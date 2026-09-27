/**
 * Amira Store — admin boundary UX guard (PHASE-03; Next.js 16 `proxy`
 * convention — the file was migrated from `middleware.ts`, logic unchanged).
 *
 * Edge-level, cookie-PRESENCE-ONLY redirect for /admin pages: without a
 * session cookie the visitor goes straight to the login page. This is a UX
 * fast-path, NOT the authorization check — every protected page re-validates
 * the session against the database in `requireAdminPage()` (see
 * src/lib/auth/guard.ts), and every admin API route re-validates via
 * `requireAdminMutation()`. API routes (/api/admin/*) are intentionally NOT
 * matched here: they must answer 401 JSON, not redirect.
 *
 * PHASE-03 security audit addition: every /admin response is stamped with
 * Cache-Control: no-store — session-sensitive UI must never be cached by
 * browsers or intermediaries.
 */

import { NextResponse, type NextRequest } from 'next/server';

const ADMIN_SESSION_COOKIE = 'amira_admin_session';

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (pathname === '/admin/login') {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  if (!request.cookies.has(ADMIN_SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    // Preserve the intended destination for post-login navigation
    // (validated client-side to /admin/* only — no open redirect).
    if (pathname !== '/admin') {
      url.searchParams.set('next', `${pathname}${search}`);
    }
    const response = NextResponse.redirect(url);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
