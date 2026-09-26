# Amira Store — AI Agent Execution Contract

## Authority
This file is the short, mandatory execution contract.

This is a GREENFIELD project: start from a new empty workspace. Do not assume an existing application or legacy Amira Store repository exists. `MASTER_PLAN.md` is the product/engineering source of truth. Phase files under `docs/phases/` are the only allowed implementation scope for the current phase.

## Mandatory startup sequence
1. Read this file completely.
2. Read `MASTER_PLAN.md` completely.
3. Read `EXECUTION_STATUS.md` completely.
4. Identify `CURRENT_PHASE` from `EXECUTION_STATUS.md`.
5. Read only that phase file, plus any linked reference files required by that phase.
6. Determine whether the workspace is empty or already contains only the supplied planning documents. For a new greenfield workspace, bootstrap the application and infrastructure according to PHASE-00.
7. Inspect the workspace before modifying anything.
8. Produce a short implementation checklist for the current phase internally, then execute it.
9. Do not implement a later phase early unless a dependency is required and documented.

## Phase gate
A phase is complete only when every Definition of Done item in its phase file is satisfied, tests/checks pass, no blocking issue remains, and `EXECUTION_STATUS.md` is updated. Never advance the phase by assumption.

## No-skip rule
Do not summarize, truncate, or silently ignore later requirements in `MASTER_PLAN.md`. The plan is intentionally split into phase files because a single giant prompt is less reliable. Phase files are executed one at a time.

## Required repository state after each phase
- Working code is committed.
- Typecheck passes.
- Lint passes.
- Relevant unit/integration tests pass.
- Build passes when applicable.
- Phase-specific manual checks are recorded.
- `EXECUTION_STATUS.md` is updated.
- `docs/qa/TRACEABILITY.md` is updated for implemented requirements.
- `docs/ops/ISSUE_LOG.md` is updated if any issue occurred.
- No known error is hidden.

## Error protocol
When an error occurs:
1. Stop the affected task.
2. Record the error in `docs/ops/ISSUE_LOG.md` with symptom, root cause, impact, and exact fix.
3. Fix only the root cause and the minimum adjacent changes required to restore correctness.
4. Re-run the smallest relevant check first.
5. Re-run the full phase checks after the local fix passes.
6. Do not perform unrelated refactors while fixing the issue.
7. Never delete or weaken a test merely to make the phase pass.
8. If the issue cannot be safely fixed within phase scope, mark the phase BLOCKED and stop.

## Scope discipline
Do not add features that are not explicitly required. In particular, do not add:
- Customer registration/login/accounts.
- Customer password reset/email recovery.
- Multiple admin users.
- Admin registration/create-admin pages.
- Admin forgot-password/email recovery.
- Online payments or payment gateways.
- Brands/brand management.
- Coupons/promo-code systems.
- Multi-vendor features.
- Returns/exchanges workflow modules.
- Best-seller algorithms.
- Featured/selected-products systems.
- Rule-based product recommendation systems.
- A mandatory newsletter system.

## Non-negotiable business rules
- Store name: أميرة استور.
- Arabic only, RTL, Egypt, EGP.
- Payment is Cash on Delivery only.
- Shipping fee is NOT calculated during checkout; it is determined through WhatsApp after the customer provides the address.
- Customer checkout fields: name, phone, one simple address textarea; optional notes may be provided if useful.
- Cart supports multiple products and multiple variants of the same product.
- Product system is generic and variant-based; size is not tied to color.
- A variant can have its own SKU, original price, current price, stock, and images.
- Stock decreases immediately when checkout successfully creates an order, inside a database transaction.
- Order must be stored before the WhatsApp handoff.
- WhatsApp default number: +201019003677; it is editable from Admin Settings.
- WhatsApp message is pre-filled; the customer must still press Send.
- Order tracking requires order number + the phone used at checkout; no customer account is required.
- Admin can edit orders, and inventory adjustments must remain transaction-safe.
- New Arrivals is driven by real product creation date (`createdAt`), not manual selection.
- No selected/featured products section.
- Reviews support on-site reviews and WhatsApp testimonial screenshots managed by the admin.
- Admin authentication is username + password only; no register/create-admin/forgot-password/email-recovery flow.
- Admin changes password from inside the admin area.
- Logo is original, store-appropriate, replaceable later from Admin.
- Repository must be GitHub-ready, database/migrations/seed-ready for Neon, and deploy-ready for Vercel.

## Production safety
Never place real secrets in Git. Use `.env.example` for names only. Production and Preview must use separate environment values. Never run destructive schema shortcuts against production. Use committed migration files as the schema-change record.

## Finish rule
Do not say the project is complete until `docs/qa/FINAL_ACCEPTANCE.md` passes all mandatory checks and `EXECUTION_STATUS.md` says `PROJECT_STATUS=COMPLETE`.
