'use client'

import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'
import { usePush } from '@/lib/use-push'

/**
 * Web Push opt-in, per device. Rendered only when VAPID keys are configured —
 * without them the server can never send, so offering the switch would lie.
 */
export function PushToggle() {
  const t = getStrings(useLang())
  const { state, busy, enable, disable } = usePush()

  if (state === 'loading') return null

  const hint = {
    unsupported: t.pushUnsupported,
    'ios-install': t.pushIosInstall,
    blocked: t.pushBlocked,
    on: t.pushOn,
    off: t.pushDesc,
  }[state]

  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
        {state === 'on' ? <Bell size={18} /> : <BellOff size={18} />}
      </span>
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">{hint}</p>
      {state === 'on' ? (
        <Button size="sm" variant="secondary" disabled={busy} onClick={disable}>
          {t.pushDeactivate}
        </Button>
      ) : state === 'off' ? (
        <Button size="sm" disabled={busy} onClick={enable}>
          {t.pushActivate}
        </Button>
      ) : null}
    </div>
  )
}
