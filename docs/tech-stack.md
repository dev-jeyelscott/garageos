# GarageOS Tech Stack

**Document:** `tech-stack.md`  
**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Status:** Draft for team approval  
**Scope:** Engineering implementation baseline only; not product-scope expansion  
**Generated:** 2026-06-24  
**Reduced:** 2026-06-27

## 1. Purpose

Defines the approved GarageOS implementation stack for frontend, backend, database, migrations, authentication, jobs, storage, testing, observability, deployment, and tooling.

This document does not add product functionality, modules, workflows, integrations, roles, permissions, or phases. It only selects technologies and conventions needed to implement the approved GarageOS scope.

## 2. Source Authority

Priority order:

1. `requirements.md`
2. `database-design.md`
3. `database-schema.md`
4. `architecture.md`
5. `api-contracts.md`
6. QA, RTM, roadmap, user stories, permission matrix, and UX screen map

Rules:

- PRD wins on product behavior.
- Schema/design win on persistence and data integrity.
- Architecture wins on system structure.
- API contracts win on externally visible API behavior.
- This file records implementation decisions only.
- Undecided provider/tool choices require ADRs.
- Explicit exclusions remain out of scope.

## 3. Fixed Constraints

| Area            | Constraint                                                                             |
| --------------- | -------------------------------------------------------------------------------------- |
| Product         | Multi-tenant SaaS subscription product.                                                |
| Client          | Mobile-first PWA only.                                                                 |
| Offline         | App shell + read-only recent records only; no offline writes.                          |
| Backend         | Modular monolith first.                                                                |
| API             | REST/HTTPS/JSON under `/api/v1` with workflow action endpoints.                        |
| Database        | PostgreSQL 16+ transactional source of truth.                                          |
| Tenancy         | Shared DB/schema with strict tenant isolation.                                         |
| Scope           | Tenant records require `tenant_id`; branch records require `tenant_id` + `branch_id`.  |
| Inventory       | Ledger-first with FIFO layers and reservations.                                        |
| Financial       | Issued financial/receipt/refund/ledger/audit records are immutable or correction-only. |
| Critical writes | Idempotency, transactions, row locks or optimistic locking where applicable.           |
| Jobs            | Retry-safe, observable background processing.                                          |
| Files           | Private tenant-scoped storage with signed URLs.                                        |
| Observability   | Structured logs, metrics, tracing, request/correlation IDs, error monitoring.          |
| Deployment      | Containerized PWA/API/worker/scheduler behind HTTPS.                                   |
| QA              | Unit, API, integration, E2E, concurrency, security, performance, operational tests.    |

## 4. Explicit Technology Non-Scope

Do not introduce technologies or architecture that imply:

- Native iOS/Android apps.
- Offline mutation queues, sync conflict resolution, or offline operational writes.
- Microservices-first architecture.
- General ledger/accounting modules beyond documented reports/AP/AR.
- Subscription payment gateway charging.
- Customer portal identity or self-service.
- 2FA.
- ML, AI forecasting, predictive analytics, or custom BI platform scope.

## 5. Approved Core Stack

| Layer            | Decision                                                             |
| ---------------- | -------------------------------------------------------------------- |
| Language         | TypeScript                                                           |
| Repository       | pnpm monorepo                                                        |
| Frontend         | Next.js + React                                                      |
| Styling          | Tailwind CSS                                                         |
| Components       | shadcn/ui-style accessible component foundation                      |
| Backend          | NestJS modular monolith                                              |
| API              | REST over HTTPS, JSON, `/api/v1`                                     |
| Database         | PostgreSQL 16+                                                       |
| Query layer      | Kysely + node-postgres                                               |
| Migrations       | Kysely migrations or node-pg-migrate; final ADR required             |
| Runtime          | Node.js LTS                                                          |
| Jobs             | PostgreSQL-backed jobs/outbox first                                  |
| Files            | S3-compatible private object storage                                 |
| Cache            | Browser PWA cache first; optional server cache                       |
| Auth             | Short-lived access token + rotating hashed refresh token             |
| Password hashing | Argon2id preferred; bcrypt cost >= 12 fallback                       |
| API docs         | OpenAPI generated or contract-maintained with CI checks              |
| Tests            | Vitest/Jest, Supertest, Testcontainers PostgreSQL, Playwright        |
| Deployment       | Docker containers                                                    |
| Observability    | JSON logs, OpenTelemetry-compatible traces/metrics, error monitoring |

