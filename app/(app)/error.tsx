'use client'

import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const t = getStrings(useLang())

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 text-center gap-4">
      <div className="text-5xl">😵</div>
      <h1 className="text-xl font-bold">{t.errorTitle}</h1>
      <button
        onClick={reset}
        className="px-8 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 font-semibold active:scale-95 transition-all cursor-pointer"
      >
        {t.retry}
      </button>
    </main>
  )
}
