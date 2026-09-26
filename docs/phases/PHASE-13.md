# PHASE 13 — Full QA + Security + Failure Testing

## Objective
Break the system deliberately before deployment.

## Automated tests
### Unit
- price calculations
- discount calculations
- Arabic phone normalization
- order number generation
- variant validation
- status transition validation
- cart merge behavior
- WhatsApp message rendering
- URL encoding

### Integration
- order creation transaction
- stock decrement
- cancellation restoration
- order edit inventory delta
- review verification
- tracking authorization
- admin authorization
- media upload permissions

### Concurrency
- two simultaneous purchases of final stock
- repeated checkout submission
- same variant from multiple sessions

### Security
- price tampering
- stock tampering
- order-id enumeration
- tracking without correct phone
- unauthorized admin mutation
- brute-force login
- malicious file upload
- oversized file upload
- path traversal/upload filename handling
- XSS payloads in product/comment fields
- CSRF protections as applicable to chosen server action/route architecture

### E2E
Primary journey:
Home → category/search → product → variant → cart → checkout → order success → WhatsApp handoff → admin sees order → stock decreased → admin updates shipping → customer tracks order.

## Visual QA
Check representative pages at:
- 360-ish phone
- 390-ish phone
- tablet portrait
- tablet landscape
- laptop
- desktop
- large desktop

Check Arabic wrapping, product card truncation, modal overflow, sticky headers, touch interactions, empty/error states.

## Definition of Done
All critical scenarios pass. No blocker/high issue is open. Every remaining low issue is documented with a plan/date if kept.
