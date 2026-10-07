# Amira Store — Deep Forensic Audit
Date: 2026-10-06
Artifact SHA-256: `b1242b9c1a6ad8721f1bee1b9779742b4ab5ab19d890d473a4174eb35f4e34c`

## Scope
Audited the supplied recovered forensic-repaired ZIP as a source artifact. This round goes beyond the previous file-tree verification and checks application semantics, transaction/concurrency behavior, authorization, media boundaries, dependency/security posture, SEO/routing, abuse surfaces, and source-based web design.

Inventory:
- 348 filesystem files in the supplied project tree (excluding archive directory wrapper semantics)
- 254 TypeScript/TSX files
- 42 API route files
- 24 Drizzle/PostgreSQL business tables
- 4 migrations
- 13 public assets
- 32 docs files

Live GitHub baseline checked:
- repository: `ahmedtaha55555412-code/amira-store`
- main: `02a99f8de4d598835677466a1624c259336b21b9`
- CI run for current main previously observed as successful for install/typecheck/lint/build.

Important boundary:
- The ZIP does not contain live Neon/Vercel credentials or runtime state, so live Production DB contents and current deployed browser behavior are NOT PROVEN by this artifact audit alone.

## Executive verdict

**NOT READY TO DECLARE COMPLETE.**

The project has a strong architecture and many good security/transaction foundations, but this deeper audit found multiple real issues that were not covered by the previous 348-file equivalence gate.

The two highest-priority classes are:
1. **High severity dependency risk in direct `sharp@0.34.5`** while the app parses untrusted uploaded image bytes with Sharp.
2. **High-severity logical URL validation bypass for admin-managed Homepage CTA values** (`//host` and backslash-prefixed paths become external URLs in browsers).

Additional P2 issues affect faceted filtering correctness, transaction/concurrency integrity, media consistency, moderation races, canonical slug consistency, and Vercel upload behavior.

---

## Critical / High findings

### F-01 — HIGH — Admin Homepage CTA open-redirect / external-navigation bypass
**Files**
- `src/lib/admin/homepage.ts:80-88`
- `src/components/store/hero.tsx:43-92`

The validator accepts any string beginning with `/`:
`v.startsWith('/')`.

That includes protocol-relative or browser-normalized forms such as:
- `//evil.example`
- `/\\evil.example`

Browser URL resolution turns these into an external URL. A direct proof against `new URL()` showed:
- `//evil.example` -> `https://evil.example/`
- `/\\evil.example` -> `https://evil.example/`

The Hero component decides "external" only when the value starts with `https://`, so these bypasses are rendered as internal anchors even though the browser can navigate away.

**Impact:** an authenticated admin who stores a crafted CTA can make a public banner navigate customers to an attacker-controlled origin; this is a phishing/open-redirect surface.

**Fix:** accept internal paths only when they start with exactly one `/`, contain no backslash, and are normalized as same-origin paths; keep the strict WhatsApp allowlist separately. Add adversarial tests for `//`, `/\\`, encoded forms, whitespace, and mixed slash variants.

### F-02 — HIGH — Direct Sharp dependency is below patched security baseline
**Files**
- `package.json`: direct dependency `"sharp": "^0.34.3"`
- `bun.lock`: resolved direct Sharp is `0.34.5`
- `src/lib/media/validation.ts:16-18, 78-128`

The application imports the direct Sharp package to parse attacker-controlled upload bytes with `sharp(bytes).metadata()`.

Sharp published a HIGH advisory affecting versions `<0.35.4` because of libheif vulnerabilities that can lead to possible RCE under certain glibc/Linux conditions; the project currently resolves direct Sharp to `0.34.5`. Sharp's security advisory list also records a newer HIGH vulnerability in librsvg dated 2026-09-30.

**Impact:** the image upload attack surface is directly exposed to a vulnerable image-processing dependency.

**Fix:** upgrade the direct Sharp dependency to a currently patched release (at least `>=0.35.4`; prefer the latest compatible release after a full lockfile + build regression), regenerate `bun.lock`, and rerun upload/magic-byte/dimension tests.

Source: https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c
Source: https://github.com/lovell/sharp/security/advisories

### F-03 — HIGH/P2 — Faceted filters can combine different variants incorrectly
**File**
- `src/lib/storefront/catalog.ts:289-302`

For each selected attribute group, the query adds an independent `EXISTS` against `product_variants`. That means:
- variant A may satisfy size=L
- variant B may satisfy color=red
- the product still passes size=L + color=red

