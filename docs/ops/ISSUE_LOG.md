# Issue Log

## Required format
### ISSUE-YYYY-MM-DD-NNN
- Phase:
- Severity:
- Status: OPEN / FIXED / BLOCKED / ACCEPTED
- Symptom:
- Reproduction:
- Root cause:
- Minimal fix:
- Verification:
- Related files:
- Notes:
---

### ISSUE-2026-09-29-062
- Phase: PHASE_11 (final gate — production smoke round 1, 2026-09-29)
- Severity: MEDIUM (SEO — absolute URLs in production metadata resolved to a localhost origin)
- Status: FIXED
- Symptom: production homepage/category canonical + og:url and the robots.txt Sitemap reference rendered `http://localhost:3000/…` on https://amira-store-opal.vercel.app (caught by the final-gate production smoke, NOT by local suites — the local APP_URL contract value IS localhost:3000, so verify:seo 105/105 was correct locally).
- Reproduction: curl production / and /robots.txt; canonical/meta/og and Sitemap line all carried the localhost origin.
- Root cause: the documented origin contract is `APP_URL` (metadata.ts + robots.ts fallback `|| "http://localhost:3000"`); the development environment defines APP_URL but the PRODUCTION environment was missing the variable entirely (verified via the Vercel env API) — the fallback therefore engaged in production.
- Minimal fix: environment-only — created `APP_URL=https://amira-store-opal.vercel.app` on the production target via the Vercel API (control-plane config of the existing project; zero application-code changes; documented contract honored). robots.txt is build-time (redeploy required); canonical/og:url resolve at runtime.
- Verification: production re-smoke after redeploy — canonical/og:url/Sitemap references carry the production origin (see the final-gate audit record); local verification unchanged (tree untouched by the fix).
- Related files: none (environment configuration only; contract documented in src/lib/storefront/metadata.ts + src/app/robots.ts)
- Notes: the env API listed 23 production variables after creation; no other variable was touched; no second project/store created.

### ISSUE-2026-09-29-061
- Phase: PHASE_11 (final gate, 2026-09-29)
- Severity: LOW (environment recurrence — detected and resolved at the final gate; zero user impact)
- Status: FIXED
- Symptom: the local PHASE-11 auto-snapshot commit (`543c61f`, sandbox-generated UUID message) carried the DELETION of `src/app/api/admin/media/upload/route.ts` (−71 lines) although nothing in the PHASE-11 round (SEO/perf/a11y scope; ISSUE-057…060) touched or removed it; any deploy of that tree would have dropped the admin media-upload capability from production.
- Reproduction: `git show 543c61f --stat` lists the route as deleted; the file is present in `origin/main` (a681be0); admin settings UI posts to this route.
- Root cause: THIRD recurrence of the documented sandbox-recycle file-loss pattern (ISSUE-038 behavior): snapshot excludes the file, the platform auto-commit records the deletion. Prior recurrences: snapshot `c3f982a` (reverted at reconciliation, worklog 2026-09-28) and the a2bacc7-era recycle (restored from origin/main before the PHASE-10 governance round, worklog). Not an intentional change: the deletion appears in NO issue entry, no worklog record, and has no rationale inside the PHASE-11 scope.
- Minimal fix: restored the file byte-identically from `origin/main` at the final gate (`git restore --source=origin/main`), worktree blob hash == origin blob hash (`5198d94c…`); no other file touched.
- Verification: focused live probe of the restored route 7/7 (GET 405, cross-origin 403, unauth 401, missing-file 400, real multipart upload 200 → PUBLIC store namespace `…public.blob.vercel-storage.com`, zero-residue cleanup via the registry service); typecheck + lint + build green with the route present; full battery 756/756 on the restored tree.
- Related files: `src/app/api/admin/media/upload/route.ts`
- Notes: deploy discipline reaffirmed — production deploys must always be gated on a tree reconciled against `origin/main` after any sandbox recycle.

### ISSUE-2026-09-29-057
- Phase: PHASE_11 (browser QA, 2026-09-29)
- Severity: MEDIUM (a11y — the global skip-link target was dead on three storefront routes)
- Status: FIXED
- Symptom: `/checkout`, `/cart`, and `/order/success` rendered NO `<main>` landmark; the root layout's global skip link (`href="#main-content"`) therefore pointed at a non-existent id on those routes and activating it did nothing.
- Reproduction: agent-browser DOM probe — `document.querySelectorAll('main').length === 0` on all three routes while the skip link targets `/#main-content`; siblings (home/category/product/search/about/contact + policies via PolicyShell) all render `<main id="main-content">`.
- Root cause: those three pages were built as `<Section><Container>…</Container></Section>` without the per-page `<main id="main-content" tabIndex={-1} className="flex-1 outline-none">` wrapper the sibling pages use (PHASE-05 pattern).
- Impact: keyboard/screen-reader users lost the skip-link affordance and the main landmark on the cart → checkout → success journey (WCAG landmark/bypass failure).
- Minimal fix: wrap each of the three pages in the exact sibling `<main id="main-content" tabIndex={-1} className="flex-1 outline-none">` pattern; add a permanent HTTP-level regression check (`verify:seo` section F: main landmark on /, /about, /contact, /cart, /checkout).
- Verification: `verify:seo` 105/105 including the new landmark checks; standalone production build serves `<main id="main-content" tabindex="-1">` on /checkout and /cart; skip link reveals on focus and moves focus to main in the browser.
- Related files: `src/app/(store)/checkout/page.tsx`, `src/app/(store)/cart/page.tsx`, `src/app/(store)/order/success/page.tsx`, `scripts/verify-seo.ts`
- Notes: policy pages were already compliant via `PolicyShell`'s own main landmark.

### ISSUE-2026-09-29-058
- Phase: PHASE_11 (browser QA, 2026-09-29)
- Severity: LOW (a11y — WCAG 2.2 AA 2.5.8 Target Size Minimum on product-card title links)
- Status: FIXED
- Symptom: product-card title `<Link>`s measured ~20px touch height at 375px width (inline box = one text line), under the 24×24 CSS-px AA minimum.
- Reproduction: agent-browser bounding-box audit of `h3 a` inside ProductCard at 375px → min dimension < 24.
- Root cause: inline anchor inside the line-clamped `h3` has no vertical padding; the reserved `min-h` sits on the h3, not the link.
- Impact: undersized text-link touch targets on every card grid; the card image area remains a full-size duplicate pointer target for the same URL, so the affected path is keyboard/touch on the text link.
- Minimal fix: `inline-block py-1 -my-1` on the title link — extends the hitbox past 24px (measured 47px) with zero layout shift (negative margin compensates the padding).
- Verification: agent-browser re-measure → 47×47px; card row rhythm unchanged (visual QA 375/768/1440); battery green.
- Related files: `src/components/store/product-card.tsx`
- Notes: header utility buttons (36/32px) and the WhatsApp FAB (48px) already satisfy the 24px AA minimum; no other undersized targets found at 375.

### ISSUE-2026-09-29-059
- Phase: PHASE_11 (responsive-image audit, 2026-09-29)
- Severity: MEDIUM (latent correctness gap — admin-uploaded product images could not render through the next/image pipeline)
- Status: FIXED
- Symptom: `next.config.ts` had NO `images.remotePatterns`, while `media_assets.url` stores provider-truth Blob CDN URLs (`https://<store>.public.blob.vercel-storage.com/…`) for admin uploads; ProductCard/PDP render gallery images through `next/image`, which refuses unconfigured remote hosts at render time.
- Reproduction: read `src/lib/media/vercel-blob.ts` (`url: blob.url` registration) + next.config.ts; any admin-uploaded product image referenced by ProductCard/PDP would hit the Next.js "hostname is not configured under images" error.
- Root cause: PHASE-04/05 image work was verified with the local `/brand/demo/*.svg` seed media (local paths need no remotePatterns); the remote-host path was never exercised end-to-end through next/image.
- Impact: the first real admin-uploaded product image would break the card/PDP render in production; also blocked the PHASE-11 responsive-image optimization goal for uploaded media.
- Minimal fix: `images.remotePatterns = [{ protocol: 'https', hostname: '**.public.blob.vercel-storage.com' }]`. The PRIVATE store host is deliberately NOT allow-listed — private originals are only ever delivered through the gated `/api/media/[id]` route (ISSUE-048 contract) and must never enter the public optimizer or its cache.
- Verification: build + production standalone render green; decision documented in the next.config comment; hero banners/review/testimonial images intentionally stay raw `<img>` per the ISSUE-049 AssetImage precedent (gated delivery semantics) — untouched.
- Related files: `next.config.ts`
- Notes: PHASE-11 perf directive #1 ("audit responsive images using the existing media architecture") — the allow-list enables responsive srcset optimization for uploaded public media without touching the storage architecture.

