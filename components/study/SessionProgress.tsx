'use client'

import type { AnswerResult } from '@/types'

interface Props {
  current: number
  total: number
  combo: number
  results: AnswerResult[]
}

const RESULT_COLORS: Record<AnswerResult, string> = {
  correct: 'bg-green-500',
  approximate: 'bg-yellow-500',
  incorrect: 'bg-red-500',
}

export default function SessionProgress({ current, total, combo, results }: Props) {
  return (
    <div className="space-y-3">
      {/* Progress dots */}
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => {
          const result = results[i]
          return (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i < results.length
                  ? RESULT_COLORS[result]
                  : i === current
                  ? 'bg-blue-500'
                  : 'bg-slate-800'
              }`}
            />
          )
        })}
      </div>

      {/* Counter + combo */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">{current + 1} / {total}</span>
        {combo >= 3 && (
          <span className="text-orange-400 font-bold">🔥 ×{combo} combo</span>
        )}
      </div>
    </div>
  )
}
