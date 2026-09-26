# Research Notes Used for the Architecture

## Next.js
Use the current supported App Router architecture and verify the exact stable version at implementation time from official Next.js release/support documentation.

## Vercel
Vercel provides Local, Preview, and Production environments with environment-specific variables, and Git integrations can create Preview deployments for non-production branches and Production deployments from the configured production branch. This supports the project's GitHub → Preview → Production workflow.

## Neon
Neon branches are isolated and have their own connection strings. Neon documents using branches for development/preview environments and integrating previews with GitHub/Vercel.

## Drizzle
Drizzle Kit supports generating committed SQL migrations from schema changes and applying them with `drizzle-kit migrate`. Drizzle ORM supports transactions for atomic multi-statement operations. The order + inventory flow depends on this.

## WhatsApp
WhatsApp's Click to Chat supports a `wa.me/<international-number>?text=<urlencoded-message>` format. The message is prefilled in the chat composer; the customer still sends it.

## Accessibility
WCAG 2.2 is a W3C Recommendation and is used as the accessibility target.

## Performance
Current Core Web Vitals good thresholds are LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at the 75th percentile, segmented by device type.

## Agent execution research
Recent 2026 research on coding agents indicates repository-level instructions and agent plans can materially affect agent behavior. This plan therefore uses a short authoritative `AGENTS.md` plus bounded phase plans and durable status/traceability files instead of a single oversized instruction document. See source links below.

## Official/primary sources
- Next.js docs: https://nextjs.org/docs/app/getting-started
- Vercel Git: https://vercel.com/docs/git
- Vercel environments: https://vercel.com/docs/deployments/environments
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Neon workflow primer: https://neon.com/docs/get-started-with-neon/workflow-primer
- Drizzle generate: https://orm.drizzle.team/docs/drizzle-kit-generate
- Drizzle migrate: https://orm.drizzle.team/docs/drizzle-kit-migrate
- Drizzle transactions: https://orm.drizzle.team/docs/transactions
- WhatsApp Click to Chat: https://faq.whatsapp.com/5913398998672934
- WCAG 2.2: https://www.w3.org/TR/wcag/
- Core Web Vitals: https://web.dev/articles/vitals

## Agent-plan research
- https://arxiv.org/abs/2608.04661
- https://arxiv.org/abs/2601.20404
