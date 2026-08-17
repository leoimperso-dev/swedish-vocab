'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

type State = 'loading' | 'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on'

/**
 * iOS exposes Web Push only to an app launched from the home screen — in a
 * Safari tab the API is simply absent. Telling that user "unsupported" is
 * wrong: they are one "Add to Home Screen" away.
 */
function needsHomeScreenInstall(): boolean {
  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    // iPadOS reports itself as a Mac; a touch point gives it away
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (!iOS) return false
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return !standalone
}

/**
 * Web Push opt-in, per device. Rendered only when VAPID keys are configured —
 * without them the server can never send, so offering the switch would lie.
 */
export function PushToggle() {
  const t = getStrings(useLang())
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const detect = async (): Promise<State> => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) {
        return needsHomeScreenInstall() ? 'ios-install' : 'unsupported'
      }
      if (Notification.permission === 'denied') return 'blocked'
      const reg = await navigator.serviceWorker.ready
      return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
    }
    detect()
      .then(next => { if (!cancelled) setState(next) })
      .catch(() => { if (!cancelled) setState('unsupported') })
    return () => { cancelled = true }
  }, [])

  const enable = async () => {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
      })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      setState(res.ok ? 'on' : 'off')
    } catch {
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setState('off')
    } catch {
      /* the row is dropped server-side on the first failed send anyway */
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return null

  const hint = {
    unsupported: t.pushUnsupported,
    'ios-install': t.pushIosInstall,
    blocked: t.pushBlocked,
    on: t.pushOn,
    off: t.pushDesc,
  }[state]

  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
        {state === 'on' ? <Bell size={18} /> : <BellOff size={18} />}
      </span>
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">{hint}</p>
      {state === 'on' ? (
        <Button size="sm" variant="secondary" disabled={busy} onClick={disable}>
          {t.pushDeactivate}
        </Button>
      ) : state === 'off' ? (
        <Button size="sm" disabled={busy} onClick={enable}>
          {t.pushActivate}
        </Button>
      ) : null}
    </div>
  )
}

/** The subscribe call wants the VAPID key as raw bytes, not base64url. */
function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const buffer = new ArrayBuffer(raw.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return buffer
}
