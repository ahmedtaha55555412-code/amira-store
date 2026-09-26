# Final Acceptance Checklist

All items are mandatory unless explicitly marked optional in the Master Plan.

## Customer UX
- [ ] Arabic-only UI and RTL.
- [ ] Responsive phone/tablet/desktop.
- [ ] Homepage matches the approved brand direction without cloning references.
- [ ] Five top-level categories work.
- [ ] Category tree works.
- [ ] New Arrivals reflects newly created products.
- [ ] No featured/selected products mechanism exists.
- [ ] Offers reflect real variant pricing.
- [ ] Search works with Arabic input.
- [ ] Filters do not show irrelevant attributes for every category.
- [ ] Product page handles no-variant, single-attribute, and multi-attribute products.
- [ ] Size is not forced to color.
- [ ] Variant price updates correctly.
- [ ] Variant stock updates correctly.
- [ ] Variant-specific images update correctly.
- [ ] Cart supports multiple products and repeated product with different variants.
- [ ] Wishlist works without login.
- [ ] Checkout requires name, phone, and simple address.
- [ ] COD is the only payment method.
- [ ] No online payment route exists.
- [ ] Order is persisted before WhatsApp handoff.
- [ ] Stock decrements immediately after successful order creation.
- [ ] WhatsApp message contains correct order details.
- [ ] WhatsApp number is editable by Admin.
- [ ] Customer can track by order number + checkout phone.

## Admin
- [ ] One admin account only.
- [ ] Login is username + password.
- [ ] No register/create-admin route.
- [ ] No forgot-password route.
- [ ] No email recovery.
- [ ] Change password works inside admin.
- [ ] Product CRUD works.
- [ ] Category CRUD works.
- [ ] Variant CRUD works.
- [ ] Per-variant price/original-price/stock/images work.
- [ ] Inventory ledger works.
- [ ] Order list/detail/edit works.
- [ ] Inventory adjusts correctly after order edits.
- [ ] Shipping cost can be recorded later.
- [ ] Order and shipping statuses work.
- [ ] Reviews moderation works.
- [ ] WhatsApp testimonials upload/publish works.
- [ ] Logo can be replaced.
- [ ] Homepage text/media/visibility/order settings work without product selection logic.

## Security
- [ ] No secret committed.
- [ ] Admin routes protected server-side.
- [ ] Login rate limited.
- [ ] Tracking endpoint rate limited.
- [ ] Checkout validates everything server-side.
- [ ] Client price values cannot override DB price.
- [ ] Client stock values cannot override DB stock.
- [ ] Upload validation works.
- [ ] Sensitive testimonial originals are not accidentally public.
- [ ] High-impact admin changes are logged.

## Database
- [ ] All migrations are committed.
- [ ] Fresh database migration succeeds.
- [ ] Seed is deterministic and development-only.
- [ ] Production does not auto-seed demo data.
- [ ] Transactions cover order + inventory changes.
- [ ] No negative stock.
- [ ] No duplicate order creation from repeated submit.

## Quality
- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] E2E tests pass.
- [ ] Build passes.
- [ ] Accessibility audit passes target checks.
- [ ] Core Web Vitals targets are met or documented with remediation.
- [ ] Broken/loading/empty states are reviewed.

## Deployment
- [ ] GitHub main green.
- [ ] Preview deployment works.
- [ ] Preview points to isolated non-production DB.
- [ ] Production environment variables verified.
- [ ] Neon production migrations applied successfully.
- [ ] Vercel production deployment healthy.
- [ ] Smoke tests pass on production.
- [ ] Rollback procedure documented.

## Launch decision
PROJECT_STATUS must be `COMPLETE` only after all mandatory checks above are checked and `EXECUTION_STATUS.md` is updated.
