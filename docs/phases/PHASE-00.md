# PHASE 00 — Greenfield Bootstrap + Execution Controls

## Objective
Create the durable execution system and bootstrap the brand-new Amira Store project from an empty workspace. There is no legacy application to preserve.

## Read first
- `AGENTS.md`
- `MASTER_PLAN.md`
- `EXECUTION_STATUS.md`

## Tasks
1. Inspect the workspace and confirm it is a new/empty project workspace containing the supplied planning files only.
2. Verify required local tooling/availability: Node.js, npm/pnpm/yarn as chosen, Git, GitHub CLI (`gh`), Vercel CLI (`vercel`), and Neon CLI (`neonctl`) or equivalent authenticated integrations.
3. Verify authenticated access to GitHub, Neon, and Vercel. If an account is not authenticated, stop only at the exact authorization step and report it as BLOCKED; do not fake success.
4. Bootstrap the application using the current stable/appropriate Next.js + TypeScript setup defined by `MASTER_PLAN.md`.
5. Initialize Git and create the new GitHub repository for Amira Store, keeping it private unless the owner explicitly chooses otherwise. Push the baseline repository.
6. Create/link the Vercel project and establish Local/Preview/Production environment separation.
7. Create the Neon project/database and required development/preview/production branching strategy.
8. Create `.env.example` and the project environment contract; never commit real secrets.
9. Create or normalize all documentation directories and preserve the supplied plan files.
10. Create/verify `.gitignore`, README, package scripts, and baseline CI scaffolding.
11. Record baseline tool versions, authentication verification, repository URLs/IDs, and project IDs in `docs/ops/BASELINE.md` without recording secret values.
12. Create the initial baseline commit and push it to GitHub.

### Infrastructure safety
- Do not touch unrelated GitHub repositories, Neon projects, or Vercel projects.
- Confirm resource names/IDs before destructive operations.
- Do not run production database migrations in this phase unless the phase explicitly requires only an empty database bootstrap.
- Do not insert production fake/demo business data.

## Required outputs
- Baseline technical report in `docs/ops/BASELINE.md`.
- New GitHub repository created and baseline pushed.
- Vercel project created/linked.
- Neon project/database and environment strategy established.
- Environment variable contract committed without secret values.
- Working `AGENTS.md`, `MASTER_PLAN.md`, `EXECUTION_STATUS.md`.
- Initial `package.json` scripts identified/documented.

## Integration checks
- Dependencies install successfully.
- New app starts successfully in development.
- GitHub remote exists and baseline commit is pushed.
- Vercel project is linked and a non-production deployment path is proven.
- Neon project/branch access is proven without exposing credentials.
- No real secrets are committed.

## Definition of Done
- Baseline commands have results recorded.
- Execution controls are committed.
- No blocker remains unexplained.
- `CURRENT_PHASE` is changed to `PHASE_01` only after all checks pass.

## Stop conditions
Stop if required external authentication is unavailable, if a requested resource identity is ambiguous, or if the greenfield bootstrap would affect an unrelated resource. Record the exact blocker instead of guessing.
