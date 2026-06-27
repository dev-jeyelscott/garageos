# AGENTS.md

Guidance for AI agents and maintainers working in this repository.

## Project Snapshot

GarageOS is a TypeScript pnpm monorepo for a mobile-first motorcycle shop management SaaS.

- Frontend: `apps/web` Next.js + React PWA.
- API: `apps/api` NestJS modular monolith.
- Background units: `apps/worker` and `apps/scheduler`.
- Shared packages: `packages/shared`, `packages/api-client`, `packages/config`, `packages/db`, `packages/test-utils`.
- Database: PostgreSQL 16+ with versioned `node-pg-migrate` migrations in `packages/db/migrations`.

The project is documentation-first. Approved docs and accepted ADRs are binding implementation guidance.

## Source Order

When behavior, schema, API shape, or scope is unclear, follow this order:

1. `docs/requirements.md`
2. `docs/database-design.md`
3. `docs/database-schema.md`
4. `docs/architecture.md`
5. `docs/api-contracts.md`
6. `docs/requirements-traceability-matrix.md`
7. `docs/user-stories.md`
8. `docs/permission-matrix.md`
9. `docs/ux-sreen-map.md`
10. `docs/qa-acceptance-test-plan.md`
11. `docs/tech-stack.md`
12. Accepted ADRs in `docs/adr`
13. Verified implementation in the current checkout

If implementation conflicts with higher-priority docs, call out the conflict before changing behavior. Do not invent requirements, routes, permissions, schema fields, workflows, integrations, or screens.

## Scope Guardrails

Keep GarageOS within approved scope:

- Mobile-first PWA, not native mobile apps.
- Modular monolith first, not microservices-first.
- PostgreSQL is the transactional source of truth.
- Offline support is app shell plus read-only recent records only.
- No offline writes, mutation queues, sync conflict resolution, or offline approvals.
- No customer portal, payroll, full accounting/general ledger, subscription payment collection, 2FA, AI forecasting, marketplace, loyalty, or standalone POS checkout unless approved docs change.

## Architecture Rules

- Tenant context is derived from authenticated session, never trusted from client payload.
- Tenant-owned records require `tenant_id`.
- Branch-specific operational records require both `tenant_id` and `branch_id`.
- Backend and database enforcement are authoritative; UI restrictions are only UX assistance.
- API routes use REST/JSON under `/api/v1` with documented response and error envelopes.
- API payload fields use `snake_case`.
- Workflow changes use explicit command/action endpoints, not arbitrary status patches.
- Critical retryable writes require idempotency where documented.
- Mutable records use optimistic locking where documented.
- Financial, receipt, refund, ledger, audit, and posted inventory records are immutable or correction-only.
- Important state changes require audit logs and sanitized observability.
- Background work should be retry-safe and observable.

## Repository Conventions

- Use TypeScript throughout.
- Prefer existing module boundaries and patterns over new abstractions.
- Keep domain/business logic in application/domain services, not controllers or UI components.
- Keep controllers thin: validate, authorize, call services, return envelopes.
- Keep repositories tenant/branch scoped by design.
- Use Zod validation where existing API code does.
- Use shared transaction utilities for multi-record writes.
- Put tests next to the affected code using `*.spec.ts` or `*.test.ts`.
- Do not commit secrets. `.env` is local only; update `.env.example` when adding required config.
- Preserve unrelated dirty worktree changes.

## Common Commands

Use `pnpm.cmd` on Windows PowerShell if the plain `pnpm` shim is blocked.

Root verification:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

Targeted verification:

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm --filter @garageos/web typecheck
pnpm --filter @garageos/web test
pnpm --filter @garageos/shared test
pnpm --filter @garageos/config test
pnpm --filter @garageos/api-client test
```

Database:

```bash
pnpm dev:db
pnpm db:migrate
pnpm db:seed
pnpm db:validate
pnpm dev:db:down
```

Development servers:

```bash
pnpm dev:web
pnpm dev:api
pnpm dev:worker
pnpm dev:scheduler
```

## Testing Expectations

Match test coverage to risk:

- Unit tests for domain rules, calculations, validators, policies, and state transitions.
- API/contract tests for envelopes, validation, auth, permissions, branch access, errors, idempotency, and optimistic locking.
- Integration tests for repositories, transactions, constraints, rollback, tenant isolation, and concurrency-sensitive behavior.
- Frontend tests for auth/session flows, mobile states, loading/empty/error/forbidden/conflict/read-only/offline states.
- Regression tests for every bug fix.

For critical workflows, include blocked-path and concurrency coverage. High-risk areas include tenant isolation, branch access, FIFO inventory, document numbering, billing allocations, payments, refunds, file access, exports, background jobs, and sensitive logging.

## Database and Migration Rules

- Migrations are version-controlled and production-safe.
- Use PostgreSQL constraints, indexes, FKs, checks, unique constraints, and locks to protect invariants where practical.
- Seed scripts must be idempotent.
- Money uses fixed precision. Quantities use fixed precision.
- Do not directly edit issued or posted financial, inventory ledger, receipt, refund, or audit records.
- Destructive migrations require explicit approval, backup/rollback notes, and documentation.

## API Rules

- Preserve documented route names, enums, error codes, headers, and envelope shapes.
- Return stable error codes and include request/correlation metadata.
- Accept `X-Correlation-ID`; generate one if missing.
- Use `Idempotency-Key` for documented critical writes.
- Use cursor pagination for high-volume lists.
- Do not expose undocumented endpoints for excluded capabilities.
- Never return or log plaintext passwords, reset/verification tokens, access/refresh tokens, provider secrets, full card data, or sensitive free text.

## Frontend Rules

- Build mobile-first and support narrow screens.
- Use existing components and styling patterns before adding new ones.
- Keep UI flows aligned with `docs/ux-sreen-map.md`, `docs/ui-tokens.md`, and `docs/ui-registry.md`.
- Show loading, empty, validation, forbidden, subscription/read-only, offline, conflict, and success states where applicable.
- Offline mode must be read-only. Block creates, edits, approvals, payments, refunds, inventory actions, uploads, settings changes, and role/permission changes while offline.
- Backend authorization must remain authoritative even when UI hides or disables actions.

## Work Process

Before editing:

1. Check `git status -sb`.
2. Read the relevant docs and existing implementation.
3. Identify the smallest safe change set.
4. Avoid touching unrelated files or generated artifacts.

During implementation:

- Prefer narrow, source-aligned changes.
- Update docs, ADRs, tests, fixtures, or env examples when behavior requires it.
- Keep validation commands tied to the files changed.
- If a command fails, diagnose from output and fix the smallest proven cause.

Before handoff:

- Run the relevant lint, typecheck, tests, and database validation when practical.
- State exactly what was run and whether it passed.
- State any validation not run.
- Summarize changed files and residual risks.

## Git and Remote Safety

- Do not push, open PRs, change GitHub settings, or perform remote write operations unless explicitly requested.
- Do not revert user changes.
- Do not use destructive git commands unless explicitly requested.
- Commit only when explicitly asked.

## Definition of Done

Use `docs/definition-of-done.md` as the quality contract. A change is not done if it:

- Is not traceable to approved docs.
- Introduces undocumented scope.
- Relies only on frontend checks for security or business rules.
- Can leak tenant or branch data.
- Bypasses tenant lifecycle, permissions, branch access, plan gates, idempotency, audit, or observability requirements.
- Mutates immutable/correction-only records directly.
- Lacks tests or documentation for the risk level of the change.
