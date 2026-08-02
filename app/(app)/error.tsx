'use client'

import { OctagonAlert } from 'lucide-react'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/LangProvider'
import { Card } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const t = getStrings(useLang())

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Card className="animate-rise w-full max-w-sm border-danger/30 bg-danger-soft">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger">
          <OctagonAlert size={22} />
        </span>
        <h1 className="mt-3 font-display text-xl font-semibold">{t.errorTitle}</h1>
        <Button onClick={reset} size="lg" className="mt-5 w-full">
          {t.retry}
        </Button>
      </Card>
    </main>
  )
}
