# Amira Store — External Access Matrix

The owner may grant the ZCode workspace the authenticated access required to execute the project end-to-end.

| System | Required operational capability | Preferred authentication | Verification |
|---|---|---|---|
| GitHub | Create/manage the new repository, push code, manage branches/PRs/actions/secrets as required by the plan | GitHub CLI browser/OAuth or an equivalent authenticated GitHub connection | `gh auth status`, repository API/CLI checks |
| Neon | Create/manage the Amira Store Postgres project, branches, database roles/connection settings, and migrations | Neon CLI login or authenticated Neon integration | `neonctl`/API project + branch checks |
| Vercel | Create/link the project, manage Preview/Production environments, environment variables, deployments, domains | Vercel CLI login or authenticated Vercel integration | `vercel` project/link/deployment checks |
| ZCode | Full file/terminal/browser execution for the workspace | ZCode Full access mode | Visible execution mode + successful tool calls |

## Credential rule
Never put passwords, raw API keys, database URLs, session secrets, or private tokens into prompts, documentation committed to Git, or source code.
Use authenticated login flows or secret stores/environment variables.

## Scope rule
"Full access" means enough authority to complete the Amira Store project inside the owner's authenticated accounts. It does not authorize deletion or modification of unrelated projects/resources.
