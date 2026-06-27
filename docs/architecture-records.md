# GarageOS Architecture Records / ADR Package

**Document:** `architecture-records.md`  
**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Status:** Build-ready architecture decision baseline  
**Scope Mode:** Implementation decision baseline only; not product-scope expansion

---

## 1. Purpose

This document preserves the accepted GarageOS architecture decisions in a compact form for low-token planning, implementation handoffs, and review.

It records implementation decisions, constraints, trade-offs, validation requirements, and follow-ups. It does **not** add product modules, roles, permissions, workflows, integrations, or future scope.

---

## 2. Source-of-Truth Order

1. `requirements.md`
2. `database-design.md`
3. `database-schema.md`
4. `architecture.md`
5. `api-contracts.md`
6. Supporting docs: QA plan, RTM, roadmap, tech stack, permission matrix, UX screen map, user stories

If this ARD package conflicts with PRD, schema, architecture, or API contracts, the source document wins and this ARD must be revised.

---

## 3. Non-Scope Guardrails

Do **not** introduce:

- Native iOS/Android apps.
- Offline write queues, sync conflict resolution, or offline operational transactions.
- Microservices-first implementation.
- General ledger, chart of accounts, journal entries, bank reconciliation, or formal accounting close.
- Payroll, commissions, payslips, or government payroll contribution workflows.
- Direct BIR/tax authority filing.
- E-commerce marketplace, public checkout, delivery, or customer portal.
- Loyalty program, service packages, AI forecasting, or custom BI beyond defined reports.
- Automated subscription payment collection through a payment gateway.
- Standalone retail POS/cart checkout independent of job orders/service invoices.
- Two-factor authentication.

---

## 4. Decision Inventory

| ID       | Decision                                                          | Status                                    | Required Before                                |
| -------- | ----------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| ARD-0001 | Architecture record governance                                    | Accepted                                  | Milestone 1                                    |
| ARD-0002 | TypeScript monorepo with `pnpm` workspaces                        | Accepted                                  | Milestone 1                                    |
| ARD-0003 | Next.js React TypeScript PWA with read-only offline cache         | Accepted                                  | Milestone 1                                    |
| ARD-0004 | Tailwind CSS + shadcn/ui-style design system                      | Accepted                                  | Milestone 1                                    |
| ARD-0005 | NestJS TypeScript modular monolith                                | Accepted                                  | Milestone 1                                    |
| ARD-0006 | REST `/api/v1`, `snake_case`, workflow action endpoints           | Accepted                                  | Milestone 1                                    |
| ARD-0007 | Zod DTO validation plus service-layer business validation         | Accepted                                  | Milestone 1                                    |
| ARD-0008 | Kysely + `node-postgres` SQL-visible query layer                  | Accepted                                  | Milestone 1                                    |
| ARD-0009 | `node-pg-migrate` migrations and drift control                    | Accepted                                  | Milestone 1                                    |
| ARD-0010 | `text` + named `CHECK` constraints for enums                      | Accepted                                  | Milestone 1                                    |
| ARD-0011 | UUIDv7 primary IDs; tenant-scoped document numbers                | Accepted                                  | Milestone 1                                    |
| ARD-0012 | Layered tenant/branch isolation; RLS before production where safe | Accepted                                  | Milestone 1                                    |
| ARD-0013 | In-memory access token + rotating HttpOnly refresh cookie         | Accepted                                  | Milestone 2                                    |
| ARD-0014 | Shared idempotency service + optimistic/row locking               | Accepted                                  | Milestone 2                                    |
| ARD-0015 | App-level immutability first; DB triggers before launch           | Accepted                                  | Milestone 1 baseline; harden before launch     |
| ARD-0016 | PostgreSQL-backed jobs/outbox with `SKIP LOCKED`                  | Accepted                                  | Milestone 2                                    |
| ARD-0017 | PostgreSQL rebuildable report/search read models                  | Accepted                                  | Milestone 6 baseline; full before Milestone 12 |
| ARD-0018 | Private S3-compatible object storage + signed URLs                | Accepted                                  | Milestone 11                                   |
| ARD-0019 | Provider adapters; vendor selection deferred                      | Accepted with provider selection deferred | Milestone 10/13                                |
| ARD-0020 | No Redis/server cache initially; PostgreSQL remains authoritative | Accepted                                  | Milestone 1                                    |
| ARD-0021 | Partition-ready append-only tables; partition after thresholds    | Accepted                                  | Milestone 13 hardening                         |
| ARD-0022 | Generate OpenAPI and enforce contract drift control               | Accepted                                  | Milestone 2                                    |
| ARD-0023 | Dockerized PWA/API/worker/scheduler + CI/CD                       | Accepted                                  | Milestone 1                                    |
| ARD-0024 | Observability, backups, restore tests, RPO/RTO                    | Accepted                                  | Milestone 13                                   |

