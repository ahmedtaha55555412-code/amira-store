# PHASE 06 — Cart + Guest Wishlist

## Objective
Implement a reliable guest shopping state.

## Cart rules
- Multiple products.
- Multiple variants of the same product.
- Same product with different variants can coexist.
- Cart stores variant identity, quantity, and client display metadata only; server revalidates price/stock at checkout.

## Tasks
1. Implement cart state with durable client storage.
2. Add/remove/update quantity.
3. Normalize duplicate line items by product+variant identity.
4. Implement cart drawer and full cart page.
5. Implement subtotal display.
6. Add stock-aware validation for UX.
7. Build guest wishlist in localStorage; no customer account.
8. Handle storage corruption/versioning gracefully.
9. Clear cart after successful order creation only after the server confirms success.

## Verification
- cart survives refresh.
- two variants of one product remain separate.
- quantity cannot become <=0.
- out-of-stock states are clear.
- wishlist works without login.
- no customer account endpoint is created.

## Definition of Done
Cart and wishlist work independently of admin and are ready to feed Checkout.
