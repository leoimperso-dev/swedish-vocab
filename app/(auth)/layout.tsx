import { AuthBrand } from '@/components/auth/AuthBrand'
import { AuthLangProvider, AuthLanguageSwitcher } from '@/components/auth/AuthLang'
import { getStrings } from '@/lib/i18n'
import { requestLang } from '@/lib/ui-lang'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const lang = await requestLang()
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-10">
      <div className="animate-rise w-full max-w-[430px] text-center">
        <AuthLangProvider lang={lang}>
          <AuthBrand tagline={getStrings(lang).auth.tagline} />
          {children}
          <AuthLanguageSwitcher />
        </AuthLangProvider>
      </div>
    </main>
  )
}