This contradicts the expected single-variant semantics for a faceted variant filter.

**Impact:** customers can see products that do not actually have a single purchasable variant matching the selected combination.

**Fix:** use one candidate active variant scope that must satisfy ALL selected attribute groups for the SAME variant, e.g. grouped existence/HAVING over `variant_id` or nested same-variant predicates.

### F-04 — P2 — Product image `variantRef` can silently degrade to product-level image
**File**
- `src/lib/catalog/products.ts:605-610, 856-882`

A non-null `variantRef` is resolved with:
`finalIdByKey.get(image.variantRef) ?? null`

Unknown references become `null` instead of causing validation failure. That silently converts a variant-specific image into a generic product gallery image.

**Fix:** reject any non-null `variantRef` that cannot be resolved before deleting/reinserting the product's image rows.

---

## Database / concurrency / consistency findings

### F-05 — P2 — Missing composite FK: product image variant may belong to another product
**File**
- `src/db/schema/catalog.ts:257-296`

`product_images` has separate FKs from `product_id -> products.id` and `variant_id -> product_variants.id`, but no composite FK requiring the chosen variant's `product_id` to equal the row's `product_id`.

**Impact:** direct SQL or a future application bug can create cross-product image associations that the schema itself cannot reject.

**Fix:** add a composite uniqueness target on `product_variants(id, product_id)` and a composite FK from `product_images(variant_id, product_id)`.

### F-06 — P2 — Missing composite FK: order item variant may belong to another product
**File**
- `src/db/schema/customers-orders.ts:177-240`

`order_items` independently references `products.id` and `product_variants.id`. There is no composite constraint ensuring the variant belongs to the product snapshot relationship.

**Impact:** broken historical product/variant linkage is representable at DB level.

**Fix:** composite FK `(variant_id, product_id) -> product_variants(id, product_id)` using the same safety strategy as F-05.

### F-07 — P2 — Missing composite FK: review product can disagree with order item product
**File**
- `src/db/schema/reviews.ts:34-74`

`reviews.product_id` and `reviews.order_item_id` are separate foreign keys. A review can therefore reference product A and an order item for product B unless service code prevents it.

**Fix:** add composite FK `(order_item_id, product_id) -> order_items(id, product_id)` after checking existing data.

### F-08 — P2 — Canonical slug uniqueness is application-only
**File**
- `src/db/schema/catalog.ts:80-115`
- `src/lib/catalog/products.ts:667-693`

`canonical_slug` has no DB unique index. Application code checks conflicts, but concurrent writers can race.

**Impact:** duplicate canonical slugs can be committed under concurrency.

**Fix:** add a partial unique index for non-null canonical slugs plus serialization/locking for the cross-field invariant where canonical slug must not collide with another product's normal slug.

### F-09 — P2 — Category reparent cycle check is outside transaction
**File**
- `src/lib/catalog/categories.ts:149-168, 187-213`

The service computes descendants and validates the new parent before opening the transaction that performs the update.

**Impact:** two concurrent reparent operations can pass stale cycle checks and create an invalid tree.

**Fix:** perform the invariant check inside a transaction while holding a consistent category-tree advisory lock (or lock the relevant rows consistently), then update.

### F-10 — P2 — Review moderation has TOCTOU status race
**File**
- `src/lib/admin/reviews.ts:141-198`

The current review status is read first. The final UPDATE uses only `WHERE review.id = ...` and does not require the previously observed status.

Concurrent example:
1. Admin A reads `pending`
2. Admin B changes to `rejected`
3. Admin A later sets it to `approved`

**Impact:** a newer moderation decision can be silently overwritten.

**Fix:** use compare-and-swap (`WHERE id = ? AND status = previousStatus`) and treat zero updated rows as a conflict. Revalidate before/inside the transaction.

### F-11 — P2 — Testimonial update is a stale-snapshot lost-update risk
**File**
- `src/lib/admin/testimonials.ts:229-298`

The service loads the entire testimonial, then builds the transaction update using the old values for fields that were not part of the patch.

Concurrent admin edits can overwrite each other's changes.

**Fix:** update only fields explicitly present in the patch, or lock/re-read inside the transaction and apply the patch to the latest row.

### F-12 — P2 — Media provider cleanup can delete the wrong pathname
**File**
- `src/lib/media/service.ts:94-127`

The provider returns `stored.pathname`, but when DB registration fails the code deletes `pathname` (the pre-provider value), not `stored.pathname`.

