# GarageOS Architecture

**Document:** `architecture.md`  
**System:** GarageOS — Motorcycle Shop Management System SaaS  
**Status:** Build-ready architecture reference  
**Target Client:** Mobile-first Progressive Web App  
**Database Target:** PostgreSQL 16+  
**Source Documents:** `requirements.md`, `database-design.md`, `database-schema.md`

---

## 1. Purpose

This document defines the production architecture for GarageOS in a concise, implementation-ready format. It guides API design, module boundaries, data access, background jobs, security, observability, deployment, testing, and future ADRs.

If this document conflicts with the PRD, database design, or database schema, the source documents win.

---

## 2. Architecture Principles

1. **Documentation first.** PRD, database design, schema, and accepted ADRs are authoritative.
2. **Modular monolith first.** Use one deployable backend with strict internal modules.
3. **Tenant isolation everywhere.** Tenant-owned records require `tenant_id`; branch records require `tenant_id` and `branch_id`.
4. **Database-enforced invariants.** Use constraints, unique indexes, row locks, optimistic locking, triggers, and idempotency keys.
5. **Ledger-first inventory.** Stock changes write immutable inventory ledger entries.
6. **FIFO correctness.** FIFO layers, allocations, and consumptions are first-class.
7. **Financial immutability.** Issued invoices, payments, receipts, refunds, ledgers, and audit logs are immutable or correction-only.
8. **Retry-safe jobs.** Background work must be observable, idempotent where needed, and safe to retry.
9. **Mobile-first operations.** Core workflows must work on small screens and unstable mobile networks.
10. **Operational visibility.** Critical paths need structured logs, metrics, audit logs, and alerts.

---

## 3. Recommended Stack

| Layer | Decision | Notes |
| --- | --- | --- |
| Client | TypeScript mobile-first PWA | Installable, responsive, offline shell/read-only cache. |
| UI | React / Next.js or equivalent | Strong PWA and routing ecosystem. |
| Backend | TypeScript modular monolith | Keeps transactional workflows simple. |
| API | REST + explicit workflow command endpoints | Predictable, testable, permission-aware. |
| Database | PostgreSQL 16+ | Transactions, locks, constraints, FTS/trigram, JSONB, optional RLS. |
| Jobs | Database-backed jobs and outbox first | Avoids early queue infrastructure. |
| Files | Private S3-compatible object storage | Tenant paths, signed URLs, lifecycle deletion. |
| Cache | Browser PWA cache; optional server ephemeral cache | PostgreSQL remains authoritative. |
| Observability | Logs, metrics, error monitoring, correlation IDs | Required for API, jobs, auth, inventory, exports. |
| Deployment | Containers behind HTTPS | Separate PWA/API/worker/scheduler units. |

### Why Modular Monolith

GarageOS has many atomic cross-domain workflows: payment plus receipt, invoice plus billing allocations, job completion plus inventory consumption, transfer receiving plus FIFO movement, and supplier return plus AP/credit updates. A modular monolith reduces distributed-transaction risk while preserving future extraction options.

---

## 4. System Topology

GarageOS runs as:

- **PWA/static app** served by CDN/static hosting.
- **API service** for auth, commands, queries, signed URLs, and tenant context.
- **Worker service** for jobs, outbox, reminders, exports, lifecycle transitions, deletion, and file retention.
- **Scheduler** for periodic job enqueueing.
- **PostgreSQL** as the transactional source of truth.
- **Private object storage** for tenant files and export packages.
- **External providers** for email, SMS, push, analytics, and error monitoring.

---

## 5. Backend Structure

```text
backend/
  modules/
    auth/
    tenants/
    subscriptions/
    platform-admin/
    users/
    roles-permissions/
    branches/
    customers/
    motorcycles/
    services/
    estimates/
    job-orders/
    mechanic-sessions/
    products-inventory/
    inventory-adjustments/
    inventory-transfers/
    suppliers/
    purchases/
    invoices/
    payments-refunds/
    expenses/
    reminders/
    notifications/
    files/
    reports/
    audit/
    exports/
    background-jobs/
  shared/
    database/
    transactions/
    authorization/
    validation/
    idempotency/
    observability/
    errors/
    time/
    money/
    files/
```

