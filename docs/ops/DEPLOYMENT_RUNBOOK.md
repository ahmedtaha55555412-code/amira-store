# Deployment Runbook — Greenfield GitHub + Neon + Vercel

## Target topology
This is a NEW project. ZCode must create the GitHub repository, Neon project/database, and Vercel project from the authenticated owner accounts before production launch. GitHub repository is the source of truth.

- `main` → Production
- feature/fix branches → Preview
- Neon production branch → Production application
- Neon preview branches → isolated preview deployments when automation is enabled
- Vercel Blob → media storage

## Required repository files
- `.env.example`
- `.gitignore`
- `README.md`
- `drizzle.config.ts`
- `drizzle/` committed migrations
- `scripts/` for bootstrap/seed/verification
- `.github/workflows/ci.yml`
- optional preview database workflow if configured

## Environment categories
### Development
- DATABASE_URL
- AUTH/session secret
- app URL
- any Vercel Blob development credentials/config

### Preview
- isolated Neon branch connection
- preview app URL if needed
- non-production storage where appropriate

### Production
- Neon production connection
- production app URL/domain
- production Blob configuration
- strong auth/session secrets

Never commit actual values.

## Migration policy
1. Change Drizzle schema.
2. Run `drizzle-kit generate`.
3. Review generated SQL.
4. Test migration on disposable/Preview Neon branch.
5. Run migration checks.
6. Merge only after Preview verification.
7. Apply to Production according to release procedure.

Never use production `db push` as a schema workflow.

## Preview workflow
1. Create feature branch.
2. Push to GitHub.
3. Vercel creates Preview deployment.
4. Provision/attach matching Neon preview branch when the phase requires database changes.
5. Apply migrations to Preview.
6. Run automated tests.
7. Manual browser checks.
8. Merge only when all required checks are green.

## Production workflow
1. Main is green.
2. Required checks pass.
3. Production database backup/safety checks are completed.
4. Production migration is applied.
5. Vercel deploys the production branch.
6. Run smoke tests.
7. Monitor errors/logs.
8. If release is defective, roll back deployment and assess DB migration compatibility before rollback.

## Secrets
GitHub Actions secrets and Vercel environment variables are used for sensitive values. GitHub stores secrets encrypted and only exposes them to workflows that explicitly reference them. Use least-privilege credentials.

## Final smoke test
- Homepage
- Search
- Category
- Product/variant selection
- Cart
- Checkout
- Order creation
- Stock decrement
- Success page
- WhatsApp link
- Admin login
- Order edit
- Inventory
- Tracking
- Review
- Vercel production health

## Greenfield provisioning order
1. Authenticate GitHub and verify account identity.
2. Initialize Git and create the new repository.
3. Authenticate Neon and create the Amira Store database project/branch structure.
4. Authenticate Vercel and create/link the Amira Store project.
5. Configure non-secret environment variable names in the repository and real values in the appropriate platform secret/environment stores.
6. Prove a Preview deployment before any Production deployment.
7. Run final acceptance, then deploy Production.

Do not paste credentials into the ZCode chat or commit them to Git.
