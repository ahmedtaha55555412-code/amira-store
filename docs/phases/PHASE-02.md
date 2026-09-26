# PHASE 02 — Database Schema + Migrations + Seed Strategy

## Objective
Build the complete Neon/PostgreSQL logical model in Drizzle with production-safe migrations.

## Tasks
1. Implement all core tables from `docs/DATA_DICTIONARY.md`.
2. Add UUID primary keys and appropriate foreign keys.
3. Add enums/check constraints for statuses and monetary/quantity correctness.
4. Implement product/category/attribute/variant relations.
5. Implement variant attribute many-to-many relation.
6. Implement inventory movements and order references.
7. Implement customers/orders/order-items with historical snapshots.
8. Implement reviews/testimonials/media/settings/homepage tables.
9. Add indexes for:
   - slugs
   - SKU
   - category hierarchy
   - phone normalization
   - order number
   - status/filter columns
   - inventory variant lookup
   - review/product lookup
   - timestamps used for New Arrivals.
10. Add `pg_trgm` only if the selected Neon environment supports it and it provides measurable search value; otherwise implement a portable baseline and keep the extension optional.
11. Generate the initial migration with `drizzle-kit generate`.
12. Apply it to a disposable/dev Neon database with `drizzle-kit migrate`.
13. Verify a fresh database can be built from migrations alone.
14. Create deterministic development seed scripts for categories, representative products, variants, attributes, reviews/testimonials, and settings.
15. Seed the default WhatsApp number `+201019003677` as store data, not an immutable code constant.
16. Do not seed fake production orders or fake customer accounts.

## Critical business invariants
- no negative stock
- unique SKU
- unique slugs
- valid variant attribute composition
- no duplicate review per order item
- order monetary values are nonnegative
- current price represents actual current sell price

## Verification scenarios
- size-only product can exist.
- color-only product can exist.
- size+color product can exist.
- product with no selectable attribute can exist via default variant.
- two variants may have different prices.
- two variants may have different stock.
- a variant may have different images.
- a product can have many images.

## Definition of Done
- migration applies cleanly to empty DB.
- migration is committed.
- seed works only in explicit dev/preview mode.
- schema matches the documented data dictionary.
