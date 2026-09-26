# أميرة استور — Greenfield ZCode Execution Pack

هذا الإصدار مخصص لمشروع جديد بالكامل يبدأ من Workspace فارغ. لا يحتاج إلى أي Repository قديم.

ابدأ من `ZAI_GREENFIELD_BOOTSTRAP.md` ثم `AGENTS.md`.

# أميرة استور — AI Execution Plan

This package contains the complete gated execution system for the Amira Store project.

## Start here
1. `AGENTS.md`
2. `MASTER_PLAN.md`
3. `EXECUTION_STATUS.md`
4. `ZAI_BOOTSTRAP.md`
5. `docs/DATA_DICTIONARY.md`
6. `docs/DESIGN_SYSTEM.md`
7. `docs/ops/ERROR_PROTOCOL.md`
8. `docs/qa/TRACEABILITY.md`
9. `docs/qa/FINAL_ACCEPTANCE.md`
10. `docs/phases/PHASE-00.md` through `PHASE-15.md`

## Important execution design
The project is deliberately not encoded as one giant prompt. `AGENTS.md` is intentionally short and authoritative, while detailed requirements live in `MASTER_PLAN.md` and bounded phase files. The agent must execute exactly one phase at a time and stop after its gate passes.

## Production target
- GitHub: source control and CI.
- Neon: PostgreSQL database, migrations, isolated development/preview branches.
- Vercel: Preview and Production deployments.
- Vercel Blob: media storage.

## Owner-approved core rules
- Arabic only / RTL.
- Egypt / EGP.
- Women's, men's, children's, baby, cosmetics.
- COD only.
- Shipping is finalized through WhatsApp.
- Customer checkout needs name + phone + one simple address field.
- Customer has no account.
- Admin is one username/password account; no register/create-admin/forgot-password/email recovery.
- Stock decrements immediately on successful order creation.
- Order tracking is order number + checkout phone.
- Product variants are generic and size is not forced to color.
- Variant-level original/current price, stock, SKU, and images.
- New Arrivals uses actual product creation date.
- No brands, coupons, best sellers, featured/selected products, or algorithmic product picks.
- Reviews include on-site reviews plus admin-managed WhatsApp testimonials.
- Logo is original and replaceable later.

## Application repository baseline (PHASE_00)
This repository is the Amira Store **application** repository. The planning pack above is preserved in-repo as the binding specification.

- Application: Next.js (App Router) + TypeScript strict + Tailwind CSS (sandbox scaffold baseline).
- Runtime/package manager in the execution environment: Bun (scripts documented in `docs/ops/BASELINE.md`).
- Database direction per MASTER_PLAN §25: PostgreSQL on Neon with Drizzle ORM — introduced in PHASE_02.
- Environment contract: `.env.example` (names only; real values only in platform secret stores).
- Baseline tooling/auth verification and environment decisions: `docs/ops/BASELINE.md`.
- Execution state: see `EXECUTION_STATUS.md`.
