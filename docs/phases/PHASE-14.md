# PHASE 14 — GitHub + Neon + Vercel + CI/CD + Production Hardening

## Objective
Move from application-complete to deployment-ready production engineering.

## GitHub
1. Repository is clean.
2. `.env*` secrets ignored; `.env.example` tracked.
3. CI workflow runs on pull requests and pushes.
4. Required CI steps:
   - install with locked dependencies
   - typecheck
   - lint
   - unit/integration tests
   - build
5. Optional security/dependency audits that do not block unnecessarily noisy packages.
6. Protect `main` with required checks where available.

## Neon
1. Create/confirm Production branch.
2. Create Development branch.
3. Use Preview branches for preview environments where practical.
4. Verify every migration on an isolated branch before Production.
5. Never use destructive schema shortcuts on Production.
6. Confirm connection pooling/driver choice matches Vercel runtime and transaction requirements.
7. Record production database migration state.

## Vercel
1. Link GitHub repository.
2. Set `main` as production branch.
3. Configure Development/Preview/Production environment variables separately.
4. Connect media storage.
5. Configure domain after preview validation.
6. Use Preview deployments for QA.
7. Configure deployment checks as appropriate.

## Environment contract
At minimum define names (values kept out of Git):
- DATABASE_URL
- AUTH_SESSION_SECRET or equivalent secret
- APP_URL / production URL as required
- any storage authentication values required by the selected Vercel Blob mode

Do not put WhatsApp phone in an environment variable if it is already persisted as editable store settings; seed the default value in the database and let Admin change it.

## Production rehearsal
- restore/verify fresh database from migrations
- apply migrations to Preview
- run seed only in non-production
- deploy Preview
- execute final E2E
- apply Production migration
- deploy Production
- smoke-test
- monitor logs

## Definition of Done
GitHub → Vercel → Neon workflow is repeatable, documented, secret-safe, and tested.
