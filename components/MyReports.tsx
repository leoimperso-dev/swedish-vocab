'use client'

import { useEffect, useState } from 'react'
import { Flag } from 'lucide-react'
import { getStrings } from '@/lib/i18n'
import { useLang } from '@/components/CourseProvider'
import { cn } from '@/lib/utils'

interface Report {
  id: string
  message: string
  context: string | null
  resolved: boolean
  createdAt: string
  shownTerm: string | null
  shownTranslation: string | null
  word: { term: string; translation: string } | null
}

/**
 * The learner's own reports, with whether they have been dealt with.
 *
 * Reporting a wrong card used to be a message in a bottle: the row landed in a
 * table read by a script, and nothing ever came back. Seeing the list is what
 * makes the next report worth writing.
 */
export function MyReports() {
  const t = getStrings(useLang())
  const [reports, setReports] = useState<Report[] | null>(null)

  useEffect(() => {
    fetch('/api/report')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => setReports(Array.isArray(data.reports) ? data.reports : []))
      .catch(() => setReports([]))
  }, [])

  if (reports === null) return <p className="text-xs text-muted-foreground">…</p>
  if (reports.length === 0) return <p className="text-xs text-muted-foreground">{t.reportsNone}</p>

  return (
    <ul className="space-y-2">
      {reports.map(report => {
        const card = report.word
          ? `${report.word.term} — ${report.word.translation}`
          : [report.shownTerm, report.shownTranslation].filter(Boolean).join(' — ')
        return (
          <li key={report.id} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 flex-1 break-words font-display text-[13px] font-semibold">
                {card || '—'}
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  report.resolved ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
                )}
              >
                {report.resolved ? t.reportResolved : t.reportPending}
              </span>
            </div>
            <p className="mt-1 break-words text-xs text-muted-foreground">« {report.message} »</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground/70">
              {new Date(report.createdAt).toLocaleDateString()}
              {report.context ? ` · ${report.context}` : ''}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

export function MyReportsTitle() {
  const t = getStrings(useLang())
  return (
    <span className="flex items-center gap-2">
      <Flag size={15} /> {t.reportsMine}
    </span>
  )
}
