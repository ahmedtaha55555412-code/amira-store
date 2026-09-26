# Target Project Structure

The project is greenfield. Start with this target structure in a new workspace, then adapt only where required by the current stable Next.js conventions. The separation of responsibilities is required.

```text
/
├── AGENTS.md
├── MASTER_PLAN.md
├── EXECUTION_STATUS.md
├── ZAI_BOOTSTRAP.md
├── README.md
├── package.json
├── tsconfig.json
├── next.config.*
├── eslint.config.*
├── drizzle.config.ts
├── .env.example
├── .gitignore
├── .github/
│   └── workflows/
│       └── ci.yml
├── drizzle/
│   └── <committed migration files>
├── public/
│   ├── icons/
│   └── static brand assets as appropriate
├── src/
│   ├── app/
│   │   ├── (store)/
│   │   ├── admin/
│   │   ├── api/
│   │   ├── robots.ts
│   │   ├── sitemap.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/
│   │   ├── store/
│   │   └── admin/
│   ├── db/
│   │   ├── schema/
│   │   ├── client.ts
│   │   └── queries/
│   ├── domain/
│   │   ├── products/
│   │   ├── cart/
│   │   ├── orders/
│   │   ├── inventory/
│   │   ├── reviews/
│   │   ├── search/
│   │   ├── auth/
│   │   ├── media/
│   │   └── settings/
│   ├── lib/
│   │   ├── validation/
│   │   ├── security/
│   │   ├── whatsapp/
│   │   └── utils/
│   ├── hooks/
│   ├── types/
│   └── styles/
├── scripts/
│   ├── db-seed.ts
│   ├── db-bootstrap.ts
│   ├── admin-bootstrap.ts
│   └── verify-migrations.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/
    ├── phases/
    ├── ops/
    └── qa/
```

## Rules
- UI cannot directly issue arbitrary SQL.
- Domain services own business behavior.
- Database queries are centralized enough to be testable and auditable.
- Validation is shared and explicit.
- Server-only modules must not leak into client bundles.
- Client components are used only where browser state/interactivity requires them.
