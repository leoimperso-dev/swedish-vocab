import { NextResponse, type NextRequest } from 'next/server'

// Lightweight redirect layer only — runs on Edge so it cannot query the DB.
// Real auth enforcement happens via auth() in pages and API routes.
export default function middleware(req: NextRequest) {
  const hasSession =
    req.cookies.has('authjs.session-token') ||
    req.cookies.has('__Secure-authjs.session-token')
  const isAuthPage = req.nextUrl.pathname.startsWith('/login')
  const isApiAuth = req.nextUrl.pathname.startsWith('/api/auth')

  if (isApiAuth) return NextResponse.next()
  if (!hasSession && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }
  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.png$).*)'],
}