The code itself comments that providers may canonicalize the stored path.

**Impact:** failed registry writes can leave orphaned provider objects.

**Fix:** on compensation, delete `stored.pathname`.

### F-13 — P2 — Review/testimonial publication can leave external media state ahead of DB state
**Files**
- `src/lib/admin/reviews.ts:158-170`
- `src/lib/admin/testimonials.ts` publication path

Media is materialized/publicized before the domain status transaction finishes.

**Impact:** DB failure or a moderation race can leave externally accessible media that is not yet represented as published in the domain state.

The controlled delivery route reduces public rendering risk, but provider/registry state can still drift.

**Fix:** use CAS status updates plus compensating media operations and explicit outbox/reconciliation semantics where provider mutation cannot be transactionally rolled back.

### F-14 — P2/P3 — Admin testimonial pagination count ignores status filter
**File**
- `src/lib/admin/testimonials.ts:319-374`

Rows query applies the selected status filter, while `count(*)` counts the entire table.

**Impact:** pagination totals are wrong whenever a filtered status is selected.

**Fix:** apply the same `where` predicate to the count query.

### F-15 — P2/P3 — Review pagination/statistics filtering must be audited similarly
**File**
- `src/lib/admin/reviews.ts`

The listing code uses status filtering while the broader statistics/counting logic is not consistently scoped to the same filtered dataset.

**Fix:** ensure every count used for pagination/filter display is derived from exactly the same predicate as the rows query.

### F-16 — P2/P3 — Public branding resolver relies on pathname denylist instead of explicit access mode
**File**
- `src/lib/admin/settings.ts:148-220`
- `src/lib/media/service.ts:182-200`

The branding resolver checks for `reviews/` and `testimonials/` path prefixes but does not require `media_assets.access_mode = public` in the selected row.

**Impact:** DB corruption or future namespace changes can bypass the pathname denylist and expose a non-public asset URL.

**Fix:** require `access_mode='public'` at the query level and keep namespace checks as defense in depth.

### F-17 — P2/P3 — Published testimonial SQL does not require access mode public
**File**
- `src/lib/storefront/reviews.ts:427-448`

The published testimonial query can select a published row regardless of `media_assets.access_mode`. The delivery route rejects private assets, so this can manifest as a broken public image instead of a privacy leak.

**Fix:** publication invariant should require a deliverable media state, or the feed should only select rows whose media is in a valid public/deliverable state.

---

## Authentication / throttling / reliability findings

### F-18 — P2 — Login success clears failure state across all IPs for the username
**File**
- `src/lib/auth/throttle.ts:128-145`

Successful login clears all `auth.login.failed` rows for the username, regardless of the current IP.

The surrounding code/comments model the identity as username + IP, so this weakens cross-IP spray tracking.

**Fix:** clear only the current username+IP failure bucket unless the intended policy is explicitly account-wide; if account-wide cooldown is desired, model it as a separate counter with separate semantics.

### F-19 — P2/P3 — Login session creation + last-login/audit are not atomic
**File**
- `src/app/api/admin/auth/login/route.ts:134-167`
- `src/lib/auth/session.ts:73-88`

On successful authentication, session creation happens first, then `lastLoginAt`, then activity logging. A later failure can return HTTP 500 after a session row already exists.

**Impact:** partial success state can exist after a failed HTTP response.

**Fix:** either wrap the business-side writes in one transaction or explicitly handle/compensate any post-session failure and ensure the response semantics match persisted state.

### F-20 — P2/P3 — Cart availability revalidation has no timeout
**File**
- `src/lib/storefront/cart-store.ts:228-261`

The client fetch has no `AbortSignal.timeout()`.

A permanently stalled request can keep `validating` active until browser/network timeout.

**Fix:** use a bounded client timeout (e.g. 8 seconds) and preserve the stale-known-good validation state.

---

## Public abuse / resource amplification

### F-21 — P2/P3 — Search suggestions has no durable rate limiting
**File**
- `src/app/api/storefront/search/suggestions/route.ts`

Public, uncached, no-store GET backed by a DB search. The endpoint is not rate-limited.

**Impact:** repeated automated queries can amplify database work.

**Fix:** short server-side rate limit keyed by hashed caller/IP and/or safe short-lived caching; preserve anonymous public access.

### F-22 — P2/P3 — Cart availability has no rate limiting
**File**
- `src/app/api/storefront/cart-availability/route.ts`

Public POST allows up to 50 UUIDs and executes live DB lookups without rate limiting.

