# PHASE 08 — Inventory + Order Management + Edit Flows

## Objective
Build the professional Admin order and inventory system around the already-created order domain.

## Tasks
1. Dashboard order list with filters/search/status.
2. Full order detail view.
3. Display historical item snapshots.
4. Shipping cost entry after WhatsApp confirmation.
5. Recalculate grand total server-side.
6. Implement order status transitions.
7. Implement shipping status transitions.
8. Implement order editing.
9. For item changes, calculate inventory delta against prior order state.
10. Process item changes atomically.
11. Prevent negative stock.
12. On cancellation, restore stock exactly once and record movement.
13. Prevent duplicate restoration.
14. Provide inventory ledger UI by variant.
15. Provide low-stock and out-of-stock views.
16. Log high-impact changes in admin activity log.

## Recommended status rules
Order:
- new → under_review → confirmed → preparing → completed
- active states → canceled

Shipping:
- not_started → preparing → ready_to_ship → shipped → out_for_delivery → delivered
- delivery_failed may transition to returned_to_stock as operationally required.

Do not invent silent state transitions. All transitions must be explicit and validated.

## Definition of Done
Admin can operate an order from creation through delivery, edit it safely, and audit all inventory consequences.
