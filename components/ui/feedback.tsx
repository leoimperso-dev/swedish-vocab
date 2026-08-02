import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-lg bg-surface-raised/80', className)}
    />
  )
}

export function RowSkeleton() {
  return (
    <div className="card-surface flex items-center gap-3 p-4">
      <Skeleton className="size-5 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <Skeleton className="h-2 w-14 rounded-full" />
    </div>
  )
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="…">
      {Array.from({ length: rows }).map((_, i) => (
        <RowSkeleton key={i} />
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="card-surface animate-rise flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-surface-raised text-2xl">
        {icon}
      </span>
      <p className="font-display text-base font-semibold">{title}</p>
      {description ? (
        <p className="max-w-[28ch] text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
