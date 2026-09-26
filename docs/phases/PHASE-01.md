# PHASE 01 — Foundation + Design System + Brand Assets

## Objective
Establish the production application foundation and the complete Amira Store visual system before business features.

## Tasks
1. Confirm Next.js App Router + strict TypeScript architecture.
2. Configure Arabic RTL document direction at the root.
3. Define root metadata defaults for Arabic/Egypt/Egp.
4. Establish CSS tokens for cream/ivory, blush/rose, burgundy, muted gold, charcoal, borders, status colors.
5. Select one Arabic production font family and only required weights.
6. Build the foundational layout, container, spacing, typography, focus, button, input, card, badge, dialog, table, toast, skeleton, empty/error components.
7. Build responsive breakpoints intentionally for phone/tablet/desktop.
8. Define reduced-motion behavior.
9. Build original Amira Store logo/mark as replaceable SVG/PNG/WebP assets and favicon.
10. Store the logo as a media/config asset path that can later be changed from Admin.
11. Implement global responsive overflow protection.
12. Build a visual playground or component showcase used for manual QA.

## Homepage shell only
Create the visual skeleton without database-driven product sections yet:
- announcement bar
- header
- hero placeholder
- category placeholder
- product section placeholders
- benefits
- story
- reviews/testimonial placeholders
- WhatsApp CTA placeholder
- footer

## Do not build
- products database logic
- cart
- checkout
- admin authentication
- payment

## Verification
- keyboard navigation works through primitives.
- no horizontal overflow at key widths.
- Arabic ligatures/line wrapping are visually sound.
- focus states visible.
- reduced motion works.
- logo is replaceable as an asset.

## Definition of Done
- Build passes.
- Typecheck/lint pass.
- Component primitives render correctly.
- Visual baseline reviewed on phone/tablet/desktop.
- `EXECUTION_STATUS.md` marks PHASE_01 complete only after all checks.
