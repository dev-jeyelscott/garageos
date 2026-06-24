# GarageOS Tech Stack

**Document:** `tech-stack.md`  
**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Generated:** 2026-06-24  
**Status:** Draft for team approval  
**Document Type:** Engineering technology decision artifact  
**Scope Mode:** Implementation baseline only; not product-scope expansion

**Source Documents:**

1. `requirements-v2.4.md`
2. `database-design.md`
3. `database-schema.md`
4. `architecture.md`
5. `api-contracts.md`
6. `qa-acceptance-test-plan.md`
7. `requirements-traceability-matrix.md`
8. `build-roadmap.md`
9. `user-stories.md`
10. `permission-matrix.md`
11. `ux-sreen-map.md`

---

## 1. Purpose

This document defines the recommended implementation technology stack for GarageOS.

It converts the approved source documentation into a concrete engineering baseline covering frontend, backend, database access, migrations, authentication, background jobs, storage, testing, observability, deployment, and development tooling.

This document does **not** add product functionality, modules, workflows, integrations, roles, permissions, or product phases. It only selects technologies and implementation conventions needed to build the already-approved GarageOS scope.

---

## 2. Source-of-Truth Rules

The following rules govern this document:

1. `requirements-v2.4.md` remains the highest product authority.
2. `database-design.md` and `database-schema.md` remain the persistence and data-integrity authorities.
3. `architecture.md` remains the architecture authority.
4. `api-contracts.md` remains the API behavior authority.
5. This document must not override PRD, schema, architecture, API, QA, UX, roadmap, or permission rules.
6. Technology decisions are implementation choices, not new product requirements.
7. Undecided external provider choices must be captured as ADRs instead of being treated as product ambiguity.
8. Explicitly excluded capabilities remain out of scope.

---

## 3. Existing Document Constraints

The current source documents already establish these constraints:

| Area                 | Source-Aligned Constraint                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Product shape        | Multi-tenant SaaS subscription product.                                                                    |
| Client               | Mobile-first Progressive Web App only.                                                                     |
| Offline mode         | Offline shell plus read-only recent-record cache only. No offline writes.                                  |
| Backend architecture | Modular monolith first.                                                                                    |
| API style            | REST over HTTPS, JSON, `/api/v1`, workflow action endpoints.                                               |
| Database             | PostgreSQL 16+ target.                                                                                     |
| Tenancy              | Shared database, shared schema, strict tenant isolation.                                                   |
| Data scoping         | Tenant-owned records require `tenant_id`; branch-specific records require `tenant_id` and `branch_id`.     |
| Inventory            | Ledger-first inventory with FIFO layers and FIFO reservation allocation.                                   |
| Financial records    | Issued invoices, payments, receipts, refunds, ledgers, and audit records are immutable or correction-only. |
| Critical writes      | Idempotency, transaction safety, optimistic locking or row locking required where applicable.              |
| Jobs                 | Retry-safe background processing and observable failures.                                                  |
| Files                | Private tenant-scoped storage with signed URLs.                                                            |
| Observability        | Structured logs, metrics, error monitoring, correlation IDs, background job visibility.                    |
| Deployment           | Containerized PWA/API/worker/scheduler services behind HTTPS.                                              |
| QA                   | Unit, integration, API contract, E2E, concurrency, security, performance, and operational validation.      |

---

## 4. Explicit Technology Non-Scope

The following must **not** be introduced by the technology stack:

| Excluded Area                         | Tech Stack Rule                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Native iOS or Android app             | Do not select native mobile frameworks as product clients.                                                        |
| Offline write sync                    | Do not introduce offline mutation queues, conflict resolution engines, or sync frameworks for operational writes. |
| Microservices-first architecture      | Do not split initial business workflows into distributed services.                                                |
| General ledger accounting             | Do not add accounting-ledger packages or accounting modules beyond documented reports/AP/AR behavior.             |
| Payment gateway subscription charging | Do not select a subscription charging provider as part of core GarageOS billing.                                  |
| Customer portal                       | Do not select customer identity/customer portal technology.                                                       |
| 2FA                                   | Do not add 2FA libraries or flows in this build scope.                                                            |
| AI/forecasting/BI                     | Do not add ML, predictive analytics, or custom BI platform scope.                                                 |

---

## 5. Multi-Agent Panel Brainstorm Summary

### 5.1 Business Owner

**Concern:** The stack must support SaaS monetization, plan limits, tenant lifecycle enforcement, exports, support access, and reliable production operations.

**Decision:** Use a conservative stack that minimizes infrastructure overhead while supporting subscription enforcement, tenant isolation, reporting, exports, and operational continuity.

