import * as React from 'react'
import { cn } from '@/lib/utils'

/* ---------- Card ---------- */
export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('card-surface p-4', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3
      className={cn('text-sm font-semibold tracking-tight text-foreground', className)}
      {...props}
    />
  )
}

/* ---------- Section heading ---------- */
export function SectionLabel({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

/* ---------- Progress bar ---------- */
export function ProgressBar({
  value,
  tone = 'primary',
  className,
  label,
}: {
  value: number
  tone?: 'primary' | 'xp' | 'success' | 'streak'
  className?: string
  label?: string
}) {
  const fill = {
    primary: 'bg-gradient-nordic',
    xp: 'bg-gradient-xp',
    success: 'bg-success',
    streak: 'bg-streak',
  }[tone]

  return (
    <div className={cn('w-full', className)}>
      {label ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground">{label}</span>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
            {Math.round(value)}%
          </span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300 ease-out', fill)}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  )
}

/* ---------- Level dots (5) ---------- */
export function LevelDots({
  level,
  total = 5,
  className,
  ariaLabel,
}: {
  level: number
  total?: number
  className?: string
  ariaLabel?: string
}) {
  return (
    <div
      className={cn('flex items-center gap-1', className)}
      aria-label={ariaLabel ?? `${level}/${total}`}
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'size-2 rounded-full transition-colors',
            i < level ? 'bg-success' : 'bg-border-strong',
            i < level && level === total && 'bg-accent',
          )}
        />
      ))}
    </div>
  )
}

/* ---------- Chip / badge ---------- */
const chipTones = {
  neutral: 'bg-surface-raised text-muted-foreground border-border',
  success: 'bg-success-soft text-success border-success/25',
  warning: 'bg-warning-soft text-warning border-warning/25',
  danger: 'bg-danger-soft text-danger border-danger/25',
  streak: 'bg-streak-soft text-streak border-streak/25',
  freeze: 'bg-freeze-soft text-freeze border-freeze/25',
  info: 'bg-info-soft text-info border-info/25',
} as const

export function Chip({
  tone = 'neutral',
  className,
  ...props
}: React.ComponentProps<'span'> & { tone?: keyof typeof chipTones }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        chipTones[tone],
        className,
      )}
      {...props}
    />
  )
}

/* ---------- Segmented tabs ---------- */
export function Segmented({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={cn('flex gap-1 rounded-2xl border border-border bg-surface p-1', className)}
    >
      {options.map(o => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'pressable min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-[13px] font-semibold',
              active
                ? 'bg-surface-raised text-foreground shadow-[var(--shadow-card)]'
                : 'text-muted-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Text input ---------- */
export function TextField({
  label,
  hint,
  state = 'idle',
  className,
  id,
  ...props
}: React.ComponentProps<'input'> & {
  label?: string
  hint?: string
  state?: 'idle' | 'success' | 'error'
}) {
  const autoId = React.useId()
  const inputId = id ?? autoId
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={cn(
          'h-12 w-full rounded-xl border bg-input px-4 text-base text-foreground outline-hidden transition-colors placeholder:text-muted-foreground/70',
          state === 'idle' && 'border-border focus:border-primary focus:ring-2 focus:ring-ring/40',
          state === 'success' && 'border-success/60 bg-success-soft',
          state === 'error' && 'border-danger/60 bg-danger-soft',
          className,
        )}
        {...props}
      />
      {hint ? (
        <p
          className={cn(
            'mt-1.5 text-xs',
            state === 'error'
              ? 'text-danger'
              : state === 'success'
                ? 'text-success'
                : 'text-muted-foreground',
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  )
}
