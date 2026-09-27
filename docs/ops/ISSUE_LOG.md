# Issue Log

## Required format
### ISSUE-YYYY-MM-DD-NNN
- Phase:
- Severity:
- Status: OPEN / FIXED / BLOCKED / ACCEPTED
- Symptom:
- Reproduction:
- Root cause:
- Minimal fix:
- Verification:
- Related files:
- Notes:

---

### ISSUE-2026-09-26-001
- Phase: PHASE_00
- Severity: BLOCKER (phase-scoped: blocks GitHub provisioning steps only)
- Status: BLOCKED
- Symptom: GitHub CLI (`gh`) is not installed and no authenticated GitHub connection (token/OAuth) exists in the execution environment; the new Amira Store GitHub repository cannot be created and the baseline commit cannot be pushed.
- Reproduction: `gh --version` → command not found; `gh auth status` → command not found; no `GH_TOKEN`, no `~/.config/gh`, no `~/.git-credentials`; `git remote -v` in `/home/z/my-project` → empty.
- Root cause: The execution environment has no GitHub authorization configured; account authorization is an owner-controlled step that the agent cannot and must not fake.
- Minimal fix: Owner authorizes GitHub in this workspace (install/authenticate `gh` via browser/OAuth, or provide an equivalent authenticated connection through the environment secret store). Agent then creates private repo `amira-store`, adds `origin`, pushes baseline.
- Verification: `gh auth status` succeeds; `git ls-remote origin` returns the new repository; baseline commit visible on remote `main`.
- Related files: `docs/ops/BASELINE.md` (§1, §8), `.git/config` (remote pending)
- Notes: No unrelated repositories touched.

### ISSUE-2026-09-26-002
- Phase: PHASE_00
- Severity: BLOCKER (phase-scoped: blocks Vercel provisioning steps only)
- Status: BLOCKED
- Symptom: Vercel CLI is not installed and no authenticated Vercel connection exists; the Vercel project cannot be created/linked and the non-production deployment path cannot be proven in PHASE_00.
- Reproduction: `vercel --version` → command not found; `vercel whoami` → command not found; no `VERCEL_TOKEN`; no `.vercel` project link.
- Root cause: No Vercel authorization configured in the execution environment.
- Minimal fix: Owner authorizes Vercel (`vercel login` browser/OAuth or equivalent authenticated integration). Agent then creates/links the Amira Store project and configures Local/Preview/Production environment separation.
- Verification: `vercel whoami` returns the owner account; `vercel project ls` / link metadata shows the Amira Store project.
- Related files: `docs/ops/BASELINE.md` (§1, §8)
- Notes: Environment separation is contractually established via `.env.example` + `docs/ops/DEPLOYMENT_RUNBOOK.md` pending provisioning.

### ISSUE-2026-09-26-003
- Phase: PHASE_00
- Severity: BLOCKER (phase-scoped: blocks Neon provisioning steps only)
- Status: BLOCKED
- Symptom: Neon CLI (`neonctl`) is not installed and no authenticated Neon connection exists; the Neon project/database and dev/preview/production branch strategy cannot be established in PHASE_00.
- Reproduction: `neonctl --version` → command not found; `neonctl whoami` → command not found; no `NEON_API_KEY`.
- Root cause: No Neon authorization configured in the execution environment.
- Minimal fix: Owner authorizes Neon (`neonctl auth` browser/OAuth or equivalent). Agent then creates the Amira Store Postgres project and required branches; credentials stored only in platform secret stores.
- Verification: `neonctl whoami` succeeds; `neonctl projects list` shows the Amira Store project; branch list shows dev/preview/prod strategy.
- Related files: `docs/ops/BASELINE.md` (§1, §4, §8)
- Notes: Local disposable dev DB (sandbox SQLite) is used only for Phase-00 boot verification; PHASE_02 introduces Drizzle/PostgreSQL migration workflow.

### ISSUE-2026-09-26-004
- Phase: PHASE_00
- Severity: LOW
- Status: ACCEPTED
- Symptom: The execution environment provides a pre-initialized Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui scaffold (including unused Prisma/SQLite helpers) rather than a literally empty workspace.
- Reproduction: Inspect `/home/z/my-project` before this phase.
- Root cause: Environment characteristic of the ZCode sandbox, not a legacy Amira Store artifact.
- Minimal fix: Treated as the greenfield application base; scaffold branding removed; no business code existed; deviation documented in `docs/ops/BASELINE.md` §2; Prisma explicitly marked as NOT the Amira Store data layer (Drizzle/PostgreSQL per MASTER_PLAN §25 arrives in PHASE_02).
- Verification: No Amira Store business logic exists in scaffold; baseline page boots; lint/typecheck pass.
- Related files: `package.json`, `src/app/page.tsx`, `src/app/layout.tsx`, `docs/ops/BASELINE.md`
- Notes: Accepted environment adaptation; does not weaken any plan requirement.

