# PHASE 03 — Admin Authentication + Security Foundation

## Objective
Create the only administrative identity and secure session boundary.

## Requirements
- username + password only.
- one admin only.
- no admin register page.
- no create-admin page.
- no forgot password.
- no email recovery.
- no admin email requirement.
- password change happens inside the admin dashboard.

## Tasks
1. Implement secure password hashing using a maintained password-hashing library/algorithm appropriate for Node.js/serverless.
2. Implement login endpoint/server action with validation.
3. Implement secure session creation with hashed session token storage.
4. Use HttpOnly/Secure/SameSite cookie settings appropriate to environment.
5. Implement session expiry and logout.
6. Implement login rate limiting/throttling.
7. Implement admin authorization helper used by every admin page/mutation.
8. Implement bootstrap command to create the first admin only when none exists; do not expose this as a web route.
9. Implement change-password flow requiring current password and two matching new-password fields.
10. Record login/password-change activity without storing passwords.
11. Prevent session leakage through logs/errors.

## Verification
- wrong password rejected.
- inactive admin rejected.
- session cookie is not readable by client JS.
- unauthenticated admin requests redirected/denied.
- authenticated customer cannot access admin endpoints.
- repeated bad logins trigger throttling.
- password change invalidates existing sessions if security policy requires it; this behavior must be documented.
- no forgot-password URL exists.

## Definition of Done
Admin boundary is independently secure and fully tested before catalog/admin CRUD is built.
