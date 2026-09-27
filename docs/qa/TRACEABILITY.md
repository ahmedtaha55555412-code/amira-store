# Requirements Traceability

| Requirement | Source of truth | Phase | Verification | Status |
|---|---|---:|---|---|
| Arabic-only RTL storefront | MASTER_PLAN §2 | 01,05+ | Visual/manual | PENDING |
| Egypt + EGP | MASTER_PLAN §2 | 01,02 | Unit/manual | PENDING |
| 5 main categories | MASTER_PLAN §2,3 | 02,04 | Integration | PENDING |
| Simple parent/child categories | §6 | 02,04 | CRUD test | PENDING |
| Generic variants | §6 | 02,04 | Unit/integration | PENDING |
| Size not forced to color | §6 | 02,04 | Matrix tests | PENDING |
| Variant-level original/current price | §7 | 02,04,07 | Order pricing test | PENDING |
| Variant-level stock | §13 | 02,04,07,08 | Concurrency/inventory tests | PENDING |
| Multi-product cart | §8 | 06,07 | Integration | PENDING |
| Guest wishlist | §8 | 06 | Browser/manual | PENDING |
| Guest checkout | §9 | 07 | E2E | PENDING |
| Name/phone/simple address | §9 | 07 | Validation test | PENDING |
| COD only | §9 | 07 | UI + server test | PENDING |
| Shipping via WhatsApp | §9-11 | 07 | WhatsApp URL test | PENDING |
| Order saved before WhatsApp | §10 | 07 | Integration | PENDING |
| Immediate stock decrement | §10,13 | 07,08 | transaction/concurrency | PENDING |
| Order tracking phone + order number | §14 | 08 | E2E/security | PENDING |
| Admin username/password only | §16 | 03 | Auth tests | PENDING |
| No register/create admin/forgot password | §16 | 03 | Route/security audit | PENDING |
| Admin change password inside dashboard | §16 | 03,12 | E2E | PENDING |
| Admin order editing | §18 | 08,12 | Integration | PENDING |
| Reviews | §15 | 09 | E2E | PENDING |
| WhatsApp testimonials | §15 | 09 | Admin/manual | PENDING |
| New Arrivals from createdAt | §4 | 04,10 | Data-driven test | PENDING |
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
| GitHub-ready | §28 | 14 | CI | PENDING |
| Neon-ready | §25,27 | 02,14 | migration rehearsal | PENDING |
| Vercel-ready | §27 | 14 | Preview/production | PENDING |
| No secrets in repo | §24,27 | 01,13,14 | secret scan/manual | PARTIAL — PHASE_01 staged scan clean; final audits 13/14 |
| WCAG 2.2 AA target | §22 | 11,13 | axe/manual | PENDING |
| Core Web Vitals target | §23 | 11,13 | Lighthouse/Web Vitals | PENDING |