### 5.2 Product Manager / BA

**Concern:** Technology choices must not change scope or create undocumented workflows.

**Decision:** Treat this document as an engineering baseline only. Product behavior remains governed by the PRD, API contracts, UX screen map, permission matrix, and QA plan.

### 5.3 SMEs

**Concern:** Shop workflows need reliability more than novelty: intake, job orders, inventory reservation, purchase receiving, invoices, payments, receipts, and reminders must work under real shop conditions.

**Decision:** Prefer robust transactional backend patterns, mobile-first UI, and retry-safe jobs over experimental architecture.

### 5.4 End Users

**Concern:** Mechanics, advisors, cashiers, inventory clerks, managers, and owners need fast mobile workflows on unstable shop networks.

**Decision:** Use a PWA stack with responsive UI, clear offline read-only behavior, optimistic UI only where safe, and no offline write submission.

### 5.5 Architect

**Concern:** The system has multi-record transactional workflows: inventory FIFO, invoice issuance, payment plus receipt, transfer receiving, purchase receiving, refunds, exports, and deletion jobs.

**Decision:** Build as a TypeScript modular monolith with PostgreSQL as the source of truth, database-backed jobs/outbox first, and strict module boundaries.

### 5.6 Senior Engineers

**Concern:** The query layer must not hide SQL semantics required for row locks, optimistic locking, FIFO allocation, idempotency, and report queries.

**Decision:** Use SQL-visible database tooling with a raw SQL escape hatch. Avoid ORM patterns that obscure transactions, locks, and tenant/branch scoping.

### 5.7 UX Designer

**Concern:** UI tooling must support mobile-first forms, role-aware navigation, validation states, offline banners, tenant-status banners, and accessible components.

**Decision:** Use React/Next.js with a utility-first design system approach and reusable form/action patterns.

### 5.8 QA

**Concern:** Stack must support deterministic test automation for business rules, API contracts, database constraints, concurrency, and E2E workflows.

**Decision:** Use a test stack that supports unit tests, API tests, Testcontainers-backed PostgreSQL integration tests, Playwright E2E, and CI enforcement.

### 5.9 Security

**Concern:** Tenant isolation, token safety, rate limits, support access, file privacy, sanitized logs, and dependency controls are high-risk.

**Decision:** Use secure password hashing, short-lived access tokens, rotating hashed refresh tokens, secure cookie strategy where feasible, private object storage, signed URLs, dependency scanning, and structured security logging without sensitive payloads.

### 5.10 DevOps

**Concern:** The stack must be easy to deploy, monitor, back up, restore, and operate.

**Decision:** Use Dockerized services, managed PostgreSQL where available, S3-compatible private object storage, structured logs, metrics, error monitoring, CI/CD, staging parity, and documented runbooks.

### 5.11 Project Manager

**Concern:** The stack must unblock Milestone 0 and prevent implementation inconsistency.

**Decision:** Approve the core stack before Milestone 1. Provider-level selections may remain ADRs if interfaces are defined and implementation is not blocked.

---

## 6. Clarification and Ambiguity Log

| ID     | Question                                                        | Raised By            | Answering Role            | Resolution                                                                                                                                                |
| ------ | --------------------------------------------------------------- | -------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-001 | Is the exact framework required by the product docs?            | Product Manager / BA | Architect                 | No. The source docs require PWA, REST, modular monolith, and PostgreSQL. Exact framework is an implementation decision.                                   |
| TS-002 | Should GarageOS start with microservices?                       | Architect            | Senior Engineers / DevOps | No. Modular monolith first is the approved architecture. Microservices are only a future consideration if production evidence justifies extraction.       |
| TS-003 | Should the stack include offline write support?                 | UX Designer          | Product Manager / BA      | No. Offline mode is read-only only.                                                                                                                       |
| TS-004 | Should the stack select automatic subscription payment tooling? | Business Owner       | Product Manager / BA      | No. Automated subscription collection is excluded; platform admins update subscriptions after external payment confirmation.                              |
| TS-005 | Should the ORM hide SQL and transactions?                       | Senior Engineers     | Database Architect        | No. The query layer must preserve SQL visibility and support explicit locks, transactions, and raw SQL where needed.                                      |
| TS-006 | Should external providers be finalized here?                    | DevOps               | Project Manager           | Not all providers need to be finalized here. This document defines provider categories and adapter requirements; exact vendors may be ADRs.               |
| TS-007 | Should PostgreSQL RLS be mandatory from day one?                | Security             | Architect                 | Use repository/service scoping from day one. RLS is recommended as defense-in-depth once policies are validated or earlier if the team has RLS expertise. |
| TS-008 | Should append-only triggers exist before production?            | QA                   | Senior Engineers          | Yes. Financial, inventory ledger, receipt, refund, and audit immutability should be protected before production launch.                                   |

