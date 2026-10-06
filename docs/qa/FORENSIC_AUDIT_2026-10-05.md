# Amira Store — Forensic Integration & Deep Audit

**Audit date:** 2026-10-05  
**Input:** owner-provided `amira-store-main.zip`  
**Repository reviewed:** `ahmedtaha55555412-code/amira-store`  
**Current upstream main reviewed:** `4347dfd93fdcdf96affc0a5fa5ca65927e3b7333`  
**Audit posture:** source-forensic + integration tracing + security review + DB/schema review + verification-harness review + design/source review

> This report deliberately separates source-level proof from live-environment proof. No claim below converts historical CI/browser/Neon/Vercel evidence into a fresh 2026-10-05 runtime result unless it was re-run in this audit.

## 1. Executive verdict

The project is **not UI-only**. The codebase contains a real Next.js application with a Drizzle/PostgreSQL domain layer, server-side authorization, session storage, product/variant/inventory/order services, media registry + Blob integration, guest cart/wishlist persistence, review/testimonial workflows, order tracking, admin APIs, SEO generators, and CI verification.

The original source did, however, contain several **real integration inconsistencies and security/QA gaps** that could make individually functioning screens disagree about the same business truth. The most important defects were concentrated around public product eligibility, canonical routes, image-domain separation, concurrent authentication throttling, persistence honesty, homepage mutation atomicity, durable public throttles, and verification assertions that could report PASS without proving the named postcondition.

This audit repaired those source-level defects in the working tree and added the missing durable rate-limit migration.

## 2. Inventory of the examined application

| Area | Observed |
|---|---:|
| Page routes | 29 |
| API route handlers | 42 |
| TypeScript / TSX files | 250 |
| Drizzle SQL migrations | 4 |
| Drizzle schema tables | 24 |
| GitHub default branch | `main` |
| Customer accounts | intentionally absent; guest checkout model |
| Payment | COD-only in business layer |
| Public storefront language | Arabic / RTL |
| Currency | EGP |

## 3. Architecture continuity map

```text
Storefront UI (RSC + client stores)
        │
        ├── categories / search / PDP ──> storefront/catalog.ts
        │                                  │
        │                                  └── eligibility.ts
        │                                      ├── active product
        │                                      ├── active variant
        │                                      └── reachable active category tree
        │
        ├── cart / wishlist ────────────> browser persistence adapters
        │                                  └── explicit persistenceStatus
        │
        └── checkout ───────────────────> /api/storefront/checkout
                                           │
                                           ├── durable rate limit
                                           └── checkout.ts
                                               └── one DB transaction
                                                   ├── live price/stock
                                                   ├── order + snapshots
                                                   ├── stock decrement
                                                   ├── inventory ledger
                                                   └── committed WhatsApp payload

Admin UI
   │
   └── /api/admin/*
        ├── requireAdminMutation()
        ├── domain services
        ├── transaction-scoped audit records
        └── PostgreSQL constraints / locks

Media
   └── media registry
        ├── public product media
        └── private review/testimonial originals
            └── controlled delivery only

SEO
   ├── metadata
   ├── canonical product route
   ├── sitemap
   └── robots
        └── all consume storefront reachability truth
```

## 4. High-impact defects repaired

### AUDIT-003 — storefront eligibility divergence — P1

**Root cause:** category counts, generic listing/search, PDP resolution, and sitemap generation were not using one definition of a sellable public product. An active product could exist without an active variant, and inactive/unreachable ancestor categories could produce inconsistent discovery results.

**Repair:** added `src/lib/storefront/eligibility.ts` as the shared source of truth; catalog listing/search/PDP/sitemap/category counts now require an active variant and a fully active ancestor chain. Product activation/save also refuses an active product without an active variant.

**Additional defensive hardening:** category ancestor/subtree traversals now detect malformed cycles instead of looping indefinitely.

### AUDIT-009 — first-admin bootstrap race — P2

**Root cause:** check-then-insert was not serialized.

**Repair:** `scripts/db-bootstrap-admin.ts` now performs the empty-admin check and first insert inside a transaction-scoped PostgreSQL advisory lock, then records the audit atomically.

### AUDIT-012 — acceptance seed size mismatch — P2

**Repair:** `scripts/db-seed.ts` now defines and asserts exactly 20 demo products, with active variants for sellable entries.

### AUDIT-013 — testimonial seed duplication — P2

**Repair:** the seed is idempotent for the seeded testimonial media identity: one canonical row is retained, duplicate seeded rows are removed/updated deterministically.

### AUDIT-014 — private media selectable as product image — P2

**Root cause:** product media selection could reach assets that belonged to private review/testimonial namespaces.

