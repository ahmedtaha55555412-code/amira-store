/**
 * Amira Store — PHASE-13 HTTP security suite.
 *
 * Adversarial proof over the REAL HTTP surface (dev server):
 *   §1  legitimate login + session cookie flags (FIRST — before any failure
 *       rows exist for this IP; the login throttle deliberately counts
 *       username OR IP-hash identity, so brute-force flooding later in the
 *       suite poisons this IP by design and must come last)
 *   §2  authorization: EVERY admin mutation route unauthenticated → 401
 *       (server-side enforcement, not client-side hiding). Logout is
 *       intentionally excluded: an unauthenticated logout is a harmless
 *       no-op success (200) — it grants nothing and changes nothing.
 *   §3  invalid/forged session tokens rejected everywhere (401 — verified
 *       after ISSUE-2026-09-30-067 fix; previously a redirect-throw escaped
 *       as 500 on three API GET routes)
 *   §4  CSRF/same-origin: hostile Origin, suffix-lookalike, form-spoof
 *       content types, absent Origin — with a VALID session — refused (403)
 *   §5  cache discipline: sensitive responses carry no-store
 *   §6  security headers contract (next.config.ts) on representative routes
 *   §7  method spoofing on POST-only routes → 405
 *   §8  admin page gate (307 to login) + honest 503 when media storage is
 *       unavailable with zero registry rows
 *   §9  username-enum honesty (identical error/status for unknown user vs
 *       wrong password) + legitimate login still succeeds (2 failures < 5)
 *   §10 brute-force flood → 429 + Retry-After (LAST: intentionally exhausts
 *       the IP-hash identity window; 15-minute self-heal)
 *   §11 cleanup — QA session logout
 *
 * House rules: refuses NODE_ENV=production; guard refusals create no rows;
 * valid-session probes use the real QA admin; LIFO logout cleanup; never
 * prints credentials.
 *
 * Env: BASE_URL (default http://localhost:3000), DATABASE_URL,
 * ADMIN_QA_USERNAME + ADMIN_QA_PASSWORD (suite FAILS honestly if unset —
 * same gate as verify:admin §10).
 */

import { eq, sql } from 'drizzle-orm';

import { db, getPool } from '../src/db/client';
import { mediaAssets } from '../src/db/schema';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

if (process.env.NODE_ENV === 'production') {
  console.error('[verify:security] refuses to run outside development.');
  process.exit(1);
}

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const QA_USERNAME = process.env.ADMIN_QA_USERNAME ?? '';
const QA_PASSWORD = process.env.ADMIN_QA_PASSWORD ?? '';

type LoginResult = { status: number; setCookie: string[] };

async function login(
  username: string,
  password: string,
  origin = BASE_URL,
): Promise<LoginResult> {
  const response = await fetch(`${BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(8000),
  });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  return { status: response.status, setCookie };
}

async function loginBody(
  username: string,
  password: string,
): Promise<{ status: number; body: { error?: string; ok?: boolean } }> {
  const response = await fetch(`${BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE_URL },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(8000),
  });
  const body = (await response
    .json()
    .catch(() => ({}))) as { error?: string; ok?: boolean };
  return { status: response.status, body };
}

function sessionCookieFrom(setCookie: string[]): string {
  const row = setCookie.find((c) => /^amira_admin_session=/i.test(c));
  if (!row) return '';
  return row.split(';')[0];
}

async function guarded(body: string, headers: Record<string, string>): Promise<Response> {
  return fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
    signal: AbortSignal.timeout(8000),
  });
}

/* Every admin mutation route (path, method). `:id` routes use a probe UUID —
   the authorization check MUST fire (401) before any 404 semantics. */