---

## 5. Accepted Architecture Records

### ARD-0001 — Architecture Record Governance

**Decision:** Maintain `/docs/adr/` using this structure:

```text
# ARD-XXXX — Title
Status:
Date:
Decision Owner:
Source Alignment:
Context:
Decision:
Consequences:
Validation:
Risks:
Follow-ups:
```

Accepted ARDs are binding implementation guidance unless superseded. Product behavior remains governed by source docs.

**Validation:** High-impact changes reference ARDs. Feature tickets include PRD, RTM, API, schema, permission, UX, QA, and ARD references where applicable.

---

### ARD-0002 — Repository Model and TypeScript Workspace

**Decision:** Use a TypeScript monorepo managed with `pnpm` workspaces.

```text
apps/
  web/
  api/
  worker/
  scheduler/
packages/
  shared/
  api-client/
  config/
  test-utils/
docs/
  adr/
  runbooks/
  api/
```

Shared packages contain primitives, contracts, test helpers, and config only. Do not couple frontend to backend internals.

**Validation:** CI runs install, lint, typecheck, unit tests, and migration validation. No circular package dependencies.

---

### ARD-0003 — Frontend Framework and PWA Strategy

**Decision:** Use Next.js, React, and TypeScript. Implement manifest, service worker, app-shell caching, and user-scoped read-only recent-record cache.

Offline mode must:

- Show an offline indicator.
- Allow only app shell and recently viewed read-only records.
- Block writes, approvals, uploads, payments, inventory actions, and sync behavior.
- Clear user cache on logout/session invalidation.

**Validation:** Playwright covers shell loading, offline indicator, blocked offline writes, cache clearing, and 360px mobile workflows.

---

### ARD-0004 — UX Design System Strategy

**Decision:** Use Tailwind CSS with shadcn/ui-style accessible primitives. Start with low-fidelity wireframes for high-frequency workflows.

Baseline patterns:

- Mobile navigation shell.
- Tenant status banners.
- Branch selector/indicator.
- Permission-aware action states.
- Offline read-only indicator.
- Workflow confirmation modals.
- Reason fields for audited/corrective actions.
- Form validation and conflict states.
- Background job status components.

**Validation:** Screens map only to documented route groups. QA covers permission, lifecycle, offline, empty, loading, validation, and conflict states.

---

### ARD-0005 — Backend Framework and Modular Monolith

**Decision:** Use NestJS with TypeScript as a modular monolith.

```text
module/
  api/
  application/
  domain/
  persistence/
  policies/
  events/
  tests/
```

Modules communicate through application services and domain events/outbox records, not direct cross-module table mutation.

**Validation:** Enforce module boundaries by review or dependency linting. Critical commands use explicit transactions. Integration tests verify rollback across multi-table workflows.

---

### ARD-0006 — REST API Contract, Naming, and DTO Style

**Decision:** Use REST under `/api/v1`, JSON envelopes, `snake_case` payloads, stable enum values, and explicit workflow action endpoints.

Examples:

```text
POST /invoices/{id}/issue
POST /invoices/{id}/payments
POST /payments/{id}/refunds
POST /inventory-transfers/{id}/send
POST /inventory-transfers/{id}/receive
```

Do not allow arbitrary status PATCHing for state machines.

**Validation:** Contract tests verify envelopes, status codes, error codes, correlation IDs, idempotency headers, pagination, and `snake_case`.

---

### ARD-0007 — Validation Strategy

**Decision:** Use Zod schemas for request validation and shared schema-derived types where practical. Keep DTO validation separate from business-rule validation.

Validation order:

1. DTO/schema validation.
2. Auth, tenant, branch, status, plan guards.
3. Command-service business validation.
4. Database constraints as final protection.