**Impact:** DB query amplification is possible.

**Fix:** rate limit this read-only endpoint and/or apply controlled caching. Keep the 50-ID bound.

---

## Media / deployment findings

### F-23 — P2 — Vercel request-body limit conflicts with the app's 8 MB server upload contract
**Files**
- `src/lib/media/validation.ts:18`
- `src/app/api/admin/media/upload/route.ts:40-50`

Application validation accepts up to 8 MB, but Vercel Functions impose a 4.5 MB request body limit. The upload path sends the multipart file through the Function before calling the media provider.

**Impact:** images in the 4.5–8 MB range can fail in deployed Vercel even though the application's validator says they are acceptable.

Vercel explicitly recommends client-side/direct-to-Blob uploads for files larger than 4.5 MB. citeturn522753search0turn522753search7

**Fix options:**
- safest minimal change: lower the server-upload limit below 4.5 MB with a clear UI message; OR
- preferred scalable design: use authenticated Vercel Blob client uploads for large images, then register/validate server-side using the Blob reference.

### F-24 — P2/P3 — Admin upload buffers the whole file before validation
**File**
- `src/app/api/admin/media/upload/route.ts:40-50`

`request.formData()` is parsed and `file.arrayBuffer()` is fully materialized before validation.

**Impact:** unnecessary memory pressure under concurrent uploads.

**Fix:** reject via `file.size` as early as possible and prefer direct/client uploads for larger payloads. This is secondary to F-23.

### F-25 — P3 — Media library ordering is nondeterministic
**File**
- `src/lib/media/registry.ts:105-107`

Comment says newest-first, but query uses `.limit(limit)` without an `orderBy`.

**Impact:** media library order can vary between DB executions.

**Fix:** `orderBy(desc(createdAt), desc(id))`.

### F-26 — P3 — Order number uses Math.random()
**File**
- `src/lib/storefront/checkout.ts`

Order numbers use `Math.random()` instead of a cryptographic random source.

**Impact:** limited because tracking also requires the checkout phone, but a CSPRNG is the cleaner choice for customer-facing identifiers.

**Fix:** use `crypto.randomInt()` or `randomBytes()`.

---

## Configuration / security-hardening findings

### F-27 — P2/P3 — Production APP_URL fallback can generate localhost canonical/OG URLs
**Files**
- `src/app/layout.tsx:29-32`
- `src/lib/storefront/metadata.ts:94-102`

If `APP_URL` is missing/misconfigured, code falls back to `http://localhost:3000`.

**Impact:** broken production canonical URLs, Open Graph URLs, and structured-data absolute URLs.

**Fix:** fail fast in production when `APP_URL` is missing, or derive the trusted public origin from deployment configuration. Do not silently use localhost in production.

### F-28 — P2/P3 — CSP uses unsafe-inline for script and style
**File**
- `next.config.ts:39-42`

Current policy includes:
`style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';`

**Impact:** weaker XSS defense-in-depth.

**Fix:** evaluate nonce/hash-based CSP and remove `unsafe-inline` where framework/component requirements permit. This is hardening rather than evidence of a current exploit.

### F-29 — P3 — reactStrictMode is disabled
**File**
- `next.config.ts:20`

`reactStrictMode: false`.

**Impact:** reduced development-time detection of side effects and unsafe patterns.

**Fix:** enable if the application remains behaviorally correct after QA. Not a production security defect.

---

## API/HTTP consistency findings

### F-30 — P3 — Admin mutation routes do not consistently document/enforce no-store through the shared helper
Many mutation routes return plain `NextResponse.json()` instead of the shared `jsonOk()/withNoStore` path.

The central helper contract says admin mutations should be no-store, but the code is inconsistent across routes.

**Fix:** standardize all admin mutation responses through the same response helpers. Treat this as a consistency hardening item unless cache behavior is observed in a real intermediary.

---

## Test / operations observations

### F-31 — P3 — Verification scripts are mostly production-safe, but the safety model depends on NODE_ENV guards
The verification suite does contain explicit production refusal checks for most stateful scripts. This is good.

**Residual concern:** operational safety is partly based on environment mode rather than independently proving the target DB is non-production. An operator can theoretically run a dev-mode script with a production `DATABASE_URL`.

**Fix:** add an independent database-host/project/environment allowlist/fingerprint gate before every stateful verification script. Never rely on `NODE_ENV` alone.

---

## Design / UX review