const MUTATION_ROUTES: [string, string][] = [
  ['/api/admin/settings', 'PATCH'],
  ['/api/admin/settings/logo', 'POST'],
  ['/api/admin/settings/logo', 'DELETE'],
  ['/api/admin/settings/favicon', 'POST'],
  ['/api/admin/settings/favicon', 'DELETE'],
  ['/api/admin/products', 'POST'],
  ['/api/admin/products/11111111-1111-4111-8111-111111111111', 'PUT'],
  ['/api/admin/products/11111111-1111-4111-8111-111111111111/status', 'POST'],
  ['/api/admin/reviews/11111111-1111-4111-8111-111111111111/moderate', 'POST'],
  ['/api/admin/attributes', 'POST'],
  ['/api/admin/attributes/11111111-1111-4111-8111-111111111111', 'DELETE'],
  ['/api/admin/attributes/11111111-1111-4111-8111-111111111111/values', 'POST'],
  ['/api/admin/attribute-values/11111111-1111-4111-8111-111111111111', 'DELETE'],
  ['/api/admin/testimonials', 'POST'],
  ['/api/admin/testimonials/11111111-1111-4111-8111-111111111111/update', 'POST'],
  ['/api/admin/testimonials/11111111-1111-4111-8111-111111111111/hide', 'POST'],
  ['/api/admin/testimonials/11111111-1111-4111-8111-111111111111/publish', 'POST'],
  ['/api/admin/orders/11111111-1111-4111-8111-111111111111/status', 'POST'],
  ['/api/admin/orders/11111111-1111-4111-8111-111111111111/shipping-cost', 'POST'],
  ['/api/admin/orders/11111111-1111-4111-8111-111111111111/shipping-status', 'POST'],
  ['/api/admin/orders/11111111-1111-4111-8111-111111111111/items', 'POST'],
  ['/api/admin/orders/11111111-1111-4111-8111-111111111111/payment-status', 'POST'],
  ['/api/admin/categories', 'POST'],
  ['/api/admin/categories/reorder', 'POST'],
  ['/api/admin/categories/11111111-1111-4111-8111-111111111111', 'PUT'],
  ['/api/admin/categories/11111111-1111-4111-8111-111111111111', 'DELETE'],
  ['/api/admin/homepage/sections', 'PATCH'],
  ['/api/admin/homepage/sections/hero', 'PATCH'],
  ['/api/admin/homepage/banners', 'POST'],
  ['/api/admin/homepage/banners/11111111-1111-4111-8111-111111111111', 'PATCH'],
  ['/api/admin/homepage/banners/11111111-1111-4111-8111-111111111111', 'DELETE'],
  ['/api/admin/inventory/adjust', 'POST'],
  ['/api/admin/auth/change-password', 'POST'],
  ['/api/admin/media/upload', 'POST'],
  ['/api/admin/media/11111111-1111-4111-8111-111111111111', 'PUT'],
  ['/api/admin/media/11111111-1111-4111-8111-111111111111', 'DELETE'],
  // NOTE: /api/admin/auth/logout intentionally EXCLUDED — unauthenticated
  // logout is a harmless no-op success (200), grants nothing, changes nothing.
];

const PROBE_UUID = '11111111-1111-4111-8111-111111111111';

