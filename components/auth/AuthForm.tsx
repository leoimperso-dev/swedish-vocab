'use client'

import { cn } from '@/lib/utils'

// Error banner shared by the four (auth) screens.
export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-4 rounded-xl border border-danger/50 bg-danger-soft px-4 py-3 text-sm text-danger"
    >
      {children}
    </p>
  )
}

export function AuthNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-xl border border-success/50 bg-success-soft px-4 py-3 text-sm text-success">
      {children}
    </p>
  )
}

export function AuthLinks({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mt-6 space-y-2 text-sm', className)} {...props} />
}
