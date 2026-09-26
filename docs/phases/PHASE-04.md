# PHASE 04 — Categories + Products + Variants + Media

## Objective
Build the full product catalog domain and admin workflows.

## Tasks
1. Implement simple recursive category tree with parent/child support and sort order.
2. Implement product CRUD and draft/active/archived states.
3. Implement generic attribute definitions and values.
4. Implement variant editor allowing explicit variants only.
5. Allow:
   - no options/default variant
   - one attribute
   - multiple attributes
6. Prevent two values from the same attribute from being attached to one variant unless explicitly supported later.
7. Implement variant-level SKU, original price, current price, stock, low-stock threshold, active state.
8. Implement product gallery and variant-specific images.
9. Integrate Vercel Blob via a media service abstraction.
10. Validate image mime type, size, dimensions, and upload authorization.
11. Support reordering/deleting/replacing media references without orphaning database rows.
12. Implement optional clothing size guide.
13. Implement server-side pricing validation.
14. Never calculate or trust price from client-supplied form state.

## Critical UI checks
- size-only editor works.
- color-only editor works.
- size+color editor works without auto-generating unavailable combinations.
- different variants show different prices.
- zero-stock variant cannot be purchased later.
- selecting a color changes images if variant images exist.

## Definition of Done
Admin can create a realistic catalog covering all five departments with all required variant shapes and media behavior.