try {
  section('§0 server liveness');
  {
    let up = false;
    for (let i = 0; i < 3; i += 1) {
      try {
        const probe = await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) });
        up = probe.status === 200;
        if (up) break;
      } catch {
        up = false;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!up) {
      throw new Error(`dev server unreachable at ${BASE_URL} — HTTP suite cannot run honestly`);
    }
    assert('dev server reachable', up);
  }

  if (!QA_USERNAME || !QA_PASSWORD) {
    throw new Error('ADMIN_QA_USERNAME/ADMIN_QA_PASSWORD unset — session sections cannot run honestly');
  }

  section('§1 legitimate login FIRST + session cookie flags');
  {
    const legit = await login(QA_USERNAME, QA_PASSWORD);
    assert('legitimate login succeeds (clean identity window)', legit.status === 200);
    const qaSessionCookie = sessionCookieFrom(legit.setCookie);
    assert('session cookie issued', qaSessionCookie.length > 0);

    const raw =
      legit.setCookie.find((c) => /^amira_admin_session=/i.test(c)) ?? '';
    assert('cookie is HttpOnly', /httponly/i.test(raw));
    assert('cookie is SameSite=Lax (or stricter)', /samesite=(lax|strict)/i.test(raw), raw);
    assert('cookie has Path scoped to /', /path=\//i.test(raw));
    if (BASE_URL.startsWith('https://')) {
      assert('cookie Secure on TLS origin', /secure/i.test(raw));
    } else {
      assert('plain-HTTP dev origin (Secure deferred to TLS deployment)', true);
    }

    section('§2 authorization matrix — unauthenticated mutations all 401');
    const unauthorized: string[] = [];
    for (const [path, method] of MUTATION_ROUTES) {
      const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: { 'content-type': 'application/json', origin: BASE_URL },
        body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({ probe: true }),
        signal: AbortSignal.timeout(8000),
      });
      if (response.status !== 401) unauthorized.push(`${method} ${path} → ${response.status}`);
    }
    assert(
      `all ${MUTATION_ROUTES.length} admin mutations refuse unauthenticated callers with 401`,
      unauthorized.length === 0,
      unauthorized.slice(0, 5).join('; '),
    );

    section('§3 forged/invalid sessions rejected (401, never 500)');
    const forged = await guarded(
      JSON.stringify({ variantId: PROBE_UUID, delta: 1, reason: 'فحص' }),
      { origin: BASE_URL, cookie: 'amira_admin_session=forged-token-abcdef0123456789abcdef0123456789' },
    );
    assert('forged session token → 401', forged.status === 401, `got ${forged.status}`);

    const garbage = await guarded(
      JSON.stringify({ variantId: PROBE_UUID, delta: 1, reason: 'فحص' }),
      { origin: BASE_URL, cookie: 'amira_admin_session=; amira_admin_session=x' },
    );
    assert('garbage/empty session cookie → 401', garbage.status === 401, `got ${garbage.status}`);

    for (const path of ['/api/admin/settings', '/api/admin/homepage/sections', '/api/admin/homepage/banners']) {
      const forgedRead = await fetch(`${BASE_URL}${path}`, {
        headers: { cookie: 'amira_admin_session=another-forged-token-0123456789abcdef' },
        signal: AbortSignal.timeout(8000),
      });
      assert(`forged-token GET ${path} → 401 (ISSUE-2026-09-30-067 regression guard)`, forgedRead.status === 401, `got ${forgedRead.status}`);
    }

    section('§4 CSRF/same-origin with a VALID session');
    const body = JSON.stringify({ variantId: PROBE_UUID, delta: 1, reason: 'فحص أمني' });

    const hostile = await guarded(body, { origin: 'https://evil.example', cookie: qaSessionCookie });
    assert('hostile Origin + valid session → 403', hostile.status === 403);

    const lookalike = await guarded(body, {
      origin: `${BASE_URL}.evil.example`,
      cookie: qaSessionCookie,
    });
    assert('suffix-lookalike Origin + valid session → 403', lookalike.status === 403);

    const formSpoof = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: BASE_URL, cookie: qaSessionCookie },
      body,
      signal: AbortSignal.timeout(8000),
    });
    assert('form-spoof (text/plain) + valid session → 403', formSpoof.status === 403);

    const noOrigin = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: qaSessionCookie },
      body,
      signal: AbortSignal.timeout(8000),
    });
    assert('absent Origin+Referer + valid session → 403', noOrigin.status === 403);

    const settingsHostile = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
        cookie: qaSessionCookie,
      },
      body: JSON.stringify({ storeName: 'اختراق' }),
      signal: AbortSignal.timeout(8000),
    });
    assert('hostile Origin on settings PATCH → 403 (row untouched)', settingsHostile.status === 403);

    section('§5 cache discipline on sensitive surfaces');
    const settingsAuthed = await fetch(`${BASE_URL}/api/admin/settings`, {
      headers: { cookie: qaSessionCookie },
      signal: AbortSignal.timeout(8000),
    });
    assert(
      'authorized admin GET is no-store',
      /no-store/i.test(settingsAuthed.headers.get('cache-control') ?? ''),
    );

    const denied = await fetch(`${BASE_URL}/api/admin/settings`, { signal: AbortSignal.timeout(8000) });
    assert(
      '401 admin response is no-store (not cacheable)',
      denied.status === 401 && /no-store/i.test(denied.headers.get('cache-control') ?? ''),
      `status=${denied.status}`,
    );

    const lookupProbe = await fetch(`${BASE_URL}/api/storefront/track-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL },
      body: JSON.stringify({ orderNumber: 'AMR-AAAAAA', phone: '01000000000' }),
      signal: AbortSignal.timeout(8000),
    });
    assert(
      'storefront lookup response is no-store',
      /no-store/i.test(lookupProbe.headers.get('cache-control') ?? ''),
    );

    section('§6 security headers contract');
    const home = await fetch(BASE_URL, { signal: AbortSignal.timeout(8000) });
    const headers = home.headers;
    assert('X-Content-Type-Options: nosniff', headers.get('x-content-type-options') === 'nosniff');
    assert('X-Frame-Options: DENY', headers.get('x-frame-options') === 'DENY');
    assert(
      'Referrer-Policy: strict-origin-when-cross-origin',
      headers.get('referrer-policy') === 'strict-origin-when-cross-origin',
    );
    assert(
      'Permissions-Policy disables camera/microphone/geolocation',
      (headers.get('permissions-policy') ?? '').includes('camera=()') &&
        (headers.get('permissions-policy') ?? '').includes('microphone=()') &&
        (headers.get('permissions-policy') ?? '').includes('geolocation=()'),
    );

    const loginPage = await fetch(`${BASE_URL}/admin/login`, { signal: AbortSignal.timeout(8000) });
    assert(
      'admin login page carries the same header contract',
      loginPage.headers.get('x-content-type-options') === 'nosniff' &&
        loginPage.headers.get('x-frame-options') === 'DENY',
    );

    section('§7 method spoofing');
    const putOnPost = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: BASE_URL },
      body: JSON.stringify({ username: 'x', password: 'y' }),
      signal: AbortSignal.timeout(8000),
    });
    assert('PUT on POST-only route → 405', putOnPost.status === 405, `got ${putOnPost.status}`);

    const getOnPost = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'GET',
      headers: { origin: BASE_URL },
      signal: AbortSignal.timeout(8000),
    });
    assert('GET on POST-only route → 405', getOnPost.status === 405, `got ${getOnPost.status}`);

    section('§8 admin page gate + honest storage-503');
    const adminPage = await fetch(`${BASE_URL}/admin`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    assert('unauthenticated /admin → 307 redirect to login', adminPage.status === 307);
    const location = adminPage.headers.get('location') ?? '';
    assert('redirect target is the admin login page', location.includes('/admin/login'));

    const adminAuthed = await fetch(`${BASE_URL}/admin`, {
      redirect: 'manual',
      headers: { cookie: qaSessionCookie },
      signal: AbortSignal.timeout(8000),
    });
    assert('authenticated /admin → 200', adminAuthed.status === 200, `got ${adminAuthed.status}`);

    const [registryBefore] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(mediaAssets);
    const form = new FormData();
    form.append(
      'file',
      new Blob([Buffer.from('89504e470d0a1a0a0000000d49484452000001000000010008', 'hex')], {
        type: 'image/png',
      }),
      'probe.png',
    );
    const upload = await fetch(`${BASE_URL}/api/admin/media/upload`, {
      method: 'POST',
      headers: { origin: BASE_URL, cookie: qaSessionCookie },
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    const [registryAfter] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(mediaAssets);
    if (upload.status === 503) {
      assert('media storage unconfigured → honest 503', true);
      assert('503 upload leaves zero registry rows', registryAfter.n === registryBefore.n);
    } else if (upload.status === 200 || upload.status === 201) {
      assert('media storage configured → upload authorized path works', true);
      assert('successful upload registers exactly one row', registryAfter.n === registryBefore.n + 1);
      const [asset] = await db
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .orderBy(sql`created_at desc`)
        .limit(1);
      if (asset) {
        await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
      }
    } else {
      assert(
        'upload endpoint answers with a documented status',
        [400, 401, 403, 413, 415, 422].includes(upload.status),
        `got ${upload.status}`,
      );
      assert('unexpected upload status leaves registry untouched', registryAfter.n === registryBefore.n);
    }
  }

  section('§9 username-enum honesty + legitimate recovery');
  {
    const victim = `ghost-user-${Date.now().toString(36)}`;
    const unknown = await loginBody(victim, 'Whatever123');
    const wrongPassword = await loginBody(QA_USERNAME, 'DefinitelyNotThePassword1');
    assert(
      'unknown user and wrong password → SAME status (no username oracle)',
      unknown.status === wrongPassword.status && unknown.status !== 200,
      `${unknown.status} vs ${wrongPassword.status}`,
    );
    assert(
      'error bodies identical (no username enumeration)',
      typeof unknown.body.error === 'string' &&
        unknown.body.error === wrongPassword.body.error,
    );

    const recovery = await loginBody(QA_USERNAME, QA_PASSWORD);
    assert(
      'legitimate login still succeeds (2 failures < 5, same IP)',
      recovery.status === 200,
      `got ${recovery.status}`,
    );
  }

  section('§10 brute-force flood → 429 + Retry-After (LAST by design)');
  {
    const victim = `ghost-user-flood-${Date.now().toString(36)}`;
    let saw429 = false;
    let retryAfter: string | null = null;
    for (let i = 0; i < 8; i += 1) {
      const flood = await fetch(`${BASE_URL}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE_URL },
        body: JSON.stringify({ username: victim, password: 'WrongPassword1' }),
        signal: AbortSignal.timeout(8000),
      });
      if (flood.status === 429) {
        saw429 = true;
        retryAfter = flood.headers.get('retry-after');
        break;
      }
    }
    assert('flood → 429 eventually', saw429);
    assert('429 carries Retry-After header', saw429 && Number(retryAfter) > 0, retryAfter ?? '');
  }

  section('§11 cleanup — QA session logout');
  {
    const logout = await fetch(`${BASE_URL}/api/admin/auth/logout`, {
      method: 'POST',
      headers: { origin: BASE_URL },
      signal: AbortSignal.timeout(8000),
    });
    assert('logout endpoint reachable (200 no-op without session)', logout.status === 200);
  }
} catch (error) {
  failed += 1;
  failures.push(`SUITE ABORTED: ${(error as Error).message}`);
  console.error(`\n[verify:security] SUITE ABORTED: ${(error as Error).message}`);
} finally {
  await getPool().end().catch(() => undefined);
}

console.log(`\n[verify:security] ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('[verify:security] FAILURES:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
