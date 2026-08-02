'use client'

import { X, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AnswerResult } from '@/types'

interface Props {
  current: number
  total: number
  combo: number
  results: AnswerResult[]
  onQuit: () => void
  quitLabel: string
}

const RESULT_CLASS: Record<AnswerResult, string> = {
  correct: 'bg-success',
  approximate: 'bg-warning',
  incorrect: 'bg-danger',
}

export default function SessionProgress({ current, total, combo, results, onQuit, quitLabel }: Props) {
  return (
    <header className="safe-top sticky top-0 z-40 border-b border-border/70 bg-background/85 px-4 pb-3 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 gap-1">
          {Array.from({ length: total }).map((_, i) => {
            const result = results[i]
            return (
              <span
                key={i}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  result ? RESULT_CLASS[result] : i === current ? 'bg-border-strong' : 'bg-muted',
                )}
              />
            )
          })}
        </div>
        <button
          onClick={onQuit}
          aria-label={quitLabel}
          title={quitLabel}
          className="pressable grid size-8 shrink-0 place-items-center rounded-full bg-surface-raised text-muted-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-semibold tabular-nums text-muted-foreground">
          {current + 1}/{total}
        </span>
        {combo > 1 ? (
          <span className="inline-flex items-center gap-1 font-semibold text-streak">
            <Flame size={13} /> ×{combo}
          </span>
        ) : null}
      </div>
    </header>
  )
}