Each module should use:

```text
module/
  api/             controllers and DTOs
  application/     commands, queries, transactions
  domain/          business rules and state machines
  persistence/     repositories and SQL/ORM mappings
  policies/        tenant, permission, branch checks
  events/          outbox events and handlers
  tests/           unit and integration tests
```

### Command / Query Discipline

- **Commands** handle validation, authorization, idempotency, transactions, status transitions, audit logs, and side effects.
- **Queries** handle scoped reads, pagination, search, and reports.
- Full CQRS infrastructure is not required.

---

## 6. Core Domain Modules

| Module | Responsibility | Critical Rule |
| --- | --- | --- |
| Auth | Login, logout, verification, reset, sessions, rate limits | Stored tokens must be hashed. |
| Tenant Lifecycle | Status, onboarding, subscription gates, deletion | Runs before operational permissions. |
| Platform Admin | Tenants, plans, overrides, support access | Platform admins are not tenant employees. |
| RBAC | Roles, permissions, branch access | Additive permissions; no explicit deny. |
| Customers & Motorcycles | Tenant-wide records, search, restoration | Histories remain branch-restricted. |
| Service Work | Services, estimates, job orders, mechanic sessions | Transitions must be explicit and audited. |
| Inventory | Products, stock, reservations, FIFO, ledger | Ledger/FIFO are authoritative. |
| Transfers | Branch transfers and variances | Preserve FIFO cost references. |
| Purchasing & AP | POs, receiving, returns, payments, credits | Credit purchases affect AP; cash purchases do not. |
| Invoicing & AR | Invoices, allocations, tax, discounts, AR | Allocations prevent overbilling. |
| Payments & Refunds | Payments, immutable receipts, refunds | One payment creates one receipt. |
| Expenses | Categories, records, edits, voids | Voided expenses excluded from profit reports. |
| Reminders & Notifications | Due evaluation, channels, attempts | Enforce plan-based channels. |
| Files & Exports | Signed URLs, tenant files, export packages | No permanent public tenant file URLs. |
| Reports & Dashboard | Operational summaries and exports | Large exports are asynchronous. |
| Audit | Tenant and platform audit logs | Critical actions cannot bypass audit. |
| Background Jobs | Jobs, outbox, attempts, failures | No duplicate irreversible side effects. |

---

## 7. Access Control Architecture

### Request Pipeline

1. Verify token/session.
2. Resolve actor, tenant, tenant status, branch access, permissions, and support session.
3. Apply tenant lifecycle gate.
4. Apply permission guard.
5. Apply branch guard for branch-specific records.
6. Run service/business validation.
7. Query/write through tenant-scoped repositories.
8. Return response with correlation metadata.

### Tenant Context

Every authenticated tenant request resolves:

- `actor_user_id`
- `tenant_id`
- `tenant_status`
- `subscription_status_source`
- `assigned_branch_ids`
- `tenant_wide_branch_access`
- `effective_permissions`
- optional `platform_support_access_session_id`

### Enforcement Layers

| Layer | Responsibility |
| --- | --- |
| API/routing | Reject missing or invalid context. |
| Policy | Enforce permission and branch scope. |
| Service | Enforce lifecycle and business rules. |
| Repository | Require `tenant_id` and `branch_id` where applicable. |
| Database | Enforce constraints, indexes, FKs, optional RLS. |

### Tenant Status Gate

| Status | Rule |
| --- | --- |
| `pending_setup` | Owner setup only; operational modules blocked. |
| `active` | Full access by permission and branch scope. |
| `grace_period` | Full access plus renewal warnings. |
| `read_only` | Reads, exports, renewal, password change, logout; writes blocked. |
| `suspended` | Owner renewal/export only; non-owner access blocked. |
| `pending_deletion` | Operational access blocked. |
| `deleted` | No tenant operational access. |

