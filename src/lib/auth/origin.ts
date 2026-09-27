/**
 * Amira Store — same-origin request validation for state-changing admin
 * endpoints (PHASE-03 targeted security audit, 2026-09-27 — ISSUE-2026-09-27-022).
 *
 * Implements the OWASP CSRF Prevention Cheat Sheet defense "Verifying Origin
 * With Standard Headers" as the EXPLICIT CSRF control for /api/admin/auth/*.
 * The SameSite=Lax session cookie remains as defense-in-depth — per OWASP it
 * must never be the sole CSRF defense:
 *
 * - Browsers attach an Origin header to every non-GET/HEAD fetch and form
 *   submission (same-site and cross-site). A state-changing request whose
 *   Origin does not exactly match this deployment's own origin is rejected
 *   before any body parsing or database work.
 * - When Origin is absent, the Referer origin is validated as the fallback
 *   attestation.
 * - Requests carrying NEITHER header are rejected: browsers always send one
 *   on state-changing requests, and the admin dashboard has no sanctioned
 *   non-browser integrations (single-admin model, MASTER_PLAN §16).
 *
 * The allowlist is derived from (all normalised, default ports stripped):
 *   - APP_URL (the configured deployment origin), when set;
 *   - the request's own host as the server sees it (x-forwarded-host/host)
 *     paired with x-forwarded-proto / the request URL scheme — this covers
 *     Vercel production, preview deployments and the local dev server
 *     without configuration;
 *   - localhost:3000 / 127.0.0.1:3000 only when NODE_ENV !== 'production'.
 *
 * Deliberately free of next/server imports so the service-layer verification
 * suite (scripts/verify-auth.ts) can exercise it with standard Request
 * objects.
 */

/** Local origins accepted only outside production (dev server / QA). */
const TRUSTED_LOCAL_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

/**
 * Lowercase `scheme://host[:port]` origin with default ports removed.
 * Returns null for anything that is not a valid http(s) origin (including
 * the literal "null" Origin some sandboxed contexts send — rejected).
 */
export function normalizeOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const candidate = raw.trim();
  if (!candidate || candidate.toLowerCase() === 'null') return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

function addAllowedOrigin(set: Set<string>, candidate: string | null | undefined): void {
  const normalized = normalizeOrigin(candidate);
  if (normalized) set.add(normalized);
}

/** First comma-separated value of a forwarded header, or null. */
function forwardedFirst(request: Request, header: string): string | null {
  const value = request.headers.get(header);
  const first = value?.split(',')[0]?.trim();
  return first || null;
}

/**
 * True when the request carries an Origin (or Referer fallback) attestation
 * that exactly matches this deployment's own origin.
 */
export function isSameOriginRequest(request: Request): boolean {
  const allowed = new Set<string>();

  addAllowedOrigin(allowed, process.env.APP_URL);

  const host = forwardedFirst(request, 'x-forwarded-host') ?? request.headers.get('host')?.trim();
  if (host) {
    const protocols = new Set<string>();
    const forwardedProto = forwardedFirst(request, 'x-forwarded-proto');
    if (forwardedProto) protocols.add(forwardedProto.toLowerCase());
    try {
      protocols.add(new URL(request.url).protocol.replace(/:$/, ''));
    } catch {
      // request.url is always parseable in Next.js; defensive only.
    }
    const appProto = normalizeOrigin(process.env.APP_URL)?.split('://')[0];
    if (appProto) protocols.add(appProto);
    for (const protocol of protocols) {
      addAllowedOrigin(allowed, `${protocol}://${host}`);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    for (const local of TRUSTED_LOCAL_ORIGINS) allowed.add(local);
  }

  const origin = normalizeOrigin(request.headers.get('origin'));
  if (origin) return allowed.has(origin);
  const referer = normalizeOrigin(request.headers.get('referer'));
  if (referer) return allowed.has(referer);
  // No attestation at all → reject state-changing requests outright.
  return false;
}

/**
 * CSRF hardening complement (OWASP): restrict the JSON endpoints to
 * application/json request bodies, which browser HTML forms cannot send.
 * Used alongside same-origin validation, never instead of it.
 */
export function isJsonRequest(request: Request): boolean {
  const contentType = request.headers.get('content-type') ?? '';
  return contentType.toLowerCase().split(';')[0].trim() === 'application/json';
}

/**
 * Cache-Control: no-store on authentication/session-sensitive responses —
 * no intermediary or browser cache may retain auth outcomes or admin pages.
 */
export function withNoStore<T extends Response>(response: T): T {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
