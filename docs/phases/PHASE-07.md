# PHASE 07 — Checkout + Order Creation + WhatsApp Handoff

## Objective
Implement the core revenue flow as one transaction-safe operation.

## Checkout fields
Required:
- name
- phone
- simple address textarea

Optional:
- order note

Payment:
- Cash on Delivery only.

No online payment UI, SDK, API, gateway, card fields, or alternative payment method.

## Server workflow
1. Receive checkout request and idempotency key.
2. Validate schema.
3. Load every variant from the database.
4. Verify all products/variants are active.
5. Verify stock.
6. Use live DB current price; ignore client price.
7. Calculate item subtotals and products total.
8. Resolve/create customer by normalized phone as appropriate.
9. Create order with customer/address snapshots.
10. Create order items with product/variant/price/attribute snapshots.
11. Decrement each variant stock immediately.
12. Record inventory movements.
13. Commit one transaction.
14. Generate customer-facing order number.
15. Build the WhatsApp pre-filled message from committed order data.
16. Return success payload containing safe customer-facing information.
17. Success page offers a WhatsApp button and visible fallback.

## WhatsApp
Default: `+201019003677` from store settings.
Message includes:
- greeting
- order number
- product name
- variant attributes such as size/color if selected
- quantity
- unit price
- products total
- payment method
- customer address
- statement that shipping cost will be agreed through WhatsApp
- closing

Use a properly URL-encoded click-to-chat URL. The message appears pre-filled; the customer still sends it.

## Failure behavior
- stock failure: no order and no inventory movement committed.
- DB failure: no partial order.
- WhatsApp open failure: order remains valid and success page exposes a copy/open button.
- duplicate submit: idempotent result, not a second order.

## Definition of Done
This phase must include unit + integration tests for concurrency, duplicate submissions, pricing tampering, and rollback behavior.