---

## 8. Data Architecture

GarageOS uses a shared PostgreSQL database and shared schema with strict tenant isolation.

Rules:

- Tenant-owned tables include `tenant_id`.
- Branch operational tables include `tenant_id` and `branch_id`.
- Financial, inventory, audit, event, and status-history records are append-only or correction-only.
- Document numbers are tenant-scoped and never reused.
- Money uses fixed precision decimals.
- Business dates use tenant timezone.
- Source-of-truth records are relational, not JSON-only.

| Category | Examples | Scope |
| --- | --- | --- |
| Platform-owned | plans, platform admins, platform audit | platform-wide |
| Tenant-wide | customers, motorcycles, products, suppliers, files | `tenant_id` |
| Branch-specific | jobs, invoices, purchases, stock, transfers, expenses | `tenant_id` + `branch_id` |
| Append-only | ledgers, receipts, refunds, audit logs | immutable/correction-only |
| Read models | reports, search, dashboard snapshots | rebuildable |

Transactional source tables remain authoritative. Reporting snapshots, dashboard snapshots, and search documents are derived and rebuildable.

---

## 9. Critical Transactions

All critical writes require database transactions and appropriate locks, constraints, optimistic locking, or idempotency.

| Workflow | Transaction Scope |
| --- | --- |
| Invoice issue | invoice, lines, job links, allocations, document sequence |
| Payment + receipt | invoice, payment, receipt, sequence, audit |
| Refund | payment, invoice, refund, optional inventory reversal, audit |
| Job completion | job, reservations, stock, FIFO, ledger |
| Inventory reservation/release | stock, FIFO layers, allocations, reservation, ledger |
| Adjustment posting | adjustment, stock, FIFO, ledger, audit |
| Purchase receiving | PO lines, stock, FIFO, AP, ledger |
| Supplier return | return, stock, FIFO, AP/credit, ledger |
| Transfer receive/cancel | transfer, source/destination stock, FIFO, ledger |
| Tenant deletion | deletion job, records, storage manifest, retained audit |

---

## 10. Idempotency

Client-retryable critical writes require idempotency keys scoped by:

- `tenant_id`
- `user_id`
- command/endpoint
- request intent hash
- idempotency key hash

Required at minimum for:

- invoice issuance
- payment creation
- receipt generation
- refund creation
- inventory reservation, consumption, adjustment posting
- purchase receiving
- supplier return posting
- supplier payment creation
- transfer stock-affecting transitions
- tenant deletion job execution

Flow: reserve key → return cached success if already completed → execute command in transaction → store response → return result.

---

## 11. Inventory and FIFO

Key concepts:

| Concept | Role |
| --- | --- |
| `stock_balances` | Fast branch/product quantity summary. |
| `inventory_ledger_entries` | Immutable record of stock-changing events. |
| `fifo_layers` | Received quantity at specific unit cost. |
| `inventory_reservations` | Allocated stock for jobs/transfers. |
| `fifo_reservation_allocations` | FIFO layer reservation without consuming quantity. |
| `fifo_consumptions` | Actual FIFO stock consumption. |

Rules:

- Available stock = `on_hand_qty - reserved_qty`.
- Normal transactions must not create negative available stock.
- `on_hand_qty` must not be lower than `reserved_qty`.
- FIFO allocations cannot exceed allocatable layer quantity.
- FIFO consumption uses oldest allocated layers first.
- Corrections use approved adjustment, refund reversal, void reversal, supplier return, or transfer variance workflows.

---

## 12. Financial Architecture

### Invoices and Billing Allocations

Invoices can link to one or more job orders. A job order can be billed by multiple invoices. Billing allocations prevent overbilling.

Allocation statuses:

- `reserved` — draft invoice
- `final` — issued active invoice
- `released` — cancelled/voided invoice
- `closed` — refunded allocation not automatically billable again

