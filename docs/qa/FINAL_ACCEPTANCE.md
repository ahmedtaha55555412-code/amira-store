# Final Acceptance Checklist

All items are mandatory unless explicitly marked optional in the Master Plan.

**PHASE-15 execution record (2026-09-30):** every item below carries an actual result —
`PASS` labeled `NEW` (fresh execution this phase) or `PREV` (previously proven, per-phase
evidence in `EXECUTION_STATUS.md`), or `BLOCKED (A)` (credential/environment — see the
Blocked-Item Ledger at the bottom). No result was converted between classes. Full evidence:
`worklog.md` Task ID `PHASE-15-FINAL-ACCEPTANCE`.

## Customer UX
- [x] Arabic-only UI and RTL. — PASS/NEW: `verify:storefront` 101/101; 7-viewport browser QA `dir=rtl lang=ar` on every route; production probe `<html lang="ar" dir="rtl">`
- [x] Responsive phone/tablet/desktop. — PASS/NEW: 35/35 zero-horizontal-overflow matrix (360/390/768×1024/1024×768/1440/1920/2560 × home/category/product/cart/search)
- [x] Homepage matches the approved brand direction without cloning references. — PASS/NEW (screenshots 360→2560 archived) + PREV (PHASE-01/05/13 visual governance rounds)
- [x] Five top-level categories work. — PASS/NEW: production live render (نسائي/رجالي/أطفال/مواليد/مستحضرات تجميل) + `verify:catalog` 43/43
- [x] Category tree works. — PASS/NEW: `verify:catalog` 43/43 (self-FK tree, cycle prevention) + mobile-menu tree QA
- [x] New Arrivals reflects newly created products. — PASS/NEW: `db:verify` invariant "New-Arrivals index on `products.created_at` exists (no featured flags)" + `verify:storefront`
- [x] No featured/selected products mechanism exists. — PASS/NEW: db invariant + `verify:homepage` hard-exclusion ("unknown/selection-style fields refused")
- [x] Offers reflect real variant pricing. — PASS/NEW: `verify:catalog`/`verify:storefront` (offers driven by `currentPrice < originalPrice` only)
- [x] Search works with Arabic input. — PASS/NEW: `verify:storefront` (suggestions, sub-threshold) + live Arabic query 200
- [x] Filters do not show irrelevant attributes for every category. — PASS/NEW: `verify:storefront` 101/101 filter sections
- [x] Product page handles no-variant, single-attribute, and multi-attribute products. — PASS/NEW: `verify:catalog` (default/size-only/color-only/size+color) + `verify:e2e`
- [x] Size is not forced to color. — PASS/NEW: `db:verify` explicit-variant probes (no matrix generation)
- [x] Variant price updates correctly. — PASS/NEW: `verify:e2e` 31/31 + browser QA (variant selection gates CTA; price from live variant)
- [x] Variant stock updates correctly. — PASS/NEW: `verify:checkout`/`verify:orders` + `verify:storefront`
- [x] Variant-specific images update correctly. — PASS/NEW: `db:verify` ("a variant may have different images") + `verify:storefront`
- [x] Cart supports multiple products and repeated product with different variants. — PASS/NEW: `verify:cart` 59/59
- [x] Wishlist works without login. — PASS/NEW: browser QA (local-storage wishlist with explicit Arabic disclosure) + `verify:storefront`
- [x] Checkout requires name, phone, and simple address. — PASS/NEW: `verify:checkout` 134/134
- [x] COD is the only payment method. — PASS/NEW: `verify:checkout` + checkout CTA "الدفع عند الاستلام"
- [x] No online payment route exists. — PASS/NEW: build route map (no payment route) + `verify:security`
- [x] Order is persisted before WhatsApp handoff. — PASS/NEW: `verify:checkout`/`verify:e2e` ordering proofs
- [x] Stock decrements immediately after successful order creation. — PASS/NEW: `verify:checkout` + `verify:concurrency` 22/22 + ledger identity invariants
- [x] WhatsApp message contains correct order details. — PASS/NEW: `verify:e2e` message-content checks
- [x] WhatsApp number is editable by Admin. — PASS/NEW: `verify:admin` settings section (bootstrap stores it as editable store data)
- [x] Customer can track by order number + checkout phone. — PASS/NEW: `verify:tracking` 49/49 (no-oracle two-step + rate limit)