## 6. Frontend Baseline

Use Next.js, React, TypeScript, Tailwind CSS, and shadcn/ui-style components.

Rules:

1. Build mobile-first.
2. Use deliberate server/client component boundaries.
3. Use typed REST API client.
4. Use React Hook Form or equivalent controlled form strategy.
5. Share validation schemas where practical; API remains authoritative.
6. Implement PWA manifest, service worker, app shell cache, and read-only recent-record cache.
7. Show tenant lifecycle banners for `grace_period`, `read_only`, `suspended`, and pending deletion states.
8. Show offline indicator and block all writes offline.
9. Use explicit workflow action endpoints; do not perform arbitrary status updates.
10. Expose validation, conflict, idempotency replay, blocked-action, and correlation ID states.
11. Only build documented UX screen groups.

## 7. Backend Baseline

Use NestJS with a modular monolith.

Module convention:

```text
modules/<module>/
  api/             controllers, DTOs, request/response mapping
  application/     commands, queries, transaction orchestration
  domain/          business rules, state machines, calculations
  persistence/     repositories and SQL mappings
  policies/        tenant, branch, permission checks
  events/          outbox events/handlers
  tests/           unit/integration tests
```

Rules:

1. Tenant context comes from authenticated session, never client-supplied `tenant_id`.
2. Branch-specific operations enforce branch assignment or tenant-wide branch access.
3. Tenant status guard runs before operational business validation.
4. Critical writes use explicit transactions.
5. Financial, inventory, billing, deletion, and export writes use idempotency where documented.
6. Immutable/correction-only records must not be directly edited.
7. Cross-module changes go through application services or domain events.
8. Retry-sensitive side effects go through jobs/outbox, not unreliable request-time execution.
9. Centralized exception filters must emit documented API error envelopes.
10. Structured logs include request/correlation ID and safe tenant/user context.

Recommended package layout:

```text
apps/web
apps/api
apps/worker
apps/scheduler
packages/contracts
packages/db
packages/config
packages/validation
packages/observability
packages/test-utils
```

## 8. Database and Persistence Baseline

Use PostgreSQL 16+, Kysely, and node-postgres.

Required extensions:

```sql
create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists pgcrypto;
```

Optional:

```sql
create extension if not exists citext;
```

Rules:

1. UUID primary keys; UUIDv7 preferred.
2. Money uses `numeric(14,2)`.
3. Quantity uses `numeric(14,3)`.
4. Events use `timestamptz`; business dates use tenant-timezone `date`.
5. Tenant-owned tables include `tenant_id`.
6. Branch-specific operational tables include `tenant_id` and `branch_id`.
7. Tenant-scoped unique constraints include tenant context.
8. Document numbers are tenant-scoped and never reused.
9. Stock-changing operations write immutable inventory ledger entries.
10. FIFO layers and FIFO reservations are first-class records.
11. Financial records are not directly edited after issuance/posting.
12. Critical writes use idempotency keys where documented.
13. Migrations are version-controlled, forward-safe, and CI-validated.
14. Seed scripts are idempotent.
15. Repository/service tenant scoping is required from day one; RLS is optional defense-in-depth after validation.

## 9. API and Contract Baseline

| Concern        | Decision                                       |
| -------------- | ---------------------------------------------- |
| Protocol       | REST over HTTPS                                |
| Base path      | `/api/v1`                                      |
| Payload        | JSON                                           |
| Field style    | `snake_case`                                   |
| Errors         | Centralized documented error envelope          |
| Pagination     | Cursor pagination for high-volume lists        |
| Idempotency    | `Idempotency-Key` header for critical writes   |
| Correlation    | Accept `X-Correlation-ID`; generate if missing |
| Locking        | `lock_version` or `If-Match` where documented  |
| Platform APIs  | `/platform/*`                                  |
| Support access | Explicit audited support session context       |