Remaining billable amount = authorized source quantity/amount minus reserved, final, and closed allocations.

### Payments and Receipts

Payment creation must:

1. Validate invoice status and collectible balance.
2. Reject non-positive amounts and overpayment.
3. Generate one tenant-scoped receipt number.
4. Create one payment and one immutable receipt.
5. Recalculate invoice paid amount, balance, and status.
6. Write audit logs.

### Refunds

Refunds do not edit/delete original payments or receipts. They reduce refundable amount and recalculate invoice balance/status. Inventory reversal occurs only when explicitly authorized and selected.

Financial reports are operational reports, not a full accounting system.

---

## 13. Workflow State Machines

Every stateful workflow should include:

- status column
- transition validator
- status history
- audit log
- service-layer transition command
- tests for allowed and blocked transitions

Applies to tenant lifecycle, invitations, branches, customers, motorcycles, estimates, job orders, mechanic sessions, adjustments, transfers, purchase orders, supplier returns, invoices, refunds, expenses, reminders, files, and background jobs.

---

## 14. API Architecture

Use REST resources for CRUD and command endpoints for workflow transitions.

Examples:

```text
POST /api/v1/auth/login
POST /api/v1/tenants/{tenantId}/onboarding/complete
POST /api/v1/job-orders/{jobOrderId}/status/complete
POST /api/v1/invoices/{invoiceId}/issue
POST /api/v1/invoices/{invoiceId}/payments
POST /api/v1/payments/{paymentId}/refunds
POST /api/v1/inventory/reservations
POST /api/v1/inventory-adjustments/{adjustmentId}/post
POST /api/v1/inventory-transfers/{transferId}/receive
POST /api/v1/tenant-exports
```

API rules:

- Tenant context is required for tenant routes.
- Branch-specific routes validate branch access.
- Required write routes validate idempotency.
- Large lists use cursor/keyset pagination.
- Errors use stable codes and correlation IDs.
- Money uses decimal-safe strings or values.
- Timestamps use canonical UTC; business dates use tenant timezone.

---

## 15. Frontend / PWA

Requirements:

- mobile-first, responsive, installable PWA
- works at minimum 360px width
- touch-optimized workflows
- offline app shell
- read-only recently viewed records when offline

Suggested structure:

```text
frontend/
  app/
    auth/ onboarding/ dashboard/ customers/ motorcycles/
    job-orders/ inventory/ purchases/ invoices/ payments/
    reports/ settings/ platform-admin/
  components/
    layout/ forms/ tables/ workflow/ offline/
  services/
    api-client/ auth-session/ offline-cache/ notifications/
  domain/
    money/ dates/ permissions/ status-labels/
```

Offline cache may include the app shell, static assets, recently viewed customers, motorcycles, job orders, and invoices.

Offline mode must block creates, edits, approvals, payments, refunds, inventory actions, uploads, settings changes, and role/permission changes.

Frontend may hide/disable actions based on permissions, branch access, tenant status, plan limits, and offline state, but backend authorization remains authoritative.

---

## 16. Jobs and Outbox

Required background jobs:

- tenant exports and report exports
- reminder due evaluation and delivery
- subscription lifecycle transitions
- deletion warnings and tenant deletion
- file retention deletion
- low-stock alerts
- email/SMS delivery
- report snapshot refreshes
- search document refreshes

Job states:

```text
queued -> running -> succeeded
queued -> running -> failed
queued -> cancelled
failed -> queued when retry-safe
failed -> dead_lettered after retry exhaustion
```

Worker rules:

- Acquire jobs with locks.
- Track attempts and last error.
- Use correlation IDs.
- Do not retry permanent failures.
- Emit failure events for platform/admin visibility.
- Keep irreversible operations idempotent.

Use an outbox for post-commit events such as payment recorded, receipt generated, reminder due, low stock alert, export completed, tenant status changed, and employee deactivated.

---

## 17. Files and Exports

