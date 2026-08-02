import * as React from 'react'
import { cn } from '@/lib/utils'

const base =
  'pressable inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0 [&_svg]:size-[1.15em]'

const variants = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[var(--shadow-glow)]',
  secondary:
    'bg-surface-raised text-foreground border border-border hover:border-border-strong hover:bg-surface-raised/80',
  ghost: 'text-muted-foreground hover:bg-surface-raised hover:text-foreground',
  outline: 'border border-border-strong text-foreground hover:bg-surface-raised',
  accent: 'bg-accent text-accent-foreground hover:bg-accent/90',
  success: 'bg-success text-success-foreground hover:bg-success/90',
  destructive: 'bg-danger text-danger-foreground hover:bg-danger/90',
  link: 'text-primary underline-offset-4 hover:underline',
} as const

const sizes = {
  sm: 'h-9 px-3.5 text-[13px]',
  default: 'h-11 px-5',
  lg: 'h-14 px-6 text-base rounded-2xl',
  icon: 'size-11',
} as const

export type ButtonVariant = keyof typeof variants
export type ButtonSize = keyof typeof sizes

// Class builder for Links styled as buttons (no asChild/Slot dependency)
export function buttonClasses({
  variant = 'primary',
  size = 'default',
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
} = {}) {
  return cn(base, variants[variant], sizes[size], className)
}

export function Button({
  className,
  variant = 'primary',
  size = 'default',
  ...props
}: React.ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClasses({ variant, size, className })} {...props} />
}