---

## 7. Approved Core Stack

| Layer              | Approved Choice                                                                 | Status                            | Rationale                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Primary language   | TypeScript                                                                      | Approved                          | Shared language across PWA and backend improves maintainability, DTO consistency, and team velocity.                         |
| Frontend framework | Next.js with React                                                              | Approved                          | Aligns with mobile-first PWA, routing, caching, component reuse, and deployability.                                          |
| Frontend styling   | Tailwind CSS                                                                    | Approved                          | Supports fast responsive UI implementation and consistent mobile-first layouts.                                              |
| Component system   | shadcn/ui-style component foundation                                            | Approved                          | Provides accessible, composable UI primitives without locking product UX into a heavy framework.                             |
| Backend framework  | NestJS                                                                          | Approved                          | Strong fit for modular monolith, dependency injection, guards, pipes, interceptors, testing, and explicit module boundaries. |
| API style          | REST over HTTPS, JSON                                                           | Required by source docs           | Aligns with `api-contracts.md`.                                                                                              |
| Database           | PostgreSQL 16+                                                                  | Required by source docs           | Matches schema target and supports transactions, constraints, locks, JSONB, trigram search, FTS, and optional RLS.           |
| Query layer        | Kysely + node-postgres                                                          | Approved                          | SQL-visible, typed query builder with raw SQL escape hatch for locks, FIFO, reporting, and complex transactions.             |
| Migration tool     | Kysely migrations or node-pg-migrate                                            | Approved pending ADR finalization | Must be canonical, versioned, CI-validated, and compatible with raw SQL migrations.                                          |
| Runtime            | Node.js LTS                                                                     | Approved                          | Compatible with selected TypeScript frontend/backend ecosystem.                                                              |
| Package manager    | pnpm                                                                            | Approved                          | Efficient workspace dependency management for TypeScript monorepo.                                                           |
| Repository model   | Monorepo                                                                        | Approved                          | Supports shared types, DTOs, validation schemas, testing, and coordinated versioning.                                        |
| Background jobs    | PostgreSQL-backed jobs/outbox first                                             | Approved                          | Matches architecture, avoids unnecessary infrastructure, supports transactionally queued work and retry safety.              |
| File storage       | S3-compatible private object storage                                            | Approved                          | Supports tenant-scoped object paths, signed URLs, export packages, and lifecycle deletion.                                   |
| Cache              | Browser PWA cache first; server cache optional                                  | Approved                          | PostgreSQL remains source of truth; offline cache remains read-only.                                                         |
| Auth session model | Short-lived access token + rotating hashed refresh token                        | Required by source docs           | Supports session revocation, remember-me sessions, and token rotation.                                                       |
| Password hashing   | Argon2id preferred; bcrypt cost >= 12 fallback                                  | Approved                          | Aligns with PRD-approved hashing options.                                                                                    |
| API documentation  | OpenAPI generated or contract-maintained with CI checks                         | Approved pending ADR finalization | API contracts must remain synchronized with implementation.                                                                  |
| Testing            | Vitest/Jest, Supertest, Testcontainers, Playwright                              | Approved                          | Covers unit, API, integration, DB, concurrency, and E2E validation.                                                          |
| Deployment         | Docker containers                                                               | Approved                          | Aligns with architecture deployment units for PWA/API/worker/scheduler.                                                      |
| Observability      | Structured JSON logs, OpenTelemetry-compatible traces/metrics, error monitoring | Approved                          | Required for API, jobs, integrations, auth, authorization, exports, reminders, and inventory failures.                       |

---

## 8. Frontend Stack

### 8.1 Approved Frontend Technologies

| Concern         | Technology / Pattern                                                                    |
| --------------- | --------------------------------------------------------------------------------------- |
| Framework       | Next.js with React and TypeScript                                                       |
| Rendering model | App Router with server/client components used deliberately                              |
| Styling         | Tailwind CSS                                                                            |
| Components      | shadcn/ui-style reusable components built on accessible primitives                      |
| Forms           | React Hook Form or equivalent controlled form strategy                                  |
| Validation      | Shared schema validation where practical; API remains authoritative                     |
| Data fetching   | Typed API client over REST endpoints                                                    |
| PWA             | Web app manifest, service worker, cache strategy for shell and read-only recent records |
| Offline UX      | Offline indicator, read-only cache state, write actions blocked offline                 |
| E2E tests       | Playwright                                                                              |

