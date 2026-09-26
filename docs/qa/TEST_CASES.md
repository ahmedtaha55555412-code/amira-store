# Critical Test Cases

## Product/Variant
1. Product with no selectable attributes can be created.
2. Size-only product can be created.
3. Color-only product can be created.
4. Size+color product can be created with only valid combinations.
5. Different variants can have different original prices.
6. Different variants can have different current prices.
7. Different variants can have different stock quantities.
8. Variant-specific images render correctly.
9. Inactive variant cannot be purchased.
10. Out-of-stock variant cannot be purchased.

## Cart
11. Multiple different products coexist.
12. Same product with different variants coexist as separate lines.
13. Quantity updates persist after refresh.
14. Invalid localStorage state is recovered safely.

## Checkout
15. Missing name rejected.
16. Invalid phone rejected.
17. Missing address rejected.
18. COD is the only method.
19. Client-submitted price tampering is ignored.
20. Client-submitted stock tampering is ignored.
21. Successful order creates exactly one order.
22. Inventory decreases exactly once.
23. Inventory movement is created.
24. Order items contain snapshots.
25. Duplicate submit returns the same logical result rather than a second order.
26. Insufficient stock causes full transaction rollback.
27. WhatsApp URL contains correct encoded message.
28. WhatsApp number is read from store settings.

## Inventory/Orders
29. Cancel active order restores stock once.
30. Repeated cancellation does not restore twice.
31. Editing quantity up decreases additional stock.
32. Editing quantity down returns stock.
33. Switching variant returns old variant and reserves new variant transactionally.
34. Shipping cost updates totals server-side.
35. Historical unit price remains unchanged after catalog price changes.

## Tracking
36. Correct order number + phone returns safe order data.
37. Incorrect phone does not reveal order details.
38. Tracking rate limit works.

## Reviews
39. Delivered order item can be reviewed.
40. Undelivered item is rejected by default.
41. Wrong phone cannot review another order.
42. Duplicate review for same order item is prevented.
43. Pending review not public.
44. Approved review public.
45. WhatsApp testimonial is separate and correctly labeled.

## Admin Auth
46. Invalid login rejected.
47. Login rate limit works.
48. Session expires.
49. Admin routes reject unauthenticated requests.
50. No registration/create-admin page exists.
51. No forgot-password/email-recovery flow exists.
52. Change password requires current password.
53. Changing password invalidates sessions according to policy.

## Search/UX
54. Arabic exact search returns expected product.
55. Prefix search returns expected product.
56. Typo-tolerant search behaves reasonably where enabled.
57. Dynamic filters match category attributes.
58. No-results state is useful.
59. Mobile layout has no horizontal overflow.
60. Tablet layout is intentional, not accidental.

## Deployment
61. Empty Neon database migrates successfully.
62. Preview deploy uses Preview env.
63. Production uses Production env.
64. No secret is tracked by Git.
65. Production smoke tests pass.