Tenant files use private tenant-scoped object paths:

```text
tenants/{tenant_id}/{entity_type}/{entity_id}/{file_id}-{safe_filename}
```

Rules:

- Files are private by default.
- Access checks include tenant, branch, linked entity, and permission.
- Downloads use time-limited signed URLs.
- Permanent public tenant file URLs are prohibited.
- Signed URLs must not be cached offline beyond expiry.

Full tenant exports generate ZIP packages with CSV data, JSON relationships, audit log export, attachment manifest, optional attachment binaries, and README. Large exports run asynchronously. Download links expire after 7 days.

Malware scanning is optional; if enabled, pending/infected/quarantined states must protect tenant access and exports.

---

## 18. Reports, Dashboard, and Search

Reports respect tenant and branch access. Interactive reports should query source tables or read models for date ranges up to 90 days. Larger reports should run as background exports.

Use rebuildable read models for daily sales, payments, stock valuation, dashboard snapshots, and advanced operational reports. Read models never replace source tables.

Search strategy:

- normalized exact columns for email, mobile, SKU, barcode, plate, engine, chassis, document numbers
- PostgreSQL full-text search for multi-field search
- trigram indexes for fuzzy names/models/products
- always scoped by tenant and branch access where applicable

---

## 19. Security

Authentication:

- Hash passwords with Argon2id or bcrypt cost 12+.
- Access tokens expire within 15 minutes.
- Refresh tokens rotate.
- Remember-me sessions last up to 30 days.
- Sessions revoked on deactivation/admin password reset.
- Reset, invite, verification, and refresh tokens stored as hashes.

Authorization combines tenant status, user status, email verification, permissions, branch assignments, plan limits, and support access mode.

Never store or log plaintext passwords, reset/verification/access/refresh tokens, CVV, card numbers, magnetic stripe data, or unnecessary sensitive free text.

Platform support access requires reason, defaults to read-only, supports explicit write mode only for authorized platform users, creates session records, audits every action, and is visibly marked in UI.

PostgreSQL RLS is recommended as defense-in-depth once app-level tenant context propagation is reliable.

---

## 20. Observability

Track:

- API latency/error rate
- background job failures/retries
- email/SMS delivery failures
- storage/database growth
- authentication failures
- authorization denials
- export/reminder status
- inventory transaction failures

Logs should be structured JSON with timestamp, level, environment, service, correlation ID, tenant/user IDs when applicable, request path or job type, error code, and sanitized details.

Minimum metrics:

- `http_request_duration_ms`
- `http_request_errors_total`
- `background_jobs_failed_total`
- `background_jobs_retry_total`
- `auth_failures_total`
- `authorization_denials_total`
- `inventory_transaction_failures_total`
- `notification_delivery_failures_total`
- `export_job_duration_ms`
- `db_pool_saturation`

Alert on critical job failure, repeated tenant deletion failure, payment/receipt or inventory failure spikes, provider failure spikes, storage threshold, backup failure, high API error rate, and sustained latency breach.

---

## 21. Deployment, Backup, and DR

Deployable units:

| Unit | Responsibility |
| --- | --- |
| PWA static app | Shell/assets via CDN. |
| API service | Auth, commands, queries, signed URLs. |
| Worker service | Jobs, outbox, exports, lifecycle, reminders. |
| Scheduler | Periodic job enqueueing. |
| PostgreSQL | Transactional source of truth. |
| Object storage | Tenant files and exports. |

Environments: `local`, `development`, `staging`, `production`.

Migration rules:

- Version-controlled.
- Forward-only in production.
- Batch and observe large backfills.
- Destructive migrations need backup and rollout plan.
- RLS/immutability triggers require integration tests.

Backup and DR:

- Daily encrypted database backups.
- Minimum 30-day backup retention.
- Encrypted object storage.
- Quarterly restore testing.
- RPO: 24 hours.
- RTO: 4 hours.
- Tenant deletion must preserve required platform audit metadata and avoid tenant-use restoration except platform-wide disaster recovery.