### 8.2 Frontend Rules

1. UI must be mobile-first.
2. UI must respect permission-aware navigation, but backend authorization remains authoritative.
3. Tenant status banners must be represented for `grace_period`, `read_only`, `suspended`, and pending deletion states where applicable.
4. Offline mode must never submit operational writes.
5. Workflow actions must call explicit API action endpoints, not arbitrary status updates.
6. UI must expose validation, conflict, idempotency replay, blocked-action, and correlation ID states where applicable.
7. Screens must map to documented UX screen groups only.

---

## 9. Backend Stack

### 9.1 Approved Backend Technologies

| Concern         | Technology / Pattern                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| Framework       | NestJS                                                                                                          |
| Language        | TypeScript                                                                                                      |
| Architecture    | Modular monolith                                                                                                |
| API             | REST controllers under `/api/v1`                                                                                |
| Validation      | Zod or NestJS validation pipeline; final choice by ADR                                                          |
| Authorization   | Guards and policies for auth, email verification, tenant status, support access, permissions, and branch access |
| Transactions    | Explicit transaction wrapper around command handlers                                                            |
| Domain behavior | Command services for writes; query services for reads                                                           |
| Idempotency     | Shared idempotency service for critical write endpoints                                                         |
| Audit           | Shared audit service used by critical commands                                                                  |
| Outbox          | Transactional outbox/job enqueueing inside database transactions                                                |
| Errors          | Centralized exception filters with documented API error envelopes                                               |
| Logging         | Structured logs with request ID, correlation ID, tenant/user context when safe                                  |

### 9.2 Backend Module Structure

```text
apps/
  web/                  # Next.js PWA
  api/                  # NestJS API service
  worker/               # Background worker process
  scheduler/            # Periodic job enqueueing process
packages/
  config/               # Shared config loading and validation
  db/                   # Kysely database client, migrations, generated DB types
  contracts/            # Shared API DTOs/types where safe
  validation/           # Shared validation schemas if selected
  observability/        # Logging/tracing helpers
  test-utils/           # Fixtures, factories, Testcontainers helpers
```

Backend module convention:

```text
modules/
  <module>/
    api/                # Controllers, DTOs, request/response mapping
    application/        # Commands, queries, transaction orchestration
    domain/             # Business rules, state machines, calculations
    persistence/        # Repositories and SQL mappings
    policies/           # Permission and branch/tenant access checks
    events/             # Outbox events and handlers
    tests/              # Unit and integration tests
```

### 9.3 Backend Rules

1. All tenant operations must resolve tenant context from the authenticated session, not client-provided `tenant_id`.
2. All branch-specific operations must enforce branch assignment or tenant-wide branch access.
3. Tenant status guard runs before business validation for operational writes.
4. Critical writes require explicit transaction boundaries.
5. Financial, inventory, billing, deletion, and export operations must use idempotency where documented.
6. Issued financial records, receipts, refunds, inventory ledgers, FIFO records, and audit logs must be immutable or correction-only.
7. Cross-module access must go through application services or domain events, not direct mutation of another module's tables.
8. Background side effects must be queued safely through jobs/outbox, not performed unreliably inside request lifecycle when retry safety matters.

---

## 10. Database and Persistence Stack

### 10.1 Approved Database Technologies

| Concern          | Technology / Pattern                                                                 |
| ---------------- | ------------------------------------------------------------------------------------ |
| Primary database | PostgreSQL 16+                                                                       |
| Query builder    | Kysely                                                                               |
| Driver           | node-postgres (`pg`)                                                                 |
| Migrations       | Kysely migrations or node-pg-migrate; final ADR required                             |
| IDs              | UUID primary keys; UUIDv7 preferred                                                  |
| Money            | `numeric(14,2)`                                                                      |
| Quantity         | `numeric(14,3)`                                                                      |
| Time             | `timestamptz` for events, `date` for tenant-timezone business dates                  |
| Search           | PostgreSQL trigram/full-text search where documented                                 |
| Tenant isolation | Repository scoping from day one; optional RLS defense-in-depth                       |
| Locking          | Row-level locks and optimistic locking for critical write paths                      |
| Immutability     | Append-only/correction-only tables, plus triggers before production where applicable |

### 10.2 Required PostgreSQL Extensions

```sql
create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists pgcrypto;
```

Optional:

```sql
create extension if not exists citext;
```

### 10.3 Database Rules