Rules:

- Preserve stable envelopes, error codes, workflow endpoints, and enum values.
- Derive tenant context from session.
- Do not expose endpoints for excluded capabilities.
- Keep OpenAPI or contract docs synchronized through ADR-backed CI checks.

## 10. Authentication and Security

| Concern            | Decision                                                                           |
| ------------------ | ---------------------------------------------------------------------------------- |
| Password hashing   | Argon2id preferred; bcrypt cost >= 12 fallback                                     |
| Access tokens      | Short-lived bearer tokens                                                          |
| Refresh tokens     | Rotating; hashed server-side                                                       |
| Refresh storage    | Secure HTTP-only cookie preferred                                                  |
| Sessions           | Server-side refresh session revocation                                             |
| Rate limits        | Login, public, and sensitive endpoints                                             |
| Reset/verification | Single-use hashed tokens with expiry                                               |
| Secrets            | Environment/secret-manager; never committed                                        |
| File access        | Private objects + signed URLs only                                                 |
| Logs               | No plaintext passwords, tokens, provider secrets, card data, or sensitive payloads |

Required controls:

- Tenant isolation.
- Branch access enforcement.
- Additive RBAC.
- Tenant lifecycle gates.
- Plan gates.
- Audited platform support access.
- Sensitive-data redaction.
- Authorization denial logs with sanitized details.

## 11. Background Jobs

Initial strategy: PostgreSQL-backed jobs and transactional outbox.

Job categories:

- Tenant lifecycle evaluation, deletion warnings, deletion jobs.
- Email/SMS/push/internal notifications and reminders.
- Tenant exports, attachment packaging, report exports.
- File retention/deletion/quarantine workflows.
- Report snapshots/read-model rebuilds.
- Inventory, financial, AP/AR, export, and job reconciliation.

Rules:

1. Jobs expose status, attempts, timestamps, and safe error summaries.
2. Retries must not duplicate irreversible side effects.
3. Provider delivery attempts are recorded where documented.
4. Dead-lettered jobs are observable.
5. Critical failures produce logs, metrics, and alerts.
6. Worker and scheduler deploy separately from API.

## 12. Files, Storage, and Exports

Use private S3-compatible object storage.

Rules:

1. File metadata remains tenant-scoped.
2. Branch-specific file visibility follows linked record branch access.
3. Upload/download use signed URLs.
4. No permanent public tenant file URLs.
5. Large export generation is asynchronous.
6. Export download checks tenant status, role, owner/platform access, and support context.
7. Tenant deletion removes eligible tenant-owned files according to retention rules.
8. Malware scanning provider/adaptor requires ADR before affected milestone.

## 13. Observability and Operations

| Concern          | Decision                                                           |
| ---------------- | ------------------------------------------------------------------ |
| Logs             | Structured JSON                                                    |
| Tracing/metrics  | OpenTelemetry-compatible                                           |
| Request context  | Request ID and correlation ID on API responses                     |
| Error monitoring | External provider via adapter/SDK                                  |
| Dashboards       | API, jobs, DB pool, providers, exports, inventory/payment failures |
| Backups          | Managed encrypted PostgreSQL backups + encrypted object storage    |
| Restore tests    | Quarterly target                                                   |
| DR               | RPO 24h, RTO 4h                                                    |

Must observe:

- API latency and errors.
- Background job failures/retries.
- Auth failures and authorization denials.
- Inventory, payment, receipt, refund failures.
- Notification provider failures.
- Export duration/failures.
- DB pool saturation.
- Backup failures.
- Sustained P95/P99 latency breaches.

## 14. Testing Baseline

