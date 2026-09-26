// Provisions the Azure Speech resource and writes its key into .env.
//
// This exists instead of `az login` because Azure CLI cannot run on this
// machine: Norton resigns every TLS certificate with a root whose
// basicConstraints extension is not marked critical, and the OpenSSL bundled
// with the CLI's Python rejects it. Node accepts it under --use-system-ca,
// which every script here already needs, so the same work is done against the
// REST API directly. Nothing about TLS verification is weakened.
//
// Usage: NODE_OPTIONS=--use-system-ca npx tsx scripts/azure-setup.ts
import 'dotenv/config'
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// The Azure CLI's own public client id. A device-code flow needs a client that
// is registered for it; this is the one Microsoft publishes for exactly this
// purpose, and it holds no secret.
const CLIENT_ID = '04b07795-8ddb-461a-bbee-02f9e1bf7b46'
// Defaults to `common`, which accepts both personal and work accounts. A
// subscription created from a personal address lives in its own directory,
// and Microsoft then refuses the generic endpoint — pass that directory's id
// as `--tenant <guid>` (portal → Microsoft Entra ID → Overview → Tenant ID).
const TENANT = (() => {
  const i = process.argv.indexOf('--tenant')
  return i >= 0 ? (process.argv[i + 1] ?? 'common') : 'common'
})()
const AUTHORITY = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`
const ARM = 'https://management.azure.com'

// Tried in order. Azure closes regions to new customers without warning
// ("RequestDisallowedByAzure"), and which ones are closed changes over time,
// so the region is discovered rather than assumed. All of these carry the
// same neural voices; the only real difference is latency from Europe, and
// synthesis happens once per utterance rather than per playback.
const REGIONS = ['swedencentral', 'northeurope', 'francecentral', 'westeurope', 'germanywestcentral', 'uksouth']
const GROUP = 'svenska'
const ACCOUNT = 'svenska-tts'

async function post(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  return { ok: res.ok, data: (await res.json()) as Record<string, string> }
}

// Kept outside the repository, and only for as long as the setup takes: a
// browser round trip per attempt makes iterating on a provisioning bug
// needlessly painful for whoever is holding the phone.
const TOKEN_CACHE = join(tmpdir(), 'svenska-azure-token.json')

async function fromCache(): Promise<string | null> {
  if (!existsSync(TOKEN_CACHE)) return null
  try {
    const { refresh_token } = JSON.parse(readFileSync(TOKEN_CACHE, 'utf8'))
    const again = await post(`${AUTHORITY}/token`, {
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token,
      scope: `${ARM}/.default offline_access`,
    })
    if (!again.ok) return null
    writeFileSync(TOKEN_CACHE, JSON.stringify({ refresh_token: again.data.refresh_token }))
    console.log('✅ session réutilisée')
    return again.data.access_token
  } catch {
    return null
  }
}

/** Device-code flow: the learner authenticates in a browser, we get a token. */
async function signIn(): Promise<string> {
  const cached = await fromCache()
  if (cached) return cached

  const start = await post(`${AUTHORITY}/devicecode`, {
    client_id: CLIENT_ID,
    scope: `${ARM}/.default offline_access`,
  })
  if (!start.ok) throw new Error(`devicecode: ${JSON.stringify(start.data)}`)

  console.log('\n' + '='.repeat(58))
  console.log('  Ouvre cette page :', start.data.verification_uri)
  console.log('  Et saisis ce code :', start.data.user_code)
  console.log('='.repeat(58) + '\n')

  const deadline = Date.now() + Number(start.data.expires_in ?? 900) * 1000
  const interval = Number(start.data.interval ?? 5) * 1000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval))
    const poll = await post(`${AUTHORITY}/token`, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: CLIENT_ID,
      device_code: start.data.device_code,
    })
    if (poll.ok) {
      console.log('✅ connecté')
      writeFileSync(TOKEN_CACHE, JSON.stringify({ refresh_token: poll.data.refresh_token }))
      return poll.data.access_token
    }
    // authorization_pending is the normal answer until the browser step is done
    if (poll.data.error !== 'authorization_pending' && poll.data.error !== 'slow_down') {
      throw new Error(`${poll.data.error}: ${poll.data.error_description}`)
    }
  }
  throw new Error('délai dépassé')
}

async function arm(token: string, path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${ARM}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`)
  return data
}

async function main() {
  const token = await signIn()

  const subs = await arm(token, '/subscriptions?api-version=2020-01-01')
  const usable = (subs.value ?? []).filter((s: { state: string }) => s.state === 'Enabled')
  if (usable.length === 0) throw new Error('aucun abonnement actif sur ce compte')
  const sub = usable[0]
  console.log(`abonnement : ${sub.displayName} (${sub.subscriptionId})`)

  // A subscription that has never used the service cannot create one until the
  // resource provider is registered — the portal does this silently
  await arm(token, `/subscriptions/${sub.subscriptionId}/providers/Microsoft.CognitiveServices/register?api-version=2021-04-01`, 'POST')

  // A group that already exists keeps its own location — recreating it
  // elsewhere is rejected, and a group's location constrains nothing anyway
  const base = `/subscriptions/${sub.subscriptionId}/resourceGroups/${GROUP}`
  let existing = false
  try {
    await arm(token, `${base}?api-version=2021-04-01`)
    existing = true
  } catch {
    // Not there yet
  }
  if (!existing) await arm(token, `${base}?api-version=2021-04-01`, 'PUT', { location: REGIONS[0] })
  console.log(`groupe de ressources : ${GROUP}${existing ? ' (existant)' : ''}`)

  const accountPath = `${base}/providers/Microsoft.CognitiveServices/accounts/${ACCOUNT}`
  let region = ''
  for (const candidate of REGIONS) {
    try {
      await arm(token, `${accountPath}?api-version=2023-05-01`, 'PUT', {
        location: candidate,
        kind: 'SpeechServices',
        // F0 is the always-free tier: 500k neural characters a month, no
        // expiry. Azure allows exactly one per subscription.
        sku: { name: 'F0' },
        properties: {},
      })
      region = candidate
      break
    } catch (e) {
      const message = (e as Error).message
      if (!message.includes('RequestDisallowedByAzure')) throw e
      console.log(`  ${candidate} : fermée aux nouveaux clients`)
    }
  }
  if (!region) throw new Error('aucune région disponible')
  console.log(`ressource Speech : ${ACCOUNT} (F0, ${region})`)

  // Provisioning is asynchronous; keys only exist once it has succeeded
  for (let i = 0; i < 30; i++) {
    const state = await arm(token, `${accountPath}?api-version=2023-05-01`)
    if (state.properties?.provisioningState === 'Succeeded') break
    await new Promise(r => setTimeout(r, 4000))
  }

  const keys = await arm(token, `${accountPath}/listKeys?api-version=2023-05-01`, 'POST')
  const key = keys.key1 as string
  if (!key) throw new Error('clé introuvable')

  const envPath = resolve(process.cwd(), '.env')
  const current = readFileSync(envPath, 'utf8')
  if (current.includes('AZURE_SPEECH_KEY=')) {
    console.log('\n⚠️  AZURE_SPEECH_KEY est déjà dans .env — rien réécrit')
  } else {
    appendFileSync(envPath, `\n# Synthèse vocale — ressource ${ACCOUNT}, palier gratuit F0\nAZURE_SPEECH_KEY="${key}"\nAZURE_SPEECH_REGION="${region}"\n`)
    console.log('\n✅ clé écrite dans .env')
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('\n❌', e.message); process.exit(1) })