1. Every tenant-owned business table must include `tenant_id`.
2. Every branch-specific operational table must include `tenant_id` and `branch_id`.
3. Tenant-scoped unique constraints must include tenant context.
4. Document numbers must be tenant-scoped and never reused.
5. Stock-changing operations must create immutable inventory ledger entries.
6. FIFO layers and FIFO reservation allocations must be first-class persistence concerns.
7. Financial records must not be directly edited after issuance/posting.
8. Critical writes must use idempotency keys where documented.
9. Migrations must be version-controlled and CI-validated.
10. Seed scripts must be idempotent.

---

## 11. API, Contracts, and Validation Stack

| Concern            | Decision                                                          |
| ------------------ | ----------------------------------------------------------------- |
| API protocol       | REST over HTTPS                                                   |
| Base path          | `/api/v1`                                                         |
| Payload format     | JSON                                                              |
| Field style        | `snake_case` for API fields and enum values                       |
| API docs           | OpenAPI generated or maintained from contract; final ADR required |
| Error handling     | Centralized error envelope matching API contracts                 |
| Pagination         | Cursor pagination for high-volume lists                           |
| Idempotency        | `Idempotency-Key` header for critical writes                      |
| Correlation        | `X-Correlation-ID` accepted; server generates if missing          |
| Optimistic locking | `lock_version` or `If-Match` convention where documented          |

API implementation must preserve:

1. Stable request/response envelopes.
2. Stable machine-readable error codes.
3. Explicit workflow action endpoints.
4. Tenant context derived from session.
5. Platform admin routes under `/platform/*`.
6. Support access session context for audited support workflows.
7. No endpoints for excluded product capabilities.

---

## 12. Authentication and Security Stack

| Concern             | Decision                                                                           |
| ------------------- | ---------------------------------------------------------------------------------- |
| Password hashing    | Argon2id preferred; bcrypt cost >= 12 fallback                                     |
| Access tokens       | Short-lived bearer tokens expiring within documented limit                         |
| Refresh tokens      | Rotating refresh tokens stored hashed server-side                                  |
| Refresh storage     | Secure HTTP-only cookie preferred where deployment allows                          |
| Session revocation  | Server-side refresh session revocation table                                       |
| Login protection    | Rate limiting per account and IP                                                   |
| Password reset      | Single-use hashed reset tokens with expiry                                         |
| Email verification  | Single-use hashed verification tokens with expiry                                  |
| Secrets             | Environment-managed secrets; no committed secrets                                  |
| Dependency security | Dependency scanning in CI                                                          |
| File access         | Private objects and signed URLs only                                               |
| Logging             | No plaintext passwords, tokens, provider secrets, sensitive payloads, or card data |

Security implementation must support:

1. Tenant isolation.
2. Branch access enforcement.
3. Additive RBAC.
4. Tenant lifecycle gates.
5. Plan gates.
6. Audited platform support access.
7. Sensitive-data redaction.
8. Rate limits on public and sensitive endpoints.
9. Centralized authorization denial logs without leaking secrets.

---

## 13. Background Jobs and Asynchronous Processing

### 13.1 Approved Initial Strategy

Use PostgreSQL-backed jobs and transactional outbox first.

### 13.2 Rationale

This aligns with the modular monolith and PostgreSQL-first architecture, keeps infrastructure simple, and allows critical side effects to be queued transactionally with the business operation that caused them.

### 13.3 Job Categories

| Job Category     | Examples                                                                           |
| ---------------- | ---------------------------------------------------------------------------------- |
| Tenant lifecycle | Subscription lifecycle evaluation, deletion warnings, tenant deletion jobs         |
| Notifications    | Email, SMS, push, internal notifications, reminders                                |
| Exports          | Tenant export generation, attachment packaging, report exports                     |
| Files            | Retention, deletion, quarantine/malware status handling where provider supports it |
| Reports          | Snapshot refreshes and read-model rebuilds                                         |
| Reconciliation   | Inventory, financial, AP/AR, export, and job consistency checks                    |

### 13.4 Job Rules

1. Jobs must have visible status, attempts, timestamps, and safe error summaries.
2. Jobs must not duplicate irreversible side effects on retry.
3. Provider delivery attempts must be recorded where documented.
4. Dead-lettered jobs must be observable.
5. Job failures must produce logs/metrics/alerts for critical workflows.
6. Scheduler and worker must run as separate deployment units from the API.

---

## 14. Files, Storage, and Exports