| Layer       | Tools                      | Coverage                                                                       |
| ----------- | -------------------------- | ------------------------------------------------------------------------------ |
| Unit        | Vitest/Jest                | Rules, calculations, statuses, permissions, tax, FIFO math                     |
| API         | Supertest                  | Envelopes, auth, validation, idempotency, errors, permissions, branch access   |
| Integration | Testcontainers PostgreSQL  | Repositories, transactions, constraints, locks, rollback                       |
| E2E         | Playwright                 | Mobile workflows, onboarding, job order, inventory, invoice, payment, receipt  |
| Concurrency | Parallel integration tests | FIFO, numbering, payment/refund limits, receiving                              |
| Migration   | CI migration validation    | Empty DB migration, seed idempotency, schema checks                            |
| Security    | Automated checks + review  | Tenant isolation, token handling, rates, files, support access, sensitive logs |
| Performance | Scenario load tests        | Search, reports, dashboards, ledgers, exports, high-volume endpoints           |

Rules:

- No milestone exits without relevant API, DB, frontend, blocked-path, audit, idempotency, and observability tests.
- Critical workflows require rollback and concurrency tests.
- API contracts trace to `api-contracts.md`.
- E2E includes mobile viewport coverage.
- Offline tests confirm writes are blocked.

## 15. DevOps and Deployment

| Concern          | Decision                                                          |
| ---------------- | ----------------------------------------------------------------- |
| Containers       | Docker                                                            |
| Local stack      | Docker Compose or equivalent                                      |
| Environments     | local, development, staging, production                           |
| Deployment units | PWA static app, API, worker, scheduler                            |
| DB               | Managed PostgreSQL preferred                                      |
| Object storage   | S3-compatible managed private storage                             |
| CI               | lint, typecheck, tests, migration validation, dependency scanning |
| CD               | Provider-specific ADR pending                                     |
| Secrets          | Environment/secret-manager                                        |
| Runbooks         | Backup/restore, incident response, rollback, support access       |

Rules:

1. Production runs behind HTTPS.
2. API/worker/scheduler are independently deployable/scalable.
3. Staging must validate migrations, workers, storage, exports, provider sandboxes, and observability.
4. Production migrations are forward-only.
5. Destructive migrations require backup and rollout plan.
6. Launch requires smoke tests, monitoring, provider config, backup validation, and rollback plan.

## 16. Required ADRs

| ADR                     | Required Before   | Recommended Default                                                      |
| ----------------------- | ----------------- | ------------------------------------------------------------------------ |
| Frontend framework      | Milestone 1       | Next.js + React + TypeScript                                             |
| Backend framework       | Milestone 1       | NestJS + TypeScript                                                      |
| Query layer             | Milestone 1       | Kysely + node-postgres                                                   |
| Migration tool          | Milestone 1       | Kysely migrations or node-pg-migrate                                     |
| Validation strategy     | Milestone 2       | Zod if sharing schemas; class-validator if Nest convention dominates     |
| Token storage           | Milestone 2       | Secure HTTP-only refresh cookie preferred                                |
| RLS timing              | Before production | Repository scoping first; RLS after policy validation unless experienced |
| Append-only triggers    | Before production | Enable for financial/audit/ledger tables                                 |
| Job locking             | Milestone 2/3     | PostgreSQL `FOR UPDATE SKIP LOCKED`                                      |
| OpenAPI strategy        | Milestone 2       | Generate or CI-validate against contracts                                |
| Object storage provider | Milestone 11      | S3-compatible private provider                                           |
| Email provider          | Milestone 10      | Transactional email with sandbox                                         |
| SMS provider            | Milestone 10      | Target-market delivery support                                           |
| Error monitoring        | Milestone 2/13    | Backend/jobs/source maps/alerting                                        |
| Report read models      | Milestone 12      | Rebuildable PostgreSQL read models with async refresh                    |
| Malware scanning        | Milestone 11/13   | Adapter-based provider selection                                         |

## 17. Decision Summary

