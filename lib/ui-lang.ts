import { cookies, headers } from 'next/headers'
import { asLang, INTERFACE_LANGS, type InterfaceLang } from '@/lib/i18n'

// Remembers the interface language where there is no user yet (auth screens),
// and gives the server a language before the session is read
const UI_LANG_COOKIE = 'ui-lang'

const isInterfaceLang = (value: string | undefined): value is InterfaceLang =>
  !!value && (INTERFACE_LANGS as string[]).includes(value)

/** Interface language of a request with no course yet: the cookie, then the browser's languages. */
export async function requestLang(): Promise<InterfaceLang> {
  const stored = (await cookies()).get(UI_LANG_COOKIE)?.value
  if (isInterfaceLang(stored)) return stored
  for (const part of ((await headers()).get('accept-language') ?? '').split(',')) {
    const code = part.trim().slice(0, 2).toLowerCase()
    if (isInterfaceLang(code)) return code
  }
  return asLang(null)
}

export async function rememberLang(lang: string) {
  if (!isInterfaceLang(lang)) return
  ;(await cookies()).set(UI_LANG_COOKIE, lang, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
}