### ISSUE-2026-09-29-060
- Phase: PHASE_11 (client-JS audit, 2026-09-29)
- Severity: LOW (pre-existing deviation from DESIGN_SYSTEM's documented launch gate)
- Status: FIXED
- Symptom: the 411-line QA playground client component (`ComponentPlayground`, dialog/tabs/table/toaster primitives) rendered on the PRODUCTION homepage as a fixed overlay + shipped client chunk.
- Reproduction: DESIGN_SYSTEM.md states the playground "is a development/QA aid — gate or remove before launch phases"; the homepage mounted it unconditionally.
- Root cause: the launch gate was documented but never wired to a mechanism (the playground predates it from PHASE-01; PHASE-10 scope ended at minimal metadata).
- Impact: unnecessary client JS + a QA-only floating control on the customer homepage (bottom-end, next to the WhatsApp FAB).
- Minimal fix: `{process.env.NODE_ENV === "development" ? <ComponentPlayground /> : null}` in the homepage — NODE_ENV is build-inlined, so the chunk and overlay disappear from production bundles while dev QA keeps the tool.
- Verification: production standalone HTML contains zero playground markers; dev server still renders it; build green.
- Related files: `src/app/(store)/page.tsx`
- Notes: satisfies PHASE-11 perf directive #3 (reduce unnecessary client JS) using the exact mechanism DESIGN_SYSTEM anticipated.

### ISSUE-2026-09-29-056
- Phase: PHASE_10 closure (governance/documentation-only round, 2026-09-29)
- Severity: LOW (documentation governance; zero executable impact)
- Status: FIXED
- Symptom: owner reported a phase-numbering conflict — the repository was said to contain `AMIRA_STORE_GITLAB_AI_MASTER_EXECUTION_PLAN.md`, a legacy plan using divergent numbering (PHASE-09=Checkout, PHASE-10=Order Tracking, PHASE-11=Reviews) contradicting the canonical structure (PHASE-08=Inventory+Order Management, PHASE-09=Reviews+WhatsApp Testimonials, PHASE-10=Homepage+Content Pages+Settings-Driven Branding).
- Reproduction: `git ls-files | grep AMIRA_STORE` → empty; `git log --all -- AMIRA_STORE_GITLAB_AI_MASTER_EXECUTION_PLAN.md` → empty.
- Root cause: the document does not exist in this repository at all — absent from the working tree, the complete git history of every branch, every remote ref (main @ a2bacc7, phase-00/bootstrap-preview @ e7e1c49), and the /tmp mirror; no tracked file or worklog entry references the filename, "GITLAB", or the legacy numbering. It is an external/GitLab-era planning artifact; the reported in-repo conflict therefore cannot exist.
- Impact: none on executable code. Residual risk only: someone comparing this repository against the external legacy document could apply its obsolete numbering.
- Minimal fix: canonical phase authority documented in `EXECUTION_STATUS.md` (GOVERNANCE_NOTE, 2026-09-29): MASTER_PLAN.md (§29) + docs/phases/PHASE-00…PHASE-15 are the sole canonical phase source; the legacy document is ruled HISTORICAL/NON-BINDING. No legacy file was fabricated or restored; no historical documentation erased; no application code touched.
- Verification: repo-wide `git grep` sweeps (legacy mappings PHASE-09+checkout / PHASE-10+order-tracking / PHASE-11+reviews; the filename; "gitlab") = ZERO matches. `EXECUTION_STATUS.md`: PHASE_07..10 canonical and COMPLETE, PHASE_11 LOCKED, LAST_COMPLETED_PHASE=PHASE_10. `docs/qa/TRACEABILITY.md`: 09=reviews/testimonials, 10=homepage+D-1..D-6 decisions, no legacy mapping. Documentation-only change → full regression NOT rerun (executable files untouched, per owner directive).
- Related files: `EXECUTION_STATUS.md`, `docs/ops/ISSUE_LOG.md`, `worklog.md`
- Notes: canonical mapping cross-checked against docs/phases/PHASE-07…11 titles. Out-of-scope observation (recorded, not acted on): docs/ops/PROJECT_STRUCTURE.md's tree snapshot predates the PHASE-09/10 routes — a documentation-freshness matter, not a numbering conflict; candidate for a future docs round.

### ISSUE-2026-09-29-051
- Phase: PHASE_10 (implementation round, 2026-09-29)
- Severity: MEDIUM (audit-integrity defect; every settings mutation failed AFTER committing its change)
- Status: FIXED
- Symptom: the first live run of `verify:homepage` aborted with `invalid input syntax for type uuid: "1"` (22P02) on `INSERT INTO admin_activity_logs` triggered by `updateStoreSettings`.
- Reproduction: call any settings mutation (update / logo / favicon) → the settings UPDATE commits, then `recordAdminActivity` throws.
- Root cause: `admin_activity_logs.entity_id` is a uuid column; the settings service passed the singleton's INTEGER row id (`'1'`) as its entity id.
- Impact: settings changes were persisted but every mutation surfaced an unexpected error (500 at the API layer) and wrote no audit row — an inconsistent mutation/audit state.
- Minimal fix: singleton mutations now run the update + ONE sanitized audit row in a SINGLE transaction; the row is identified by `entityType: 'store_settings'` + `metadata.singleton = 1` with `entityId: null` (uuid column contract respected). Applied to `updateStoreSettings`, `updateStoreLogo`, `updateStoreFavicon`.
- Verification: `verify:homepage` 57/57 (settings mutation gates + audit writes inside transactions); repeated settings save/delete/reset round-trips in browser E2E all 200; dev.log shows zero 5xx across the entire round.
- Related files: `src/lib/admin/settings.ts`
- Notes: mutation+audit atomicity now matches the established admin-service pattern (orders/reviews/testimonials).

### ISSUE-2026-09-29-052
- Phase: PHASE_10 (implementation round, 2026-09-29)
- Severity: MEDIUM (contract violation: silent error-shape change)
- Status: FIXED
- Symptom: `validateSectionConfig(key, null)` — the documented "restore code defaults" contract for section configs — threw `HomepageServiceError: Invalid input: expected object, received null` (400) instead of clearing the config.
- Reproduction: `PATCH /api/admin/homepage/sections/<announcement-id>` with `{"config": null}` → 400.
- Root cause: the per-key zod schema was applied to the raw value before the null-clear case was handled.
- Impact: admins could not restore a section's default copy once a config had been saved (the storefront would show curated copy forever); the homepage-manager's clear flow failed with an honest error.
- Minimal fix: null/undefined short-circuits to `null` (restore defaults) inside `validateSectionConfig` BEFORE schema evaluation; real schema violations still throw.
- Verification: `verify:homepage` sections 5/6 (config message → fallback → cleared → BRAND default) 57/57; browser E2E: setting then clearing the announcement message via the UI returns the storefront to the BRAND default copy.
- Related files: `src/lib/admin/homepage.ts`
- Notes: the admin homepage manager additionally normalizes empty-string fields to omitted and a fully-empty config to `null` client-side, mirroring the server contract (real keyboards firing onChange are unaffected; automation `fill("")` short-circuits the input event — recorded for future E2E authoring).

### ISSUE-2026-09-29-053
- Phase: PHASE_10 (implementation round, 2026-09-29)
- Severity: MEDIUM (build breakage caught before push)
- Status: FIXED
- Symptom: `bun run build` failed prerendering `/policies/privacy` — the (store) layout's server components (StoreHeader category tree, settings-driven branding) queried the database at BUILD time with no reachable DATABASE_URL (`ECONNREFUSED`).
- Reproduction: `bun run build` on the PHASE-10 tree.
- Root cause: the five NEW static-content pages (about/contact/policies/*) lacked the dynamic declaration every other storefront page carries; static prerendering pulled the DB-backed layout into the build worker.
- Impact: build failed; no runtime or data impact.
- Minimal fix: `export const dynamic = "force-dynamic"` added to the five new pages — identical to the existing storefront pattern (cart/search/review/order-success/homepage all declare it), so this introduces zero behavioral change and keeps the build environment database-independent.
- Verification: `bun run build` succeeds (route table lists /about /contact /policies/{privacy,terms,shipping} as ƒ dynamic); full battery re-run green.
- Related files: `src/app/(store)/about/page.tsx`, `src/app/(store)/contact/page.tsx`, `src/app/(store)/policies/{privacy,terms,shipping}/page.tsx`
- Notes: STATIC export was considered and rejected — those pages render settings-driven branding (favicon/footer/contact channels), and forcing the layout DB-free would complicate the PHASE-01 contract for no measured gain; documented here per ERROR_PROTOCOL.

### ISSUE-2026-09-29-054
- Phase: PHASE_10 (implementation round, 2026-09-29)
- Severity: LOW (honest-503 mapping was silently absent)
- Status: FIXED
- Symptom: `errorResponse()` (shared admin API error mapper) did not recognize `MediaStorageUnavailableError`, so the DOCUMENTED honest contract ("the endpoint answers 503 with the exact remediation", MASTER_PLAN §20 / PHASE-04 docs) was in practice mapped to a generic 500 on every route relying on the mapper.
- Reproduction: without Blob credentials, `POST /api/admin/media/upload` throws `MediaStorageUnavailableError` (status 503) → `errorResponse` fell through to the unexpected-error branch → 500.
- Root cause: the class carries `.status = 503` but was never added to the mapper's known-error list when introduced in PHASE-04.
- Impact: the unconfigured-storage state still showed the honest Arabic UI banner, but the HTTP contract differed from the documented one (500 vs 503).
- Minimal fix: `MediaStorageUnavailableError` added to `errorResponse`'s known list (its own `.status` 503 + exact remediation message then flow through the standard path).
- Verification: typecheck/lint/build clean; the mapping path is exercised by the shared suites that throw this error in unconfigured environments; documented as a discovered pre-existing defect, minimal fix only.
- Related files: `src/lib/api/admin.ts`
- Notes: no behavior change for configured environments; production carries OIDC credentials so the honest path is dormant there.

### ISSUE-2026-09-29-055
- Phase: PHASE_10 (browser E2E, 2026-09-29)
- Severity: LOW (pre-existing, console-only cosmetic artifact)
- Status: OPEN (out of PHASE-10 scope — no unrelated code touched)
- Symptom: React hydration attribute mismatch warning on `aria-controls="radix-…"` of the storefront header's mobile-menu `SheetTrigger` after admin→storefront client navigation.
- Reproduction: login to admin → navigate client-side to `/` → console shows the mismatch once.
- Root cause: Radix primitives generate the `aria-controls` id from React `useId`, which can differ between the streamed server snapshot and the client render on client-side re-navigation. The involved component (`src/components/store/store-header.tsx`, PHASE-05) is untouched by PHASE-10; the warning is console-only (UI renders and functions correctly, snapshot tree matches).
- Impact: cosmetic console warning; no functional, data, or accessibility impact observed (the sheet opens/closes correctly in E2E).
- Minimal fix: intentionally NOT applied this phase — the strict one-phase/no-unrelated-refactor rule wins; recorded for a future hardening round (candidate: stable `useId` seeding or upgrading the Radix slot chain).
- Verification: not applicable (no code change).
- Related files: `src/components/store/store-header.tsx` (pre-existing)
- Notes: recorded per the transparency rule — "never hide an error" — after root-causing it to a PHASE-00→09 code path.

### ISSUE-2026-09-28-050
- Phase: PHASE_09 (admin media content route, 2026-09-28) — fixed during browser QA
- Severity: LOW (admin-only preview route; dev-seed demo assets triggered it; Production business baseline has ZERO media so no production impact)
- Status: FIXED
- Symptom: `GET /api/admin/media/[id]/content` returned **500** for two media assets in the admin reviews/testimonials previews while returning 302 for others; dev.log showed `[admin-mutation] unexpected failure Error`.
- Reproduction: preview any `demo_seed`-provider asset (e.g. `demo/testimonial-1.png`) → 500.
- Root cause: TWO stacked defects in the new route: (1) `NextResponse.redirect(asset.url)` throws when the registry URL is not absolute — demo_seed assets carry seed-relative placeholder URLs (`/demo/…`); (2) `getPrivate()` did not catch `BlobNotFoundError`, so a `private` asset whose object is absent from the Blob store (demo assets never existed there) surfaced as an unhandled provider error instead of an honest 404.
- Minimal fix: (1) resolve the redirect target against the request origin — `new URL(asset.url, new URL(_request.url).origin)` — which is correct for BOTH provider-absolute and seed-relative URLs; (2) `getPrivate` catches `BlobNotFoundError` → returns null → route answers 404.
- Verification: the two previously-500ing assets now 302; a disposable private asset probe streamed through the authed route (200, `image/png`, byte-identical 150×120 PNG) then removed with zero residue; verify:reviews 68/68; typecheck/lint green.
- Related files: `src/app/api/admin/media/[id]/content/route.ts`, `src/lib/media/vercel-blob.ts`
- Notes: the route's catch-all intentionally logs error NAME only (no internals); the root cause was found by out-of-route reproduction, not by widening logs.

### ISSUE-2026-09-28-049
- Phase: PHASE_09 (storefront social-proof imagery, 2026-09-28) — fixed during browser QA
- Severity: MEDIUM (PDP client-side crash — Application error — whenever an APPROVED review with an image was rendered; caught by the browser E2E before any deploy)
- Status: FIXED
- Symptom: `/product/liquid-foundation` crashed client-side with "next-image-unconfigured-host" as soon as the approved review's image URL (Vercel Blob host `*.public.blob.vercel-storage.com`) reached `<Image>`; the whole page fell to the Application-error shell.
- Reproduction: approve a review that carries an image (blob URL) → open the PDP → client exception.
- Root cause: `next/image` requires every remote host in `images.remotePatterns`; the media abstraction (PHASE-04, `AssetImage` precedent) deliberately does NOT anticipate provider hosts — "media URLs may be local placeholders (development seed) or Vercel Blob public URLs (production)". Review/testimonial imagery is the first STOREFRONT surface rendering provider-hosted registry URLs.
- Minimal fix: render user-uploaded media with plain `<img loading="lazy">` exactly per the `AssetImage` precedent (width/height kept for layout stability) in `ProductReviews` and `WhatsAppTestimonialCard`. No `next.config` host list — keeps the provider abstraction honest.
- Verification: PDP renders the approved review with badge + image; homepage renders the review card + testimonial cards; no console errors; visual QA 375/768/1440 inspected personally; verify:storefront 101/101; build green.
- Related files: `src/components/store/product-reviews.tsx`, `src/components/store/whatsapp-testimonial-card.tsx`
- Notes: the homepage social-proof cards already used `<img>` (written that way initially); the inconsistency between the two components is what the E2E exposed.

### ISSUE-2026-09-28-048
- Phase: PHASE_09 (media privacy model, 2026-09-28) — RESOLVED-BY-DECISION → **RESOLVED (REAL PRIVATE STORAGE, 2026-09-28 PHASE-09 closure — see FINAL RESOLUTION below; history preserved)**
- Severity: MEDIUM (blocks the storage-level interpretation of "unapproved screenshot media should not be publicly exposed"; application-level control still fully achievable)
- Status: **RESOLVED (FINAL — real private Blob store + controlled app delivery; previous residual ELIMINATED)**
- **FINAL RESOLUTION (2026-09-28, PHASE-09 closure directive — REAL PRIVATE STORAGE, residual ELIMINATED):** the owner rejected app-level-only privacy. Implemented the Vercel-documented TWO-STORE architecture:
  * **Real PRIVATE Blob store created + connected** via the Vercel REST API: `POST /v1/storage/stores/blob {name:"amira-testimonials-private", access:"private"}` → `store_VAQxupBfERVrTG8s` (access:"private", region iad1, status available); connected to project amira-store with env prefix BLOB_PRIVATE → Vercel injected `BLOB_PRIVATE_READ_WRITE_TOKEN` (store-scoped, encrypted env var, targets production+preview+development). The existing PUBLIC store (amira-store-media, OIDC model) is UNTOUCHED — product imagery path preserved; OIDC remains the public store's credential model.
  * **Provider two-store routing (minimal extension)**: `vercel-blob.ts` routes private-accessMode puts + private-namespace reads/deletes (`isPrivateStorePathname`: `reviews/`, `testimonials/` prefixes) to the PRIVATE store via the per-call token; the public path is byte-for-byte unchanged. A private-store object's URL (`*.private.blob.vercel-storage.com`) is NOT publicly readable — storage-level privacy, structural.
  * **Controlled app delivery** (the Vercel-documented private-blob delivery pattern; chosen over signed URLs and public derivatives): new public route `GET /api/media/[id]` streams approved content server-side ONLY when (1) registry access_mode='public' AND (2) the owning entity status permits (published testimonial / approved review; unowned→registry gate); no-store; X-Content-Type-Options:nosniff. Public-store pathnames 302 to the CDN. The ORIGINAL NEVER LEAVES THE PRIVATE STORE — publish/hide/re-publish are pure registry+status flips.
  * **Feed mapping**: storefront review/testimonial feeds emit `/api/media/<assetId>` for private-store originals (single shared SQL helper `publicDeliveryUrlSql` in the media service — zero duplication); admin manager previews via the admin content route (now streams private-store objects at ANY access_mode, since their provider URL is never publicly readable).
  * **EXACT EVIDENCE (verify:reviews 84/84, all new storage-level probes)**: draft original lives in the private store (`testimonials/2026-09/…`); registry URL is the `.private.blob` host; **direct unauthenticated GET of the private original → 403 (also HEAD)**; authorized server-side read → 200 byte-identical (1004B=1004B); delivery route: draft/pending → 404, published/approved → 200, hidden → 404, re-published → 200; publish without privacy confirmation → 422 (unchanged contract); invalid id → 400, unknown uuid → 404, POST/PUT/DELETE → 405, traversal/SQL-ish → 400; cleanup left **zero private-store objects (storage-level zero residue, list-verified)**. Browser E2E: admin login → hidden/published previews stream; UI hide → delivery 404; UI re-publish → two-step privacy confirmation → delivery 200; homepage/PDP images render via `/api/media/<id>` at 375/768/1440. Full battery after the change: verify:reviews 84/84, verify:storefront 101/101, verify:catalog 43/43, db:verify 29/29, verify:auth 44/44, verify:cart 59/59, verify:checkout 134/134, verify:orders 100/100, typecheck ✅ lint ✅ build ✅ (route table carries `/api/media/[id]`), orphan scan 14/14 CLEAN, production deployment of the closure commit verified READY with the private-store env var present.
  * Residual from the previous model: **ELIMINATED** — no private asset is CDN-readable by a learned URL anymore.
- Symptom: `verify:reviews` section 8 FATAL at the first private upload: `Vercel Blob: Cannot use private access on a public store. The store must be configured with private access.`
- Reproduction: any `put(pathname, body, { access: 'private' })` against the connected `amira-store-media` store.
- Root cause: the connected Blob store is PUBLIC-mode. Vercel Blob enforces per-STORE access configuration: a public store refuses private blobs outright (SDK probe: put-private throws; get-private on a public-stored object returns 200).
- Impact: storage-level per-object privacy is NOT available on this store. The PHASE-09 privacy requirement must be enforced at the APPLICATION layer.
- Minimal fix (implemented): the `media_assets.access_mode` registry column (PHASE-02) becomes the authoritative app-level gate — private assets are (a) stored under unguessable capability pathnames (uuid+timestamp), (b) NEVER rendered by any public surface, (c) NEVER returned by any public API (admin lists null out private URLs), (d) previewable ONLY through the admin-session-gated `/api/admin/media/[id]/content` route (server-side authenticated stream); approval/publish flips the REGISTRY access_mode — the application's deliberate disclosure decision. Provider `put` always stores blob access 'public' (store constraint), documented in `vercel-blob.ts`.
- Verification: verify:reviews 68/68 (private-while-pending → feed excludes; flip at approval → feed carries the URL; admin list hides private URLs); browser E2E draft-preview + publish flow; production decision unchanged.
- Related files: `src/lib/media/vercel-blob.ts`, `src/lib/media/service.ts` (`materializeMediaPublic` = registry flip), `src/lib/admin/reviews.ts`, `src/lib/admin/testimonials.ts`
- Notes (RESIDUAL, accepted for now): a private asset's underlying object is CDN-readable by anyone who LEARNS its URL from OUTSIDE the application — the app never discloses it, but the capability URL itself is not storage-protected. TRUE storage-level privacy requires either a second PRIVATE-mode Blob store for moderated media or a store-mode change (would affect existing public catalog media) — an OWNER infrastructure decision; recorded as a PHASE-14 hardening candidate. DATA_DICTIONARY decision #16 documents the model.

### ISSUE-2026-09-28-047
- Phase: PHASE_08 (schema change for the order domain, 2026-09-28) — environment/tooling
- Severity: MEDIUM (migration tooling false-positive; caught by db:verify before any harm; Production untouched)
- Status: FIXED
- Symptom: `bun run db:migrate` reported "migrations applied successfully!" while applying NOTHING — the new migration 0002 was not executed on the Neon development branch (`__drizzle_migrations` stayed at 2 rows; the old index definition remained), yet `db:verify` then failed with `applied=2 repository=3`.
- Reproduction: `set -a; . ./.env.local; set +a; bun run db:migrate` → success message; index unchanged on the target DB.
- Root cause: `drizzle/meta/_journal.json` entry for 0002 was generated with `when=1790616645445`, which is OLDER than entry 0001's hand-set recovery stamp `when=1790700000000` (set during the ISSUE-2026-09-27-037 snapshot-recovery reconciliation). drizzle-kit's migrate treats out-of-order journal timestamps as already-applied and silently no-ops.
- Minimal fix: corrected the 0002 journal `when` to `1790700000001` (immediately after 0001, before the migration was ever applied anywhere) and re-ran `db:migrate` — migration 0002 then applied for real (3 rows; refined index live).
- Verification: `db:verify` 29/29 (migrations current 3/3 + both refined cancellation-return probes pass); direct `pg_indexes` probe shows the `(order_id, variant_id)` partial unique index on the Neon development branch.
- Related files: `drizzle/meta/_journal.json`, `drizzle/0002_cute_frightful_four.sql`, `scripts/verify-migrations.ts`
- Notes: (1) a secondary latent bug was fixed in the same pass — the newly added `expectAccept` helper in verify-migrations.ts originally returned silently on success, under-reporting the pass count; now records the pass (29/29). (2) Lesson recorded: after ANY migration generation, `db:verify`'s "migrations current" check is the authoritative confirmation — a bare migrate success message is not.

---

### ISSUE-2026-09-28-044
- Phase: FULL-SYSTEM AUDIT (pre-PHASE-08 final gate, 2026-09-28) — sandbox environment
- Severity: HIGH-in-effect, ENVIRONMENT-ONLY (blocked the live admin login path in the recycled sandbox; zero application defect; Production unaffected)
- Status: FIXED (environment fix; no code change)
- Symptom: every `POST /api/admin/auth/login` request that reached the credential path returned 500 from the dev server; dev.log showed only `[auth/login] handler failure object Error`. CSRF gates still behaved correctly (cross-origin/no-origin/text/plain → 403), and storefront pages were healthy — only the credential path 500'd.
- Reproduction: fresh dev server started from `.env.rehearsal` (which carried ONLY `DATABASE_URL` after the documented snapshot credential-wipe) → same-origin wrong-credentials login → 500 (repeated deterministically; earlier same-origin 401s in prior sessions ran against servers whose env still had the secret).
- Root cause: the dev-server process env lacked `AUTH_SESSION_SECRET`. `hashIp()` → `requireSessionSecret()` fails closed with a clear error (`AUTH_SESSION_SECRET is not configured…`) by design — the login route calls `getClientIpHash()` before credential work, so the deliberate throw surfaces as a 500. The snapshot machinery that excludes secret files had stripped the secret from the rehearsal env (ISSUE-2026-09-27-037 class); the file was never corrupted and the code is correct.
- Minimal fix: generated a strong random secret (`openssl rand -hex 32`), appended `AUTH_SESSION_SECRET` to git-ignored `.env.rehearsal` only, restarted the dev server with the documented env-sourced protocol (ISSUE-2026-09-27-025 protocol). Zero code changes.
- Verification: full battery re-run after restart — throttle 5×401 → 429 (with per-username/IP identity), successful login 200 + `HttpOnly; SameSite=lax; Path=/` host-only cookie + no-store, cross-site logout 403 with session surviving, same-origin logout 200 revoking the session, password change 200 revoking ALL sessions, old password 401 / new 200. Production env audit via the Vercel API: `AUTH_SESSION_SECRET` present in ALL THREE environments (development/preview/production) — the gap was sandbox-only. typecheck ✅ lint ✅.
- Related files: none (environment protocol; `.env.rehearsal` is git-ignored)
- Notes: recorded per ERROR_PROTOCOL because the 500 was a live system failure during the audit; the fail-closed design is CORRECT (a missing secret must never silently weaken IP hashing).

### ISSUE-2026-09-28-045
- Phase: FULL-SYSTEM AUDIT (pre-PHASE-08 final gate, 2026-09-28) — storefront SEO
- Severity: LOW (SEO status-code-only; user-facing content and crawl hygiene correct)
- Status: RESOLVED (2026-09-28 pre-PHASE-08 hardening round, owner directive "actually remediate")
- Symptom: `/product/<unknown-slug>` and `/category/<unknown-slug>` return HTTP **200** (soft-404) while rendering the correct Arabic not-found UI with `noindex` present; root-level unknown routes return a proper 404.
- Reproduction: `curl -o /dev/null -w "%{http_code}" https://amira-store-opal.vercel.app/product/__no_such_product__` → 200 (both Production and local, current tree f965eb4).
- Root cause: both dynamic segments ship `loading.tsx`. Next.js streams the 200 shell as soon as the loading boundary flushes; the later `notFound()` in the page (and even thrown from `generateMetadata`) cannot retroactively change the already-sent status. This is documented Next.js streaming behavior for `loading.js` + `notFound()`, verified live during the audit: an experimental `notFound()`-from-`generateMetadata` patch produced the SAME 200, so it was reverted (no dead changes kept).
- Impact: crawlers that ignore `noindex` may record soft-404s; the rendered page, `robots: noindex` metadata, and user experience are correct. Log-based monitoring cannot distinguish missing slugs from real visits.
- Minimal fix considered and rejected: removing `loading.tsx` restores honest 404 statuses but sacrifices the loading skeleton for EVERY real PDP/category visit (PHASE-01 states contract: no blank white regions while DB data loads) — a worse trade for a status code. No workaround invented beyond what Next offers.
- Verification: `noindex` confirmed present in the streamed response (count 1–2 depending on boundary); root 404 path works; not-found UI renders correctly at all widths.
- Related files: `src/app/(store)/product/[slug]/page.tsx`, `src/app/(store)/product/[slug]/loading.tsx`, `src/app/(store)/category/[slug]/page.tsx`, `src/app/(store)/category/[slug]/loading.tsx`, `src/app/not-found.tsx`
- Notes: revisit option (PHASE-11/14): route-level `generateMetadata` with `blocking` metadata semantics if Next changes streaming behavior, or accept as permanent with the noindex mitigation.
- **RESOLUTION (2026-09-28 hardening round):** the route was ARCHITECTED per the directive ("missing resources return a real 404 while preserving loading UX"): the route-level `loading.tsx` files were removed and each page now awaits a cheap indexed existence probe (`hasStorefrontProductBySlug` / `hasStorefrontCategoryBySlug`, additive in `src/lib/storefront/catalog.ts`) and calls `notFound()` BEFORE any JSX is returned — the status is committed while nothing has flushed. For EXISTING slugs the heavy aggregate streams inside the page via `<Suspense fallback={<ProductSkeleton/>}>` / `<CategorySkeleton/>` (the exact former loading.tsx markup extracted to co-located skeleton components — loading UX preserved, zero visual change). `generateMetadata` untouched (noindex intact on 404 bodies); defense-in-depth `notFound()` inside the aggregate for probe/aggregate races. VERIFIED: missing product 404, missing category 404, existing product/category 200 (both markers: skeleton fallback + streamed content in one body), root 404 unchanged, `/search` 200, browser refresh + direct navigation render correctly, personal inspection at 1440/375 of the rendered not-found UI. Residual (documented, accepted): a pathological admin state (active category whose ancestor deactivates between probe and aggregate) still yields the honest not-found UI with a 200 — unreachable in seed data, direct-URL-only.
- Related files updated: `src/app/(store)/product/[slug]/{page.tsx,product-skeleton.tsx}`, `src/app/(store)/category/[slug]/{page.tsx,category-skeleton.tsx}`, `src/lib/storefront/catalog.ts`; route-level `loading.tsx` files DELETED.

### ISSUE-2026-09-28-046
- Phase: FULL-SYSTEM AUDIT (pre-PHASE-08 final gate, 2026-09-28) — dead artifacts / hygiene sweep
- Severity: LOW (no functional, security, or data impact; classified inventory to keep the tree honest)
- Status: RESOLVED (2026-09-28 pre-PHASE-08 hardening round — deterministic cleanup executed; keep-by-design set documented)
- Symptom: mechanical repo-wide sweep found scaffold-era and minor drift artifacts. Inventory with classification:
  1. `.env` (git-ignored local) still carries the scaffold SQLite URL `file:.../db/custom.db`; `db/custom.db` no longer exists and no code references it. Local hygiene only.
  2. `bun.lock` + `node_modules` retain Prisma packages with NO requiring package (code is 100% Drizzle/`pg`); `@neondatabase/serverless` is declared but never imported (isolated driver decision, documented in `src/db/client.ts`).
  3. `tests/database-runtime-build.sh` + `.zscripts/database-runtime-build.sh` are SQLite-era harness scripts referencing the removed `db:push`; kept because the environment harness may invoke them (intentionally NOT deleted during the audit).
  4. Dead code: `src/db/index.ts` barrel (zero importers — all use `@/db/client`); `src/app/api/route.ts` scaffold hello-world GET; `src/components/store/product-sections-placeholder.tsx` (zero importers, superseded by data-driven sections); lib exports `destroyAllAdminSessions` (session.ts), `getMediaAsset` (registry.ts), `StorefrontSearchError` (catalog.ts) with zero call sites.
  5. Minor duplication: `centsToPriceString` (cart.ts) ≡ `centsToMoney` (whatsapp.ts) identical piaster formatting; admin products list uses a third display formatter (`toLocaleString('ar-EG')` + `ج.م` without the dot); `MAX_LINE_QUANTITY` + storage keys re-hardcoded at cart-line.tsx:26 / cart-store.ts:96 / wishlist-store.ts:43 instead of importing the canonical constants; a cents→string→cents round-trip at checkout-view.tsx:318 and a float `toFixed` estimate at product-detail.tsx:236 (display-only; the authoritative subtotal math everywhere is integer piasters — proven cents-exact by verify:cart + checkout snapshots).
  6. `docs/ops/PROJECT_STRUCTURE.md` is a stale generic template contradicting the real tree (proposes src/domain/*, missing robots/sitemap pages etc.); the accurate maps live in EXECUTION_STATUS.md + worklog.
  7. ~30 unused shadcn/ui primitives (standard full-set scaffold) and ~20 unused npm dependencies (@dnd-kit, @tanstack/*, mdxeditor, next-auth, next-intl, next-themes, recharts, z-ai-web-dev-sdk, …) — pruning candidates for PHASE-14.
  8. Playground demo prices "349 ج.م" inside the labeled QA overlay (playground.tsx) — documented dev aid, remove before launch (DESIGN_SYSTEM.md).
- Root cause: PHASE-00 scaffold artifacts never in application code paths + incremental constant drift.
- Impact: none functional; duplicates are display-only and all money MATH is the canonical integer-piaster helpers (DB CHECKs re-assert the identity — 28/28 db:verify incl. money identities).
- Minimal fix: none applied during the audit (zero-risk rule for a closure gate; environment-harness files must not be removed unilaterally). Recommended: single PHASE-14 cleanup commit pruning items 2/4/5/7/8 + regenerating `PROJECT_STRUCTURE.md` from the real tree.
- **RESOLUTION (2026-09-28 pre-PHASE-08 hardening round — cleanup EXECUTED, not deferred):**
  * Item 1: `.env` scaffold SQLite URL replaced with a documented env-protocol comment (DATABASE.md §3 protocol referenced; no secrets in `.env`).
  * Item 2: root-caused — prisma-in-bun.lock is bun's resolution of `drizzle-orm`'s own `optionalPeers` contract (zero tracked references; package-manager artifact, documented, not removable without violating drizzle's declared peers). `node_modules` pruned via `bun install` (43 packages removed).
  * Items 3: `tests/` + `.zscripts/database-runtime-build.sh` KEPT-BY-DESIGN (platform deploy harness `.zscripts/build.sh` invokes them unconditionally; harness mismatch with removed `db:push` flagged for the owner, not unilaterally deleted).
  * Item 4: dead code REMOVED — `src/db/index.ts` barrel, scaffold `src/app/api/route.ts`, `product-sections-placeholder.tsx`, dead exports `destroyAllAdminSessions` / `getMediaAsset` / `StorefrontSearchError`; 28 unused shadcn primitives deleted (20 used primitives remain).
  * Item 5: consolidated — `centsToMoney` ≡ `centsToPriceString` unified on the canonical `centsToPriceString` (cart.ts); admin `formatEgp` replaced by canonical `formatPrice` (visual delta: price suffix normalized to "ج.م."); `MAX_LINE_QUANTITY` + `CART_STORAGE_KEY` + `WISHLIST_STORAGE_KEY` now imported from canonical sources (no re-hardcoded literals); PDP add-to-cart toast estimate moved to integer-piasters math.
  * Item 6: `docs/ops/PROJECT_STRUCTURE.md` regenerated from the real tree.
  * Items 7/8: unused npm deps pruned (package.json 58→25 runtime deps; Tier A + Tier B + dead radix singles + `tailwindcss-animate` + inert `tailwind.config.ts`); `z-ai-web-dev-sdk` and `@neondatabase/serverless` KEPT-BY-DESIGN (platform dependency / documented driver isolation); playground kept (documented QA aid, launch-gating decision).
  * Regression after cleanup: typecheck ✅ · lint ✅ · production build ✅ (route table correct, static = icons only) · full battery 409/409 on rehearsal AND on the real Neon development branch · route smoke all green · browser E2E green. verify-cart's route-audit expectation updated to assert the scaffold `/api/route.ts` ABSENCE (locks in the cleanup).
- Verification: sweep evidence recorded in worklog; every src/ import resolves (typecheck ✅); no TODO/FIXME markers anywhere in src/; no duplicate route pages; single DB client (src/db/client.ts) with all 13 src + 10 script consumers.
- Related files: as itemized above
- Notes: recorded per the audit rule that even small issues must be documented, never silently dropped.


### ISSUE-2026-09-28-038
- Phase: Reconciliation round (owner CRITICAL RECONCILIATION directive, 2026-09-28) — RESOLVED (2026-09-28: all three credential paths re-issued by the owner; runtime digest CONFIRMED via live Production runtime logs; see confirmation block below)
- Severity: HIGH (blocks push/CI/production-runtime-log inspection/live-branch verification)
- Status: RESOLVED
- Symptom: TASK A of the reconciliation directive could not be executed against the ACTUAL Vercel runtime logs — deployment a7eaa03's runtime log inspection requires Vercel auth that no longer exists in the recycled sandbox (no `vercel` CLI auth file, no `VERCEL_*` env, `~/.local/share/com.vercel.cli/auth.json` missing). GitHub auth is equally gone (`gh` binary missing, credential helper `.auth/bin/gh-cred` missing → `git ls-remote` cannot authenticate; repo is private). TASK C: `.env.local` is MISSING (snapshot machinery excludes secret files; verified the `/tmp` PolarFS snapshot carries no `.env.local` either).
- Reproduction: `gh auth status` → command not found; `git ls-remote origin main` → could not read Username; `vercel` → not installed; `test -f .env.local` → missing.
- Root cause: ISSUE-2026-09-27-037 fallout — the sandbox recycle wiped every external credential (GitHub token, Vercel token, `.auth/` vault including the just-created `.auth/verify-cart.ts`, `.env.local`).
- Impact: (1) digest `2975296465` cannot be byte-correlated to a specific runtime log line from the sandbox; (2) push/CI/new-Vercel-deployment verification cannot run; (3) live development-branch verification + fixture-residue cleanup cannot run. NO project defect is implied.
- Minimal fix (owner actions, exact): (1) GitHub device-flow re-auth (one-shot, as in PHASE-00) → restores fetch/push/CI; (2) Vercel CLI login re-auth → restores `vercel logs` inspection of deployment a7eaa03; (3) re-provision the Neon `development` POOLED string into git-ignored `.env.local` (chmod 600) per DATABASE.md §9.3/§12 → restores live-branch runs.
- Verification (what the sandbox DID prove without credentials, 2026-09-28): Next 16.1.3 digest algorithm read from node_modules — user-land errors get `digest = stringHash(err.message + err.stack).toString()` (numeric, no code suffix for non-Next errors) → byte-correlation from a local repro is impossible in principle (stack paths differ per environment). Failure-class characterization on a local production standalone build: control (schema present) → 200; empty-schema DB → 500 with `Failed query: select … from "categories"` + `[cause]: error: relation "categories" does not exist` (42P01) and numeric digests (e.g. 882317259); unreachable endpoint → 500 `connect ECONNREFUSED`; DATABASE_URL unset → 500 `DATABASE_URL is not set…`. Served 500 shell is `<html id="__next_error__">` (no `global-error.tsx` in the tree) → hydrates into exactly the owner-observed English "Application error: a server-side exception has occurred" page. By documented design the Neon production branch was NEVER migrated/touched, making the 42P01 class the most probable root cause (production bring-up = DEPLOYMENT_RUNBOOK release procedure: migrations + production-safe bootstrap, NO dev seed); the log line grep for `digest: '2975296465` after Vercel re-auth is the final discriminator.
- Related files: `docs/ops/DATABASE.md` (§9.1 fingerprints, §12), `docs/ops/DEPLOYMENT_RUNBOOK.md`
- Notes: explicitly NOT marked resolved — runtime evidence is owner-gated. Nothing was inferred from build logs.
- **RESOLUTION (2026-09-28, owner-authorized round):** (1) GitHub re-issued via one-shot device flow (scopes `repo, workflow, read:org`); (2) Vercel re-issued via manual OAuth device flow (endpoints from the CLI's own OIDC discovery; credentials persisted to the git-ignored `.auth/vercel/auth.json`, chmod 600, never printed); (3) `.env.local` restored with the owner-pasted Neon development POOLED string — `sha256 = e5d2abaf3816965f…` EXACTLY matches the recorded development fingerprint (≠ production `a77fc2af…`), host carries `-pooler`, project `tiny-mud-82763154`, live proof 13 categories / 7 products / 18 variants = migrated isolated development branch. **Runtime digest 2975296465 CONFIRMED** (live `vercel logs` on dpl_Gp3naCP4FsWBMzEcse84wXgWtRZ9, built from a7eaa03): `GET /` → `Error: Failed query: select … from "categories" …` with `[cause]: error: relation "categories" does not exist`, PG `42P01` (parserOpenTable); companion digests 2239130387 / 120622555 / 875850714 = the same 42P01 class on the header-categories and product-count queries; digest reproduced byte-exact in 4/4 fresh live hits (deterministic `stringHash(message+stack)` per this deployment). **CONFIRMED ROOT CAUSE: the Neon Production (main) branch has never been migrated — deployment-configuration/database bring-up, NOT an application defect.** Production bring-up stays OWNER-GATED per DEPLOYMENT_RUNBOOK (committed migrations + production-safe bootstrap, NO dev seed); no Production database touch occurred.

- **PRODUCTION BRING-UP EXECUTED AND VERIFIED (2026-09-28, owner-authorized round):** with every pre-change gate green (runbook + DATABASE.md §4/§5 read in full; canonical migrations = 2 committed files; disposable rehearsal THIS session pinned the expected profile 23t/9e/89i/34fk/34chk/6-trgm/2-migration-rows; target identity proven hash-only: pooled production URL sha256 `a77fc2afd8ac2bd7…` byte-exact vs §9.1 record, endpoint `ep-cool-art-b1snfj5i` ≠ development `ep-dark-boat-b1fejsk4`, `DATABASE_NEON_PROJECT_ID` = `tiny-mud-82763154`), the documented release procedure ran on Neon Production `main` (`neondb`, PostgreSQL 18.6): (1) live read-only pre-mutation snapshot = public schema 0 tables / 0 enums / 0 indexes, `neon_auth` = 9 platform tables, `drizzle` schema absent, one Vercel project, one CONNECTED Neon store (`neon-cobalt-globe`; one unbound inert store flagged for owner cleanup); (2) `drizzle-kit migrate` via the DIRECT endpoint → `[✓] migrations applied successfully!` (0000 + 0001; no db push, no data statements); (3) production-safe `db:bootstrap` (absent-only) → settings singleton + 5 documented categories, zero demo data. **Verification: `__drizzle_migrations` = 2 rows, hashes byte-equal to the committed files; schema profile matches the rehearsal expectation EXACTLY (23/9/89/34/34/6, pg_trgm present); `neon_auth` untouched (9 tables before/after); business counts all 0. Runtime: `GET /` → 200 (was 500 digest `2975296465`), categories/search/`/cart` 200, honest streamed not-found on unknown product, zero digests/`__next_error__` shells; fresh `vercel logs` on the serving deployment `dpl_AEjjJDjyyA1Rnqa884wrbnP9y2WC` = digest ABSENT, 42P01 ABSENT, zero 5xx (only the pre-existing upstream node-postgres SSL-deprecation stderr warning); `dpl_FSR9p4A54Gs6` (`70dd015`) READY and intact, docs-only diff `70dd015..5703066`, no source regression.** Full record: DATABASE.md §13. Production runtime blocker RESOLVED on actual runtime evidence.

### ISSUE-2026-09-28-041
- Phase: PHASE-06 deep visual QA + production-build verification round (2026-09-28) — FIXED
- Severity: MEDIUM (would fail the next Vercel production build at prerender time; also freezes storefront nav data)
- Status: FIXED
- Symptom: production build prerenders `/cart` as static (○) and executes the store layout's categories query AT BUILD TIME — failed locally with an unreachable DB (`Export encountered an error on /(store)/cart/page`), and would fail identically on Vercel against the not-yet-migrated production branch; even with a reachable DB the category navigation on `/cart` would be frozen at build time (stale after admin category edits), contradicting the page's own `loading.tsx` streaming design and the all-dynamic storefront (`, /`, `/category/[slug]`, `/product/[slug]`, `/search` are all ƒ).
- Reproduction: run `next build` without a reachable `DATABASE_URL` → prerender of `/cart` fails with the categories query; route table shows `○ /cart`.
- Root cause: default static classification of a chrome-driven client page — the (store) layout header reads live catalog data server-side, so a static `/cart` couples the BUILD to a reachable, migrated database.
- Minimal fix: `export const dynamic = "force-dynamic"` on `src/app/(store)/cart/page.tsx` (one export + comment; matches every other storefront route and the existing loading.tsx intent).
- Verification: rebuild → `ƒ /cart` in the route table, static pages drop to 6 (icons only), build green with TypeScript validation ON; dev server + production standalone both serve `/cart` 200; verify:cart 55/55, typecheck ✅, lint ✅ after the change.
- Related files: `src/app/(store)/cart/page.tsx`
- Notes: this also de-risks the PHASE-06 push: the new Vercel deployment builds successfully BEFORE the owner-gated production migration (the build no longer queries any database).

### ISSUE-2026-09-28-043
- Phase: PHASE-07 (checkout implementation round, 2026-09-28) — FIXED
- Severity: HIGH (would have broken the idempotency contract under concurrent duplicate submissions)
- Status: FIXED
- Symptom: the PHASE-07 CONCURRENT idempotency test (three parallel `createOrderFromCart` calls with the SAME idempotency key, different carts) crashed the whole suite: the losing transaction surfaced `23505 duplicate key value violates unique constraint "orders_idempotency_key_unique"` as an UNCAUGHT top-level error instead of the designed `idempotent_replay` outcome.
- Reproduction: `bun run verify:checkout` section [10] — any concurrent same-key race.
- Root cause: `isUniqueViolation()` matched `error.code`/`error.constraint` on the TOP-LEVEL error object only. drizzle-orm ≥0.41 wraps driver errors in `DrizzleQueryError` with the original pg error in `.cause` (verified against the installed drizzle-orm 0.45.3: node_modules/drizzle-orm/errors.js), so the pg fields were one level down and every match failed. Found by the phase's own concurrency test exactly as the DoD intends.
- Minimal fix: walk the error `cause` chain (depth ≤ 5) when matching `code === '23505'` + `constraint` (one function, src/lib/storefront/checkout.ts). No other change.
- Verification: verify:checkout [10] now passes — `created,idempotent_replay,idempotent_replay` convergence, one order per key, winner-quantity stock consumed; full suite re-run green (134/134) and re-run stable.
- Related files: `src/lib/storefront/checkout.ts`
- Notes: the sequential idempotency path ([9]) masked this defect because its replay lookup runs AFTER the failing transaction returns; only true concurrency exposed it — recorded per ERROR_PROTOCOL as proof the mandatory tests earn their keep.

---
### ISSUE-2026-09-28-042
- Phase: PHASE-06 deep visual QA round (2026-09-28, drawer subtotal inconsistency) — FIXED
- Severity: MEDIUM (user-visible money inconsistency between cart surfaces)
- Status: FIXED
- Symptom: after a fresh page load, adding an item auto-opens the cart drawer whose subtotal PROVISIONALLY INCLUDES entries whose availability is not yet validated (capture: unavailable line 349 + new line 125 → drawer showed 474 ج.م.) while the /cart page correctly excludes unavailable lines (125 ج.م.). The drawer line even shows the server-truth chip while the total still counts it.
- Reproduction: cart holding an unavailable (stale-variant) entry → full page load (validation map resets on hydrate) → add any item on a PDP → drawer auto-opens → subtotal includes the unavailable line until a MANUAL open triggers revalidation.
- Root cause: the drawer's manual-open path (`onOpenChange`) calls `cartStore.scheduleRevalidation()`, but the AUTO-OPEN path (`CART_DRAWER_OPEN_EVENT` listener) only `setOpen(true)` — it never schedules revalidation, so post-add drawers render with a stale/empty validation map.
- Minimal fix: the auto-open event handler also calls `cartStore.scheduleRevalidation()` (one statement + comment) in `src/components/store/cart/cart-drawer.tsx`.
- Verification: fresh load → add → auto-opened drawer now revalidates: unavailable chip shown AND subtotal excludes it (250 ج.م. = 2×125 with the 349 unavailable line out; storage snapshot `00000000…:1 | 79840820…:2` confirms exact math); manual-open path unchanged; verify:cart 55/55 (subtotal math + status exclusion sections) green after the change.
- Related files: `src/components/store/cart/cart-drawer.tsx`
- Notes: found during personally-inspected deep visual QA (375px drawer capture) — exactly the class of minor issue the QA gate exists to catch.

### ISSUE-2026-09-28-039
- Phase: Reconciliation round (PHASE-06 regression gate, 2026-09-28) — FIXED
- Severity: MEDIUM (broke the typecheck gate in a clean environment; zero runtime exposure)
- Status: FIXED
- Symptom: `bun run typecheck` failed: `src/lib/db.ts(1,10): error TS2305: Module '"@prisma/client"' has no exported member 'PrismaClient'`.
- Reproduction: fresh `node_modules` (no generated `@prisma/client`) + `tsc --noEmit` over the recovered tree.
- Root cause: snapshot-restore debris of the SAME class as the stale `src/app/page.tsx` removed in 4c6152d — the PHASE-01-era disk snapshot resurrected `src/lib/db.ts` + `prisma/schema.prisma` (tracked since platform commit 11cbf1e) although canonical history removed Prisma in PHASE_02. The CI workflow comment is the contract: "Data layer is Drizzle ORM + PostgreSQL/Neon since PHASE_02 (Prisma removed)… no client generation step needed", and CI runs `typecheck` — so canonical main cannot carry these files. The previous round's typecheck ✅ was environment-dependent (the pre-recycle `node_modules` still contained a generated Prisma client).
- Impact: typecheck gate red in any clean checkout of the local lineage; the rebase onto canonical a7eaa03 would have removed the files anyway.
- Minimal fix: `git rm src/lib/db.ts prisma/schema.prisma` (commit 8859c1c). The commit becomes empty and drops out automatically when local commits are rebased onto canonical a7eaa03 (files never existed there).
- Verification: typecheck ✅ lint ✅ production build ✅; full suite re-run green (verify:cart 55/55, db:verify 28/28, verify:auth 44/44, verify:catalog 43/43, verify:storefront 101/101).
- Related files: `src/lib/db.ts` (deleted), `prisma/schema.prisma` (deleted), `.github/workflows/ci.yml` (evidence)
- Notes: also audited for other resurrected debris — `git ls-files` shows no other prisma/sqlite artifacts; `db/` has no tracked files.

### ISSUE-2026-09-28-040
- Phase: PHASE-06 deep visual QA round (2026-09-28) — FIXED
- Severity: LOW (dev-mode console warning only; zero production impact)
- Status: FIXED
- Symptom: browser console prints `[warning] Detected 'scroll-behavior: smooth' on the '<html>' element. To disable smooth scrolling during route transitions, add 'data-scroll-behavior="smooth"' to your <html> element.` (Next.js 16 framework guidance).
- Reproduction: any page load in dev with the PHASE-01 root layout.
- Root cause: PHASE-01 design system sets `scroll-behavior: smooth` on `<html>` (smooth anchor scrolling) without the Next.js opt-out attribute, so framework route transitions can't bypass smooth scrolling.
- Impact: potential scroll-animation interference during route transitions; console noise in dev.
- Minimal fix: `<html lang="ar" dir="rtl" data-scroll-behavior="smooth" suppressHydrationWarning>` in `src/app/layout.tsx` (one attribute; smooth anchor behavior preserved, framework route transitions exempted).
- Verification: fresh-session console after reload: 0 errors, 0 warnings (was 1 warning); hydration clean; suites/build green after the change.
- Related files: `src/app/layout.tsx`
- Notes: found during the deep visual QA console sweep (fresh-session standard: 0/0).

### ISSUE-2026-09-27-037
- Phase: Environment event between PHASE-05 closure and PHASE-06 (discovered 2026-09-27 during the owner-paused disposition round) — RECOVERED (with two owner-side gaps pending)
- Severity: HIGH (environment), mitigated to LOW for project data (zero project data loss proven)
- Status: RESOLVED (2026-09-28 — both pending owner actions completed and evidenced; corrected from a stale OPEN at the PHASE-06 closure gate, see closing addendum)
- Symptom: the sandbox was recycled to a disk snapshot from the PHASE-01 closure moment (~Sep 27 19:03) while the live session was mid-PHASE-06. On-disk effects: working tree reverted to PHASE-01 state; `.auth/` credential vault gone (GitHub + Vercel tokens — ISSUE-009 class); `.env.local` (Neon `development` pooled credential) gone; local git history after PHASE-01 gone; `EXECUTION_STATUS.md`/worklog reverted to their PHASE-01-closure content. The conversation-side state (PHASE-02..05 complete, PHASE-06 authorized) no longer matched the disk.
- Reproduction: platform lifecycle event, not reproducible in-project.
- Root cause: ephemeral sandbox disk; the only surviving current artifacts were (a) the remote git history (canonical, incl. PHASE-05 commit a7eaa03 — confirmed via the owner-provided GitHub/Vercel views) and (b) the `/tmp/my-project` PolarFS snapshot taken 2026-09-27T17:44Z holding the full PHASE-05 working tree + gate state (`CURRENT_PHASE=PHASE_06`).
- Impact: NO project data lost — PHASE-05 code/docs fully recovered from (b) and diffable against (a). Lost pending re-issue: GitHub push auth, Vercel auth (neither needed for PHASE-06 itself), and the Neon `development` branch pooled string (needed for live-branch verification; a local disposable PostgreSQL rehearsal restores development capability meanwhile, per DATABASE.md §7). Lost session work after 17:44: the verify:cart placement discussion only — no PHASE-06 code had been written yet (verified: snapshot has zero cart files).
- Minimal fix (recovery, executed): rsync-restored the working tree from the PolarFS snapshot (preserving `.git`, `.env`, `node_modules`); `bun install` + typecheck + lint → green; platform auto-snapshot commit `f96db0e` + branch `wip/recovery-phase06-20260927` preserve everything in git objects; disposable rehearsal PG 18.4 (outside the repo, `/home/z/pgdata`, port 5433) migrated/seeded → `db:verify` 28/28; production disposition for the owner-flagged build log recorded as ISSUE-035/036.
- Reconciliation plan (executes when GitHub auth is restored): `git fetch` → verify `origin/main = a7eaa03` → diff the working tree against it (expected: near-zero delta on PHASE-05 files; real delta = the disposition fix + PHASE-06 work) → re-commit in clean logical commits on top of a7eaa03 → push. Local `main` history is considered stale until then; the remote is canonical.
- Verification: typecheck ✅ lint ✅ db:verify 28/28 (rehearsal) ✅ production build ✅ (post-disposition) — the recovered tree behaves identically to the pushed PHASE-05 state.
- Related files: none (environment event); standing protocols referenced: ISSUE-025 restart protocol, DATABASE.md §7/§9.3/§10
- Notes: two owner actions remained at recording time: (1) GitHub device-flow re-authorization → restores push/CI verification; (2) re-provision the Neon `development` pooled string into git-ignored `.env.local` (owner copies from Neon Console → Connect → branch `development`; never through tracked files) → restores live-branch verification + final `verify:cart` run. Both were anticipated by the vault-persistence design (`.auth/` was always git-ignored and re-issuable; ISSUE-018 precedent).

**CLOSING ADDENDUM (2026-09-28, PHASE-06 closure gate — status corrected OPEN → RESOLVED):** both pending owner actions were completed and evidenced in the 2026-09-28 reconciliation/bring-up rounds: (1) GitHub re-issued via one-shot device flow + Vercel re-issued via OAuth device flow (see ISSUE-2026-09-28-038's RESOLUTION block) — push/CI/live-log inspection restored (CI runs 36387648285 and 36414343124 GREEN); (2) `.env.local` re-provisioned with the owner-pasted development POOLED string, fingerprint-verified `e5d2abaf3816965f…` (≠ production `a77fc2af…`), and the live-branch verification suite ran green (55+28+44+43+101) with 13/7/18 clean-seed residue inspection before the NEXT recycle excluded the file again (the environment recurrence is the documented snapshot behavior, not an unresolved recovery gap — each re-issue is a routine owner-paced step per the vault design). Ancestry reconciliation completed losslessly (fast-forward, no rewrite); zero project data lost. Nothing remains pending under this issue.

### ISSUE-2026-09-27-035
- Phase: Production infra disposition (owner-paused PHASE-06 round, 2026-09-27) — FIXED
- Severity: LOW today (deprecation warning), MEDIUM forward-compatibility (the convention will be removed in a future Next.js major)
- Status: FIXED
- Symptom: the Vercel production build of `main` (commit a7eaa03) logs `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy`. The deployment itself completes and runs.
- Reproduction: any production `next build` (Vercel 20:42:18 log) with `src/middleware.ts` present and no `src/proxy.ts`.
- Root cause: Next.js 16 renamed the edge-middleware file convention from `middleware.ts` to `proxy.ts` (verified against the installed next 16.1.3: `build/index.js` warns when `MIDDLEWARE_FILENAME` exists without `PROXY_FILENAME`; `get-page-static-info.js` accepts a default export or a named `proxy` function export, and still parses `export const config = { matcher }` via the shared middleware-config schema; the proxy always runs on the Node.js runtime). PHASE-03's admin boundary guard predates the rename.
- Impact: warning-only today; the runtime behavior (cookie-presence redirect for /admin, no-store stamps) is unchanged. Left in place it becomes a breaking upgrade later and normalizes warning noise in production builds.
- Minimal fix: `git mv src/middleware.ts src/proxy.ts`; renamed the exported function `middleware` → `proxy`; logic byte-identical (same matcher `['/admin', '/admin/:path*']`, same no-store stamps, same login passthrough); updated the live comment in `src/lib/auth/guard.ts` (historical ISSUE_LOG entries intentionally not rewritten). No other file touched.
- Verification: typecheck ✅ · lint ✅ · production build ✅ with the deprecation warning ABSENT and `ƒ Proxy (Middleware)` listed in the route table · dev-server smoke: `/admin` → 307 `/admin/login` + `cache-control: no-store`; `/admin/products` → 307 with `next=%2Fadmin%2Fproducts`; `/admin/login` → 200 + `no-store, must-revalidate`; homepage 200; suggestions endpoint regression spot ✅; origin-gate spot (cross-origin + no-origin login POST → 403/403) ✅ · dev.log zero errors.
- Related files: `src/proxy.ts` (renamed from `src/middleware.ts`), `src/lib/auth/guard.ts` (comment), `next.config.ts` (see ISSUE-2026-09-27-036)
- Notes: the deployed production runtime was NEVER broken by this — the disposition closes the forward-compatibility gap and silences the warning the owner flagged from the a7eaa03 build log.

### ISSUE-2026-09-27-036
- Phase: Production infra disposition (owner-paused PHASE-06 round, 2026-09-27) — FIXED
- Severity: MEDIUM (deploy-time safety gap)
- Status: FIXED
- Symptom: the same Vercel production build log (a7eaa03) prints `Skipping validation of types` — TypeScript errors could never fail a production deployment.
- Root cause: scaffold-default `typescript: { ignoreBuildErrors: true }` in `next.config.ts`. CI runs `typecheck`, but Vercel deploys on push and does NOT gate on the CI result — the only enforcement at deploy time was this disabled check.
- Impact: a type-broken `main` commit could ship to production (runtime mismatch vs. the verified type surface). No actual type error has shipped (every phase record shows typecheck ✅), so this is a hardened-posture fix, not an incident.
- Minimal fix: removed the `typescript.ignoreBuildErrors` block; a comment pins the decision ("a deploy must never ship type-broken code; CI `typecheck` alone does not gate Vercel deployments").
- Verification: production build ✅ and now logs `Running TypeScript ...` (validation ON) with zero type errors across the full tree including the recovered PHASE-05 code and the in-flight PHASE-06 working files.
- Related files: `next.config.ts`
- Notes: found while dispositioning the deprecation warning in the same build log; recorded separately because it is an independent control.

### ISSUE-2026-09-27-028
- Phase: PHASE_05 (browser E2E round, 2026-09-27) — FIXED
- Symptom: after navigating to /category/[slug] or /product/[slug], the page rendered breadcrumbs/content but had NO store header, footer, or WhatsApp FAB — only the homepage carried the storefront chrome.
- Root cause: the new route pages were written as standalone route files that did not include the announcement bar/header/footer, while those components were imported only by the homepage. A route-level shell was missing from the composition.
- Impact: broken task-1 requirement (header/navigation on every storefront surface), broken sticky-footer contract, no navigation path back from inner pages except the browser back button.
- Minimal fix: new route group `src/app/(store)/layout.tsx` rendering AnnouncementBar + StoreHeader + children + StoreFooter + WhatsApp FAB; homepage/category/product/search moved inside the group (URLs unchanged — route groups do not affect paths); duplicated chrome imports removed from the homepage.
- Verification: header, footer, and FAB render on /, /category/[slug], /product/[slug], /search (DOM-verified via curl + browser a11y tree); sticky footer contract holds on every page; typecheck/lint clean.
- Related files: `src/app/(store)/layout.tsx`, `src/app/(store)/page.tsx`, `src/app/(store)/category/[slug]/page.tsx`, `src/app/(store)/product/[slug]/page.tsx`, `src/app/(store)/search/page.tsx`
- Notes: found only because the browser E2E exercised real navigation, not page-open checks.

### ISSUE-2026-09-27-029
- Phase: PHASE_05 (browser E2E round, 2026-09-27) — FIXED
- Symptom: at desktop width the header had NO search field; the a11y tree contained a single hidden (0×0) search input and the autocomplete could not be exercised at 1440px.
- Root cause: during the header refactor that extracted the cart/wishlist "coming soon" buttons into a client component, the desktop `<HeaderSearch>` instance was accidentally dropped from the header actions row; only the mobile search-row instance survived (hidden at ≥1024px).
- Impact: search UI (task 5) unreachable at desktop/tablet landscape; autocomplete only usable below 1024px.
- Minimal fix: re-added `<HeaderSearch className="hidden w-48 lg:block xl:w-64" />` to the header actions row.
- Verification: a11y tree shows `searchbox "ابحث في أميرة استور"` at 1440/768/375 (two instances, one visible per breakpoint); autocomplete fill→suggestions→navigation exercised in the browser.
- Related files: `src/components/store/store-header.tsx`
- Notes: regression introduced and caught within the same phase.

### ISSUE-2026-09-27-030
- Phase: PHASE_05 (browser E2E round, 2026-09-27) — FIXED
- Symptom: programmatic/keyboard scroll-into-view on product pages landed interactive targets (color chips) VISUALLY BENEATH the sticky storefront header; automated clicks hit the covering breadcrumb bar ("element covered" ×2).
- Root cause: `html` had `scroll-padding-bottom` (PHASE-04 gate fix D-1) but no `scroll-padding-top`, so scroll-into-view positioned targets under the sticky top bar (h-16 + mobile search row).
- Impact: ergonomic/a11y only — keyboard and assistive scroll targeting could hide focused controls behind the header; no data or functional impact.
- Minimal fix: `scroll-padding-top: 5rem` on `html` in `globals.css` (mirrors the existing bottom compensation).
- Verification: scrollIntoView targets now clear the header; color-chip interactions complete in the browser; typecheck/lint clean.
- Related files: `src/app/globals.css`

### ISSUE-2026-09-27-031
- Phase: PHASE_05 (verify-suite round, 2026-09-27) — FIXED
- Symptom: verify-storefront [1] Arabic-normalization equivalence failed on 3/9 corpus entries — the SQL `translate()` normalization produced "نساوي/امراي/عاولي" where the TypeScript map produces "نسايي/امراي/عايله" (character pairs shifted/swapped).
- Root cause: the SQL FROM/TO pair was hand-typed as RTL Arabic string literals; their VISUAL character order is not their codepoint order, so the literal silently scrambled the intended mapping (classic bidirectional-text authoring hazard).
- Impact: search normalization would have been inconsistent between query side (TS) and column side (SQL) — tashkeel/alef/taa variants would fail to match on some characters.
- Minimal fix: `src/lib/storefront/arabic.ts` now constructs BOTH implementations programmatically from ONE typed source of truth (`ARABIC_CHAR_MAP` pairs via explicit `\uXXXX` escapes + delete-set), with the SQL fragment derived from the same pairs; hand-typed RTL literals forbidden there. The SQL wrapper also mirrors query-side whitespace collapsing (`regexp_replace` + `btrim`) so the two are byte-equivalent on every input.
- Verification: verify-storefront [1] passes 9/9 corpus entries including multi-space, tashkeel, alef variants, tatweel; [3] Arabic-aware matching passes (taa-marbuta typed as ه matches «منشفة» and identical results with real ة).
- Related files: `src/lib/storefront/arabic.ts`, `scripts/verify-storefront.ts`
- Notes: caught by the equivalence test the suite exists for — the exact failure mode the phase doc's "Arabic-aware" requirement demands guarding against.

### ISSUE-2026-09-27-032
- Phase: PHASE_05 (verify-suite round, 2026-09-27) — FIXED
- Symptom: price-band filter (priceMin=120, priceMax=200) returned ZERO products although two seeded products overlap that band; facets price range assertion failed.
- Root cause: two independent defects — (a) the range-overlap comparisons were inverted (`productMin <= priceMin` instead of `productMin <= priceMax`, `productMax >= priceMax` instead of `productMax >= priceMin`); (b) the facets' price span probed only the FIRST product row instead of aggregating across the category scope.
- Impact: price filtering unusable (always over-restrictive) and the filter panel's price range displayed a single product's span rather than the category's.
- Minimal fix: corrected overlap semantics (`productMin <= shopperMax AND productMax >= shopperMin`); facets price range is now a true `min/max` aggregate over active variants of active products in scope.
- Verification: verify-storefront [7][8] pass — band 120–200 returns exactly the overlapping products; band 100000–200000 returns zero; category-wide span asserted.
- Related files: `src/lib/storefront/catalog.ts`

### ISSUE-2026-09-27-033
- Phase: PHASE_05 (search-quality round, 2026-09-27) — FIXED
- Symptom: the fuzzy tier as first implemented (`similarity(query, full_name) >= 0.24`) never fired for realistic typos — `similarity('قيمص', 'قميص رجالي كلاسيك قطن') = 0.04` because full-string trigram similarity collapses for short queries against long names.
- Root cause: wrong pg_trgm operator for the matching shape: full-string `similarity()` compares WHOLE strings, while shopper queries are 1–3 words inside long product names.
- Impact: typo-tolerant matching (task 8) silently ineffective — worse than honest absence.
- Minimal fix: switched to `strict_word_similarity(query, name) >= 0.35` (whole-word alignment), threshold chosen by measurement: noise floor ≤ 0.25 (nonsense queries) vs real typos ≥ 0.37 in 5+ letter words; relevance ordering switched to rank-case first, then word similarity. Known documented limit: a single transposition inside a 4-letter word destroys most trigrams and stays outside the practical tier (verified measurement, recorded openly).
- Verification: browser + verify-storefront [4]: 'مرطاب' → moisturizer, 'كلسيك' → shirt, 'قمزى' correctly below floor, latin garbage zero; exact/prefix/substring tiers unchanged.
- Related files: `src/lib/storefront/catalog.ts`, `scripts/verify-storefront.ts`

### ISSUE-2026-09-27-034
- Phase: PHASE_05 (browser QA round, 2026-09-27) — ACCEPTED (no fix required)
- Symptom: in DEV mode, React logs hydration attribute mismatches (`aria-controls` Radix useId values differ between server and client render) on category pages, originating from Radix Dialog/Select triggers (header sheet, filter sheet, sort select).
- Root cause: known Radix + React 19 streamed-SSR interaction — the dev build's strict hydration diffing flags the Radix-generated `aria-controls` id; React 19 does not patch the attribute up.
- Impact: dev-mode console noise only. Verified NON-ISSUES: production build shows ZERO errors/warnings across every storefront surface and full navigation (fresh session, cumulative count 0); all three affected controls (header sheet, filter sheet, sort select) open, apply, and navigate correctly in both dev and prod.
- Minimal fix: none (fixing would require suppressing React hydration diagnostics or patching Radix internals — disproportionate to a dev-only attribute warning).
- Verification: fresh-browser production session: 0 error/warn across /, /category/[slug], /product/[slug], /search, /admin/login; sheet/filters/select interactions re-proven after the warnings were observed.
- Related files: none
- Notes: recorded per the transparency rule; revisit if Radix ships an upstream fix worth taking.

---

### ISSUE-2026-09-26-001
- Phase: PHASE_00
- Severity: BLOCKER (phase-scoped: blocks GitHub provisioning steps only)
- Status: BLOCKED
- Symptom: GitHub CLI (`gh`) is not installed and no authenticated GitHub connection (token/OAuth) exists in the execution environment; the new Amira Store GitHub repository cannot be created and the baseline commit cannot be pushed.
- Reproduction: `gh --version` → command not found; `gh auth status` → command not found; no `GH_TOKEN`, no `~/.config/gh`, no `~/.git-credentials`; `git remote -v` in `/home/z/my-project` → empty.
- Root cause: The execution environment has no GitHub authorization configured; account authorization is an owner-controlled step that the agent cannot and must not fake.
- Minimal fix: Owner authorizes GitHub in this workspace (install/authenticate `gh` via browser/OAuth, or provide an equivalent authenticated connection through the environment secret store). Agent then creates private repo `amira-store`, adds `origin`, pushes baseline.
- Verification: `gh auth status` succeeds; `git ls-remote origin` returns the new repository; baseline commit visible on remote `main`.
- Related files: `docs/ops/BASELINE.md` (§1, §8), `.git/config` (remote pending)
- Notes: No unrelated repositories touched.

### ISSUE-2026-09-26-002
- Phase: PHASE_00
- Severity: BLOCKER (phase-scoped: blocks Vercel provisioning steps only)
- Status: BLOCKED
- Symptom: Vercel CLI is not installed and no authenticated Vercel connection exists; the Vercel project cannot be created/linked and the non-production deployment path cannot be proven in PHASE_00.
- Reproduction: `vercel --version` → command not found; `vercel whoami` → command not found; no `VERCEL_TOKEN`; no `.vercel` project link.
- Root cause: No Vercel authorization configured in the execution environment.
- Minimal fix: Owner authorizes Vercel (`vercel login` browser/OAuth or equivalent authenticated integration). Agent then creates/links the Amira Store project and configures Local/Preview/Production environment separation.
- Verification: `vercel whoami` returns the owner account; `vercel project ls` / link metadata shows the Amira Store project.
- Related files: `docs/ops/BASELINE.md` (§1, §8)
- Notes: Environment separation is contractually established via `.env.example` + `docs/ops/DEPLOYMENT_RUNBOOK.md` pending provisioning.

### ISSUE-2026-09-26-003
- Phase: PHASE_00
- Severity: BLOCKER (phase-scoped: blocks Neon provisioning steps only)
- Status: BLOCKED
- Symptom: Neon CLI (`neonctl`) is not installed and no authenticated Neon connection exists; the Neon project/database and dev/preview/production branch strategy cannot be established in PHASE_00.
- Reproduction: `neonctl --version` → command not found; `neonctl whoami` → command not found; no `NEON_API_KEY`.
- Root cause: No Neon authorization configured in the execution environment.
- Minimal fix: Owner authorizes Neon (`neonctl auth` browser/OAuth or equivalent). Agent then creates the Amira Store Postgres project and required branches; credentials stored only in platform secret stores.
- Verification: `neonctl whoami` succeeds; `neonctl projects list` shows the Amira Store project; branch list shows dev/preview/prod strategy.
- Related files: `docs/ops/BASELINE.md` (§1, §4, §8)
- Notes: Local disposable dev DB (sandbox SQLite) is used only for Phase-00 boot verification; PHASE_02 introduces Drizzle/PostgreSQL migration workflow.

### ISSUE-2026-09-26-004
- Phase: PHASE_00
- Severity: LOW
- Status: ACCEPTED
- Symptom: The execution environment provides a pre-initialized Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui scaffold (including unused Prisma/SQLite helpers) rather than a literally empty workspace.
- Reproduction: Inspect `/home/z/my-project` before this phase.
- Root cause: Environment characteristic of the ZCode sandbox, not a legacy Amira Store artifact.
- Minimal fix: Treated as the greenfield application base; scaffold branding removed; no business code existed; deviation documented in `docs/ops/BASELINE.md` §2; Prisma explicitly marked as NOT the Amira Store data layer (Drizzle/PostgreSQL per MASTER_PLAN §25 arrives in PHASE_02).
- Verification: No Amira Store business logic exists in scaffold; baseline page boots; lint/typecheck pass.
- Related files: `package.json`, `src/app/page.tsx`, `src/app/layout.tsx`, `docs/ops/BASELINE.md`
- Notes: Accepted environment adaptation; does not weaken any plan requirement.

### ISSUE-2026-09-26-006
- Phase: PHASE_00
- Severity: HIGH
- Status: FIXED
- Symptom: `.env` (and the sandbox local dev database `db/custom.db`) were tracked by Git — committed by the pre-existing scaffold's initial commits before ignore rules took effect. This violates the plan's production-safety rule "Never place real secrets in Git" (AGENTS.md) even though the current `.env` holds only a low-sensitivity local SQLite URL.
- Reproduction: `git ls-files .env db` → both listed.
- Root cause: Scaffold repository predates the `.env*` ignore entry; `.gitignore` does not untrack files that were already committed.
- Minimal fix: `git rm --cached .env db/custom.db` (untrack, keep local files) + append `db/*.db` to `.gitignore` + add `!.env.example` exception so the environment contract stays tracked.
- Verification: `git ls-files .env db` → empty; `git ls-files --cached .env.example` → tracked; staged diff secret scan clean; dev server still boots after untracking.
- Related files: `.gitignore`, `.env.example`, `db/custom.db`
- Notes: Git history retains scaffold-era blobs from before this project existed; no history rewrite performed (not warranted — the removed `.env` contains no production secret; content reviewed before decision).

### ISSUE-2026-09-26-005
- Phase: PHASE_00
- Severity: LOW
- Status: FIXED
- Symptom: `bun run typecheck` (tsc --noEmit) exited 1 with 4 errors — 2× TS2307 missing `socket.io`/`socket.io-client` in `examples/websocket/`, 2× type errors in `skills/` scripts. Zero errors in `src/` (Amira Store application code).
- Reproduction: `bun run typecheck` on the untouched baseline.
- Root cause: `tsconfig.json` `include` globs (`**/*.ts`, `**/*.tsx`) sweep in execution-environment demo/skill assets that are not part of the Amira Store application; `socket.io` packages are intentionally not installed for the app.
- Minimal fix: Added `examples` and `skills` (plus future `tests` guard) to `tsconfig.json` `exclude`. No deletions, no dependency changes, no code edits in those folders.
- Verification: `bun run typecheck` → exit 0; `bun run lint` → exit 0; dev server still boots.
- Related files: `tsconfig.json`
- Notes: These folders are sandbox tooling, not application scope; excluding them from the app's TS program does not hide any application error.

### ISSUE-2026-09-26-007
- Phase: PHASE_00
- Severity: LOW
- Status: FIXED
- Symptom: 112 tracked files appeared permanently modified in `git status` (mode change 100644=>100755) despite zero content change, polluting every diff/stage operation before the GitHub push.
- Reproduction: `git status --short` after the baseline commit; `git diff --summary` → only `mode change 100644 => 100755` lines; `git diff --numstat` → content churn only in `.zscripts/dev.pid` (see ISSUE-2026-09-26-008).
- Root cause: The sandbox filesystem marks all workspace files as executable; Git's fileMode tracking compares the stored 644 modes against the filesystem's 755.
- Minimal fix: `git config core.fileMode false` (repository-local config only). No file content touched; no global setting forced on other environments.
- Verification: `git status --short` → clean except the genuine `.zscripts/dev.pid` entry; `git diff --numstat` → no content churn.
- Related files: `.git/config`
- Notes: Content-neutral; hides no real change — verified via numstat before applying.

### ISSUE-2026-09-26-008
- Phase: PHASE_00
- Severity: LOW
- Status: FIXED
- Symptom: `.zscripts/dev.pid` (sandbox dev-server runtime PID file) was tracked by Git and churns on every dev-server restart, producing meaningless diffs/commits.
- Reproduction: `git diff --numstat` shows a 1/1 change in `.zscripts/dev.pid` after each sandbox dev-server restart.
- Root cause: The scaffold tracked a runtime artifact; PID values are environment-local state, not project source.
- Minimal fix: `git rm --cached .zscripts/dev.pid` + append `.zscripts/dev.pid` to `.gitignore` (the runnable `.zscripts/*.sh` tooling remains tracked).
- Verification: `git ls-files .zscripts/dev.pid` → empty; `git status --short` → clean; local file kept on disk so sandbox tooling keeps working.
- Related files: `.gitignore`, `.zscripts/dev.pid`
- Notes: Same hygiene class as ISSUE-2026-09-26-006.

### ISSUE-2026-09-26-009
- Phase: PHASE_00
- Severity: HIGH
- Status: FIXED
- Symptom: Between execution sessions the sandbox was recycled: all home-directory state outside `/home/z/my-project` was wiped (`~/.config/gh/hosts.yml` GitHub credential, `~/.local/bin/gh`, globally installed `vercel`/`neon` CLIs, `~/.npm-global` packages). Previously verified `gh` authentication disappeared; CLI installs had to be repeated.
- Reproduction: After the session gap, `gh: command not found`; `ls ~/.config/gh/` → not found; `~/.npm-global/bin` no longer contains `vercel`/`neon`. `/home/z/my-project` (workspace, git history) fully intact.
- Root cause: The execution environment persists only the project workspace across recycles; dotfiles, installed binaries, and credential stores outside it are ephemeral.
- Minimal fix: (1) Reinstall `gh` (static binary), `vercel`, `neonctl`. (2) Create git-ignored credential vault `/home/z/my-project/.auth/` (chmod 700, files chmod 600) inside the persistent workspace; CLI credential files are stored/restored from there (`gh` hosts, Vercel `auth.json`, Neon credentials) after each recycle. Never committed, never pushed, never displayed (`.gitignore` entry `.auth/` verified with `git check-ignore`).
- Verification: `git check-ignore .auth/` → ignored; `git status --short` → clean; restored `gh auth status` succeeds after recycle; repo remote push unaffected.
- Related files: `.gitignore`, `.auth/` (untracked)
- Notes: This is an environment constraint, not a plan deviation. Tokens stored here are the same files the CLIs would keep in `$HOME` on a normal machine; sensitivity handling unchanged (never logged/displayed/committed).

### ISSUE-2026-09-27-010
- Phase: PHASE_00
- Severity: LOW
- Status: OPEN (owner decision required — no action taken per owner instruction)
- Symptom: Two Neon marketplace resources exist on the Vercel team after the integration install: (1) `neon-cobalt-globe` (`store_Xot2tvwkL5JACcF7`, Neon project `tiny-mud-82763154`) — CORRECTLY bound to project `amira-store` across development/preview/production; (2) `amira-store` (`store_dqlFkjRT5Qe6XRyB`, Neon project `nameless-bar-74352862`) — connected to ZERO projects, injects no environment variables. The second resource appears to be a leftover from the integration connect flow (created ~9 minutes after the first).
- Reproduction: `GET /v1/storage/stores?teamId=team_5ThEi7AtAs9s7KUjKD9sR9zy` → 2 stores; store `store_dqlFkjRT5Qe6XRyB` → `totalConnectedProjects: 0`, `projectsMetadata: []`.
- Root cause: Duplicate resource creation during the owner's browser-side integration flow (exact UI path unknown; both resources belong to the same Neon installation `icfg_XaLDAPAdjX8ajtYn8mL9vC0a`).
- Minimal fix: Owner decision — either delete the orphan via Vercel Dashboard → Storage → resource `amira-store` → Delete (frees one Neon Free-plan project slot; does not affect the bound resource), or keep it. NO deletion/rename performed by the agent (explicit owner constraint during verification round).
- Verification: Post-decision — `GET /v1/storage/stores` should list exactly one store; `totalConnectedProjects` on the surviving store remains 1.
- Related files: `EXECUTION_STATUS.md` (PHASE_00 addendum 2026-09-27), `worklog.md` (Task 4-f)
- Notes: No functional conflict — the bound resource is unambiguous (all 18 `DATABASE_*` env vars on `amira-store` carry `contentHint.storeId = store_Xot2tvwkL5JACcF7`). Orphan consumes a Neon Free-tier project slot (limit 100) only.

**ISSUE-2026-09-27-010 — RESOLVED (2026-09-28, FINAL PRE-PHASE-08 CLOSURE — owner authorized deletion):**
- **Re-proven orphan (2026-09-28, pre-deletion evidence):** `GET /v1/storage/stores` → `store_dqlFkjRT5Qe6XRyB` "amira-store" (Neon marketplace resource; `externalResourceId: nameless-bar-74352862`, status `available`) with `totalConnectedProjects: 0`, `projectsMetadata: []`; `GET /v1/storage/stores/{id}/connections` → `[]`. Project env-var census (API): 18 `DATABASE_*` → `store_Xot2tvwkL5JACcF7` (live Neon), 2 `BLOB_*` → `store_bP1wi1NtS4fRkbRh` (Blob), 4 non-store vars (APP_URL, AUTH_SESSION_SECRET, +2 build keys) — **zero reference the orphan**. Resolved `DATABASE_URL` values for production (`a77fc2afd8ac2bd7…` @ `ep-cool-art-b1snfj5i`), development (`f5aa1006670416a5…` @ `ep-dark-boat-b1fejsk4`), and preview (same as production fallback) all belong to Neon project `tiny-mud-82763154` endpoints — the orphan's `nameless-bar-74352862` is used by Production: NO, Development: NO, Preview: NO, Vercel: NO (no bindings), Neon: it IS the orphan's own Neon-side project and nothing else consumes it. Deployments consume env vars only → zero deployment references.
- **Deletion:** first-party REST `DELETE /v1/storage/stores/{id}` → 404 (route not exposed for marketplace resources — recorded, not worked around); the Vercel CLI then named the sanctioned route: `vercel integration-resource remove store_dqlFkjRT5Qe6XRyB --yes` → `{"resource":"amira-store","removed":true}`. The live Neon store and the Blob store were never touched (different resource ids).
- **Post-deletion verification (same day):** stores list = exactly 2 (`neon-cobalt-globe` + `amira-store-media`, each bound to the project); project env listing unchanged (25 vars; BOTH `DATABASE_URL` entries intact — integration var `[preview, production]` + development-target var); env pulls re-fingerprinted: production `a77fc2afd8ac2bd7…` / development `f5aa1006670416a5…` — unchanged; Neon production read-only probe 23t/9e/2 migration hashes OK; Neon development probe OK; local app on the Development env 200; production runtime smoke 13/13 (incl. real 404s and the /admin 307 boundary); no environment variable and no deployment references the deleted resource.
- Transparency note: the deleted resource's Neon-side project (`nameless-bar-74352862`) lifecycle is integration-managed; no application credential ever pointed at it (fingerprint/endpoint evidence above). Any residual Neon-side object is outside Vercel's resource scope and consumes nothing of the application (no Neon control-plane credential exists in the sandbox; none required for this disposition).
- **Status: RESOLVED (2026-09-28).**

### ISSUE-2026-09-27-011
- Phase: PHASE_00
- Severity: MEDIUM (blocked the non-production deployment proof)
- Status: FIXED
- Symptom: First Git-triggered Vercel deployment (`dpl_3fJuSPdnrPUR5Tneeor7CpvDK8rC`, commit `a1f993d` on `phase-00/bootstrap-preview`) landed in state `BLOCKED` with `buildSkipped: true`, `alwaysRefuseToBuild: true`; `readyStateReason: "The deployment was blocked because Vercel couldn't find a Git account for the commit author."` (Hobby plan refuses builds from unmapped authors.)
- Reproduction: push any commit whose author email does not match the GitHub account connected to the Vercel project; observe deployment BLOCKED via `GET /v13/deployments/{uid}`.
- Root cause: repo git identity was the sandbox default `Z User <z@container>`; Vercel maps commit authors to Vercel accounts via GitHub account emails, and `z@container` matches nothing.
- Minimal fix: repo-local `git config user.name "ahmedtaha55555412-code"` + `user.email "323053819+ahmedtaha55555412-code@users.noreply.github.com"` (owner's GitHub noreply); branch commit amended (`e7e1c49`) and re-pushed. No history rewrite of pushed `main` commits.
- Verification: new deployment `dpl_E5DUbpcL6633dBh9iXrmA5QkHSm3` → `READY` (framework `nextjs`, 36.6 s, author `ahmedtaha55555412-code`); blocked deployment left in place as a record (non-functional).
- Related files: `.git/config` (repo-local), `docs/ops/BASELINE.md` §3/§7/§9
- Notes: All future commits in this workspace must be authored with the owner-attributed identity; repo-local config persists but the shell resets between sessions — the config lives in `.git/config`, which persists with the workspace.

### ISSUE-2026-09-27-012
- Phase: PHASE_00 (closure hygiene)
- Severity: MEDIUM (first CI run on main red)
- Status: FIXED
- Symptom: First GitHub Actions run (36298109713, push `f397c02`) failed at Typecheck: `src/lib/db.ts(1,10): error TS2305: Module '"@prisma/client"' has no exported member 'PrismaClient'`. Sandbox typecheck passed because its Prisma client was generated earlier.
- Reproduction: fresh runner + `bun install --frozen-lockfile` → `bun run typecheck` → TS2305.
- Root cause: Bun blocks `@prisma/client`'s postinstall hook on CI (trustedDependencies policy), so `prisma generate` never ran before `tsc --noEmit`.
- Minimal fix: explicit CI step `bun run db:generate` between install and typecheck (comment in workflow explains scope: scaffold helper only; PHASE_02 introduces Drizzle and revisits).
- Verification: follow-up CI run on main green (run id recorded in worklog Task 4-h).
- Related files: `.github/workflows/ci.yml`, `src/lib/db.ts` (untouched scaffold file)
- Notes: Production deployment unaffected (`dpl_AQD3anGMnopwHDcxn4bnDJWdzrNJ` READY — Next build on Vercel does not typecheck `src/lib/db.ts` in the same way).

### ISSUE-2026-09-27-013
- Phase: PHASE_01
- Severity: MEDIUM (visual/RTL defect in foundational primitives)
- Status: FIXED
- Symptom: In the RTL storefront, the close (✕) button of the mobile navigation Sheet overlapped the sheet title "القائمة" (both anchored to the physical right edge). The shared shadcn `Dialog`/`Sheet` close buttons used physical positioning (`absolute top-4 right-4`), which is wrong under `dir="rtl"` where inline-start = right. Browser QA (agent-browser, 375px viewport) surfaced it.
- Reproduction: open `/` at 375px → tap "فتح قائمة التنقل" → sheet title glyphs collide with the ✕.
- Root cause: stock shadcn primitives assume LTR; physical `right-4` does not mirror in RTL documents.
- Minimal fix: `top-4 right-4` → `top-4 end-4` (CSS logical property) in `src/components/ui/sheet.tsx` and `src/components/ui/dialog.tsx` — correct in both LTR (admin, later) and RTL.
- Verification: re-opened the mobile sheet at 375px after fix — title clean at inline-start, ✕ at inline-end; sheet nav click closes sheet and scrolls to `#offers` (scrollY 2616, section in view); playground dialog unaffected.
- Related files: `src/components/ui/sheet.tsx`, `src/components/ui/dialog.tsx`
- Notes: Any future shadcn primitive copied into the repo must be re-audited for physical positioning (`left/right`) versus logical (`start/end`) under RTL.

### ISSUE-2026-09-27-014
- Phase: PHASE_01
- Severity: LOW (dev-only cosmetic; QA tooling collision)
- Status: FIXED
- Symptom: Next.js dev-tools indicator (fixed, bottom-left default) overlapped the QA playground trigger at 1440px; after moving it to `top-right`, it overlapped the RTL header hamburger at 375px (both are fixed corner overlays in the same corners as the store's own overlays).
- Reproduction: `bun run dev` → open `/` at 375/1440px → observe overlay collisions with `<nextjs-portal>`.
- Root cause: the store intentionally occupies fixed corners (WhatsApp FAB bottom-start, QA playground bottom-end, dense header top); every dev-indicator corner collides on at least one breakpoint.
- Minimal fix: `devIndicators: false` in `next.config.ts` (development-only flag; production bundle unaffected).
- Verification: dev server restarted; no `<nextjs-portal>` element present; FAB/playground/header interactions clear at 375/768/1440px.
- Related files: `next.config.ts`
- Notes: recorded for transparency; not a product defect.

### ISSUE-2026-09-27-015
- Phase: PHASE_02
- Severity: BLOCKER (migration failed on a clean database — caught by the fresh-DB rehearsal)
- Status: FIXED
- Symptom: `drizzle-kit migrate` on a fresh empty database failed: `ERROR: there is no unique constraint matching given keys for referenced table "attribute_values"` while adding `variant_attribute_values_value_attribute_pair_fk` (composite FK → `attribute_values(id, attribute_id)`). The migration had never been applied to any real database, so nothing was corrupted; the defect existed only in the generated SQL ordering.
- Reproduction: `bun run db:verify:local` (fresh disposable PostgreSQL, migrations only).
- Root cause: drizzle-kit emits all FK `ALTER TABLE` statements immediately after table creation but all `CREATE UNIQUE INDEX` statements later, in the index section. The composite FK requires `attribute_values_id_attribute_key` to exist BEFORE the FK is added; drizzle-kit's statement ordering could not express that dependency.
- Minimal fix: reviewed and edited the generated migration `drizzle/0000_init_schema.sql` — moved the single `CREATE UNIQUE INDEX "attribute_values_id_attribute_key" …` statement to directly after the `CREATE TABLE "attribute_values"` statement. End-state schema is byte-identical; only statement order changed (drizzle-kit documents reviewing/adjusting generated SQL before applying).
- Verification: full re-run of `bun run db:verify:local` → migrations apply cleanly to TWO fresh databases; 28/28 probes pass.
- Related files: `drizzle/0000_init_schema.sql`
- Notes: This is exactly the failure class the clean-database rehearsal (PHASE-02 task 13) exists to catch. Any future migration introducing a composite FK must re-check index ordering in the generated SQL.

### ISSUE-2026-09-27-016
- Phase: PHASE_02
- Severity: HIGH (FK miswired — invariant hole; caught by the seed run)
- Status: FIXED
- Symptom: Development seed failed on the first variant-attribute insert: `violates foreign key constraint "variant_attribute_values_attribute_id_attribute_values_id_fk" — Key (attribute_id)=… is not present in table "attribute_values"`.
- Reproduction: `bun run db:seed` on a migrated disposable database.
- Root cause: in `src/db/schema/catalog.ts` the denormalized `variant_attribute_values.attributeId` was (copy-paste) wired to reference `attributeValues.id` instead of `attributes.id`. The single-column FK therefore demanded an attribute-VALUES id in a column that legitimately stores an attributes id; the composite FK (which is the real consistency guard) would also have been unsatisfiable together with it.
- Minimal fix: `attributeId` references `attributes.id` (ON DELETE cascade). The composite FK `(attribute_value_id, attribute_id) → attribute_values(id, attribute_id)` remains the invariant enforcer: it is now logically satisfiable AND still rejects mismatched value/attribute pairs (verified by a dedicated probe).
- Verification: seed completes (7 products / 18 variants / 24 assignments); probe "value/attribute pair consistency (composite FK)" rejects a color-value id paired with the size attribute id; 28/28 probes pass.
- Related files: `src/db/schema/catalog.ts`, `drizzle/0000_init_schema.sql` (regenerated)
- Notes: Found because the seed exercises real data paths before any UI exists — data-layer-first catching design errors as intended.

### ISSUE-2026-09-27-017
- Phase: PHASE_02
- Severity: MEDIUM (seed idempotency gap — schema constraint missing)
- Status: FIXED
- Symptom: Re-running the development seed duplicated one product-gallery image row (images 13 → 14). SEED_PLAN requires re-runs to never duplicate.
- Reproduction: run `bun scripts/db-seed.ts` twice against the same disposable database; compare `SELECT count(*) FROM product_images`.
- Root cause: non-primary gallery rows had NO unique constraint covering them (primary-image partial unique indexes only), so `ON CONFLICT DO NOTHING` had nothing to conflict on for those rows.
- Minimal fix: added two partial unique indexes — `(product_id, media_asset_id) WHERE variant_id IS NULL` and `(variant_id, media_asset_id) WHERE variant_id IS NOT NULL` — "same media cannot be attached twice at the same level" (a genuine domain rule), making seeds and future admin edits naturally idempotent. Migration regenerated accordingly.
- Verification: seed re-run → counts stable at 7/18/24/13; 28/28 probes pass.
- Related files: `src/db/schema/catalog.ts`, `drizzle/0000_init_schema.sql`, `docs/DATA_DICTIONARY.md` (note 9)
- Notes: none.

### ISSUE-2026-09-27-018
- Phase: PHASE_02 (environment)
- Severity: MEDIUM (blocks remote verification + push this session; not a code defect)
- Status: RESOLVED (both halves closed — Vercel/Neon half 2026-09-27; GitHub half 2026-09-27, see closing addendum)
- Symptom: The git-ignored credential vault `.auth/` is missing after the latest sandbox recycle, so `gh`/`vercel` authentication and `git push` (GitHub) are unavailable this session. Recurrence of the ISSUE-2026-09-26-009 environment class.
- Reproduction: `git push` → credential helper `/home/z/my-project/.auth/bin/gh-cred` not found; no `gh`/`vercel` binaries on PATH.
- Root cause: sandbox recycles wipe everything outside `/home/z/my-project`; the vault restore step did not run before this session.
- Minimal fix: owner restores CLI credentials (GitHub + Vercel) per ISSUE-2026-09-26-009 mitigation; then `git push origin main`. Live-Neon verification steps are pre-written in `docs/ops/DATABASE.md` §8 and need no further code work.
- Verification: after restore — `gh auth status` succeeds, push succeeds, CI run green on the PHASE_02 commit.
- Related files: none (environment)
- Notes: PHASE_02 remote-scope items are therefore satisfied by the committed local rehearsal on real PostgreSQL 18 (identical wire protocol/driver) with the live-Neon application documented as the single remaining remote step; production is untouched either way.

**Addendum (2026-09-27, PHASE-02 compliance round):**
- Vercel/Neon half RESOLVED: Vercel authentication restored via the OAuth device flow (owner approved in browser; the flow was driven manually because the sandbox kills background pollers between turns; device code displayed, token/refresh token never displayed and shredded after use). No Neon API key was needed — the existing Vercel↔Neon integration supplied per-environment connection secrets via `vercel env pull` (values compared by hash only, never printed).
- Live-Neon verification EXECUTED and PASSED: exact committed migration applied via `drizzle-kit migrate` to a real EMPTY disposable Neon database (`phase02_drizzle_verify_tmp`, PostgreSQL 18.6/fra1) → SCHEMA_MATCH 23/23 tables + 9/9 enums vs the committed snapshot → `drizzle.__drizzle_migrations` row hash == sha256(drizzle/0000_init_schema.sql) → app-driver smoke (pooled endpoint) write+ROLLBACK clean → disposable db dropped with zero residue → production `neondb` unmodified (public tables [] before/after). Full procedure and evidence: docs/ops/DATABASE.md §8.
- STILL OPEN (GitHub half): `gh` credential restore + `git push origin main` (commits b4fca6e, 49ce1f0, and the PHASE-02 completion commit) + first green CI run on the Drizzle CI workflow. Owner-side action unchanged.

**Closing addendum (2026-09-27, GitHub half RESOLVED — owner-approved device flow):**
- GitHub authentication restored owner-paced: one OAuth device code (GitHub CLI client, scope `repo, workflow, read:org`), owner approved in browser, single token exchange, token never displayed/committed (held in a chmod-600 temp file, shredded after registration; credential now lives only in gh's own config outside the repo). `gh auth status` → Logged in to github.com account `ahmedtaha55555412-code` (active).
- Pushed exactly the pending local history with a plain fast-forward `git push origin main`: `ffcbd43..c6fdea5` — commits `b4fca6e` (PHASE-02 implementation), `49ce1f0` (documented sandbox auto-commit), `d82ed08` (PHASE-02 live-Neon completion docs), `c6fdea5` (pre-PHASE-03 safety-round docs). No force push, no history rewrite, no reset/rebase.
- Source-of-truth equality verified by hash: local `main` HEAD == `origin/main` HEAD == `c6fdea52768554385c25a8958c0b8e7c67216943`; local tree == remote tree (`3a7435818dadbd874fcfd75ad676ff64db814316`) → byte-identical content, no unexpected files; working tree clean; 0 pending commits; `.github/workflows/ci.yml` present at remote HEAD (`3ee34d4c`).
- Secret scan of the pushed range `ffcbd43..main`: 3 grep hits, all `127.0.0.1` loopback placeholders inside the committed local-rehearsal script; zero tokens (`gho_`/`ghp_`/PAT: none).
- Planning repository verified untouched via GitHub API: `ahmedtaha55555412-code/amira-store-plan` HEAD still `2f4e4b31927b9caa28f32c0ac7c26f0a537dfbf8`, `pushed_at=2026-09-26T18:06:04Z` (predates this execution), single branch `main`; no push/edit/recreate/permission change performed.
- Housekeeping: stale repo-local credential helper (pointed at the recycled vault path) removed from `.git/config`; push used gh's credential helper.

### ISSUE-2026-09-27-019
- Phase: PHASE_02 (verification-round discovery) → elevated to pre-PHASE_03 safety gate (owner directive 2026-09-27)
- Severity: MEDIUM (development writes would hit the production database; controlled by standing guardrails)
- Status: OPEN — narrowed scope (2026-09-27): the isolated Neon `development` branch is the ACTIVE local development target via git-ignored `.env.local` (compensating control verified & live); only the Vercel `development`-environment binding gap remains (future `vercel-dev` option recorded in DATABASE.md §9.5)
- Symptom: On the Vercel↔Neon integration, the project's `development` and `production` environments resolve to the IDENTICAL Neon database (`neondb` on the primary branch) — sha256(DATABASE_URL) hashes are equal. There is no dedicated isolated development branch.
- Reproduction: `vercel env pull --environment=development|production` → both DATABASE_URL values hash to a77fc2afd8ac2bd7…; public tables of neondb = [] (only the platform `neon_auth` schema exists).
- Root cause: Neon Vercel-native integration default — one primary-branch database serves production + development; isolated copy-on-write branches are created only per Preview Deployment.
- Impact: a migration run against the "development" env var would hit the production database; agents must never treat the development environment target as disposable. Disposable verification targets must be temporary databases (or owner-created branches) on the same Neon project, exactly as done for PHASE-02 (docs/ops/DATABASE.md §8).
- Minimal fix: none required now. PHASE_14 may create a dedicated dev branch (owner decision; requires Neon console or API access).
- Verification: the PHASE-02 live-Neon round used `phase02_drizzle_verify_tmp` (created empty → migrated → verified → dropped, zero residue); production `neondb` unmodified (public tables [] before/after).
- Related files: docs/ops/DATABASE.md §8
- Notes: the Neon Free plan supports console-created branches if the owner prefers a true dev branch later.

**Addendum (2026-09-27, pre-PHASE_03 safety/continuity round — owner directive):**
- Owner set development-environment isolation as a PHASE_03 gate and prescribed the target architecture: production → main branch, development → dedicated development branch, preview → isolated per-deployment branches, all inside `neon-cobalt-globe` (no second project, no rename/delete, no secrets printed, production untouched).
- Integration limitation CONFIRMED, not worked around: the 18 `DATABASE_*` vars are integration-store secrets (ciphertext to user tokens, proven PHASE_00) jointly targeting all three environments; the Vercel↔Neon native integration exposes no public API for branch creation or per-environment branch rebinding; Neon branch creation requires the console or a Neon API key (neither available owner-paced in-sandbox). A same-branch `CREATE DATABASE` is explicitly NOT accepted as a substitute (no compute/storage isolation from main).
- RESOLUTION RECORDED: exact limitation + concrete safe remediation path written to **docs/ops/DATABASE.md §9** — owner steps: (1) create `development` branch from `main` in the Neon console; (2) map development → `development` in Vercel Storage settings if the integration UI offers it; (3) otherwise owner chooses compensating control (recommended: `.env.local` → development branch for local work; Vercel development env treated as production-equivalent) or explicit manual per-env management (documented tradeoffs); (4) hash-only post-change verification procedure (fingerprints differ, endpoint hosts differ, production hash unchanged, neondb tables unchanged).
- Standing guardrails effective immediately: the Vercel `development` environment is treated as production-equivalent (no migrate/seed/writes through it); disposable targets remain temporary databases on `tiny-mud-82763154`; `drizzle-kit push` remains forbidden; no secret values printed.
- Production state this round: UNCHANGED — zero writes, zero binding changes; evidence from the PHASE-02 live-Neon round stands (public tables [] before/after).

**Addendum (2026-09-27, owner-side isolation gate — final pre-PHASE_03 round):**
- The agent re-checked every control-plane path WITHOUT any database writes or API mutations: Vercel CLI is logged out (no token/auth file), no Neon CLI / API key / config exists anywhere in the sandbox, and the only live credential is GitHub (not a Neon control plane). Branch creation is control-plane-only, so per the standing directive (no invented workarounds, no replacement resources, no same-branch CREATE DATABASE substitute) **no branch was created by the agent and nothing was touched**.
- The exact owner-side walkthrough is now in docs/ops/DATABASE.md §9.3: Neon console (project tiny-mud-82763154 → Branches → Create branch → name `development`, parent `main`, keep copy-data default, endpoint enabled) + Vercel Storage mapping check WITH the critical guardrail (a single project-wide branch selector must NEVER be used — it would rebind Production; only a per-environment mapping is acceptable), plus fallbacks (a)/(b) and the hash-only verification procedure (post-change: sha256(DATABASE_URL.production) must equal the recorded a77fc2afd8ac2bd7…; development hash must differ; endpoint ids must differ).
- Status remains OPEN — REMEDIATION DOCUMENTED. Development remains write-prohibited (production-equivalent) until the owner completes the console step and the fingerprint verification passes.

**Addendum (2026-09-27, binding-capability research round — owner directive after branch creation):**
- **Branch creation CONFIRMED (owner-attested):** the owner created the isolated `development` branch in the Neon console — child of `main`, project `tiny-mud-82763154` / resource `neon-cobalt-globe`. Branches now: `main` (default/production), `development` (new child), `preview/phase-00/bootstrap-preview` (existing Vercel preview branch). Independent verification from the sandbox is not possible (no Neon control-plane credential; DB connections forbidden by standing rules) — recorded as owner-attested evidence.
- **Owner UI finding:** Vercel Marketplace resource settings expose only Allowed Environments (All / Production-only) and an Update Configuration with NO per-environment branch selector.
- **First-party research verdict (docs-only round, ZERO mutations):** the Neon-Managed integration's ONLY documented per-environment Development binding is the installation-time option "Create a branch for your development environment" → a persistent integration-managed `vercel-dev` branch + Vercel development environment variables set by the integration itself (neon.com/docs/guides/neon-managed-vercel-integration). It (1) cannot bind an arbitrary EXISTING branch such as `development`, and (2) has no documented post-install toggle (Managing = variable selection/role, preview branch cleanup, Disconnect only) — enabling it would require the reconnect/reinstall the owner explicitly forbade this round. Vercel-side manual override of the integration-managed `DATABASE_*` variables is impossible (integration-store secrets; also owner-forbidden).
- **Consequence:** Vercel `development` is NOT yet bound to the isolated `development` branch; integration LEFT UNTOUCHED per the owner's conditional; compensating control (§9.3(a): local git-ignored `.env.local` → `development` branch pooled string; Vercel development env write-prohibited) remains the operative development architecture. Full analysis + recorded future `vercel-dev` owner option: docs/ops/DATABASE.md §9.5.
- Status stays OPEN — narrowed scope: "Vercel `development` environment still maps to the production branch; the isolated Neon `development` branch exists but is reachable only via local `.env.local` (future owner options recorded in DATABASE.md §9.5)."

**ISSUE-2026-09-27-019 — RESOLVED (2026-09-28, FINAL PRE-PHASE-08 CLOSURE — owner directive):**
- Owner directive: "Fix the Vercel Environment configuration so that Production → Neon main, Development → Neon development, Preview → isolated branch per contract", with the standing redlines (no production-data modification, no secrets printed, no invented credentials).
- **Mechanism (Vercel control-plane target surgery; no reinstall, no value changes, no upsert):**
  1. A direct project-level `DATABASE_URL` creation for target `[development]` was attempted FIRST and refused by Vercel (`ENV_CONFLICT` — name occupied for an overlapping target while the integration var covered `development`). Recorded as evidence, not bypassed.
  2. `PATCH /v9/projects/{id}/env/mnk1KV5UjdrPX9QK` — the integration var's **target** narrowed from `[development, preview, production]` → `[preview, production]`; the PATCH body omitted `value`, so the integration-managed credential is byte-unchanged. Production fingerprint re-pulled immediately after the PATCH: **`a77fc2afd8ac2bd7…` UNCHANGED** (fail-fast gate; auto-revert armed and unused).
  3. `POST /v10/projects/{id}/env` created project-level `DATABASE_URL` id `lGK9GdoX5H9pBtcB`, target `[development]`, type `encrypted` (same posture as the integration's own secret), value = the development-branch POOLED string already sanctioned in git-ignored `.env.local` since PHASE-03 (re-provisioned and battery-validated in the 2026-09-28 hardening round; endpoint `ep-dark-boat-b1fejsk4`). Nothing was invented.
- **Resulting topology (resolved-value fingerprints, hash-only protocol):**
  - production → `a77fc2afd8ac2bd7…` @ `ep-cool-art-b1snfj5i-pooler` = Neon **main** — UNCHANGED invariant;
  - preview → same integration var (static fallback unchanged; per-preview-deployment isolated-branch injection remains integration-native, per the PHASE-00/02 contract);
  - development → `f5aa1006670416a5…` @ `ep-dark-boat-b1fejsk4-pooler` = the isolated Neon **development** branch — **differs from production in both fingerprint and endpoint id**.
- **Runtime proof (same day):** the application was started with the PULLED Vercel Development environment and served development-branch data (6 distinct seeded product links on the homepage — production's catalog is 0 products, a decisive branch discriminator); a disposable write/read/delete probe (temp table create → insert → select → delete → drop) passed 7/7 against `ep-dark-boat-b1fejsk4` with zero residue; the production DB re-probe after ALL changes was byte-identical to the pre-change baseline (23t/9e/89 idx/34 FK/34 CHECK/6 trgm/2 migration hashes/1 settings/5 categories/0 business rows/neon_auth 9 tables).
- **Redeploy note:** Vercel `development`-target variables are not consumed by any deployment target (they apply to local `vercel dev` / `env pull` flows); production and preview values are unchanged, so no redeploy was REQUIRED. The current production deployment `dpl_6XXKa3sSkZh8BuM2tMAKRPNqhiiK` (built from `263600c` AFTER the change) was verified READY with a 13/13 read-only runtime smoke.
- Guardrail update (supersedes §9.4's first bullet): the Vercel `development` environment now resolves to the isolated development branch and is no longer production-equivalent; it is a disposable target for development writes. Neon `main` (production) remains write-prohibited except through the documented release procedure. Full topology + verification procedure recorded in DATABASE.md §9.6.
- **Status: RESOLVED (2026-09-28).**

### ISSUE-2026-09-27-020
- Phase: PHASE_03 (start round, 2026-09-27 — owner explicitly authorized the phase)
- Severity: BLOCKER (per ERROR_PROTOCOL: prevents phase completion; security/data boundary involved)
- Status: OPEN — BLOCKED at the database-safety gate; PHASE-03 NOT started; zero code written; no workaround invented (owner directive)
- Symptom: The only DB target sanctioned for PHASE-03 (isolated Neon `development` branch, project `tiny-mud-82763154`) has NO connection string available in the sandbox: `.env.local` does not exist and no other legitimate source holds it.
- Reproduction: exhaustive name/shape-only scan (no secret values printed): (1) `.env.local` / `.env.development*` / `.env.production` ABSENT — only the 1-line scaffold `.env` (non-Neon value) exists; (2) shell env var names: no `NEON_*`/`PG*`/`AUTH_SESSION_SECRET`/`APP_URL`, only scaffold `DATABASE_URL` (non-Neon); (3) no Neon config dirs (`~/.config/neon`, `~/.neon`), no neonctl, no Neon API key anywhere in the sandbox; (4) git-ignored `.auth/` vault contains only `.auth/verify/neon-{1-create,3-verify,4-smoke,5-drop}.mjs` — scanned CLEAN: zero embedded connection strings (each reads credentials via `process.env`; their target `phase02_drizzle_verify_tmp` was dropped at PHASE-02 end, so any previously passed value is dead); (5) the only Neon URL reachable in this ecosystem is the Vercel Development/Production shared `DATABASE_URL` — FORBIDDEN (points at Production `neondb` on `main`).
- Root cause: the compensating-control step documented in docs/ops/DATABASE.md §9.3 Step 1.6 (owner copies the `development` branch's POOLED connection string into git-ignored `.env.local`) has not been performed/propagated into this sandbox; no supported first-party path exists for the agent to obtain the string itself (Vercel Development URL = Production, forbidden; no Neon control-plane credential).
- Affected layer/files: ALL DB-backed PHASE-03 tasks (login endpoint, session creation/expiry, throttling, bootstrap command, change-password flow, activity logging, and their tests/verification); missing file: `/home/z/my-project/.env.local`. NO application files touched this round.
- Minimal fix (owner action — exactly one of):
  - **Option A (primary, per §9.3 Step 1.6):** in Neon Console → project `tiny-mud-82763154` → **Branches** → open the **`development`** branch (NOT main) → **Connect** → enable **Pooled connection** → copy the string into a NEW file `/home/z/my-project/.env.local` (workspace file access) containing exactly one line: `DATABASE_URL=<development-branch pooled string>`. CRITICAL: the string MUST come from the `development` branch's own Connect panel — the project-level/default Connect button delivers the `main` (Production) branch credentials, which must never enter the sandbox. Never through chat/email/IM; the file is git-ignored (`.gitignore` line 34 `.env*`; `git check-ignore .env.local` passes).
  - **Option B (only if the owner has no direct sandbox file access):** owner issues a Neon API key (owner-issued, per DATABASE.md §9.2 precedent) into the git-ignored `.auth/` vault via their own secure file channel; upon explicit owner authorization the agent performs a READ-ONLY Neon API call (project `tiny-mud-82763154`, branch `development` → pooled connection URI) and writes `.env.local` itself; the value is never printed/logged/chatted. NOT executed without explicit owner authorization.
- Verification command/check (after the owner action, before any PHASE-03 use): `test -f /home/z/my-project/.env.local && git -C /home/z/my-project check-ignore .env.local`; agent then verifies WITHOUT printing values: URL is a `*.neon.tech` POOLED host; `sha256(DATABASE_URL) ≠ a77fc2afd8ac2bd7…` (the recorded production fingerprint); host/endpoint id differs from the production endpoint; then a `SELECT 1` probe and `drizzle-kit migrate` (DRIZZLE_DATABASE_URL aimed explicitly) target that URL ONLY.
- Final status: RESOLVED (2026-09-27, same session).

**Closing addendum (2026-09-27, PHASE-03 unblock round):**
- The owner supplied the `development`-branch POOLED connection string through an authorized channel and explicitly delegated `.env.local` creation to the agent ("Do not stop merely because the credential needs to be placed in `.env.local`"). The file was created git-ignored (chmod 600) and the full verification checklist above PASSED with values never displayed: git-ignored ✓; pooled `*.neon.tech` host (endpoint id `ep-dark-boat-b1fejsk4`) ✓; **sha256 = e5d2abaf3816965f… ≠ production fingerprint a77fc2afd8ac2bd7…** ✓; read-only probe → `neondb`, PostgreSQL 18.6, 0 public tables, only platform `neon_auth` schema ✓ (owner attestation + fingerprint inequality = identity evidence; no production endpoint id was ever recorded, so hash inequality is the operative discriminator).
- All PHASE-03 database work then ran against exactly this URL, explicitly sourced per command: `drizzle-kit migrate` (direct endpoint of the SAME endpoint id) → 23/23 tables + 9/9 enums + migration hash == committed file; `db:bootstrap`; `db:seed`; `db:verify` 28/28; `db:bootstrap:admin`; `verify:auth` 29/29. Vercel `development` DATABASE_URL was never opened; Neon `main`/Production was never connected to.

### ISSUE-2026-09-27-021
- Phase: PHASE_03 (browser/QA round, 2026-09-27)
- Severity: HIGH (security control misbehaved — throttling triggered on non-failure traffic patterns and counted non-failure rows)
- Status: FIXED
- Symptom: repeated-bad-login QA loop returned 429 on attempt 2 while only ONE failure row existed for the submitted username; the throttle counted rows irrespective of their action type.
- Reproduction: `curl` login attempts sequence after a prior mixed login history; `getLoginThrottleState` returned `throttled=true` with `recentFailures` exceeding the actual `auth.login.failed` row count.
- Root cause: drizzle's `and()` inlines raw `sql` fragments verbatim WITHOUT parenthesizing them — the `or` between the username and ipHash identity conditions bound looser than the AND-ed `action`/`createdAt` filters, so the count matched "any activity row with this IP hash" (including successes) regardless of action or window.
- Minimal fix: fully parenthesize the OR pair in `getLoginThrottleState` (`((u = $username) or (i = $ipHash))`) with an explanatory comment; `clearLoginFailures` (single raw condition) was already safe.
- Verification: QA failure rows cleared → clean loop 5×401 → 429 + Retry-After on attempt 6; browser shows the Arabic throttle message; recovery after transient-row cleanup; `bun run verify:auth` 29/29 (its throttle probe uses the username-only path and passes alongside the fixed SQL).
- Related files: `src/lib/auth/throttle.ts`
- Notes: caught by the phase's own QA loop exactly as the verification plan intended; recorded for transparency per ERROR_PROTOCOL.

**ISSUE-2026-09-27-019 — Addendum (2026-09-27, PHASE-03 unblock round — compensating control ACTIVE):**
- The owner-provided `development`-branch POOLED string is now operationally live in git-ignored `.env.local` (verification chain in ISSUE-2026-09-27-020's closing addendum). All local PHASE-03 database work ran against the isolated branch; the Vercel `development` environment remains production-bound and WRITE-PROHIBITED.
- Scope of this issue therefore narrows further: "Vercel `development` environment still maps to the production branch; the isolated Neon `development` branch is the active local development target via `.env.local`; future `vercel-dev` binding option remains recorded in DATABASE.md §9.5." Status stays OPEN (binding gap only).

### ISSUE-2026-09-27-022
- Phase: PHASE_03 (owner-mandated targeted security audit, 2026-09-27 — AFTER phase completion, BEFORE PHASE-04)
- Severity: HIGH (missing explicit CSRF control on state-changing admin endpoints; session-sensitive responses cacheable)
- Status: FIXED
- Symptom: owner-directed OWASP-referenced audit of all state-changing admin endpoints (login / logout / change-password) found that SameSite=Lax on the session cookie was the SOLE cross-site request defense — no Origin/Referer validation and no CSRF token; authentication/session-sensitive responses (auth endpoints + /admin pages) carried no Cache-Control: no-store.
- Reference standard: OWASP CSRF Prevention Cheat Sheet — "Verifying Origin With Standard Headers" + "SameSite must not be the sole CSRF defense"; owner audit criteria #1–#5 (origin validation / explicit CSRF or equivalent same-origin mechanism / SameSite as defense-in-depth only / no state-changing GETs / no-store on session-sensitive responses).
- Audit result against the 10 criteria: #4 (no state-changing GET — only POST admin endpoints; bootstrap is CLI-only) ✓, #6 (cookie HttpOnly/SameSite/host-only/path/Secure-on-https) ✓, #7 (session fixation impossible — fresh 256-bit CSPRNG token per login, SHA-256 at rest, all sessions revoked on password change) ✓, #8 (authorization: requireAdminMutation + DB re-validation on change-password; logout token-scoped idempotent) ✓, #9 (throttle post-ISSUE-021 correct) ✓, #10 (no credential/session leakage — redaction filter, name-only error logs) ✓; #1/#2 FAIL → this fix; #3 defense-in-depth now complemented by #1; #5 FAIL → fixed here.
- Root cause: PHASE-03 implemented the cookie flags required by its task list but no explicit same-origin/CSRF request control, and no explicit no-store cache policy on auth responses.
- Minimal fix (PHASE-03 scope only): new `src/lib/auth/origin.ts` — `isSameOriginRequest()` (strict Origin/Referer-vs-deployment-origin match, default-port normalisation, literal-null rejection, x-forwarded-host/proto aware, localhost allowances only when NODE_ENV !== 'production', reject requests with NO attestation) + `isJsonRequest()` (application/json enforcement — browser HTML forms cannot send it) + `withNoStore()` (Cache-Control: no-store). Wired BEFORE any body parsing / DB work into login + logout + change-password; every response of the three endpoints wrapped; middleware stamps ALL /admin responses with no-store. No schema change, no new endpoints, no unrelated refactors.
- Verification (isolated Neon development branch ONLY; Production/Vercel-Development URL never touched):
  - `bun run verify:auth` extended with section [12] — 15 new checks (same-site accepted, cross-site/look-alike/null/no-attestation rejected, default-port normalisation both directions, Referer fallback, APP_URL allowlist, JSON content-type enforcement, withNoStore header, normalizeOrigin malformed rejection) → **44 passed, 0 failed**
  - curl matrix on the dev server — 15/15: cross-origin login 403+no-store; no-Origin 403; text/plain spoof 403; same-origin wrong creds 401 (gate passed); real login 200 + no-store + `HttpOnly; SameSite=lax; Path=/` host-only cookie; Referer fallback 200; **authenticated cross-site logout 403 AND session survived (GET /admin 200)**; same-origin logout 200+no-store; cross-site/no-Origin change-password 403/403; same-origin wrong-current-password 401 (no rotation); unauthenticated change-password 401; /admin/login no-store; /admin → 307 /admin/login + no-store; real password still valid after the full matrix
  - Browser QA (agent-browser): browser-native same-origin fetch → 401 + no-store (browser automatic Origin passes the gate through the real request path); text/plain fetch → 403; wrong-credential UI generic Arabic error; /admin unauthenticated → redirect; zero console/page errors; zero horizontal overflow 375/1440
  - typecheck ✅ lint ✅; test artifacts cleaned from the dev branch (1 probe failure row + 4 test sessions removed)
- Related files: `src/lib/auth/origin.ts` (new), `src/app/api/admin/auth/{login,logout,change-password}/route.ts`, `src/middleware.ts`, `scripts/verify-auth.ts`
- Notes: found only by the owner's post-completion audit; recorded per ERROR_PROTOCOL. Non-browser clients have no sanctioned use of the admin dashboard (single-admin model, MASTER_PLAN §16) — requests without Origin/Referer are rejected by design.

### ISSUE-2026-09-27-023
- Phase: PHASE_04 (2026-09-27; UPDATED by the PHASE-04 final integration/visual gate, same day)
- Severity: MEDIUM (deployment-time configuration gap; does not block any PHASE-04 task's logic)
- Status: RESOLVED (2026-09-28 pre-PHASE-08 hardening round, owner directive "create/use a real Blob store and prove a real live flow") — see RESOLUTION block at the end of this entry.
- Symptom: no Blob credential is present in the sandbox environment, so the Vercel Blob provider cannot be exercised live here; the admin media UI shows an honest "uploads not configured" banner and the upload endpoint answers 503 with the exact remediation.
- Root cause: connecting a Vercel Blob store to the project is an owner-side dashboard action; nothing in the sandbox can mint credentials. Additionally (found by this gate): the provider's configured-state check recognized ONLY the legacy long-lived `BLOB_READ_WRITE_TOKEN` and would have reported "unconfigured" on a modern OIDC-connected store.
- Impact: 13/14 PHASE-04 tasks fully implemented AND verified, including the entire media service abstraction (validation: magic-byte mime sniffing / 8 MB ceiling / sharp dimensions; registry; reference guards; attach/reorder/replace). Only the live "bytes → Blob" hop awaits credentials; the provider is isolated behind `src/lib/media/service.ts` per MASTER_PLAN §20.
- Current-state audit performed by the final gate (owner directive, no workarounds, no new store created, no tokens exposed):
  1. Installed client: `@vercel/blob` 2.8.0 with bundled `@vercel/oidc` 3.8.9. Its `resolveBlobAuth()` accepts — in order — presigned payloads, an explicit `token`, an OIDC token (`options.oidcToken` or auto via `getVercelOidcToken()`) paired with `storeId` (option or `BLOB_STORE_ID` env), then falls back to `BLOB_READ_WRITE_TOKEN`.
  2. Official Vercel docs (vercel.com/docs/vercel-blob, retrieved 2026-09-27): for OIDC-connected stores Vercel injects `BLOB_STORE_ID` + `VERCEL_OIDC_TOKEN` automatically; the SDK pairs them; the OIDC token is short-lived and rotated by the Vercel runtime. June 2026 announcement (cross-checked via two independent search results): OIDC became the DEFAULT for newly connected stores; existing stores can be upgraded from the store's Projects tab.
  3. Verdict: OIDC IS supported for this exact project/store model at deployment — via the installed client version itself (≥2.4), needing no rewrite of the media architecture. `VERCEL_OIDC_TOKEN` is minted only inside the Vercel runtime, so a live OIDC hop is NOT technically possible from this sandbox (no token, and `@vercel/oidc`'s refresh path exists only on Vercel's network); the legacy-token path is equally absent here. Hence the live upload/delete hop remains recorded for PHASE-14 and this issue stays OPEN — precisely per the owner's conditional.
  4. Minimal code changes made (the only code the audit changed): `isVercelBlobConfigured()` now returns true for EITHER `BLOB_READ_WRITE_TOKEN` OR the OIDC pair (`BLOB_STORE_ID` + `VERCEL_OIDC_TOKEN`) — the exact surfaces `resolveBlobAuth()` accepts; the 503 error message, the admin banner copy (Arabic), and `.env.example` now name both mechanisms. `.env.example` notes OIDC values are Vercel-injected/runtime-minted and must never be committed.
- Verification performed: verify-catalog new section [14] (6 checks — no creds → unconfigured; store id alone → unconfigured; store id + OIDC token → configured; legacy token → configured; blank token → unconfigured; env restored exactly), suite now 43/43; banner text visually confirmed in browser at 1440/768/375; upload endpoint still answers 503 honestly in the sandbox.
- Related files: `src/lib/media/vercel-blob.ts`, `src/lib/media/types.ts`, `src/app/api/admin/media/upload/route.ts`, `src/app/admin/(protected)/media/media-manager.tsx`, `.env.example`, `scripts/verify-catalog.ts`
- Notes: NOT a workaround — the media service abstraction with the honest unconfigured state is exactly the MASTER_PLAN §20 contract; at deployment the owner connects the store (OIDC default) and the existing code path activates with zero further changes; if the owner instead upgrades an existing store from its Projects tab, the same code path applies.
- **RESOLUTION (2026-09-28 pre-PHASE-08 hardening round):** RESOLVED — see the full RESOLUTION block at the top of this entry (store created, OIDC model, live upload+delete proven under both credential models, orphan-prevention implemented and proven, production contract verified pure-OIDC with zero test media).

### ISSUE-2026-09-27-026 (final gate finding D-1)
- Phase: PHASE_04 final integration/visual gate (2026-09-27)
- Severity: LOW (UX polish; no data or security impact)
- Status: FIXED
- Symptom: in the product editor, programmatic/keyboard/smooth scrolling could land interactive controls (attribute checkbox, value combobox, size-guide "إضافة صف") visually underneath the sticky bottom save bar; browser automation hit "element covered by sticky bar" three times during the golden flow.
- Root cause: the editor's sticky save bar (`sticky bottom-4`) overlays page content while `scroll-padding-bottom` on `html` was unset (`auto`), so scroll-into-view operations positioned targets at the viewport bottom edge — under the bar. The editor also sets `scroll-behavior: smooth` (inherited from PHASE-01), making transient overlap longer.
- Impact: cosmetic/ergonomic only — content is fully reachable by manual scrolling; no data, security, or functionality impact.
- Minimal fix: `scroll-padding-bottom: 7rem` on `html` in `src/app/globals.css` (global, benefits every admin surface with a sticky bar).
- Verification: browser re-measurement on the editor — checkbox scrolls to y=398 with the bar top at y=690 (fully clear); automated click-through of the previously failing interactions no longer hits the bar; typecheck/lint clean; no-op save round-trip still 200.
- Related files: `src/app/globals.css`
- Notes: the sticky save bar itself is correct, deliberate UX (PHASE-04); the fix only compensates scroll targeting.

### ISSUE-2026-09-27-027 (final gate finding N-3)
- Phase: PHASE_04 final integration/visual gate (2026-09-27)
- Severity: MEDIUM (accessibility; MASTER_PLAN §22 targets WCAG 2.2 AA) — FIXED
- Symptom: the five per-variant inputs in the product editor (SKU, السعر الأصلي, السعر الحالي, المخزون, حد التنبيه) exposed NO accessible name — the visible labels were sibling `<Label>` elements without htmlFor/id association, so assistive technology announced unnamed textboxes (confirmed in the accessibility tree during visual QA).
- Root cause: the variant row markup used visual-only label siblings; the size-guide table inputs by contrast carried `aria-label`s (and were announced correctly), so the gap was specific to the variant row.
- Impact: screen-reader users could not tell which value each variant input holds; a WCAG 2.2 AA gap on a PHASE-04 admin surface. No functional/data impact.
- Minimal fix: `aria-label` added to each of the five inputs (mirroring the existing size-guide pattern): رمز SKU للمتغير / السعر الأصلي للمتغير / السعر الحالي للمتغير / المخزون للمتغير / حد التنبيه للمتغير.
- Verification: accessibility tree now reports all five named inputs; visual snapshot unchanged; editor save round-trip 200; typecheck/lint clean.
- Related files: `src/app/admin/(protected)/products/[id]/editor-sections.tsx`
- Notes: found only by actually inspecting the accessibility tree (not just screenshots) — recorded per ERROR_PROTOCOL.

### ISSUE-2026-09-27-024
- Phase: PHASE_04 (browser QA round, 2026-09-27)
- Severity: MEDIUM (editor state bug caught before push)
- Status: FIXED
- Symptom: after a successful product save + `router.refresh()`, the SECOND save failed 422 with "رمز SKU مستخدم بالفعل" although the admin had not duplicated anything.
- Root cause: the editor's `useState` initializers run only on mount; after refresh the server re-render passed a NEW aggregate (with persisted variant ids), but the editor state still held the pre-save rows (`id: null`), so the next save re-submitted existing variants as new ones and the service's foreign-SKU pre-check correctly refused.
- Minimal fix: `useEffect` resync in `ProductEditor` keyed on the aggregate prop identity (server refreshes produce a new props object; client re-renders reuse the same object), resetting product/variants/images/sizeGuide/attributeIds to persisted truth.
- Verification: full editor golden path re-run in the browser — first save creates variants, second save (gallery + variant image + size guide) succeeds; DB rows verified (2 variants, gallery image, variant-level image, size-guide row).
- Related files: `src/app/admin/(protected)/products/[id]/product-editor.tsx`
- Notes: the service rejection was CORRECT behavior — the bug was purely client state lifecycle.

### ISSUE-2026-09-27-025
- Phase: PHASE_04 (browser QA round, 2026-09-27)
- Severity: HIGH (environment; login 500 in the sandbox dev server after restart) — FIXED
- Symptom: after restarting the dev server, every admin login returned 500; the underlying pg-pool error was `AggregateError [ECONNREFUSED ::1:5432, 127.0.0.1:5432]` — the app was dialing LOCAL Postgres instead of the Neon development branch.
- Root cause: the sandbox shell exports a scaffold-era local `DATABASE_URL`; Next.js gives PROCESS env precedence over `.env.local`, so a dev server started from a shell carrying the scaffold variable shadowed the authorized development-branch URL in `.env.local`. (Prior rounds' server instance predated the shadow, masking it.)
- Minimal fix: start the dev server with `.env.local` sourced explicitly (`set -a; . ./.env.local; set +a; bun run dev`), which pins the process env to the development branch. Recorded as the standing restart protocol.
- Verification: login restored (401 generic rejection on bad credentials, 200 + cookie on the real credential); every subsequent DB-touching QA step passed against the development branch.
- Related files: none (environment protocol; documented in DATABASE.md §10 and the worklog)
- Notes: database safety was NEVER violated — the scaffold URL points at a non-Neon local database; no Production or Vercel-Development credential was involved at any point.

### ISSUE-2026-09-29-063
- Phase: PHASE_12 (baseline reconciliation round, 2026-09-29)
- Severity: HIGH (environment capacity; blocks two legacy suites, zero code impact)
- Status: RESOLVED — FINAL (2026-09-30, PHASE-13 final closure: the standing re-verification obligation is DISCHARGED with 141/141 real-Blob checks green; the full credential-recycle incident history below is preserved — including the fact that it BLOCKED the PHASE-12 gate and the PHASE-13 gate across 5 documented rounds)
- Symptom: the sandbox was recycled between sessions; the git-ignored `.env.local` (Neon development pooled URL + Blob tokens) and `.auth/` (Vercel token) vanished again. With no credentials present, `verify:homepage` (57) and `verify:reviews` (84) honestly REFUSE (media storage unconfigured → 503 path; private-store token gate), and `AUTH_SESSION_SECRET` was missing so the first admin login 500'd (IP-hash HMAC key — caught and fixed during QA, see below).
- Root cause: standing sandbox-recycle pattern (4th documented round after ISSUE-2026-09-27-037, ISSUE-061-era rounds). The preflight also caught the SAME file-loss signature on `src/app/api/admin/media/upload/route.ts` (unstaged deletion, intercepted PRE-COMMIT and restored losslessly from HEAD — never entered staging or any commit).
- Minimal fix (environment-only, per DATABASE.md's sanctioned "any disposable PostgreSQL" local-development policy):
  1. Embedded PostgreSQL 17.4 provisioned at `127.0.0.1:54329` (disposable, non-Neon, production never touched); committed migrations applied via `drizzle-kit migrate` (3/3), `db:bootstrap` + `db:seed` + `db:bootstrap:admin` run; `db:verify` 29/29 on the fresh instance.
  2. `DATABASE_URL`, `APP_URL`, and a fresh dev-only `AUTH_SESSION_SECRET` exported for the dev server (the scaffold SQLite `DATABASE_URL` from the sandbox template was overwritten — it is not a Postgres URL).
  3. Login 500 diagnosed to `requireSessionSecret()` via `getClientIpHash()` → `hashIp()`; fixed by provisioning the dev-only secret (no code change — the honest hard-fail is correct for an unconfigured deployment).
- Impact on the phase gate: the full Blob-free regression runs GREEN on the disposable instance — 615 baseline checks (db:verify 29 + auth 44 + catalog 43 + storefront 101 + cart 59 + checkout 134 + orders 100 + seo 105) + the new verify:admin 66 = **681/681**. The 141 real-Blob checks (homepage 57 + reviews 84) REFUSED by design; the media code path they cover is UNCHANGED by PHASE-12 except additive audit rows + read-only registry helpers, all covered by the new suite. **Standing obligation: re-run verify:homepage + verify:reviews on the Neon development branch with restored Blob credentials (owner re-provision per DATABASE.md §9.3) before or at the PHASE-13 gate.**
- Related files: none (environment); `/tmp` disposable provisioning only
- Notes: no production credential existed in the sandbox at any point; the Vercel token loss means vercel-CLI control-plane verification (deployment listing/env) was unavailable this phase — production verification ran via read-only HTTP smoke against the deployed origin instead.
- Final closure addendum (2026-09-30, PHASE-13 BLOCKER RECOVERY + FINAL CLOSURE, owner-authorized Vercel PAT): the 5-round recycle obligation is DISCHARGED — ① credentials re-provisioned per DATABASE.md §9.3/§9.6 through the owner-authorized Vercel token vaulted ONLY in git-ignored `.auth/vercel_token` (mode 600, dir 700; never printed/echoed/logged/committed); the EXISTING project `amira-store` (`prj_jaEPtjMP1YvTGaynt9LaHXzxcTFA`) verified via read-only `projects ls` (exactly one project) and linked — nothing created; ② §9.6 hash-only fingerprint gates PASS with values never displayed: production sha256(DATABASE_URL) = `a77fc2afd8ac2bd7…` @ `ep-cool-art-b1snfj5i-pooler` (EXACT invariant match — production binding untouched), development = `f5aa1006670416a5…` @ `ep-dark-boat-b1fejsk4-pooler` (EXACT match, isolated); ③ Blob auth surfaces verified LIVE with read-only probes: PUBLIC store via the OIDC pair (`BLOB_STORE_ID` + `VERCEL_OIDC_TOKEN` from the development pull — the owner-preferred short-lived surface; the legacy long-lived `BLOB_READ_WRITE_TOKEN` is absent from the environment by design) and PRIVATE store via `BLOB_PRIVATE_READ_WRITE_TOKEN`; ④ **verify:homepage 57/57** + **verify:reviews 84/84 = 141/141** against the REAL public store + REAL private store + the Neon development branch (no mock, no bypass, no suppression); private-original protection reconfirmed live (direct unauthenticated private GET → 403 at the CDN; controlled-delivery publication matrix DRAFT/PENDING/HIDDEN → 404, PUBLISHED/APPROVED → 200; authorized server reads byte-identical); storage-level leftovers = 0 on BOTH stores (equal to the pre-run baseline); ⑤ honest intermediate result preserved: the first reviews run scored 78/84 — all 6 failures were the HTTP delivery-route probes hitting a dead local dev server (recycled) — diagnosed environmental, NOT application/Blob/credential; cleared to 84/84 on the sanctioned re-run with the development environment (zero code changes); ⑥ the recovery is now a REPRODUCIBLE procedure (vaulted token + documented env-pull), not a persisted secret — future recycles re-provision the same documented way.

### ISSUE-2026-09-29-064
- Phase: PHASE_12 (preflight audit finding, 2026-09-29)
- Severity: HIGH (security hardening: one admin mutation route lacked the same-origin CSRF gate)
- Status: FIXED
- Symptom: `DELETE /api/admin/homepage/banners/[id]` (PHASE-10) performed session authorization but skipped the same-origin gate every other admin mutation route applies (`guardMutation`/`guardJsonMutation`), so a cross-origin request WITH a stolen/valid session cookie could delete a banner where the identical request against any other route would be refused with 403.
- Root cause: route-level inconsistency introduced in PHASE-10 — the DELETE handler was written without the shared guard (every sibling PATCH/POST route had it).
- Minimal fix: `guardMutation(request)` added as the first check of the DELETE handler (identical pattern to the media DELETE route); file-level docstring updated.
- Verification: live-HTTP probe (verify:admin section 10h) — cross-origin DELETE with a valid session → **403** and the row verified UNCHANGED in the database; same-origin authorized flows unchanged. Full suite 66/66.
- Related files: `src/app/api/admin/homepage/banners/[id]/route.ts`, `scripts/verify-admin.ts`
- Notes: defense-in-depth (SameSite=Lax cookie remained); recorded because uniform CSRF posture across ALL admin mutations is a standing security contract (MASTER_PLAN §24).

### ISSUE-2026-09-30-065
- Phase: PHASE_13 (adversarial XSS round, 2026-09-30)
- Severity: HIGH (stored XSS breakout context; content authored by the single admin, so exploitability is bounded, but the injected markup executes for any visitor of the affected page)
- Status: FIXED
- Symptom: verify:phase13 §5 stored a hostile product name (`<script>alert(1)</script>`) and short description (`"><img src=x onerror=alert(2)>`); the product page HTML contained the payload RAW inside `<script type="application/ld+json">` — JSON.stringify does not escape `<`/`>`, so the payload's own `</script>` terminated the JSON-LD block and the remainder rendered as live markup (proven: `<img onerror=...>` present as executable markup, first `</script>` break reachable).
- Root cause: the JSON-LD injection site used `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}` with no HTML-safety escaping of the serialized JSON.
- Minimal fix: new `serializeJsonLd()` in `src/lib/storefront/metadata.ts` — escapes `<`→`\u003c`, `>`→`\u003e`, `&`→`\u0026`, U+2028/2029 (JSON semantics unchanged for crawlers; breakout impossible regardless of stored content origin); the product page now calls it instead of raw `JSON.stringify`. Text-node rendering was already React-escaped (verified inert for name/description/review/search contexts).
- Verification: verify:phase13 §5 51/51 — no raw `<script>alert(1)` in HTML, no `<img …onerror=` markup, escaped `\u003c` present inside the JSON-LD block; verify:seo 105/105 still passes (structured data parses and matches DB truth).
- Related files: `src/lib/storefront/metadata.ts`, `src/app/(store)/product/[slug]/page.tsx`, `scripts/verify-phase13.ts`
- Notes: reflezted-XSS contexts (search query, suggestions) were probed and found inert without changes.

### ISSUE-2026-09-30-066
- Phase: PHASE_13 (schema-message sweep, 2026-09-30)
- Severity: LOW (i18n consistency; no data/security impact)
- Status: FIXED
- Symptom: malformed input on customer-facing forms could surface ENGLISH zod default messages in the Arabic-only storefront: phone `.min(8)`/`.max(25)` in the reviews lookup + tracking lookup ("Too small: expected string to have >=8 characters"), and the checkout item schema (quantity/uuid — e.g. "Invalid input: expected integer") reached the 400 response body verbatim.
- Root cause: schemas relied on zod default messages for constraints where the route surfaces `issues[0].message` directly.
- Minimal fix: explicit Arabic messages on those constraints (tracking.ts, reviews.ts, checkout.ts item/phone schema) — no behavioral change, message-only.
- Verification: verify:phase13 §1 (Arabic-Indic digits → Arabic error), §A1/§5d of verify:tracking/verify:e2e (400 bodies Arabic); full suites re-run green (tracking 49/49, e2e 31/31, checkout 134/134).
- Related files: `src/lib/storefront/tracking.ts`, `src/lib/storefront/reviews.ts`, `src/lib/storefront/checkout.ts`
- Notes: recorded because an Arabic-only store must never emit English validation copy (MASTER_PLAN §2).

### ISSUE-2026-09-30-067
- Phase: PHASE_13 (authorization matrix round, 2026-09-30)
- Severity: MEDIUM (unauthenticated GET on three admin API routes answered 500 instead of 401; no data exposure — the failure fires before any data access — but the error contract was broken and produced noise)
- Status: FIXED
- Symptom: `GET /api/admin/settings`, `GET /api/admin/homepage/sections`, `GET /api/admin/homepage/banners` without a session returned **500** ("[admin-mutation] unexpected failure") instead of 401.
- Root cause: those GET handlers called `requireAdminPage()` (page semantics: `redirect('/admin/login')` THROWS a NEXT_REDIRECT error). Inside an API route the route-level `catch → errorResponse()` did not recognize the redirect error and fell through to the generic 500 branch. All sibling API routes correctly use `requireAdminMutation()` (throws `AdminAuthError` → 401).
- Minimal fix: swapped `requireAdminPage()` → `requireAdminMutation()` in the three GET handlers (imports updated).
- Verification: verify:security §2 — all 36 admin mutation routes unauthenticated → 401; §3 — forged-token GETs on the three routes → 401 (regression-guard assertions added); full suites green (security 39/39, admin 66/66).
- Related files: `src/app/api/admin/settings/route.ts`, `src/app/api/admin/homepage/sections/route.ts`, `src/app/api/admin/homepage/banners/route.ts`, `scripts/verify-security.ts`
- Notes: unauthenticated `POST /api/admin/auth/logout` returning 200 is INTENTIONAL (no-op success — grants nothing, changes nothing) and is excluded from the 401 matrix with a comment in the suite.

### ISSUE-2026-09-30-068
- Phase: PHASE_14 (pre-flight round, 2026-09-30)
- Severity: HIGH (blocks the live-infrastructure subset of the phase; no security exposure — see Notes)
- Status: RESOLVED — FINAL (2026-09-30, same day: the owner DELIVERED the Vercel PAT into the sandbox and the entire blocked live subset was re-proven — see the ROUND 8 + RESOLUTION addendum below)
- Symptom: 6th documented sandbox recycle round. Between the PHASE-14 owner-unlock run and the implementation run the workspace was restored to an older snapshot: (a) one TRACKED file missing (`src/app/api/admin/media/upload/route.ts` — the established ISSUE-061 signature); (b) all git-ignored runtime artifacts lost: `.auth/vercel_token` (owner-issued Vercel PAT vault, mode 600/700), `.auth/bin/gh-cred` helper, `.vercel/project.json` (project link), `.env.local` (Neon development URL), the globally-installed vercel CLI, and `/tmp` artifacts.
- Reproduction: `ls .auth` → missing; `git status` → ` D src/app/api/admin/media/upload/route.ts`; `vercel whoami` → CLI absent.
- Root cause: sandbox infra recycles the workspace to a disk snapshot between runs; git-ignored (untracked) files and post-snapshot tracked-file states are not preserved.
- Affected layer/files: workspace runtime artifacts; one tracked source file (restored).
- Minimal fix: the tracked file was restored EXCLUSIVELY from authoritative origin/main (`git checkout origin/main -- …`) and proven byte-identical (worktree blob `6cebc016379ffa490334dcf250f1c2d6c1ce0726` == origin blob — hash equality, not eyeball). No unrelated changes introduced. `/tmp/my-project` snapshot and all alternate credential surfaces checked — the Vercel PAT is NOT recoverable in-sandbox (by design: it exists only in the git-ignored vault; DATABASE.md §9.3/§9.6 protocol).
- Verification command/check: `git status --porcelain` empty after restore; blob-hash equality vs origin/main; `bun run db:verify:local` re-proves the tree is coherent (29/29) without any cloud credential.
- Notes: (1) the credential lifecycle is owner-controlled BY DESIGN — no workaround was invented (standing directive); (2) nothing leaked: the vault was git-ignored and its contents never printed/committed; (3) UNBLOCK CONDITION: owner re-provisions the Vercel PAT per DATABASE.md §9.3/§9.6 (and the `.vercel` link + `.env.local` are then re-derived mechanically); live items that unblock: Vercel env-var matrix re-verification, Neon fingerprint re-verification, Preview application-level smoke (behind Vercel Deployment Protection SSO), live rollback rehearsal, Vercel runtime-log inspection.
- RECYCLE ROUND 7 ADDENDUM (2026-09-30, recovery-session pre-flight): the ISSUE-061 signature RECURRED — the tracked `src/app/api/admin/media/upload/route.ts` was again missing from the working tree while HEAD == origin/main == `647047d` (blob `6cebc016379ffa490334dcf250f1c2d6c1ce0726` intact in both). Restored byte-identically from origin (blob-hash equality re-verified, 2750 B); tree returned clean; NO commit created. Additionally, the EMPTY `.auth/` vault directory (created earlier the same day, mode 700, zero contents) vanished at an invocation boundary and was re-staged — zero data impact (it held nothing). Cause classified: sandbox recycle / snapshot restore (ISSUE-061 signature), not an application or repository defect. Status remains OPEN — the Vercel credential has still NOT been delivered to the sandbox as of the end of this round (sweep evidence in the PHASE-14 recovery worklog record; GATE 6 precondition negative).
- RECYCLE ROUND 8 + RESOLUTION ADDENDUM (2026-09-30, owner-authorized credential round): the ISSUE-061 signature recurred a THIRD time at pre-flight (upload route missing from the working tree at HEAD == origin/main == `cb67c5e`; blob `6cebc016…` intact) → restored byte-identically from origin, tree clean, zero commits; the recycle also wiped `.auth/` (empty), `.vercel/`, `.env.local`, the vercel CLI and /tmp — all re-derived mechanically (vault re-created mode 700/600; CLI 61.1.0 reinstalled; link re-derived; `.env.local` re-pulled per §9.3 and shredded after use per the §15 zero-residue discipline). RESOLUTION: the owner delivered the Vercel PAT (explicit authorization, no manual Vercel operations requested); it was vaulted ONLY in git-ignored `.auth/vercel_token` (never printed/committed; `git check-ignore` + `git ls-files` verified) and the ENTIRE blocked live subset was re-proven NEW: project identity exact (6A), env topology per contract (6B), §9.6 hash-only fingerprints EXACT on all three environments (6C: production `a77fc2afd8ac2bd7…` @ `ep-cool-art-b1snfj5i-pooler`, development `f5aa1006670416a5…` @ `ep-dark-boat-b1fejsk4-pooler`, preview == production per §9.4), Blob surfaces present/non-empty on all targets + real two-store auth exercised (6D), `verify:homepage` 57/57 + `verify:reviews` 84/84 = **141/141** fresh with zero residue (6E; the intermediate honest 78/84 was the documented server-required delivery-route class, cleared with the server in the same invocation), authenticated Preview smoke 200/200/307/404/405 through `vercel curl` with protection NEVER disabled + anonymous probe 302/noindex + runtime logs 0 5xx (6F; the CLI's automation-bypass secret was revoked the same session after its one-time session-log exposure — behaviorally dead), and the live rollback mechanism exercised on a disposable project with full cleanup (6G). Zero application changes; zero production mutations. Status: RESOLVED — FINAL.

### ISSUE-2026-09-30-069
- Phase: PHASE_14 (CI workflow-security hardening round, 2026-09-30)
- Severity: MEDIUM (real hardening gaps: implicit workflow permissions, floating third-party action versions, unpinned runtime) — with a RECORDED FALSE-AUDIT CORRECTION (transparency note below)
- Status: FIXED
- Symptom (audit phase): the PHASE-14 pre-flight audit READ the CI workflow's branch filters as corrupted (`branches: ain]` instead of a main-only square-bracket list) "since the initial commit", and CI trigger behavior seemed to require fail-open semantics to explain main-push runs.
- Root cause (of the false audit finding): the agent's command/output transport mangles square-bracket sequences beginning with a bracket+m ("[m" is swallowed as an ANSI-like sequence) in BOTH directions — displayed file contents showed `ain]` wherever the actual bytes were a main-only list (because the tail "ain]" is a SUBSTRING of the correct "[main]"), and incoming command literals containing "[main]" were corrupted before execution, turning several attempted fixes into no-ops and producing contradictory intermediate states. Byte-level verification (counted occurrences via chr()-constructed literals, cross-checked against the GitHub Contents API blob `7e1a2373f56b…`) proved the committed workflow ALWAYS had the intended main-only filters — including the initial PHASE-00 commit `c82c9d9`.
- Real defects fixed (independent of the false finding): (1) workflow had NO explicit `permissions:` block (repo default was already "read" — verified via API — but the guarantee is now explicit and workflow-borne); (2) third-party actions were referenced by floating major tags (`@v4`/`@v2`) → both pinned to full 40-hex commit SHAs resolved via the GitHub API with source-repo verification (`actions/checkout@11d5960a…` v4 line, `oven-sh/setup-bun@0c5077e5…` v2 line); (3) `bun-version: latest` floated the CI runtime → pinned to `1.3.14` (the development runtime version, CI/local parity); (4) the environment-dependent nature of the regression suites is now documented in the workflow itself.
- Minimal fix: `.github/workflows/ci.yml` hardened (content-only; job id/check name "verify" unchanged; triggers unchanged — they were already correct).
- Verification: CI check "verify" = completed/success on the exact hardened SHA `9314276`; trigger-matrix evidence: a unique non-main branch push produces 0 workflow runs (negative), a PR produces the "verify" run via the pull_request event (positive, PR #1 — closed unmerged), main pushes produce "verify" (every phase push). `verify:phase14` §1 asserts the full contract (43/43).
- Related files: `.github/workflows/ci.yml`, `scripts/verify-phase14.ts`, `docs/ops/DEPLOYMENT_RUNBOOK.md`
- Notes: commit `9314276`'s MESSAGE contains the incorrect "corrupted branch filter" premise (authored under the same mangling illusion); its CONTENT is valid hardening. History is NOT rewritten (force-push forbidden; the audit trail records this correction instead). Lesson recorded: any future audit of bracket-containing content MUST use counted/byte-level comparisons, never display inspection.

### ISSUE-2026-09-30-070
- Phase: PHASE_14 (branch-protection round, 2026-09-30)
- Severity: LOW (platform plan limitation, not a misconfiguration; compensating controls in place)
- Status: RESOLVED — 2026-09-30 (owner-authorized repository visibility change private→public; protection configured and PROVEN ACTIVE by independent read-back)
- Symptom: required-status-check / force-push / deletion protection for `main` cannot be configured: classic branch protection API → 403; rulesets API → 403 with "Upgrade to GitHub Pro or make this repository public to enable this feature." (both attempts recorded 2026-09-30 with the intended protection bodies).
- Root cause: repository is PRIVATE on a GitHub free plan (owner: user account).
- Affected layer: GitHub repository settings only — no application impact.
- Minimal fix: none possible at this plan level (per directive: configure "where available"). Compensating controls documented in DEPLOYMENT_RUNBOOK.md: CI "verify" green-SHA pinned per phase record; single collaborator (owner only — verified via API); production branch locked to `main` on the Vercel side; force-push absent from the workflow and visible in audit history.
- Verification command/check: the two recorded 403 responses; `verify:phase14` documents the limitation (runbook contract check).
- Notes: on plan upgrade the FIRST action must be: require the "verify" check for `main`, block force pushes and deletions, include administrators.
- RESOLUTION (2026-09-30, owner-authorized public-repository path): the owner changed ONLY `ahmedtaha55555412-code/amira-store` private→public (planning repo untouched). Pre-publication security preflight PASS (full-reachable-history scan: 771 blobs / 19.4 MB / all refs incl. branches — 0 same-line secret values; 58 Actions run logs (116 files, 1.14 MB) — 0 secret patterns; 0 artifacts; PR #1 comment audit clean; historical `.env` blob (untracked since `c82c9d9`) = 50-byte platform local-path pointer, byte-identical (sha256 `be8e1a92…`) to today's bootstrap file, no credential material; `.env.example` proven empty-valued in every historical version). Post-publication: secret scanning + push protection ENABLED via authorized API PATCH (both were "disabled" at publication moment; the security-preflight PASS plus GitHub's own post-publication scanner — 0 open / 0 resolved alerts — cleared enabling).
- Old state (pre-resolution): classic protection API 403; rulesets API 403; `main` unprotected; compensating controls only.
- New state (verified by independent read-back `GET /repos/…/branches/main/protection` + `GET /branches/main` at 2026-09-30): `protected = true`; `required_status_checks.contexts = ["verify"]` (strict=false); `required_pull_request_reviews` PRESENT with `required_approving_review_count = 0` (PR required, ZERO approval count → no single-owner deadlock); `enforce_admins.enabled = true` (no bypass actors, administrators included); `allow_force_pushes.enabled = false`; `allow_deletions.enabled = false`; `restrictions = null`.
- Post-resolution pipeline proof (same day): the documentation commit for this issue was itself routed through the new protection — non-main branch push → 0 workflow runs (trigger filter holds); PR → pull_request "verify" run; merge at 0 approvals (no deadlock); main merge-push → "verify" run on the exact merge SHA. Full loop proven live post-publication.

### ISSUE-2026-09-30-071
- Phase: PHASE_14 (CI verification round, 2026-09-30)
- Severity: LOW (new verification tooling only; no application/runtime impact)
- Status: FIXED
- Symptom: CI check "verify" = FAILURE on `c9fc682` — lint step rejected `scripts/verify-phase14.ts` line 95 (`require('node:child_process')` — `@typescript-eslint/no-require-imports`). The file was created AFTER the local full-check round; only the focused `verify:phase14` run followed, so the local lint gate was not re-run before the commit.
- Root cause: ESM-style project + ESLint rule forbids require() imports; new file used require for the git ls-files helper.
- Minimal fix: top-level `import { execSync } from 'node:child_process'` + direct call.
- Verification: focused lint green, then full gate re-run (typecheck + lint + build + verify:phase14 43/43) before re-commit; CI "verify" required green on the exact new SHA.
- Notes: ALSO the first live proof that the CI gate FAILS BLOCKED on a real regression (the PHASE-14 trigger/failure matrix's positive-failure evidence). Process note recorded: new tooling files must pass the full local gate before commit (ERROR_PROTOCOL rule 5/8 applied).