| Area                 | Preferred                     | Reason                                                   |
| -------------------- | ----------------------------- | -------------------------------------------------------- |
| Backend architecture | Modular monolith              | Atomic multi-table workflows.                            |
| Language             | TypeScript                    | Shared frontend/backend context.                         |
| Query layer          | Kysely + raw SQL escape hatch | Type safety with SQL visibility.                         |
| Jobs                 | PostgreSQL first              | Lower ops complexity and transactional outbox alignment. |
| Files                | Private S3-compatible storage | Tenant privacy and signed URLs.                          |
| Cache                | Browser PWA cache first       | Offline is read-only; DB remains source of truth.        |
| API                  | REST                          | Matches API contracts.                                   |
| Deployment           | Containers                    | Matches PWA/API/worker/scheduler units.                  |

## 18. Acceptance Criteria

Accept this stack only if it:

1. Preserves mobile-first PWA.
2. Preserves modular monolith.
3. Preserves PostgreSQL 16+ as source of truth.
4. Enforces tenant and branch scoping.
5. Supports REST APIs under `/api/v1`.
6. Supports idempotent critical writes.
7. Supports row locks or optimistic locking.
8. Supports immutable/correction-only financial, receipt, refund, ledger, and audit records.
9. Supports PostgreSQL-backed jobs/outbox first.
10. Supports private tenant file storage and signed URLs.
11. Supports read-only offline cache without offline writes.
12. Supports contract, integration, E2E, security, concurrency, and operational tests.
13. Supports logs, correlation IDs, metrics, error monitoring, and alerts.
14. Does not introduce excluded capabilities.
15. Has ADRs before affected milestones start.

## 19. Milestone 0 Readiness Checklist

- [ ] Tech stack reviewed and approved.
- [ ] ADR directory created.
- [ ] ADRs created for frontend, backend, query layer, migration tool, token strategy, job locking, and OpenAPI strategy.
- [ ] Monorepo initialized.
- [ ] TypeScript strict mode enabled.
- [ ] ESLint and Prettier configured.
- [ ] CI runs lint, typecheck, unit tests, dependency scanning, and migration validation placeholder.
- [ ] Local Docker Compose or equivalent stack created.
- [ ] `.env.example` created with no secrets.
- [ ] Database migration baseline created.
- [ ] API response/error envelope helpers created.
- [ ] Observability logging context baseline created.
- [ ] Testing baseline implemented.

## 20. Key Risks

| Risk                                       | Mitigation                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Query abstraction hides locks/transactions | Use Kysely/pg raw SQL escape hatch and concurrency tests.                                 |
| Provider choices delay work                | Define adapters early; finalize vendors before affected milestones.                       |
| RLS added too late or incorrectly          | Enforce repository scoping from day one; add tested RLS defense-in-depth.                 |
| Jobs duplicate side effects                | Use idempotent jobs, outbox, attempt tracking, locks, dead-letter visibility.             |
| Over-engineering                           | Keep stack conservative and source-aligned.                                               |
| Under-testing concurrency                  | Add early concurrency tests for numbering, FIFO, payments, refunds, transfers, receiving. |
| UI treats permissions as sufficient        | Backend guards remain authoritative.                                                      |
| API/DTO/schema enum drift                  | Generate or CI-validate API and DB enum/check constraints.                                |

## 21. Final Baseline

```text
TypeScript monorepo
Next.js + React mobile-first PWA
Tailwind CSS + shadcn/ui-style components
NestJS modular monolith backend
REST over HTTPS under /api/v1
PostgreSQL 16+ transactional source of truth
Kysely + node-postgres query layer
SQL-compatible versioned migrations
PostgreSQL-backed jobs/outbox first
Private S3-compatible object storage with signed URLs
Short-lived access tokens + rotating hashed refresh tokens
Argon2id password hashing preferred
Dockerized PWA/API/worker/scheduler deployment
Structured logs, correlation IDs, metrics, error monitoring, alerts
Vitest/Jest, Supertest, Testcontainers PostgreSQL, Playwright
```

Provider-specific selections for object storage, email, SMS, analytics, error monitoring, malware scanning, and deployment hosting must be finalized through ADRs before their affected milestones.
