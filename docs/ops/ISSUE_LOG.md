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
- Status: OPEN — configuration pending (owner action at deployment; tracked for PHASE-14). The code side was narrowed by this audit: the media service now accepts BOTH current Vercel auth models.
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
