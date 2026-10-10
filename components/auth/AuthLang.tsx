'use client'

import { createContext, useContext } from 'react'
import { useRouter } from 'next/navigation'
import { getStrings, INTERFACE_LANGS, type InterfaceLang } from '@/lib/i18n'
import { chooseLanguage } from '@/app/(auth)/actions'
import { Flag } from '@/components/ui/flags'
import { cn } from '@/lib/utils'

// The auth screens have no user and so no course: their language comes from
// the cookie or the browser (lib/ui-lang.ts), and the visitor can switch it here.
const AuthLangContext = createContext<InterfaceLang>(INTERFACE_LANGS[0])

export function AuthLangProvider({ lang, children }: { lang: InterfaceLang; children: React.ReactNode }) {
  return <AuthLangContext.Provider value={lang}>{children}</AuthLangContext.Provider>
}

export function useAuthLang() {
  return useContext(AuthLangContext)
}

export function useAuthStrings() {
  return getStrings(useAuthLang()).auth
}

export function AuthLanguageSwitcher() {
  const current = useAuthLang()
  const router = useRouter()
  const pick = async (lang: InterfaceLang) => {
    await chooseLanguage(lang)
    router.refresh()
  }
  return (
    <div className="mt-8 flex justify-center gap-2">
      {INTERFACE_LANGS.map(lang => (
        <button
          key={lang}
          type="button"
          onClick={() => pick(lang)}
          aria-pressed={current === lang}
          title={getStrings(lang).languageName[lang]}
          className={cn(
            'grid h-7 w-10 cursor-pointer place-items-center overflow-hidden rounded-md border transition-opacity',
            current === lang ? 'border-primary' : 'border-border opacity-50 hover:opacity-100',
          )}
        >
          <Flag lang={lang} />
        </button>
      ))}
    </div>
  )
}
