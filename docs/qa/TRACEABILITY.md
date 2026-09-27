# Requirements Traceability

| Requirement | Source of truth | Phase | Verification | Status |
|---|---|---:|---|---|
| Arabic-only RTL storefront | MASTER_PLAN §2 | 01,05+ | Visual/manual | PENDING |
| Egypt + EGP | MASTER_PLAN §2 | 01,02 | Unit/manual | PARTIAL — schema defaults EGP/ar/Africa-Cairo in store_settings (PHASE_02); UI per-page checks 05+ |
| 5 main categories | MASTER_PLAN §2,3 | 02,04 | Integration | DONE — schema + bootstrap/seed init the 5 departments (PHASE_02); admin tree CRUD verified (verify:catalog [1] + browser QA; PHASE_04) |
| Simple parent/child categories | §6 | 02,04 | CRUD test | DONE — self-FK tree with RESTRICT + hierarchy index (PHASE_02); recursive tree admin with cycle prevention + guarded deletes (verify:catalog [1]; PHASE_04) |
| Generic variants | §6 | 02,04 | Unit/integration | DONE — generic attributes/values + explicit variants; admin editor with inline attribute/value management (verify:catalog [2][4]; PHASE_04) |
| Size not forced to color | §6 | 02,04 | Matrix tests | DONE — matrix-free model DB-verified (PHASE_02) + editor supports no-option/size-only/color-only/size+color explicitly without auto-generation (verify:catalog [4][5]; PHASE_04) |
| Variant-level original/current price | §7 | 02,04,07 | Order pricing test | PARTIAL — per-variant numeric(12,2) + positivity CHECKs (PHASE_02); server-side pricing validation in editor save (verify:catalog [7]; PHASE_04); order flow PHASE_07 |
| Variant-level stock | §13 | 02,04,07,08 | Concurrency/inventory tests | PARTIAL — per-variant stock + no-negative-stock CHECK + ledger identities (PHASE_02); editor stock changes write auditable manual_adjustment/opening movements (verify:catalog [8]; PHASE_04); checkout flows PHASE_07/08 |
| Product media (gallery + variant images) | §6,20 | 04,10 | Integration + browser QA | DONE — media service abstraction (Vercel Blob provider isolated; magic-byte/type/size/dimension validation), media registry with guarded deletes, gallery/variant image attach + reorder + replace with no orphans; upload live-verification pending BLOB token (ISSUE-2026-09-27-023; PHASE_04) |
| Optional clothing size guide | §6 | 04,10 | Integration | DONE — per-product guide upsert with rows (size label + measurements map), editor UI, storefront display PHASE_10 (verify:catalog [11]; PHASE_04) |
| Multi-product cart | §8 | 06,07 | Integration | PENDING |
| Guest wishlist | §8 | 06 | Browser/manual | PENDING |
| Guest checkout | §9 | 07 | E2E | PENDING |
| Name/phone/simple address | §9 | 07 | Validation test | PENDING |
| COD only | §9 | 07 | UI + server test | PENDING |
| Shipping via WhatsApp | §9-11 | 07 | WhatsApp URL test | PENDING |
| Order saved before WhatsApp | §10 | 07 | Integration | PENDING |
| Immediate stock decrement | §10,13 | 07,08 | transaction/concurrency | PENDING |
| Order tracking phone + order number | §14 | 08 | E2E/security | PENDING |
| Admin username/password only | §16 | 03 | Auth tests | DONE — single-admin bcrypt login (verify:auth 29/29 + browser QA on the isolated development branch; PHASE_03) |
| No register/create admin/forgot password | §16 | 03 | Route/security audit | DONE — only /admin/login exists (public); bootstrap is a CLI (`db:bootstrap:admin`) refusing when an admin exists; no recovery flows anywhere (PHASE_03) |
| Admin change password inside dashboard | §16 | 03,12 | E2E | DONE — /admin/settings/security E2E-verified (current password + confirmation; revokes ALL sessions — documented policy); dashboard UX polish PHASE_12 (PHASE_03) |
| Admin order editing | §18 | 08,12 | Integration | PENDING |
| Reviews | §15 | 09 | E2E | PENDING |
| WhatsApp testimonials | §15 | 09 | Admin/manual | PENDING |
| New Arrivals from createdAt | §4 | 04,10 | Data-driven test | PARTIAL — created_at DESC index, no featured flags anywhere in schema (PHASE_02); UI PHASE_10 |
| No featured/selected products | §4,29 | all | Static/code audit | PENDING |
| No brands | §2 | all | schema/UI audit | PENDING |
| No coupons | §2 | all | route/schema audit | PENDING |
| Replaceable logo | §5,16 | 01,10,12 | Admin/manual | PARTIAL — PHASE_01 original assets + BrandLogo replaceability contract done; Admin management in PHASE_10/12 |
| Design tokens (ivory/blush/burgundy/gold/charcoal + status) | PHASE-01, DESIGN_SYSTEM | 01 | Code review/manual | DONE |
| Single Arabic production font (weights only) | PHASE-01, MASTER_PLAN §5 | 01 | Manual render check | DONE |
| Arabic RTL root direction + Egypt metadata defaults | PHASE-01, MASTER_PLAN §2,21 | 01 | DOM check | DONE (root; per-page SEO in 11) |
| Original logo mark + favicon assets | PHASE-01 | 01 | Manual/browser | DONE |
| Responsive foundations phone/tablet/desktop + overflow guard | PHASE-01, MASTER_PLAN §5 | 01 | Browser QA (375/768/1440) | DONE |
| Reduced-motion behavior | PHASE-01, MASTER_PLAN §5 | 01 | CSS check | DONE (full audit PHASE_11) |
| Foundational primitives + loading/empty/error states | PHASE-01 | 01 | Manual playground | DONE |
| Homepage shell (announcement→footer, honest placeholders) | PHASE-01 | 01 | Browser QA | DONE |
| Visible focus + keyboard navigation on primitives | PHASE-01, MASTER_PLAN §22 | 01 | Browser keyboard QA | DONE (AA audit PHASE_11) |
| GitHub-ready | §28 | 14 | CI | PARTIAL — CI updated for Drizzle (PHASE_02); green run pending credential restore (ISSUE-018) |
| Neon-ready | §25,27 | 02,14 | migration rehearsal + live-Neon apply | PARTIAL — committed migration validated on real disposable Neon database via `drizzle-kit migrate` (empty start → SCHEMA_MATCH 23/23+9/9, migration-row hash == sha256 of committed file, smoke write+rollback OK, disposable db dropped, prod untouched — docs/ops/DATABASE.md §8) (PHASE_02); PHASE_14 production hardening PENDING |
| Vercel-ready | §27 | 14 | Preview/production | PENDING |
| No secrets in repo | §24,27 | 01,13,14 | secret scan/manual | PARTIAL — PHASE_01/02 staged scans clean (DATABASE_URL never committed); PHASE_03: `.env.local` verified git-ignored, credential fingerprint-tracked, diff scanned before push (ISSUE-020/019 records); final audits 13/14 |
| Explicit CSRF protection on state-changing admin endpoints | §24, OWASP CSRF Prevention Cheat Sheet | 03 | verify:auth §12 + curl matrix + browser QA | DONE — strict same-origin Origin/Referer validation + application/json enforcement on login/logout/change-password + SameSite=Lax as defense-in-depth; cross-site & no-attestation requests 403 before any parsing/DB work; authenticated cross-site logout refused with session surviving (PHASE_03 security audit 2026-09-27; ISSUE-2026-09-27-022) |
| Cache-Control no-store on auth/session-sensitive responses | §24, OWASP session management | 03 | header checks (curl + verify:auth) | DONE — all login/logout/change-password responses + every /admin page response carry `Cache-Control: no-store` (PHASE_03 security audit 2026-09-27; ISSUE-2026-09-27-022) |
| Production PostgreSQL schema + Drizzle migrations + seed strategy | PHASE-02, DATA_DICTIONARY | 02 | bun run db:verify:local (exit 0; 28/28) + live-Neon drizzle-kit migrate verification | DONE (live-Neon apply PROVEN 2026-09-27, DATABASE.md §8; development-branch bring-up re-proven 2026-09-27, DATABASE.md §10) |
| Order/inventory/reviews/settings schema readiness for later phases | PHASE-02, DATA_DICTIONARY | 02 | invariant probes (money identities, snapshots, ledger, singleton) | DONE |
| WCAG 2.2 AA target | §22 | 11,13 | axe/manual | PENDING |
| Core Web Vitals target | §23 | 11,13 | Lighthouse/Web Vitals | PENDING |
| Catalog admin golden flow end-to-end (login→categories→variants→media→activate→edit→persisted aggregate) | §6,7,13,16,17,20 | 03,04 | Browser E2E + DB probes (final gate) | DONE — full flow exercised in the browser against the development branch; aggregate/ledger/reference integrity verified in DB; security gates re-proven (401/403/no-store) on every catalog mutation route (PHASE_04 final gate 2026-09-27) |
| Inventory ledger relationship (variant stock ↔ auditable movements) | §13 | 02,04,07,08 | DB probes (final gate) | PARTIAL — opening + manual_adjustment movements verified with before/after/delta identity + admin id on the development branch (PHASE_04 final gate); sale/cancel movements PHASE_07/08 |
| Media reference integrity under edit/delete/reorder | §6,20 | 04 | Browser + API + DB probes (final gate) | DONE — guarded delete 409 with referencing-domain report (product-image and WhatsApp-testimonial references exercised), clean delete 200, attachment removal/reorder leave zero orphan rows (PHASE_04 final gate 2026-09-27) |
| All variant shapes creatable via admin UI without forced matrix | §6 | 04 | Browser E2E ×5 shapes (final gate) | DONE — no-option/default, size-only, color-only (with per-color variant images), size+color explicit subset, generic attribute (volume); different per-variant prices; zero-stock preserved (PHASE_04 final gate 2026-09-27) |
| Vercel Blob auth model currency (OIDC vs long-lived token) | §20 | 04,14 | current-state audit + service-layer checks (final gate) | PARTIAL — @vercel/blob 2.8.0 supports OIDC (Vercel-injected BLOB_STORE_ID + VERCEL_OIDC_TOKEN) as the current default for newly connected stores; provider configured-state + copy + .env.example updated (verify:catalog [14]); live Blob hop awaits credentials at deployment (ISSUE-2026-09-27-023 OPEN → PHASE_14) |
| Admin product-editor accessibility (variant inputs) | §22 | 04,11 | a11y tree inspection (final gate) | DONE for the variant-row inputs — all five carry aria-labels (ISSUE-2026-09-27-027); full AA audit PHASE_11 |
