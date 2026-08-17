'use client'

import { getStrings } from '@/lib/i18n'
import { localeOf, type Lang } from '@/lib/courses'

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86400000],
  ['month', 30 * 86400000],
  ['week', 7 * 86400000],
  ['day', 86400000],
  ['hour', 3600000],
  ['minute', 60000],
]

/**
 * "Seen 3 hours ago", in the reader's language.
 *
 * Rendered on the client on purpose: a server-rendered relative time is stale
 * the moment the page is cached, and the browser knows what "now" is.
 */
export function LastSeen({ at, lang }: { at: string | null; lang: Lang }) {
  const t = getStrings(lang)
  if (!at) return <>{t.lastSeenNever}</>

  // Reading the clock during render is what a relative time *is*; there is
  // nothing to synchronise and a re-render showing a fresher "3 minutes ago"
  // is the correct result, not an unstable one.
  // eslint-disable-next-line react-hooks/purity
  const elapsed = Date.now() - Date.parse(at)
  const format = new Intl.RelativeTimeFormat(localeOf(lang), { numeric: 'auto' })
  const [unit, ms] = UNITS.find(([, size]) => elapsed >= size) ?? UNITS[UNITS.length - 1]
  const value = Math.round(elapsed / ms)

  return <>{`${t.lastSeen} ${format.format(-Math.max(value, 1), unit)}`}</>
}
