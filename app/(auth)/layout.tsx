import { AuthBrand } from '@/components/auth/AuthBrand'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-10">
      <div className="animate-rise w-full max-w-[430px] text-center">
        <AuthBrand />
        {children}
      </div>
    </main>
  )
}