---

## 22. Performance and Scale

Targets:

| Metric | Target |
| --- | --- |
| Initial mobile page load | < 3s over 4G |
| API P50 | < 200ms |
| API P95 | < 500ms |
| API P99 | < 1000ms |
| Interactive report summary | < 5s for default ranges up to 90 days |

Techniques:

- tenant/branch/date/status indexes
- keyset pagination for high-volume lists
- reporting snapshots for dashboard-heavy workloads
- async exports
- CDN for static assets
- avoid N+1 list queries
- selective indexing
- bounded critical transactions
- partition-ready append-only tables

Minimum supported scale:

| Target | Scale |
| --- | ---: |
| Active shops | 500 |
| Tenant users | 10,000 |
| Active branches | 2,000 |
| Customers | 1,000,000 |
| Motorcycles | 1,500,000 |
| Job orders | 2,000,000 |
| Inventory ledger entries | 5,000,000 |

Scaling path: horizontal API/workers → optimize queries/indexes → read replicas → partition append-only tables → isolate reporting/export workers → extract services only after proven need.

---

## 23. Testing and Acceptance

Test types:

- Unit: business rules, transitions, money/tax/FIFO calculations.
- Integration: repositories, constraints, transactions, RLS, idempotency.
- API: auth, permissions, branch access, validation, idempotency.
- E2E: mobile job order, reservation, invoice, payment, receipt.
- Concurrency: numbering, FIFO, reservations, payment/refund, overbilling.
- Migration: schema, seed data, rollback rehearsal outside production.
- Performance: lists, reports, dashboards, ledgers, exports.
- Security: tenant/branch isolation, tokens, files, rate limits.

Must-pass themes:

- No cross-tenant access.
- Branch-scoped users cannot access unassigned branch records.
- No duplicate document numbers under concurrency.
- No overpayment, over-refund, overbilling, over-reservation, or negative stock.
- Receipts are one-to-one with payments and immutable.
- FIFO uses oldest allocated layers.
- Cash purchases do not create AP.
- Supplier returns reduce stock and AP or create supplier credit as documented.
- Restricted tenant states block operational writes.
- Audit logs are immutable.
- Tenant exports include manifests and optional attachments.
- Tenant deletion preserves required platform-retained audit metadata.

---

## 24. Security Checklist

| Control | Requirement |
| --- | --- |
| HTTPS | Production traffic over HTTPS; HTTP redirected/blocked. |
| Passwords | Argon2id or bcrypt cost 12+. |
| Tokens | Store only hashes for reset, verification, invite, refresh. |
| Sessions | Revoke on deactivation/password reset. |
| Rate limits | Login, reset, verification resend, uploads, public APIs, reminders, exports. |
| Tenant isolation | Middleware, policies, repository scoping, optional RLS. |
| Branch access | Enforced on branch-specific records. |
| Files | Private storage and signed URLs only. |
| Card data | Do not store card number, CVV, or magnetic stripe data. |
| Audit logs | Immutable; retained at least 3 years. |
| Secrets | Outside source code in env/secret manager. |
| Backups | Encrypted and tested quarterly. |

---

## 25. Architecture Decisions

| ID | Decision | Reason | Trade-off |
| --- | --- | --- | --- |
| AD-001 | Modular monolith backend | Cross-domain transactions require atomicity. | Less independent domain scaling initially. |
| AD-002 | PostgreSQL source of truth | Relational integrity, transactions, locks, constraints, FTS/trigram, optional RLS. | Requires indexing, monitoring, partitioning later. |
| AD-003 | DB-backed jobs/outbox first | Matches schema and avoids premature queue infra. | High-volume async work may need dedicated queue later. |
| AD-004 | Read models for reports/search | Protects operational transactions. | Requires refresh jobs and freshness monitoring. |
| AD-005 | Idempotency on critical writes | Prevents duplicate payments, receipts, billing, inventory actions. | Requires intent hashing and response storage. |
| AD-006 | No full offline writes | PRD excludes offline transactional sync. | Some workflows require connectivity. |