| Concern            | Decision                                                                   |
| ------------------ | -------------------------------------------------------------------------- |
| Storage model      | Private S3-compatible object storage                                       |
| Access model       | Signed upload/download URLs                                                |
| Path strategy      | Tenant-scoped object paths                                                 |
| Public access      | No permanent public tenant file URLs                                       |
| Export packaging   | Background job-generated packages with manifests                           |
| Retention/deletion | Lifecycle rules aligned to tenant deletion and file retention requirements |
| Malware scanning   | Provider or adapter decision pending ADR                                   |

Rules:

1. File metadata must remain tenant-scoped.
2. Branch-specific file visibility must follow branch access where linked to branch-specific records.
3. Export generation must be asynchronous for large packages.
4. Export downloads must enforce tenant status, role, and owner/platform access rules.
5. Tenant deletion must delete eligible tenant-owned files according to retention rules.

---

## 15. Observability and Operations Stack

| Concern          | Decision                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Logs             | Structured JSON logs                                                                                  |
| Request tracing  | Request ID and correlation ID on all API responses                                                    |
| Tracing/metrics  | OpenTelemetry-compatible instrumentation                                                              |
| Error monitoring | External error-monitoring provider via adapter/SDK                                                    |
| Alerts           | Provider-configured alerts for critical failures                                                      |
| Dashboards       | API latency/error rate, job failures, DB pool, provider failures, exports, inventory/payment failures |
| Backups          | Managed encrypted PostgreSQL backups plus object storage encryption                                   |
| Restore testing  | Quarterly restore testing target                                                                      |
| DR targets       | RPO 24 hours, RTO 4 hours                                                                             |

Observability must cover:

1. API latency and error rates.
2. Background job failures and retries.
3. Auth failures and authorization denials.
4. Inventory transaction failures.
5. Payment/receipt/refund failures.
6. Notification provider failures.
7. Export job duration and failures.
8. Database pool saturation.
9. Backup failures.
10. Sustained P95/P99 latency breaches.

---

## 16. Testing Stack

| Test Layer        | Recommended Tooling                            | Coverage                                                                                    |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Unit tests        | Vitest or Jest                                 | Domain rules, calculations, status transitions, permission resolution, tax, FIFO math.      |
| API tests         | Supertest or equivalent                        | API envelopes, auth, validation, idempotency, errors, permissions, branch access.           |
| Integration tests | Testcontainers PostgreSQL                      | Repositories, transactions, constraints, locks, idempotency, rollback behavior.             |
| E2E tests         | Playwright                                     | Mobile-first workflows, onboarding, job order, inventory, invoice, payment, receipt.        |
| Concurrency tests | Custom integration tests with parallel workers | FIFO allocation, document numbering, payment/refund overrun prevention, purchase receiving. |
| Migration tests   | CI migration validation                        | Empty database migration, seed idempotency, schema contract checks.                         |
| Security tests    | Automated checks plus review checklists        | Tenant isolation, token handling, rate limits, file access, support access, sensitive logs. |
| Performance tests | Scenario-based load tests                      | Search, reports, dashboards, ledger lists, exports, high-volume API endpoints.              |

Testing rules:

1. No milestone exits without relevant API, database, frontend, blocked-path, audit, idempotency, and observability tests.
2. Critical transactional workflows require rollback and concurrency tests.
3. API contracts must be traceable to `api-contracts.md`.
4. E2E tests must include mobile viewport coverage.
5. Offline mode tests must confirm writes are blocked.

---

## 17. DevOps and Deployment Stack

| Concern           | Decision                                                               |
| ----------------- | ---------------------------------------------------------------------- |
| Containerization  | Docker                                                                 |
| Local development | Docker Compose or equivalent local stack                               |
| Environments      | local, development, staging, production                                |
| Deployment units  | PWA static app, API service, worker service, scheduler service         |
| Database          | PostgreSQL managed service preferred in hosted environments            |
| Object storage    | S3-compatible managed private storage                                  |
| CI checks         | lint, typecheck, unit tests, migration validation, dependency scanning |
| CD                | Provider-specific deployment pipeline pending ADR                      |
| Secrets           | Environment/secret-manager based, never committed                      |
| Runbooks          | Backup/restore, incident response, deployment rollback, support access |

Deployment rules:

1. Production must run behind HTTPS.
2. API, worker, and scheduler must be independently deployable/scalable containers.
3. Staging must be close enough to production for migrations, workers, storage, exports, provider sandbox tests, and observability validation.
4. Production migrations must be forward-only.
5. Destructive migrations require backup and rollout plan.
6. Launch must include smoke tests, monitoring, provider configuration, backup validation, and rollback plan.

---

## 18. Monorepo and Tooling Standards

### 18.1 Recommended Repository Layout

