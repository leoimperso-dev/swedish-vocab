'use client'

import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/primitives'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'
import { usePush } from '@/lib/use-push'

const SNOOZE_KEY = 'push-banner-snoozed-until'
// Dismissing snoozes rather than buries: a device that never opted in receives
// no reminder and no duel turn at all, so the nudge has to come back.
const SNOOZE_DAYS = 7

/**
 * Asks for Web Push where it will actually be seen.
 *
 * The profile switch is the setting; this is the nudge. A subscription is
 * minted by the browser on the device itself, so a learner who never taps it
 * is unreachable however their account is configured.
 */
export function PushBanner() {
  const t = getStrings(useLang())
  const { state, busy, enable } = usePush()
  // Starts hidden so the first client render matches the server's
  const [snoozed, setSnoozed] = useState(true)

  useEffect(() => {
    try {
      const until = Number(window.localStorage.getItem(SNOOZE_KEY))
      setSnoozed(Number.isFinite(until) && until > Date.now())
    } catch {
      setSnoozed(false)
    }
  }, [])

  const dismiss = () => {
    setSnoozed(true)
    try {
      window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000))
    } catch {}
  }

  // Only shown where tapping changes something: already on, blocked in the
  // browser settings or plainly unsupported all have nothing to offer here
  if (snoozed || (state !== 'off' && state !== 'ios-install')) return null

  return (
    <Card className="border-info/30 bg-info-soft">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info/15 text-info">
          <Bell size={18} />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-display text-sm font-semibold">{t.pushBannerTitle}</p>
          <p className="text-xs text-muted-foreground">
            {state === 'ios-install' ? t.pushIosInstall : t.pushBannerBody}
          </p>
          {state === 'off' && (
            <Button size="sm" disabled={busy} onClick={enable}>
              {t.pushActivate}
            </Button>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label={t.pushBannerDismiss}
          className="pressable -mr-1 -mt-1 grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground"
        >
          <X size={16} />
        </button>
      </div>
    </Card>
  )
}
