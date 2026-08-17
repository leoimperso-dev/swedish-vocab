import { ResetPasswordForm } from './ResetPasswordForm'

// The token comes from the emailed link, so it is read server-side and handed to
// the form — no useSearchParams, no Suspense boundary.
export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const { token } = await searchParams
  return <ResetPasswordForm token={typeof token === 'string' ? token : ''} />
}