```text
garageos/
  apps/
    web/
    api/
    worker/
    scheduler/
  packages/
    contracts/
    db/
    config/
    validation/
    observability/
    test-utils/
  docs/
    adr/
    architecture.md
    api-contracts.md
    tech-stack.md
  infra/
    docker/
    scripts/
  .github/
    workflows/
```

### 18.2 Engineering Tooling

| Concern                | Decision                                              |
| ---------------------- | ----------------------------------------------------- |
| Package manager        | pnpm workspaces                                       |
| Formatting             | Prettier                                              |
| Linting                | ESLint                                                |
| Type checks            | TypeScript strict mode                                |
| Commit hooks           | Optional local hooks; CI remains authoritative        |
| Environment validation | Typed config schema at service startup                |
| Code generation        | DB/API type generation where useful and CI-controlled |
| Documentation          | Markdown docs plus ADRs for decisions                 |

---

## 19. Required ADRs

The following ADRs should be created or finalized before Milestone 1 begins unless marked as provider-level and non-blocking.

| ADR                                   | Required Before   | Decision Needed                              | Recommended Default                                                                 |
| ------------------------------------- | ----------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| ADR-0001 Frontend Framework           | Milestone 1       | Confirm Next.js/React choice                 | Next.js + React + TypeScript                                                        |
| ADR-0002 Backend Framework            | Milestone 1       | Confirm backend framework                    | NestJS + TypeScript                                                                 |
| ADR-0003 Database Query Layer         | Milestone 1       | Confirm query layer                          | Kysely + node-postgres                                                              |
| ADR-0004 Migration Tool               | Milestone 1       | Choose canonical migration tool              | Kysely migrations or node-pg-migrate                                                |
| ADR-0005 Validation Strategy          | Milestone 2       | Zod vs NestJS class-validator                | Zod if shared schemas are prioritized; class-validator if Nest conventions dominate |
| ADR-0006 Token Storage Strategy       | Milestone 2       | Secure cookie vs memory bearer pattern       | Secure HTTP-only refresh cookie preferred                                           |
| ADR-0007 RLS Timing                   | Before production | RLS from day one vs later hardening          | Repository scoping day one; RLS after policy validation unless team is experienced  |
| ADR-0008 Append-Only Trigger Strategy | Before production | Which immutable tables get triggers and when | Enable before production for financial/audit/ledger tables                          |
| ADR-0009 Background Job Locking       | Milestone 2/3     | Database locking algorithm                   | PostgreSQL row locking with `FOR UPDATE SKIP LOCKED` pattern                        |
| ADR-0010 OpenAPI Strategy             | Milestone 2       | Generate vs manually maintain                | Generate or CI-validate against contracts                                           |
| ADR-0011 Object Storage Provider      | Milestone 11      | Exact provider                               | Any S3-compatible private provider satisfying security and deletion needs           |
| ADR-0012 Email Provider               | Milestone 10      | Exact provider                               | Provider with reliable transactional email and sandbox support                      |
| ADR-0013 SMS Provider                 | Milestone 10      | Exact provider                               | Provider supporting target market delivery requirements                             |
| ADR-0014 Error Monitoring Provider    | Milestone 2/13    | Exact provider                               | Provider with source maps, backend errors, jobs, and alerting                       |
| ADR-0015 Report Read Model Strategy   | Milestone 12      | Refresh approach                             | Rebuildable PostgreSQL read models with async refresh for heavy reports             |
| ADR-0016 Malware Scanning Strategy    | Milestone 11/13   | Provider/adaptor choice                      | Adapter-based provider selection                                                    |

---

## 20. Decision Matrix

| Option Area          | Considered Options                          | Preferred                     | Reason                                                                   |
| -------------------- | ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| Backend architecture | Modular monolith, microservices             | Modular monolith              | Required workflows need atomic multi-table transactions.                 |
| Backend language     | TypeScript, Go, Java, C#                    | TypeScript                    | Aligns with frontend, reduces context switching, fits chosen frameworks. |
| Query layer          | Heavy ORM, Kysely, Drizzle, raw SQL only    | Kysely + raw SQL escape hatch | Balances type safety with SQL visibility.                                |
| Job queue            | PostgreSQL jobs, Redis queue, managed queue | PostgreSQL first              | Lower operational complexity and transactionally aligned outbox.         |
| File storage         | Public URLs, private object storage         | Private S3-compatible storage | Required tenant privacy and signed URL access.                           |
| Cache                | Server cache first, browser cache first     | Browser PWA cache first       | Offline scope is read-only; PostgreSQL remains source of truth.          |
| API style            | REST, GraphQL, RPC                          | REST                          | Matches existing API contracts.                                          |
| Deployment           | Containers, serverless-only, VM-only        | Containers                    | Matches web/API/worker/scheduler deployment units.                       |

