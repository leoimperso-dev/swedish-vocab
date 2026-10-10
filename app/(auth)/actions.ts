'use server'

import { rememberLang } from '@/lib/ui-lang'

// The auth screens' language switcher: no user yet, so only the cookie changes
export async function chooseLanguage(lang: string) {
  await rememberLang(lang)
}