**Validation:** Contract tests assert `422 validation_failed` and field-level errors. Domain tests cover inventory insufficiency, overpayment, over-refund, and invalid transitions.

---

### ARD-0008 — SQL-Visible Query Layer

**Decision:** Use Kysely with `node-postgres`. Keep raw SQL escape hatch for locks, CTEs, reports, migration fixes, and performance-critical paths.

Repository rules:

- Tenant-owned queries require `tenant_id`.
- Branch-specific queries require `tenant_id` and `branch_id`.
- Critical commands run in explicit transactions.
- Row locks and optimistic locks must be visible in repository code.

**Validation:** Integration tests run against real PostgreSQL. Concurrency tests prove no over-reservation, overpayment, overbilling, duplicate receipts, or duplicate numbers.

---

### ARD-0009 — Migration Tool and Schema Drift Control

**Decision:** Use `node-pg-migrate`. Raw SQL migrations are allowed for constraints, indexes, triggers, RLS, and PostgreSQL-specific features.

Rules:

- Production migrations are forward-only.
- Seed scripts are idempotent.
- Destructive changes require backup and rollout plan.
- CI validates migrations against a clean PostgreSQL database.

**Validation:** CI applies all migrations from zero to latest and verifies schema snapshot/drift expectations.

---

### ARD-0010 — Database Enum Strategy

**Decision:** Use `text` columns with named `CHECK` constraints for business status/workflow enums in the initial build.

Rules:

- Values match documented lowercase API/schema enums.
- Constraints are migration-controlled.
- Shared TypeScript enum/const definitions stay aligned with API DTOs and schema source.

**Validation:** Schema tests reject invalid enum values. API tests accept/return only documented values. Drift checks compare DTO enums to migration constraints.

---

### ARD-0011 — Identifier Strategy

**Decision:** Use UUIDv7 stored in PostgreSQL `uuid` columns for primary IDs. Generate authoritative IDs server-side. Use separate tenant-scoped business document numbers protected by unique constraints and transaction locks.

**Validation:** Unit tests verify UUID format. DB constraints verify UUID columns and document-number uniqueness. Concurrency tests verify document numbers are never duplicated or reused.

---

### ARD-0012 — Tenant/Branch Isolation and RLS Timing

**Decision:** Enforce layered isolation from day one:

1. Session-derived tenant context.
2. Tenant status guard.
3. Permission guard.
4. Branch access guard.
5. Repository methods requiring tenant/branch scope.
6. Database FKs, indexes, and constraints.
7. PostgreSQL RLS after repository policies stabilize, before production launch for high-risk tables where safe.

RLS is defense-in-depth, not the only isolation layer.

**Validation:** Cross-tenant and branch-access tests cover customers, motorcycles, products, invoices, reports, files, and exports. RLS fixtures run in staging before production enablement.

---

### ARD-0013 — PWA Token Transport and Session Security

**Decision:** Use short-lived access tokens held in memory by default, plus rotating refresh tokens in `HttpOnly`, `Secure`, `SameSite=Lax` cookies for same-site deployments.

Rules:

- Store refresh tokens as hashes.
- Add CSRF protection for refresh/logout flows when cookies are used.
- Revoke refresh sessions on logout-all, deactivation, and admin password reset.
- Revisit cookie/CSRF settings if app/API become cross-site before production.

**Validation:** Security tests cover token rotation, reuse detection, revocation, deactivated-user lockout, password-reset revocation, expiry, and no tokens in logs.

---

### ARD-0014 — Idempotency and Optimistic Locking

**Decision:** Implement shared idempotency for duplicate-sensitive critical writes.

Idempotency scope:

- Tenant.
- User.
- Endpoint/action.
- Request intent hash.
- Idempotency key hash.

Use `lock_version` optimistic locking for mutable records. Use row locks for high-contention financial/inventory commands. Initial `If-Match` may use raw `lock_version`; ETag can be added later.

**Validation:** Tests verify same-key/same-intent replay, same-key/different-intent conflict, and concurrency safety for payments, refunds, billing, inventory, FIFO, receipts, and exports.

---

### ARD-0015 — Append-Only Immutability Protections

**Decision:** Protect immutable records in two layers:

1. Application level from first implementation: no update/delete paths for immutable records.
2. Database triggers before production launch: block updates/deletes except documented correction/status fields.

