'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_LANG, type Lang } from '@/lib/i18n'

const LangContext = createContext<Lang>(DEFAULT_LANG)

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

export function useLang(): Lang {
  return useContext(LangContext)
}
