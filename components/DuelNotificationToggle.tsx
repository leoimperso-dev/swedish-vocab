'use client'

import { useState } from 'react'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'

/**
 * Whether duel pushes are wanted at all, on the account.
 *
 * Separate from the switch above it, which drops this device's subscription
 * and so silences every notification including the daily reminder.
 */
export function DuelNotificationToggle({ enabled }: { enabled: boolean }) {
  const t = getStrings(useLang())
  const [on, setOn] = useState(enabled)

  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={on}
        onChange={e => {
          setOn(e.target.checked)
          void fetch('/api/push/reminder', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ duels: e.target.checked }),
          })
        }}
        className="size-4 cursor-pointer accent-primary"
      />
      {t.duelNotifications}
    </label>
  )
}