Critical immutable areas include audit logs, receipts, issued invoice records/lines where applicable, payments, refunds, inventory ledger entries, FIFO records, and side-effect history.

**Validation:** Schema tests attempt blocked updates/deletes. API tests verify corrections create allowed records/status changes instead of mutating issued records.

---

### ARD-0016 — Background Job Locking and Outbox Processing

**Decision:** Use PostgreSQL-backed `background_jobs` and `outbox_events`.

Worker claim query:

```sql
select *
from background_jobs
where status = 'queued'
  and run_at <= now()
order by priority desc, run_at asc, created_at asc
for update skip locked
limit :batch_size;
```

Rules:

- Workers claim jobs inside transactions.
- Jobs track attempts, max attempts, last error, next retry, and dead-letter state.
- Irreversible side effects need provider idempotency keys or internal side-effect records.
- Jobs emit structured logs, metrics, and alerts.

**Validation:** Worker tests verify no duplicate claims, safe retries, dead-letter behavior, job status visibility, and alerting.

---

### ARD-0017 — Reporting/Search Read Model Refresh Strategy

**Decision:** Use PostgreSQL-backed rebuildable read models.

Initial approach:

- Search documents maintained by transactional events/outbox where practical.
- Dashboard snapshots refreshed by jobs.
- Report summaries maintained by scheduled or event-driven refresh.
- Transactional source tables remain authoritative.
- Large exports run asynchronously.

**Validation:** Report formula tests compare read models to source tables. Rebuild jobs regenerate read models. Performance tests cover dashboard, search, ledger pagination, reports, and exports.

---

### ARD-0018 — File Upload, Download, and Object Storage

**Decision:** Use private S3-compatible object storage with direct signed upload/download URLs.

Flow:

1. Client requests upload intent.
2. API validates tenant, branch, permission, status, plan restrictions, file type, and size.
3. API creates metadata.
4. API returns short-lived signed upload URL.
5. API/worker finalizes metadata after confirmation.
6. Downloads require API authorization before signed URL generation.

Provider choice remains operational as long as private buckets, signed URLs, lifecycle policies, and export packages are supported.

**Validation:** Security tests block unauthorized signed URLs. Upload tests block read-only/suspended/offline uploads. Export/deletion tests verify file lifecycle rules.

---

### ARD-0019 — External Provider Adapter Strategy

**Decision:** Implement vendor-neutral adapters:

```text
EmailProvider
SmsProvider
PushProvider
AnalyticsProvider
ErrorMonitoringProvider
StorageProvider
MalwareScanProvider optional/deferred
```

Vendor selection is deferred to environment/cost/compliance review. Product/domain logic must not depend directly on vendor SDKs.

Provider criteria: target-market availability, delivery logs/status callbacks, secret management, predictable cost, sandbox support, monitoring, and sensitive-payload safety.

**Validation:** Tests use fake providers. Staging uses sandbox providers where possible. Delivery attempts/failures are visible without leaking secrets.

---

### ARD-0020 — Server-Side Cache Policy

**Decision:** Do not introduce Redis or external server-side cache initially.

Allowed:

- Browser PWA app-shell cache.
- User-scoped read-only recent-record cache.
- Short-TTL in-process caches for low-risk configuration values with safe invalidation.

Disallowed initially:

- Cache as source of truth.
- Cache-backed stock quantities, invoice balances, unsafe permission decisions, or stale tenant lifecycle status.

**Validation:** Performance tests determine whether server cache is needed. Security tests verify user cache clearing. Permission/status changes must not remain stale unsafely.

---

### ARD-0021 — Append-Only Table Partitioning Threshold

**Decision:** Design high-volume append-only tables to be partition-ready, but defer physical partitioning until metrics justify it.

Review partitioning when any condition occurs:

- Table exceeds 10 million rows.
- P95 indexed list/report queries exceed targets.
- Table/index bloat affects vacuum/autovacuum.
- Export/report workload creates sustained pressure.

Default strategy: monthly time-based partitions for audit/log/job/notification-style tables with tenant/date-aware indexes.

**Validation:** Migrations avoid future partition blockers. Monitoring tracks rows, bloat, autovacuum lag, and P95 latency. Rehearse partitioning in staging before production.

---

### ARD-0022 — OpenAPI Generation and Contract Drift Control