### Source-based design score
| Dimension | Score |
|---|---:|
| First impression | 8.7 |
| Visual design | 8.8 |
| Hierarchy/layout | 8.7 |
| Typography | 9.0 |
| Color/contrast | 8.4 |
| UX/navigation | 8.2 |
| Conversion/CTAs | 8.4 |
| Mobile source quality | 8.8 |
| Accessibility source quality | 8.5 |
| Brand consistency | 9.0 |
| **Overall** | **8.6/10** |

This is a **source-code design score**, not a fresh browser screenshot score.

### What works
- Arabic-first RTL structure.
- Self-hosted Cairo variable font, avoiding build-time Google Fonts dependency.
- Warm ivory / burgundy / gold system is coherent and family-oriented.
- Responsive header and mobile drawer are designed intentionally.
- Product cards distinguish stock and pricing states.
- Focus/reduced-motion/accessibility patterns are present.
- WhatsApp/COD conversion path is visibly aligned with the store model.

### Design issues
1. Header department affordances should match behavior. A chevron/dropdown cue should not imply a submenu if the desktop control is just a direct link.
2. `overflow-x: clip` is useful as defensive containment, but it can conceal a real layout overflow defect; browser QA should verify geometry rather than treating clipping as a fix.
3. Contrast needs fresh browser-level verification for muted text and status chips.
4. The CTA problem F-01 is both a security defect and a conversion-trust defect.

Current live Vercel/browser visual state is **NOT PROVEN** from this ZIP alone.

---

## Dependency / web research

### Positive
The project uses Next.js `16.3.8`. Next.js announced its September 30, 2026 security release and specifically lists `16.3.8` as the Active LTS patched release. citeturn825204search0

### Negative: Sharp
Direct application Sharp resolves to `0.34.5`, below the patched `<0.35.4` boundary for the libheif HIGH advisory. citeturn825204search5

### Negative: Drizzle
The project uses `drizzle-orm 0.45.3` with `pg`. Drizzle has an open issue describing pooled `transaction()` leaking a pool client when `BEGIN` fails in the node-postgres driver; the issue explicitly notes the same shape in the 0.45.x line. citeturn825204search1turn825204search3

**Important:** this is a real upstream reliability risk, but I am NOT classifying every deployed failure as proven. It needs a targeted reproduction or patched dependency decision before changing production code.

### Vercel upload
Vercel Functions enforce a 4.5 MB request-body limit and explicitly recommend client-side/direct-to-Blob uploads for larger files. citeturn522753search1turn522753search7

---

## Highest-priority repair queue

### P0 / immediate
1. F-02 Sharp upgrade.
2. F-01 CTA URL validation.

### P1 / correctness & integrity
3. F-03 same-variant facet filtering.
4. F-10 review moderation CAS.
5. F-11 testimonial lost-update prevention.
6. F-12 media compensation pathname.
7. F-04 invalid variantRef rejection.
8. F-08 canonical slug uniqueness/serialization.
9. F-09 category mutation serialization.
10. F-23 upload architecture/limit reconciliation.

### P2 / data model hardening
11. F-05/F-06/F-07 composite FKs.
12. F-16/F-17 media access-mode invariants.
13. F-14/F-15 filtered pagination counts.
14. F-19 login atomicity.
15. F-18 login-throttle semantics.
16. F-21/F-22 public endpoint abuse controls.

### P3 / polish
17. F-20 cart timeout.
18. F-25 media ordering.
19. F-26 CSPRNG order numbers.
20. F-27 APP_URL fail-fast.
21. F-28 CSP hardening.
22. F-30 response-helper consistency.
23. F-31 stronger environment safety for verification scripts.

---

## What is NOT PROVEN from this artifact alone

- Live Production Neon row-level integrity.
- Live Vercel environment variable correctness.
- Preview→Neon environment isolation.
- Current Production Blob credentials/runtime.
- Fresh browser visual QA against the deployed app.
- Real concurrent checkout race behavior against Neon.
- Actual production upload behavior at 4.5–8 MB.
- Current branch protection state after later GitHub changes.

Those require live authenticated verification and must not be inferred from source or historical audit logs.

## Final forensic assessment

The previous "348 files / 0 missing" gate proves **source-tree completeness**, not application correctness.

This deeper audit finds enough real issues that the project should be treated as:

**STATUS: REPAIR REQUIRED**

and not yet as final-release-ready.

The fixes should be applied in small, isolated packages, with typecheck/lint/build + focused verification after each package, followed by a fresh full Integration/Continuity Gate and browser QA.
