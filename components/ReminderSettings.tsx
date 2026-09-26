'use client'

import { useState } from 'react'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'

/**
 * The daily nudge: whether to send it, and at which local hour.
 *
 * Saved on the account, not on the device — the cron that sends it knows the
 * user, not the browser the switch was flipped in.
 */
export function ReminderSettings({ enabled, hour }: { enabled: boolean; hour: number }) {
  const t = getStrings(useLang())
  const [on, setOn] = useState(enabled)
  const [at, setAt] = useState(hour)

  const save = (body: { enabled?: boolean; hour?: number }) => {
    void fetch('/api/push/reminder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">{t.reminderHint}</p>
      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={on}
          onChange={e => {
            setOn(e.target.checked)
            save({ enabled: e.target.checked })
          }}
          className="size-4 cursor-pointer accent-primary"
        />
        {t.reminderOn}
      </label>
      {on && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t.reminderAt}
          <select
            value={at}
            onChange={e => {
              const next = Number(e.target.value)
              setAt(next)
              save({ hour: next })
            }}
            className="cursor-pointer rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
