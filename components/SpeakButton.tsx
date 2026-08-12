'use client'

import { Square, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Start/stop control for a read-aloud queue. Square (not pause) because the
// queue restarts from the top — there is no resume.
export function SpeakButton({ playing, onToggle, label, stopLabel, className, compact }: {
  playing: boolean
  onToggle: () => void
  label: string
  stopLabel: string
  className?: string
  // Icon-only, for toolbars where space is tight
  compact?: boolean
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle() }}
      aria-label={playing ? stopLabel : label}
      title={playing ? stopLabel : label}
      aria-pressed={playing}
      className={cn(
        'pressable inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold',
        compact ? 'size-10' : 'h-10 px-3',
        playing
          ? 'border-primary/40 bg-info-soft text-primary'
          : 'border-border bg-surface text-muted-foreground',
        className,
      )}
    >
      {playing ? <Square size={15} /> : <Volume2 size={16} />}
      {!compact && <span>{playing ? stopLabel : label}</span>}
    </button>
  )
}
