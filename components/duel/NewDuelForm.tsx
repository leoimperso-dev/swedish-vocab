'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Card, SectionLabel, Segmented } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/feedback'
import { getStrings } from '@/lib/i18n'
import { useCourse, useLang } from '@/components/CourseProvider'
import { courseDirections, flagOf, promptLang, answerLang, type Direction } from '@/lib/courses'
import { BLITZ_SECONDS, DEFAULT_ROUNDS, ROUND_LENGTH_OPTIONS, type DuelMode } from '@/lib/duel/rules'
import { cn } from '@/lib/utils'

interface Opponent {
  id: string
  name: string | null
  image: string | null
  xp: number
}

export function NewDuelForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (duelId: string) => void
}) {
  const t = getStrings(useLang())
  const course = useCourse()
  const [opponents, setOpponents] = useState<Opponent[] | null>(null)
  // Opponent id → duel already running against them
  const [busy, setBusy] = useState<Record<string, string>>({})
  const [picked, setPicked] = useState<string | null>(null)
  const [mode, setMode] = useState<DuelMode>('CLASSIC')
  const [rounds, setRounds] = useState<number>(DEFAULT_ROUNDS)
  const [direction, setDirection] = useState<Direction>(courseDirections(course)[0])
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetch('/api/duels/opponents')
      .then(r => r.json())
      .then(d => {
        setOpponents(Array.isArray(d.opponents) ? d.opponents : [])
        setBusy(d.busy ?? {})
      })
      .catch(() => setOpponents([]))
  }, [])

  const submit = async () => {
    if (!picked || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/duels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opponentId: picked, mode, rounds, direction }),
      })
      const data = await res.json()
      if (data?.duel?.id) onCreated(data.duel.id)
      else setSending(false)
    } catch {
      setSending(false)
    }
  }

  const modes: Array<{ value: DuelMode; label: string; desc: string }> = [
    { value: 'CLASSIC', label: t.duelModeClassic, desc: t.duelModeClassicDesc },
    { value: 'BLITZ', label: t.duelModeBlitz, desc: t.duelModeBlitzDesc(BLITZ_SECONDS) },
  ]

  return (
    <Card className="animate-rise space-y-4">
      <div>
        <SectionLabel>{t.duelChooseOpponent}</SectionLabel>
        {opponents === null ? (
          <ListSkeleton rows={3} />
        ) : opponents.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t.duelNoOpponents}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {opponents.map(o => {
              const running = busy[o.id]
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    disabled={Boolean(running)}
                    onClick={() => setPicked(o.id)}
                    className={cn(
                      'pressable flex w-full items-center gap-3 rounded-xl border p-2.5 text-left',
                      picked === o.id ? 'border-primary bg-info-soft' : 'border-border',
                      running && 'pointer-events-none opacity-50',
                    )}
                  >
                    <Avatar name={o.name} image={o.image} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{o.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {running ? t.duelActive : `${o.xp} XP`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div>
        <SectionLabel>{t.duelChooseMode}</SectionLabel>
        <div className="mt-2 grid gap-2">
          {modes.map(m => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={cn(
                'pressable rounded-xl border p-3 text-left',
                mode === m.value ? 'border-primary bg-info-soft' : 'border-border',
              )}
            >
              <p className="font-display text-sm font-semibold">{m.label}</p>
              <p className="text-xs text-muted-foreground">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>{t.duelRoundsLabel}</SectionLabel>
        <Segmented
          className="mt-2"
          value={String(rounds)}
          onChange={v => setRounds(Number(v))}
          options={ROUND_LENGTH_OPTIONS.map(n => ({ value: String(n), label: t.duelRoundsValue(n) }))}
        />
      </div>

      <div>
        <SectionLabel>{t.chooseDirection}</SectionLabel>
        <Segmented
          className="mt-2"
          value={direction}
          onChange={v => setDirection(v as Direction)}
          options={courseDirections(course).map(d => ({
            value: d,
            label: `${flagOf(promptLang(d))} → ${flagOf(answerLang(d))}`,
          }))}
        />
      </div>

      <div className="flex gap-3">
        <Button className="flex-1" disabled={!picked || sending} onClick={submit}>
          {sending ? <Loader2 size={16} className="animate-spin" /> : null}
          {t.duelStart}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t.cancel}
        </Button>
      </div>
    </Card>
  )
}
