import { NextResponse, type NextRequest } from 'next/server'

// Reachable without a session: the (auth) screens and the endpoints they post to.
const PUBLIC_PAGES = ['/login', '/signup', '/forgot-password', '/reset-password']
const PUBLIC_APIS = ['/api/auth', '/api/register', '/api/password']

// Lightweight redirect layer only — runs on Edge so it cannot query the DB.
// Real auth enforcement happens via auth() in pages and API routes.
export default function middleware(req: NextRequest) {
  const hasSession =
    req.cookies.has('authjs.session-token') ||
    req.cookies.has('__Secure-authjs.session-token')
  const { pathname } = req.nextUrl
  const isAuthPage = PUBLIC_PAGES.some(p => pathname.startsWith(p))
  const isApiAuth = PUBLIC_APIS.some(p => pathname.startsWith(p))

  if (isApiAuth) return NextResponse.next()
  if (!hasSession && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }
  // No redirect for hasSession && isAuthPage: the cookie may be expired/invalid.
  // server-side auth() in page.tsx handles the redirect correctly after JWT validation.
  return NextResponse.next()
}

export const config = {
  // sw.js must stay public: the browser fetches it to register the worker, and
  // a redirect to /login there fails registration outright — no offline cache
  // and no push notifications. It carries no user data, only code already
  // served to everyone.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.png$).*)'],
}