### ISSUE-2026-09-26-006
- Phase: PHASE_00
- Severity: HIGH
- Status: FIXED
- Symptom: `.env` (and the sandbox local dev database `db/custom.db`) were tracked by Git — committed by the pre-existing scaffold's initial commits before ignore rules took effect. This violates the plan's production-safety rule "Never place real secrets in Git" (AGENTS.md) even though the current `.env` holds only a low-sensitivity local SQLite URL.
- Reproduction: `git ls-files .env db` → both listed.
- Root cause: Scaffold repository predates the `.env*` ignore entry; `.gitignore` does not untrack files that were already committed.
- Minimal fix: `git rm --cached .env db/custom.db` (untrack, keep local files) + append `db/*.db` to `.gitignore` + add `!.env.example` exception so the environment contract stays tracked.
- Verification: `git ls-files .env db` → empty; `git ls-files --cached .env.example` → tracked; staged diff secret scan clean; dev server still boots after untracking.
- Related files: `.gitignore`, `.env.example`, `db/custom.db`
- Notes: Git history retains scaffold-era blobs from before this project existed; no history rewrite performed (not warranted — the removed `.env` contains no production secret; content reviewed before decision).

### ISSUE-2026-09-26-005
- Phase: PHASE_00
- Severity: LOW
- Status: FIXED
- Symptom: `bun run typecheck` (tsc --noEmit) exited 1 with 4 errors — 2× TS2307 missing `socket.io`/`socket.io-client` in `examples/websocket/`, 2× type errors in `skills/` scripts. Zero errors in `src/` (Amira Store application code).
- Reproduction: `bun run typecheck` on the untouched baseline.
- Root cause: `tsconfig.json` `include` globs (`**/*.ts`, `**/*.tsx`) sweep in execution-environment demo/skill assets that are not part of the Amira Store application; `socket.io` packages are intentionally not installed for the app.
- Minimal fix: Added `examples` and `skills` (plus future `tests` guard) to `tsconfig.json` `exclude`. No deletions, no dependency changes, no code edits in those folders.
- Verification: `bun run typecheck` → exit 0; `bun run lint` → exit 0; dev server still boots.
- Related files: `tsconfig.json`
- Notes: These folders are sandbox tooling, not application scope; excluding them from the app's TS program does not hide any application error.

### ISSUE-2026-09-26-007
- Phase: PHASE_00
- Severity: LOW
- Status: FIXED
- Symptom: 112 tracked files appeared permanently modified in `git status` (mode change 100644=>100755) despite zero content change, polluting every diff/stage operation before the GitHub push.
- Reproduction: `git status --short` after the baseline commit; `git diff --summary` → only `mode change 100644 => 100755` lines; `git diff --numstat` → content churn only in `.zscripts/dev.pid` (see ISSUE-2026-09-26-008).
- Root cause: The sandbox filesystem marks all workspace files as executable; Git's fileMode tracking compares the stored 644 modes against the filesystem's 755.
- Minimal fix: `git config core.fileMode false` (repository-local config only). No file content touched; no global setting forced on other environments.
- Verification: `git status --short` → clean except the genuine `.zscripts/dev.pid` entry; `git diff --numstat` → no content churn.
- Related files: `.git/config`
- Notes: Content-neutral; hides no real change — verified via numstat before applying.

### ISSUE-2026-09-26-008
- Phase: PHASE_00
- Severity: LOW
- Status: FIXED
- Symptom: `.zscripts/dev.pid` (sandbox dev-server runtime PID file) was tracked by Git and churns on every dev-server restart, producing meaningless diffs/commits.
- Reproduction: `git diff --numstat` shows a 1/1 change in `.zscripts/dev.pid` after each sandbox dev-server restart.
- Root cause: The scaffold tracked a runtime artifact; PID values are environment-local state, not project source.
- Minimal fix: `git rm --cached .zscripts/dev.pid` + append `.zscripts/dev.pid` to `.gitignore` (the runnable `.zscripts/*.sh` tooling remains tracked).
- Verification: `git ls-files .zscripts/dev.pid` → empty; `git status --short` → clean; local file kept on disk so sandbox tooling keeps working.
- Related files: `.gitignore`, `.zscripts/dev.pid`
- Notes: Same hygiene class as ISSUE-2026-09-26-006.