---

## 26. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Inventory/FIFO bugs | Transaction tests, fixtures, locks, invariant checks, reconciliation reports. |
| Overbilling/overpayment | Allocation locks, invoice locks, constraints, idempotency. |
| Tenant isolation defects | Middleware, repositories, tests, optional RLS. |
| Duplicate job side effects | Idempotent jobs, locks, outbox state, safe retries. |
| Slow reports/exports | Async jobs, snapshots, pagination, worker isolation. |
| Object storage leakage | Private buckets, signed URLs, tenant paths, auth before URL generation. |
| Append-only table growth | Partition-ready schema, keyset pagination, retention, monitoring. |
| Support misuse | Explicit sessions, reasons, read-only default, visible marker, audit logs. |
| Scope creep | Enforce documented exclusions in backlog and reviews. |

---

## 27. Remaining ADRs

1. Frontend framework and PWA build strategy.
2. Backend framework and ORM/query builder.
3. UUIDv7 library and ID conventions.
4. PostgreSQL enums vs `text` + check constraints.
5. RLS from day one vs after repository scoping stabilizes.
6. Immutability triggers from first migration vs later.
7. Background job locking algorithm.
8. Report read model refresh strategy.
9. Object storage and malware scanning providers.
10. Email, SMS, analytics, and error monitoring providers.
11. Need for server-side cache beyond PWA cache.
12. Partitioning thresholds for append-only tables.

---

## 28. Implementation Order

1. Repo standards, environment config, secrets, CI.
2. Platform, tenant, user, role, permission, branch migrations and seed data.
3. Auth, sessions, tenant context, RBAC, branch authorization.
4. Onboarding, subscription lifecycle gates, platform admin basics.
5. Customers, motorcycles, service catalog, estimates, job orders.
6. Products, stock, FIFO layers, reservations, inventory ledger.
7. Job completion with FIFO consumption.
8. Purchases, receiving, supplier AP, supplier payments, supplier returns.
9. Invoices, allocations, payments, receipts, refunds, AR.
10. Transfers and adjustments with approval workflow.
11. Expenses, reminders, notifications, provider adapters.
12. Files, signed URLs, export jobs, attachment packaging.
13. Dashboard, reports, search, export formats.
14. Offline PWA shell and read-only cache.
15. Observability, audits, rate limits, backup/restore, RLS/triggers, load tests.

---

## 29. Architecture Acceptance Criteria

Architecture is acceptable only if:

- PWA supports mobile-first workflows and offline shell/read-only cache.
- Backend scales horizontally without losing transactional correctness.
- Tenant isolation is enforced across API, service, repository, and database layers.
- Branch access is enforced for branch-specific records.
- Critical writes are atomic and idempotent.
- Inventory uses ledger entries, FIFO layers, reservations, and consumptions correctly.
- Financial records, receipts, refunds, ledgers, and audit logs are immutable or correction-only.
- Plan limits and lifecycle status are centrally enforced.
- Large exports and long-running work are asynchronous.
- Reports/dashboards use rebuildable read models without replacing source tables.
- Files use private tenant-scoped storage and signed URLs.
- Observability covers API, jobs, integrations, auth, authorization, exports, reminders, and inventory failures.
- Backup/DR supports RPO 24 hours and RTO 4 hours.

---

## 30. Final Recommendation

Build GarageOS as a containerized, mobile-first PWA backed by a TypeScript modular monolith and PostgreSQL 16+. Use database-backed jobs/outbox first. Keep PostgreSQL as the transactional source of truth. Treat tenant isolation, branch access, idempotency, financial immutability, auditability, and FIFO inventory correctness as foundational architecture constraints.

This architecture intentionally avoids premature microservices and unnecessary infrastructure while preserving SaaS scale, auditability, background processing, exports, reporting, and future service extraction if production data later justifies it.