---

## 21. Acceptance Criteria

This tech stack is acceptable only if:

1. It preserves the mobile-first PWA requirement.
2. It preserves the modular monolith architecture.
3. It preserves PostgreSQL 16+ as the transactional source of truth.
4. It supports strict tenant and branch scoping.
5. It supports workflow-safe REST APIs under `/api/v1`.
6. It supports idempotent critical writes.
7. It supports row locks or optimistic locking for high-risk transactions.
8. It supports immutable or correction-only financial, receipt, refund, ledger, and audit records.
9. It supports database-backed jobs/outbox first.
10. It supports private tenant-scoped file storage and signed URLs.
11. It supports offline shell and read-only recent-record cache without offline writes.
12. It supports contract, integration, E2E, security, concurrency, and operational testing.
13. It supports structured logs, correlation IDs, metrics, errors, and alerting.
14. It does not introduce excluded capabilities.
15. ADRs exist for unresolved provider/tooling choices before affected milestones start.

---

## 22. Implementation Readiness Checklist

Before development proceeds beyond Milestone 0:

- [ ] `tech-stack.md` reviewed and approved by Product, Engineering, QA, Security, DevOps, and Project Manager.
- [ ] ADR directory created.
- [ ] ADRs created for frontend, backend, query layer, migration tool, token strategy, job locking, and OpenAPI strategy.
- [ ] Monorepo initialized.
- [ ] TypeScript strict mode enabled.
- [ ] Linting and formatting configured.
- [ ] CI runs lint, typecheck, unit tests, dependency scanning, and migration validation placeholder.
- [ ] Local Docker Compose or equivalent development environment created.
- [ ] `.env.example` created with no real secrets.
- [ ] Database migration baseline created.
- [ ] API response/error envelope helpers created.
- [ ] Observability logging context baseline created.
- [ ] Testing strategy baseline implemented.

---

## 23. Risks and Mitigations

| Risk                                       | Impact                                                              | Mitigation                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Query abstraction hides locks/transactions | Inventory, FIFO, invoices, payments, and refunds may become unsafe. | Use Kysely/node-postgres with raw SQL escape hatch and integration/concurrency tests.                  |
| Provider choices delay feature work        | Notifications, exports, storage, and monitoring may slip.           | Define provider adapters early and finalize vendors before affected milestones.                        |
| RLS added too late or incorrectly          | False confidence or tenant isolation gaps.                          | Enforce repository scoping from day one; add RLS as tested defense-in-depth.                           |
| Background jobs duplicate side effects     | Duplicate notifications, exports, payments, or deletion actions.    | Use idempotent jobs, outbox, attempt tracking, locks, and dead-letter visibility.                      |
| Over-engineering                           | Delays foundations and core workflows.                              | Keep stack conservative and aligned to documented requirements.                                        |
| Under-testing concurrency                  | Financial or inventory corruption.                                  | Add concurrency tests early for document numbering, FIFO, payments, refunds, transfers, and receiving. |
| UI assumes permissions are enough          | Tenant status or branch access may be bypassed.                     | Backend guards remain authoritative; frontend only improves UX.                                        |
| Inconsistent API/DTO/schema enums          | Contract drift and QA failures.                                     | Generate or validate API types and DB enum/check constraints in CI.                                    |

---

## 24. Final Panel Recommendation

The panel recommends approving the following GarageOS technology baseline:

```text
TypeScript monorepo
Next.js + React mobile-first PWA
Tailwind CSS + shadcn/ui-style component foundation
NestJS TypeScript modular monolith backend
REST over HTTPS under /api/v1
PostgreSQL 16+ transactional source of truth
Kysely + node-postgres query layer
Versioned SQL-compatible migrations
PostgreSQL-backed jobs/outbox first
Private S3-compatible object storage with signed URLs
Short-lived access tokens plus rotating hashed refresh tokens
Argon2id password hashing preferred
Dockerized PWA/API/worker/scheduler deployment units
Structured JSON logs, correlation IDs, metrics, error monitoring, and alerts
Vitest/Jest, Supertest, Testcontainers PostgreSQL, and Playwright testing stack
```

This stack is intentionally conservative. It supports the documented GarageOS requirements without introducing excluded scope, unnecessary distributed-system complexity, or premature infrastructure dependencies.

Provider-specific selections for object storage, email, SMS, analytics, error monitoring, malware scanning, and deployment hosting should be finalized through ADRs before their affected milestones begin.
