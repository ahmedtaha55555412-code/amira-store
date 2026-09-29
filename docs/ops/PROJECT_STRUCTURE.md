# Project Structure — ACTUAL TREE

> Regenerated 2026-09-28 during the pre-PHASE-08 hardening round (ISSUE-046 item 6).
> This document now reflects the real repository. The previous version was a stale
> generic scaffold template (proposed `src/domain/*`, listed routes that do not
> exist, missed every storefront route) and has been replaced.
> Authoritative maps also live in `EXECUTION_STATUS.md` and `worklog.md`.

```text
/
├── AGENTS.md · MASTER_PLAN.md · EXECUTION_STATUS.md · ACCESS_MATRIX.md
├── README.md · RESEARCH_NOTES.md · ZAI_BOOTSTRAP.md · ZAI_GREENFIELD_BOOTSTRAP.md
├── package.json · bun.lock · tsconfig.json · next.config.ts
├── eslint.config.mjs · postcss.config.mjs · components.json · Caddyfile
├── drizzle.config.ts            # postgresql-only; `db push` banned
├── drizzle/                     # THE schema mechanism: committed SQL migrations + meta journal
├── .github/workflows/ci.yml     # typecheck + lint + build
├── docs/
│   ├── DATA_DICTIONARY.md · DESIGN_SYSTEM.md
│   ├── ops/   (BASELINE, DATABASE, DEPLOYMENT_RUNBOOK, ERROR_PROTOCOL,
│   │           ISSUE_LOG, PROJECT_STRUCTURE, SEED_PLAN, COMPLETION_REPORT_TEMPLATE,
│   │           PHASE_PROMPT_TEMPLATE)
│   ├── phases/ (PHASE-00 … PHASE-15)
│   └── qa/     (FINAL_ACCEPTANCE, TEST_CASES, TRACEABILITY)
├── public/
│   └── brand/                   # logo + 8 demo product SVGs (seed media)
│                                 # (robots.txt → superseded by app/robots.ts; sitemap: app/sitemap.ts — PHASE-11)
├── scripts/                     # operational scripts + tracked verification suites
│   ├── db-bootstrap.ts          # production-safe, absent-only bootstrap
│   ├── db-bootstrap-admin.ts    # admin bootstrap (rehearsal/dev)
│   ├── db-seed.ts               # development seed
│   ├── verify-migrations.ts     # `db:verify` — migration integrity + schema profile
│   ├── verify-auth.ts           # `verify:auth` — 44 checks
│   ├── verify-catalog.ts        # `verify:catalog` — 43 checks (incl. media §14)
│   ├── verify-storefront.ts     # `verify:storefront` — 101 checks
│   ├── verify-cart.ts           # `verify:cart` — 59 checks
│   ├── verify-checkout.ts       # `verify:checkout` — 134 checks
│   └── generate-brand-assets.mjs · verify-local-database.mjs
├── src/
│   ├── app/
│   │   ├── layout.tsx · not-found.tsx · globals.css · icon.svg · apple-icon.png
│   │   ├── (store)/                     # storefront route group (chrome + FAB)
│   │   │   ├── layout.tsx · page.tsx    # homepage (وصل حديثًا + العروض)
│   │   │   ├── cart/ · checkout/ · search/
│   │   │   ├── order/success/
│   │   │   ├── category/[slug]/         # page + skeleton component (real 404 — ISSUE-045)
│   │   │   └── product/[slug]/          # page + skeleton component (real 404 — ISSUE-045)
│   │   ├── admin/
│   │   │   ├── login/
│   │   │   └── (protected)/ products/(+[id], +new) · media · categories · settings/security
│   │   └── api/
│   │       ├── admin/    auth(login, logout, change-password) · categories(+[id], reorder)
│   │       │             products(+[id], [id]/status) · attributes · attribute-values
│   │       │             media(upload, [id]) · settings/security
│   │       └── storefront/ cart-availability · checkout
│   ├── components/
│   │   ├── ui/                  # shadcn/ui New York — ONLY the 20 primitives in use
│   │   ├── store/               # ProductCard, PriceBlock, cart drawer/lines, header/footer,
│   │   │                        # filters, PDP client, playground (QA overlay), …
│   │   └── admin/               # admin surfaces
│   ├── config/                  # brand.ts · navigation.ts
│   ├── db/                      # client.ts (pg Pool — single DB client) + schema/
│   ├── hooks/                   # use-cart, use-toast, …
│   ├── lib/
│   │   ├── api/                 # shared API-route helpers
│   │   ├── auth/                # session, guard, origin (CSRF), password, throttle, activity
│   │   ├── catalog/             # categories, products, attributes, pricing, slug
│   │   ├── media/               # service facade + validation (magic bytes) + vercel-blob adapter
│   │   ├── storefront/          # catalog, availability, cart(+store), checkout, whatsapp, format, arabic, metadata
│   │   ├── branding.ts · utils.ts
│   │   └── proxy.ts             # Next 16 proxy convention (middleware successor)
│   └── middleware.ts
└── tests/                       # platform deploy-harness .sh wrappers (NOT the verification
                                 # suites — those are scripts/verify-*.ts)
```

## Conventions that matter

- **Single DB client**: `src/db/client.ts` (`pg` Pool over `DATABASE_URL`); `@neondatabase/serverless`
  is deliberately declared-but-isolated (driver decision documented in that file + ISSUE_LOG).
- **Migrations**: only via `drizzle-kit generate` → committed SQL in `drizzle/`; `db push` is
  banned everywhere (drizzle.config.ts enforces).
- **Money**: integer piasters end-to-end; display via `src/lib/storefront/format.ts`
  (`formatPrice`) and `centsToPriceString` (canonical cents→numeric-string, `src/lib/storefront/cart.ts`).
- **404 semantics** (ISSUE-045): `product/[slug]` + `category/[slug]` run an indexed existence
  probe BEFORE returning JSX (`notFound()` → real HTTP 404); heavy aggregate streams inside the
  page via `<Suspense fallback={<…Skeleton/>}>` — loading UX preserved for valid slugs.