**Repair:** product aggregate save validates `access_mode='public'` and blocks `reviews/` and `testimonials/` path namespaces. Admin product media picker now lists only eligible public catalog assets.

### AUDIT-015 — deployed throttles were per-process — P2

**Root cause:** checkout/review/tracking limits were held in local process memory, which is not a shared security boundary across serverless instances.

**Repair:** added `request_rate_limits` and migration `drizzle/0003_durable_request_rate_limits.sql`. Public checkout, review submit/lookup, and tracking routes now use an atomic PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` fixed-window counter keyed by a one-way caller hash. The decision is therefore shared across deployed instances.

The old pure sliding-window functions remain only as deterministic unit-test helpers; production routes no longer use them for admission control.

### AUDIT-016 — cart verification assertion was tautological — P3

**Repair:** `scripts/verify-cart.ts` now checks the actual API route structure rather than asserting a condition that was already hard-coded by the harness.

### AUDIT-017 — cart/wishlist persistence failures were silent — P2

**Repair:** cart and wishlist stores now track `persistenceStatus`, and the UI exposes an accessible Arabic warning when browser persistence fails. In-memory behavior remains usable, but it is no longer represented as durable storage success.

### AUDIT-018 — canonical product URL mismatch — P2

**Root cause:** admins could set a distinct canonical slug, metadata could advertise it, but PDP lookup used only the original slug.

**Repair:** PDP resolution accepts `slug` or `canonicalSlug`; a legacy/non-canonical request redirects to the canonical product route. Metadata, Open Graph, JSON-LD, and sitemap use the same canonical identity.

### AUDIT-019 — verification assertions could pass without proof — P3

**Repair:** storefront cleanup now performs an independent post-delete query. The unavailable-media injection in `verify-phase13.ts` is now reported as an explicit SKIP when storage is configured instead of being counted as a false PASS.

### AUDIT-020 — login throttle check/record race — P2

**Repair:** login admission is reserved atomically before credential work under PostgreSQL advisory locks keyed by username and optional IP identity. Reservations count against the same window budget, and success/failure completion clears or converts the reservation deterministically.

### AUDIT-022 — no CSP — P2 hardening

**Repair:** `next.config.ts` now sends a baseline Content Security Policy in addition to the existing `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` headers.

The policy intentionally allows the self-hosted app, inline styles required by the current UI stack, and the public Vercel Blob image hostname. A future nonce-based CSP can tighten `script-src` further, but the current configuration closes the previously empty policy surface without forcing an architectural rewrite.

## 5. Additional transactional integrity repairs

`src/lib/admin/homepage.ts` was audited beyond the historical issue register. Several homepage mutations could commit application state and then fail to record their corresponding admin activity atomically. The following operations now execute inside the same DB transaction as their audit row:

- homepage section update;
- section reorder;
- banner create;
- banner update;
- banner delete.

`src/lib/admin/testimonials.ts` now creates the testimonial row and its audit record in one transaction, while external Blob upload failure still uses compensating cleanup.

`src/lib/catalog/products.ts` now keeps product mutations and their admin audit record in the same transaction.

## 6. Seed/media correctness repair

The development seed previously declared `.png` demo pathnames while the actual URLs used `.svg`. The seed now uses `demo/<slug>.svg` consistently with `image/svg+xml`, eliminating a silent media-reference mismatch.

## 7. Security/source inspection results

Static source sweeps found:

- no committed `.env` secret values;
- no `eval()` or `new Function()` usage;
- no `dangerouslySetInnerHTML` outside the controlled JSON-LD surface;
- JSON-LD serialization explicitly escapes HTML-breakout characters;
- admin mutation routes use the shared admin guard pattern, with authentication endpoints intentionally public;
- no customer-registration / forgot-password surface was found;
- production product data is not represented by hard-coded component product arrays.

## 8. Design / UX review from source

This is a **source-based design review, not fresh screenshot acceptance**, because the provided ZIP is not a running browser environment in this container.

| Dimension | Score | Notes |
|---|---:|---|
| First impression | 8.5/10 | Warm ivory/blush/burgundy identity is coherent. |
| Visual system | 8.8/10 | Centralized CSS tokens, consistent radius, spacing and status roles. |
| Hierarchy/layout | 8.4/10 | Strong header/section/footer structure and responsive containers. |
| Typography | 8.7/10 | Self-hosted Cairo variable font, Arabic-first hierarchy. |
| Color/contrast | 8.4/10 | Brand palette is deliberate and focus states are explicit. |
| Navigation/UX | 8.6/10 | Database-backed category navigation + responsive sheet/search. |
| Conversion | 8.8/10 | Explicit variant selection, COD trust messaging and WhatsApp handoff. |
| Mobile | 8.5/10 | Responsive header/menu patterns and overflow protection are present. |
| Accessibility | 8.4/10 | Skip link, focus-visible, semantic nav/footer, reduced-motion support. |
| Brand consistency | 9.0/10 | Branding is settings-driven and uses the same visual token system. |
| **Overall source-design score** | **8.6/10** | Strong architecture and design-system consistency; browser proof is still required for final release. |

## 9. GitHub / CI cross-check

The upstream repository currently targets `main`. The latest observed main commit is `4347dfd93fdcdf96affc0a5fa5ca65927e3b7333`, and its GitHub Actions `verify` run completed successfully with locked dependency installation, TypeScript typecheck, lint, and production build.

That CI result is **baseline evidence for the original upstream main**, not proof of the local forensic patch, because this audit did not push the working-tree changes to GitHub.

## 10. What could NOT be honestly re-proven from the ZIP

The following are intentionally marked **NOT REPROVEN**, not silently treated as PASS:

1. Fresh full `bun run typecheck`, `bun run lint`, and `bun run build` on the patched tree. The ZIP has no `node_modules`, Bun is not installed in the audit container, and external package installation was unavailable.
2. Fresh authenticated browser interaction against a running patched Next.js server.
3. Fresh visual screenshot inspection at 390×844, 768×1024, 1440×900, etc. Historical screenshots in repository audit documents remain historical.
4. Fresh Neon Development migration/seed/invariant execution.
5. Fresh Neon Production read/write isolation proof.
6. Fresh Vercel Preview → Neon database branch isolation proof.
7. Fresh production Blob credential/runtime verification.
8. Deployment-specific trust assumptions around `x-forwarded-*` proxy headers (AUDIT-021 class).

These are environment gates, not reasons to invent a green runtime result.

## 11. Required release verification after applying this repair

Run, in the isolated Development environment first:

```text
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run build
bun run db:migrate
bun run db:verify
bun run verify:auth
bun run verify:catalog
bun run verify:storefront
bun run verify:cart
bun run verify:checkout
bun run verify:orders
bun run verify:reviews
bun run verify:homepage
bun run verify:tracking
bun run verify:security
bun run verify:concurrency
bun run verify:e2e
bun run verify:phase13
bun run verify:phase14
```

Then perform a **real authenticated browser pass** for:

```text
Homepage → category → search → PDP → variant selection → cart → wishlist
→ checkout → order creation → WhatsApp handoff
→ admin login → product/media/category/order/inventory/review/testimonial/settings
→ customer order tracking → delivery-gated review
```

The final production gate must separately prove that Preview cannot write to Production Neon data before any Preview acceptance flow performs a mutation.

## 12. Changed-file set in this forensic repair

Application/schema/test files changed or added in the working tree include:

```text
src/lib/storefront/eligibility.ts
src/lib/storefront/durable-rate-limit.ts
src/lib/storefront/catalog.ts
src/lib/storefront/cart-store.ts
src/lib/storefront/wishlist-store.ts
src/lib/storefront/checkout.ts
src/lib/catalog/products.ts
src/lib/media/registry.ts
src/lib/admin/homepage.ts
src/lib/admin/testimonials.ts
src/lib/auth/throttle.ts
src/db/schema/rate-limit.ts
src/db/schema/index.ts
src/app/(store)/product/[slug]/page.tsx
src/app/admin/(protected)/products/[id]/page.tsx
src/app/api/admin/auth/login/route.ts
src/app/api/storefront/checkout/route.ts
src/app/api/storefront/reviews/route.ts
src/app/api/storefront/reviews/lookup/route.ts
src/app/api/storefront/track-order/route.ts
src/components/store/cart/cart-drawer.tsx
src/components/store/wishlist/wishlist-drawer.tsx
scripts/db-bootstrap-admin.ts
scripts/db-seed.ts
scripts/verify-auth.ts
scripts/verify-cart.ts
scripts/verify-storefront.ts
scripts/verify-homepage.ts
scripts/verify-phase13.ts
scripts/verify-phase14.ts
next.config.ts
docs/DATA_DICTIONARY.md
drizzle/0003_durable_request_rate_limits.sql
drizzle/meta/0003_snapshot.json
drizzle/meta/_journal.json
```

## 13. Final state of this artifact

**Source repair status:** COMPLETE for the source-level defects listed in this report.  
**Runtime acceptance status:** NOT CLAIMED from this ZIP alone.  
**GitHub push:** NOT PERFORMED by this audit.  
**Production DB mutation:** NONE performed by this audit.