## Admin
- [x] One admin account only. — PASS/NEW: `verify:auth` 44/44 + bootstrap refuses second admin
- [x] Login is username + password. — PASS/NEW: `verify:auth` (+ CSRF same-origin gate proven live during this phase's battery sequencing)
- [x] No register/create-admin route. — PASS/NEW: build route map + `verify:security` guards
- [x] No forgot-password route. — PASS/NEW: route map + `verify:security`
- [x] No email recovery. — PASS/NEW: route map + `verify:security`
- [x] Change password works inside admin. — PASS/NEW: `verify:auth` (change-password flow + audit rows + throttle)
- [x] Product CRUD works. — PASS/NEW: `verify:admin` 66/66 + `verify:catalog`
- [x] Category CRUD works. — PASS/NEW: `verify:admin` + `verify:catalog` (guarded deletes)
- [x] Variant CRUD works. — PASS/NEW: `verify:admin` + `verify:catalog` (explicit variants)
- [x] Per-variant price/original-price/stock/images work. — PASS/NEW: `verify:admin`/`verify:catalog` + db positivity CHECKs
- [x] Inventory ledger works. — PASS/NEW: `db:verify` ledger identity (after = before + delta) + `verify:orders` 100/100
- [x] Order list/detail/edit works. — PASS/NEW: `verify:orders` 100/100 (committed unit prices immutable; new lines priced from live data)
- [x] Inventory adjusts correctly after order edits. — PASS/NEW: `verify:orders` (deltas transactional; negative-stock edits rejected)
- [x] Shipping cost can be recorded later. — PASS/NEW: `verify:orders` + money-identity CHECK (`grand_total = products_total + shipping`)
- [x] Order and shipping statuses work. — PASS/NEW: `verify:orders` (validated transitions) + `verify:e2e`
- [x] Reviews moderation works. — PASS/NEW: `verify:admin` moderation section (`verify:reviews` private-store storage-level section = PREV 84/84; local fresh run honestly REFUSED without Blob credentials — Blocked-Item Ledger)
- [x] WhatsApp testimonials upload/publish works. — PASS/NEW: `verify:admin` testimonials API guards + PREV publish/hide flows (PHASE-09/12)
- [x] Logo can be replaced. — PASS/NEW: `verify:admin` settings/media + PREV browser QA (PHASE-10/12)
- [x] Homepage text/media/visibility/order settings work without product selection logic. — PASS/NEW: `verify:admin` homepage sections + `verify:homepage` hard exclusions (selection-style fields refused)

## Security
- [x] No secret committed. — PASS/NEW: 0 GitHub secret-scanning alerts (open/resolved) + tracked-tree pattern sweep clean + `verify:phase14` 43/43 baseline checks
- [x] Admin routes protected server-side. — PASS/NEW: `verify:security` 39/39 (36 admin mutation routes → 401 unauthenticated; forged tokens → 401)
- [x] Login rate limited. — PASS/NEW: limiter LIVE-OBSERVED during this phase (429 + Retry-After after 5 failures/15 min, per username or per hashed IP)
- [x] Tracking endpoint rate limited. — PASS/NEW: `verify:tracking` (hashed-IP limit 12/5 min)
- [x] Checkout validates everything server-side. — PASS/NEW: `verify:checkout` (zod + server re-validation)
- [x] Client price values cannot override DB price. — PASS/NEW: `verify:checkout` tampering proofs (charges live variant price, snapshots stored)
- [x] Client stock values cannot override DB stock. — PASS/NEW: `verify:checkout`/`verify:concurrency` (server stock authority)
- [x] Upload validation works. — PASS/NEW: `verify:admin` edge battery (MIME/size 422s, safe retry, idempotent refs)
- [x] Sensitive testimonial originals are not accidentally public. — PASS/PREV: storage-level private-store proofs (`verify:reviews` 84/84 PHASE-13 final gate + Gate 6E; direct unauthenticated private GET → 403; publication matrix 404/200). Fresh local run honestly REFUSED without Blob credentials — Blocked-Item Ledger
- [x] High-impact admin changes are logged. — PASS/NEW: `db:verify` audit-row invariants + throttle-as-audit (`auth.password_change.failed`) + redaction filter

## Database
- [x] All migrations are committed. — PASS/NEW: 3 committed files (`0000_init_schema`, `0001_storefront_search`, `0002`), journal integrity
- [x] Fresh database migration succeeds. — PASS/NEW: `db:verify:local` ALL CHECKS PASS (fresh DB from committed chain alone)
- [x] Seed is deterministic and development-only. — PASS/NEW: `db:verify:local` idempotency (bootstrap+seed re-run safe)
- [x] Production does not auto-seed demo data. — PASS/PREV: §13/§14 absent-only bootstrap records + production business rows = 0 (no demo data anywhere)
- [x] Transactions cover order + inventory changes. — PASS/NEW: `verify:checkout`/`verify:orders`/`verify:concurrency` + db CHECK invariants
- [x] No negative stock. — PASS/NEW: `db:verify` CHECK rejection + `verify:concurrency` races
- [x] No duplicate order creation from repeated submit. — PASS/NEW: `verify:checkout` idempotency + `verify:concurrency`

## Quality
- [x] Typecheck passes. — PASS/NEW: `tsc --noEmit` exit 0
- [x] Lint passes. — PASS/NEW: `eslint .` exit 0
- [x] Unit tests pass. — PASS/NEW: deterministic suites (auth 44, catalog 43, cart 59, orders 100, admin 66 — all fresh)
- [x] Integration tests pass. — PASS/NEW: checkout 134, tracking 49, security 39, concurrency 22, storefront 101 — all fresh
- [x] E2E tests pass. — PASS/NEW: `verify:e2e` 31/31 golden journey
- [x] Build passes. — PASS/NEW: `next build` exit 0
- [x] Accessibility audit passes target checks. — PASS/NEW (`verify:seo` a11y sections 105/105; touch-target scan: only the focus-revealed skip-link <24px — compliant pattern) + PREV (PHASE-11/13 WCAG 2.2 AA rounds)
- [x] Core Web Vitals targets are met or documented with remediation. — PASS/PREV (PHASE-11 performance round; no code changed since that affects CWV surfaces — docs-only delta)
- [x] Broken/loading/empty states are reviewed. — PASS/NEW: browser QA (honest Arabic empty-search state, honest 404 with recovery paths, honest "لا توجد مراجعات بعد") + `verify:storefront`

## Deployment
- [x] GitHub main green. — PASS/NEW: CI "verify" = success on `14eaf27` (the production commit) + every main push
- [x] Preview deployment works. — PASS/PREV: platform-level proven (PHASE-14 Gate 6F; SSO-protected previews)
- [x] Preview points to isolated non-production DB. — PASS/PREV: integration-native copy-on-write per-deployment branches (DATABASE.md §9.1/§9.6)
- [x] Production environment variables verified. — PASS/PREV: Gate 6B/6C topology + fingerprints (live refresh blocked (A) — vault lost to recycle round 9; Blocked-Item Ledger)
- [x] Neon production migrations applied successfully. — PASS/PREV: §13.3 migration-row hashes == committed-file sha256 (3/3); live re-probe blocked (A)
- [x] Vercel production deployment healthy. — PASS/NEW: production alias 200, READY deployment built from exactly `14eaf27`, security headers present, 19/19 anonymous route matrix with zero 5xx, deployment-protection probe 302→SSO on raw deployment URL
- [x] Smoke tests pass on production. — PASS/NEW (FULL, 2026-10-01 owner-authorized controlled execution): golden journey executed LIVE on production through the real public/admin surfaces — order `AMR-TV652F` created via the real checkout (COD-only, server-authoritative price 300.00, idempotent replay returned the SAME order, no second order), stock 1→0 with the exact `sale` ledger row (before 1 / after 0), WhatsApp handoff verified as generated URL (`https://wa.me/201019003677?text=…`, destination = owner-approved store number) + complete message payload (order number/product/variant/qty/price/total/name/address) — NEVER opened or sent, admin saw the order on `/admin/orders`, shipping cost 45.00 recorded server-side (grand-total identity 345.00 = 300.00 + 45.00, DB CHECK verified), five validated shipping transitions to `delivered` (zero restorations), tracking (correct phone → delivered with totals; wrong phone → generic rejection, no disclosure), delivery-gated review proven BOTH ways on production (pre-delivery → 422 rejection with ZERO rows; post-delivery → 201 pending → admin approved (`is_verified_purchase=true`) → visible on the product page), WhatsApp testimonial upload→publish (privacy-confirmed)→homepage feed (delivered only via the controlled `/api/media/[id]` route)→hide→clean. Full reverse-FK transactional cleanup committed with exact row-count assertions (review 1, testimonial row 1, movements 3, order cascading items 1, guarded customer 1, variants 2, attribute cascading values 1, product 1) + private Blob object/registry row deleted via the sanctioned admin API. Post-cleanup assertions: EVERY business/media table = 0, product page honest 404, deleted order untrackable (422), homepage 0 product links / 0 acceptance strings; permanent-by-design rows only (admin_users=1, categories=5, settings=1, homepage_sections=10, append-only audit trail). Zero demo/acceptance data remains.
- [x] Rollback procedure documented. — PASS: DEPLOYMENT_RUNBOOK.md "Rollback & recovery" + PREV live mechanism rehearsal on a disposable project (Gate 6G)

## Launch decision
PROJECT_STATUS must be `COMPLETE` only after all mandatory checks above are checked and `EXECUTION_STATUS.md` is updated.

---

## Blocked-Item Ledger — RESOLVED (final unblock round, 2026-10-01, owner-authorized)

The 2026-09-30 blocked subset (classification A — credential/environment) was fully cleared in the
owner-authorized final execution round (worklog `PHASE-15-FINAL-PRODUCTION-EXECUTION`):

1. **Fresh 141 real-Blob run** — RESOLVED/PASS-NEW: `verify:homepage` 57/57 + `verify:reviews` 84/84
   against the REAL public + private Blob stores (probe rows/media removed in `finally`, storage-level
   zero residue on both stores), running on the isolated development database with platform-pulled
   credentials (`BLOB_STORE_ID` + minted `VERCEL_OIDC_TOKEN` for the public store,
   `BLOB_PRIVATE_READ_WRITE_TOKEN` for the private store).
2. **Live Vercel/Neon refresh** — RESOLVED/PASS-NEW: owner-provisioned token verified (identity
   `ahmedtaha55555412-7683`; exactly ONE project `amira-store` `prj_jaEPtjMP1YvTGaynt9LaHXzxcTFA`);
   production deployment identity = `dpl_63QuerrwY9HCmU267YDakU1MqQyM` READY built from EXACTLY the
   production commit `6783c75` (alias read-back points to it); §9.6 env pulls re-proven — production
   `DATABASE_URL` fingerprint `a77fc2afd8ac2bd7…` @ `ep-cool-art-b1snfj5i-pooler` (invariant) and
   development `f5aa1006670416a5…` @ `ep-dark-boat-b1fejsk4-pooler` (both hash-only, values never
   printed); production read-only probes: PostgreSQL 18.6, migration journal 3/3 hashes == committed
   files, pre-fixture `admin_users=0` + all business tables 0, canonical 5 categories + settings.
3. **Production transaction/admin smoke legs** — RESOLVED/PASS-NEW: single production admin
   `amira_admin` established via the sanctioned first-admin-only CLI (password generated offline,
   stored only in the git-ignored `.auth/` vault at 600, NEVER printed/committed; real rotation
   executed through the change-password route with all-sessions revocation proven live) + the FULL
   controlled acceptance fixture A–J executed and cleaned (record above). The owner-controlled test
   phone was used for the fixture customer identity only; no WhatsApp message was ever sent.
4. **Authenticated preview smoke** — unchanged PASS/PREV (Gate 6F).

**In-round production defect found and RESOLVED** (ISSUE-2026-10-01-073): the production runtime had
NO working Blob credential surface (the public store's original 2026-09-28 connection injected only
`BLOB_STORE_ID` + webhook key and runtime OIDC was absent) — media uploads would have returned the
app's honest 503. Fixed in-round by recreating the store connection in the current model (injects
`BLOB_READ_WRITE_TOKEN`) + redeploying the SAME commit; live-verified (upload → 200 with immediate
delete; testimonial upload → publish → homepage → hide). Zero security controls weakened.

**Final launch decision: every mandatory item above is checked with genuine evidence —
`PROJECT_STATUS=COMPLETE`, `CURRENT_PHASE=NONE`, `LAST_COMPLETED_PHASE=PHASE_15`.**