**Decision:** Generate OpenAPI from NestJS route metadata and DTO/schema annotations. Validate generated output against `api-contracts.md`.

Rules:

- Generated OpenAPI is committed or published as CI artifact.
- Public API changes require review against API contracts and RTM.
- Contract tests cover envelopes, auth headers, idempotency, pagination, enums, status codes, and errors.

**Validation:** CI fails on unapproved OpenAPI drift. Representative endpoints across modules are contract-tested. Frontend API client is generated or validated once stable.

---

### ARD-0023 — Environments, Deployment Units, and CI/CD

**Decision:** Use Dockerized deployment units:

| Unit             | Responsibility                              |
| ---------------- | ------------------------------------------- |
| PWA static app   | Client shell/assets                         |
| API service      | REST API, commands, queries, signed URLs    |
| Worker service   | Jobs, exports, reminders, lifecycle, outbox |
| Scheduler        | Periodic job enqueueing                     |
| PostgreSQL       | Transactional source of truth               |
| Object storage   | Tenant files and exports                    |
| Monitoring stack | Logs, metrics, traces, errors, alerts       |

Environments: `local`, `development`, `staging`, `production`.

CI baseline: lint, typecheck, unit tests, migration validation, API contract tests, practical integration tests, and dependency/security scanning.

**Validation:** New developer setup works from docs. CI blocks failing checks. Staging runs migrations, workers, storage sandbox, provider sandboxes, and E2E tests before production.

---

### ARD-0024 — Observability, Backup, and Disaster Recovery

**Decision:** Implement production observability and recovery:

- Structured JSON logs with request/correlation ID, safe tenant/actor context, endpoint/action, outcome, and error code.
- OpenTelemetry-compatible traces/metrics where practical.
- Error monitoring for API, PWA, workers, providers, auth, authorization, exports, reminders, and inventory failures.
- Background job status views.
- Daily encrypted PostgreSQL backups.
- Object storage retention aligned to tenant deletion/retention rules.
- Quarterly restore tests.
- RPO: 24 hours.
- RTO: 4 hours.
- Sensitive data must not be logged or leaked in errors.

**Validation:** DevOps/QA verify safe logs, restore drill evidence, alerting, job diagnostics, and sensitive-log review before production.

---

## 6. Consolidated Validation Checklist

| Area             | Evidence                                                                              |
| ---------------- | ------------------------------------------------------------------------------------- |
| Scope control    | No excluded capabilities in tickets, routes, screens, schema, or tests                |
| Architecture     | Modular monolith, command/query separation, explicit transactions                     |
| Database         | Migrations, constraints, indexes, seed data, immutability protections                 |
| Tenant isolation | Cross-tenant reads/writes blocked at API/repository/RLS where enabled                 |
| Branch access    | Unassigned branch records blocked                                                     |
| Auth/security    | Hashing, token rotation, revocation, rate limits, sensitive-log checks                |
| API              | Envelopes, correlation IDs, idempotency, pagination, `snake_case`, workflow endpoints |
| Inventory/FIFO   | Ledger-first writes, FIFO allocations, no over-reservation/negative stock             |
| Financial        | No overbilling/overpayment/over-refund; immutable receipts                            |
| Jobs             | Locking, retries, dead-letter behavior, no duplicate side effects                     |
| PWA/offline      | Installable shell, read-only cache, offline writes blocked                            |
| Files            | Private storage, signed URL authorization, export/deletion handling                   |
| Reports/search   | Rebuildable read models, formulas, performance tests                                  |
| Operations       | CI/CD, staging parity, telemetry, backups, restore tests, runbooks                    |

---

## 7. Remaining Follow-Ups

1. Select UUIDv7 library.
2. Select providers for email, SMS, push, analytics, error monitoring, object storage.
3. Split this package into `/docs/adr/ARD-XXXX.md` files if desired.
4. Generate OpenAPI after API skeleton exists.
5. Prototype RLS policies and fixtures before production.
6. Define log-redaction tests for passwords, tokens, provider secrets, card details, signed URLs, and sensitive free text.
7. Define report read-model freshness targets by report category.
8. Create backup/restore runbook and restore evidence template.

---

## 8. Final Recommendation

Approve this token-optimized ARD package as the low-token implementation reference. Keep the original ARD package as the full audit/detail source. Implementation should proceed only after these decisions are accepted or superseded by more specific ARDs.
