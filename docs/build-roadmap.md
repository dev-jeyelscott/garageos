# GarageOS Build Roadmap

**Document:** `build-roadmap.md`  
**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Status:** Source-aligned engineering sequencing roadmap  
**Roadmap Type:** Engineering checkpoints, not product-scope phases  
**Target:** Mobile-first PWA, PostgreSQL 16+, modular monolith

---

## 1. Purpose

This roadmap defines the implementation order for GarageOS from foundation to launch readiness. It preserves approved scope, dependency order, quality gates, and acceptance evidence while removing repeated rationale and role-panel prose.

Use this document to answer:

- What should be built first.
- Which milestones depend on earlier work.
- What must be validated before closure.
- Which scope must stay excluded.
- Which decisions must be resolved before deeper implementation.

---

## 2. Source-of-Truth Order

Follow documents in this priority order:

1. `requirements.md`
2. `database-design.md`
3. `database-schema.md`
4. `architecture.md`
5. `api-contracts.md`
6. `requirements-traceability-matrix.md`
7. `user-stories.md`
8. `permission-matrix.md`
9. `ux-sreen-map.md`
10. `qa-acceptance-test-plan.md`
11. `tech-stack.md`
12. `architecture-records.md`
13. Existing roadmap versions

If this roadmap conflicts with the PRD, the PRD wins. If downstream docs conflict with schema, architecture, API contracts, QA, permissions, tech stack, or ADRs, update the dependent artifact instead of inventing behavior.

---

## 3. Scope Guardrails

GarageOS is one approved build scope. Milestones are sequencing checkpoints only; they are not MVP phases or permission to defer documented requirements.

### In Scope

- Mobile-first PWA.
- Multi-tenant SaaS backend.
- PostgreSQL schema, migrations, seed data, constraints, indexes.
- Tenant lifecycle, onboarding, subscription enforcement, platform admin, support access.
- Auth, sessions, email verification, password reset, RBAC, branch access.
- Shop settings, branches, employees, roles, permissions.
- Customers, motorcycles, services, estimates, job orders, mechanic sessions.
- Products, stock balances, FIFO, reservations, adjustments, transfers, ledger entries.
- Suppliers, purchases, supplier returns, AP, supplier payments, supplier credits.
- Invoices, billing allocations, payments, receipts, refunds, voids, tax, discounts, AR.
- Expenses, reminders, internal notifications, provider delivery tracking.
- Files, private object storage, signed URLs, tenant exports, offline read-only cache.
- Dashboard, reports, search, export formats, calculation verification.
- Audit logs, idempotency, background jobs, observability, backup, retention, DR.
- Security hardening, performance validation, UAT, launch readiness.

### Explicitly Out of Scope

Do not implement or imply:

- Native iOS or Android apps.
- Offline writes, sync queues, conflict resolution, or offline approvals.
- Full accounting, general ledger, chart of accounts, journal entries, bank reconciliation, formal close.
- Payroll, commissions, payslips, government payroll contributions.
- Direct BIR/tax authority filing.
- E-commerce marketplace, online store, public checkout, delivery workflow.
- Customer portal or customer self-service login.
- Loyalty points, rewards, tiers, redemption.
- Service packages.
- Predictive analytics, AI recommendations, forecasting, custom BI beyond defined reports.
- Automated subscription payment collection.
- Standalone walk-in retail POS/cart checkout independent of job orders/service invoices.
- Two-factor authentication.
- Microservices-first implementation.

---

## 4. Critical Path

```text
foundation
-> migrations + seed data
-> auth/session/security middleware
-> tenant context + subscription gate + RBAC + branch access
-> idempotency + audit + transaction utilities
-> tenant lifecycle + onboarding + platform admin
-> master data
-> service operations
-> inventory/FIFO reservation and consumption
-> purchasing/AP
-> invoicing/billing allocations
-> payments/receipts/refunds/AR
-> expenses/reminders/notifications
-> files/exports/offline read-only cache
-> dashboard/reports/search/export formats
-> security/observability/performance/DR
-> UAT and launch readiness
```

Do not build operational workflows on weak tenancy, authorization, migrations, transactions, idempotency, or audit logging.

---

## 5. Roadmap Principles

1. Implement documented behavior only.
2. Missing details become ADRs, clarification tickets, or downstream artifacts.
3. Foundations come before operational modules.
4. Protect invariants through API validation, service policies, repository scoping, database constraints, locks, optimistic locking, audit logs, and tests.
5. Build vertical slices after foundations: database, API, domain logic, frontend, tests, observability, docs.
6. Backend and database are authoritative; UI restrictions are not sufficient enforcement.
7. Critical writes must be retry-safe.
8. Reports and exports are first-class; formulas must influence data capture early.
9. Mobile-first support is mandatory.
10. Test concurrency early for duplicate numbers, FIFO over-allocation, overbilling, overpayment, over-refund, double consumption, and duplicate background side effects.

---

## 6. Milestone Overview

|   # | Milestone                                          | Goal                                                                                                   | Depends On    |
| --: | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------- |
|   0 | Project Foundation and Engineering Decisions       | Repo, standards, ADRs, CI, local dev, UX/QA planning                                                   | Approved docs |
|   1 | Database Foundation and Core Migrations            | Schema foundations, seed data, constraints, indexes, fixtures                                          | M0            |
|   2 | API Foundation, Auth, Tenant Context, RBAC         | Secure request pipeline, auth/session, permissions, branch guard, idempotency, audit                   | M0-M1         |
|   3 | Tenant Lifecycle, Onboarding, Platform Admin       | Tenant creation, setup, subscription gates, plan enforcement, support access, export/deletion controls | M1-M2         |
|   4 | Core Master Data                                   | Branches, employees, roles, customers, motorcycles, services, categories                               | M2-M3         |
|   5 | Service Operations                                 | Estimates, job orders, mechanic sessions, status transitions, notes/files placeholders                 | M4            |
|   6 | Inventory Foundation and FIFO                      | Products, stock balances, ledger, reservations, FIFO layers/allocation                                 | M1-M5 partial |
|   7 | Inventory Workflows                                | Adjustments, approvals, transfers, variance, low-stock, cancellation rules                             | M6            |
|   8 | Purchasing, Suppliers, AP                          | Suppliers, purchase orders, receiving, supplier payments/credits/returns, AP basis                     | M6            |
|   9 | Invoicing, Payments, Receipts, Refunds, AR         | Billing allocations, invoices, discounts/tax, payments, receipts, refunds, voids, AR                   | M5-M8         |
|  10 | Expenses, Reminders, Notifications, Integrations   | Expenses, reminders, preferences, provider adapters, delivery tracking, plan channels                  | M3-M9         |
|  11 | Files, Exports, Offline PWA Cache                  | Attachments, object storage, signed URLs, tenant exports, read-only offline cache                      | M2-M10        |
|  12 | Dashboard, Reports, Search, Export Formats         | Dashboard, reports, search/read models, CSV/PDF/Excel exports, formula verification                    | M6-M11        |
|  13 | Security, Observability, Performance, DR Hardening | Security review, logs/metrics/errors, performance, backups, restore, runbooks                          | All previous  |
|  14 | End-to-End UAT and Launch Readiness                | Full acceptance, defect burn-down, signoffs, production smoke, pilot launch                            | All previous  |

---

## 7. Detailed Milestones

## M0 — Project Foundation and Engineering Decisions

**Goal:** Prepare the repo and engineering process for predictable execution.

**Build:**

- Initialize repo/workspace.
- Create `web`, `api`, `worker`, `scheduler`.
- Create shared packages: `shared`, `api-client`, `config`, `test-utils`.
- Add `/docs/adr`, `/docs/runbooks`, `/docs/api`, `/docs/testing`.
- Configure TypeScript, lint, format, tests, hooks, Docker Compose, `.env.example`.
- Add CI baseline: lint, typecheck, unit tests, dependency scan, migration placeholder.
- Record foundational ADRs.
- Create DoD, traceability template, UX wireframe backlog, QA structure.

**Deliverables:** local dev setup, CI baseline, ADR directory, README, traceability template, DoD, UX backlog, QA folders.

**Gate:** local setup works; CI blocks failures; no secrets committed; foundational ADRs accepted; feature tickets include required trace references.

---

## M1 — Database Foundation and Core Migrations

**Goal:** Implement PostgreSQL foundations.

**Build:**

- Finalize migration tool and enum/check strategy.
- Add approved PostgreSQL extensions.
- Create core schemas: platform, tenant, subscription, auth/session/token, RBAC, branches/settings, customers/motorcycles, services/job orders, inventory/FIFO, purchasing/AP, invoicing/payments/AR, expenses, reminders, notifications, outbox, files, exports, audit, idempotency, background jobs, reporting/search scaffolds.
- Add constraints, indexes, tenant/branch scoping, document-number uniqueness, FKs.
- Seed plans, plan limits, permissions, protected Shop Owner behavior.
- Add fixture factory, migration tests, schema drift checklist.

**Deliverables:** migrations, seed data, database integrity tests, CI migration validation, document-number strategy, role-template seed-grant approval record.

**Gate:** empty DB migrates; seeds are idempotent; tenant tables include `tenant_id`; branch tables include `tenant_id` + `branch_id`; money/quantity precision works; required constraints/indexes exist; non-owner default grants are not finalized without approval.

---

## M2 — API Foundation, Auth, Tenant Context, RBAC

**Goal:** Build the secure API foundation.

**Build:**

- Create `/api/v1` REST skeleton.
- Implement response/error envelopes, request/correlation IDs.
- Implement auth routes: signup-owner, login, refresh, logout, logout-all, verification, forgot/reset/change password, session.
- Add password/token hashing, access-token expiry, refresh rotation, remember-me rules, rate limits.
- Resolve tenant context from session.
- Add tenant status/subscription guard, platform/support context, permission guard, branch guard.
- Add validation pipeline, idempotency service, optimistic locking convention, transaction wrapper, audit service.
- Implement auth/session UI screens.
- Add contract, integration, security tests.

**Deliverables:** auth APIs/screens, policy engine, transaction/idempotency/audit/logging utilities, stable errors/envelopes, contract tests.

**Gate:** secure password/token storage; refresh rotation; deactivated users blocked; tenant clients cannot override scope with `tenant_id`; branch/permission denials are stable; responses include metadata; sensitive logs are clean.

---

## M3 — Tenant Lifecycle, Onboarding, Platform Admin

**Goal:** Enable SaaS lifecycle before broad tenant operations.

**Build:**

- Platform-created tenant flow.
- Owner signup tenant flow.
- Default plan/subscription duration validation.
- Onboarding state machine: shop profile, first branch, tax/localization, invoice prefix, completion gate.
- Subscription calculation and tenant status gates: grace, read-only, suspended, pending-deletion, deleted.
- Plan limit and tenant override service.
- Platform tenant management UI/API.
- Subscription override UI/API.
- Support access with reason, mode, expiry, visible marker, audit.
- Tenant lifecycle worker.
- Export/deletion job placeholders.
- Renewal request/instructions flow without payment collection.

**Deliverables:** platform tenant APIs/UI, signup/onboarding, lifecycle worker, plan enforcement, support access, renewal request, lifecycle audit/system logs.

**Gate:** owner signup blocked without default plan/duration; pending setup limited to setup areas; tenant activates only after onboarding + subscription requirements; lifecycle dates use tenant timezone; grace allows operations with warnings; read-only/suspended/pending-deletion/deleted gates work; no subscription payment collection is implemented.

---

## M4 — Core Master Data

**Goal:** Build tenant master data used by service, inventory, financial, reminder, and reporting workflows.

**Build:**

- Branch list/detail/create/update/deactivate/reactivate.
- Enforce branch limits and last-active-branch rule.
- Employee invitation, creation, deactivation, reactivation.
- Role/permission management and role-template protections.
- Branch assignment and tenant-wide branch access.
- Customer create/search/detail/update/merge/soft-delete/restore.
- Motorcycle create/search/detail/update/soft-delete/restore.
- Service catalog CRUD/deactivate.
- Product category management as needed by inventory.
- Duplicate warnings without automatic merge.
- Audit logs and mobile-first screens.

**Deliverables:** master-data APIs/screens, role-template seed config, duplicate-warning services, branch-access tests, audit events.

**Gate:** last Shop Owner cannot be deactivated/demoted; branch limits enforced; customers/motorcycles tenant-wide with branch-filtered operational history; invitations are single-use, tenant-scoped, expiring, audited; additive role permissions; Shop Owner protections hold.

---

## M5 — Service Operations

**Goal:** Implement intake and repair execution.

**Build:**

- Estimate numbers, draft/create/update, present, approve, convert, cancel, expiration.
- Job order numbers, create/detail/update, line scaffolding, assignment, status transitions.
- Correction workflow with permission and reason.
- Mechanic assigned-jobs view.
- Mechanic session start/pause/resume/finish.
- Notes, labor task completion, attachment placeholders.
- Status/audit history UI.
- Mobile-first intake and mechanic workflows.

**Deliverables:** estimate/job/mechanic APIs/screens, workflow validators, status history, tests.

**Gate:** estimates do not affect revenue/AR/on-hand/FIFO; each job order is one service engagement for one motorcycle at one branch; transitions explicit; mechanics do not see financial/supplier/subscription modules unless granted; corrections are permissioned/reasoned/audited; tenant/branch isolation enforced.

---

## M6 — Inventory Foundation and FIFO

**Goal:** Build authoritative inventory before stock workflows depend on it.

**Build:**

- Product/category management.
- Branch stock balances.
- Immutable inventory ledger write service.
- FIFO layer creation/locking.
- Available stock calculation.
- Reservation command and oldest-first FIFO allocation.
- Reservation release.
- FIFO consumption records.
- Integrate job order part reservation and completion with FIFO consumption.
- Inventory read/search APIs.
- Deterministic FIFO fixtures, concurrency tests, reconciliation checks.

**Deliverables:** product/inventory APIs/screens, ledger/FIFO services, reservation/release/consumption, job completion integration, FIFO/stock concurrency tests.

**Gate:** stock changes write ledger entries; FIFO consumes oldest available stock; reservations cannot exceed available; on-hand cannot fall below reserved; job completion consumes atomically; COGS from FIFO consumption; concurrent reservations cannot over-allocate.

---

## M7 — Inventory Workflows

**Goal:** Implement adjustments, transfers, variance, and low-stock controls.

**Build:**

- Adjustment draft/request, approval/rejection, idempotent posting with locks.
- Positive adjustment FIFO layer creation.
- Negative adjustment FIFO consumption.
- Force adjustment permission/reason/audit.
- Transfer draft/request, reservation, send, receive, variance loss, cancellation.
- Low-stock alerts.
- Branch deactivation stock blockers.
- Audit and status history.

**Deliverables:** adjustment APIs/screens, transfer APIs/screens, state machines, low-stock alerts, variance/approval/audit tests.

**Gate:** posted adjustments immutable/corrected only by new adjustments; transfers preserve FIFO cost references; variance loss does not create AP/AR/revenue/expense; cancellation rules enforced; force adjustment protected, reasoned, audited.

---

## M8 — Purchasing, Suppliers, AP

**Goal:** Implement supplier, purchasing, receiving, return, and AP workflows.

**Build:**

- Supplier create/read/update/deactivate/reactivate.
- Purchase draft/create/update/cancel and ordered/received/partially received/closed transitions.
- Receiving with stock + FIFO layer creation.
- Cash purchase no-AP behavior.
- Credit purchase AP behavior.
- Supplier payments, credits, returns.
- Supplier return valuation from documented costing basis.
- AP balances/report basis.
- Status history, audit, idempotency.
- Mobile purchasing/AP screens.

**Deliverables:** supplier/purchase/receiving/payment/credit/return APIs/screens, AP scaffolding, tests.

**Gate:** receiving updates stock and FIFO transactionally; cash purchases do not create AP; credit purchases create AP; returns adjust stock and supplier balance/credits; receiving cannot over-receive; supplier balances/payment history permission-protected.

---

## M9 — Invoicing, Payments, Receipts, Refunds, AR

**Goal:** Implement billing, collection records, immutable receipts, refunds, voids, and AR.

**Build:**

- Invoice draft from job orders.
- Billing allocation to prevent overbilling.
- Invoice line types, calculations, discount allocation, tax.
- Invoice issue with idempotency.
- Cancellation/void rules.
- Payment creation, partial/split payments, overpayment blocking.
- Exactly one immutable receipt per payment.
- Refund creation and controls.
- Refund inventory reversal where applicable.
- Paid-invoice refund status recalculation.
- AR balances/report basis.
- Financial immutability protections.
- Cashier mobile flows.

**Deliverables:** invoice/payment/receipt/refund/AR APIs/screens, billing allocation service, idempotency/concurrency tests.

**Gate:** invoice issuance cannot overbill; payments cannot exceed collectible balance; each payment creates one immutable receipt; refunds cannot exceed refundable amount; issued financial records are immutable/correction-only; concurrent payments/refunds cannot overpay/over-refund.

---

## M10 — Expenses, Reminders, Notifications, Integrations

**Goal:** Implement expenses, reminders, notifications, adapters, delivery tracking, and plan-channel enforcement.

**Build:**

- Expense categories and create/read/update/void.
- Expense report basis.
- Reminder rules: time, mileage, birthday, follow-up.
- Reminder scheduler.
- Notification preferences, in-app delivery, push/email/SMS adapters.
- Delivery attempts/failure tracking.
- Plan-channel enforcement and no-silent-downgrade behavior.
- Provider sandbox/fake adapters.
- Sanitized provider logging.

**Deliverables:** expense/reminder/notification APIs/screens, provider interfaces, workers, delivery tracking, plan-channel tests.

**Gate:** voided expenses excluded from profit reports; channels obey plan limits; unavailable channels are blocked with clear messaging; no silent fallback; provider failures observable/retry-safe; secrets/payloads not logged.

---

## M11 — Files, Exports, Offline PWA Cache

**Goal:** Implement files, private access, tenant exports, and read-only offline cache.

**Build:**

- Object storage provider/config.
- Private tenant-scoped object paths.
- Upload intent API and signed upload/download URLs.
- File metadata lifecycle, linking, soft-delete/restore, retention.
- Full tenant export job with structured data, relationships, audit export, attachment manifest, README, selected attachments.
- Export job status, safe errors, download expiry.
- PWA manifest/service worker, app-shell cache, read-only recent-record cache.
- Clear user cache on logout/session invalidation.
- Block offline writes, uploads, approvals, payments, refunds, inventory actions, settings, role changes.

**Deliverables:** file APIs/screens, signed URL services, export worker/screens, offline shell/cache, file/offline tests.

**Gate:** no permanent public tenant file URLs; signed URLs time-limited; access respects tenant/permission/branch; exports include required data/attachments; large exports async; offline cache read-only/user-scoped/cleared on logout; cached records do not bypass permissions after reconnect.

---

## M12 — Dashboard, Reports, Search, Export Formats

**Goal:** Implement visibility, search, reports, exports, and formula verification.

**Build:**

- Dashboard summary/API/screen.
- Revenue chart, inventory alerts.
- Customer, service, inventory, AR/AP, revenue, collection, COGS, gross profit, expenses, variance reports.
- Branch comparison and advanced reports where plan allows.
- Search read models.
- CSV/PDF/Excel exports where documented.
- Large report export jobs.
- Formula fixtures and performance tests.

**Deliverables:** dashboard/report/search APIs/screens, calculation services, read-model jobs, export fixtures, access tests.

**Gate:** reports respect tenant/branch/role/plan; restricted reports are blocked unless plan allows; search excludes soft-deleted by default; large exports async; dashboard handles empty/branch/renewal/read-only/low-stock states; stock valuation and COGS use FIFO source data.

---

## M13 — Security, Observability, Performance, DR Hardening

**Goal:** Harden for production readiness.

**Build:**

- Threat model by module.
- Tenant isolation tests across UI/API/repository/database/files/reports/exports.
- Branch access tests.
- Support access audit review.
- Sensitive log review.
- Rate-limit tests.
- Dependency/container scans.
- Structured logs, metrics, error monitoring, traces/correlation IDs.
- Background job observability.
- API/report/export performance tests.
- Encrypted backups and restore rehearsal.
- Validate or waive RPO 24h/RTO 4h.
- Runbooks: deployment, rollback, backup/restore, incident response, support access, tenant lifecycle, provider failures.

**Deliverables:** security report, log review evidence, performance report, observability/runbooks, job retry/failure evidence, backup/restore evidence, DR checklist, incident baseline.

**Gate:** tenant/branch tests pass; sensitive data not logged/exported/returned; support access explicit/reasoned/visible/expiring/audited; jobs observable/retry-safe/no duplicate irreversible effects; performance evidence or mitigations exist; backups/restore evidence exist; RPO/RTO validated or waived.

---

## M14 — End-to-End UAT and Launch Readiness

**Goal:** Validate full scope, resolve release blockers, and prepare controlled launch.

**Build:**

- Freeze release candidate against approved docs.
- Run regression, mobile E2E, and role-based UAT.
- Validate tenant lifecycle, service flow, purchasing/AP, refunds/voids/AR, reminders/channels, files/exports/offline/deletion.
- Burn down release-blocking defects.
- Collect product, QA, security, DevOps, engineering signoffs.
- Provision production.
- Bootstrap first platform admin.
- Verify seeds, plans, permissions, role templates, providers, storage, analytics, errors, backups, restore.
- Execute production smoke.
- Onboard limited pilot tenants.
- Monitor errors, latency, jobs, reports, exports, delivery.

**Required UAT Scenarios:**

1. Owner signup, verification, onboarding, first branch.
2. Platform-created tenant, owner invitation, subscription assignment, onboarding.
3. Employee invitation, role assignment, branch assignment, access restriction.
4. Customer/motorcycle creation, duplicate warning, service history, restore.
5. Estimate lifecycle and conversion.
6. Job order lifecycle, mechanic assignment, service/labor lines, release.
7. Mechanic session lifecycle and productivity reporting.
8. Product creation, purchase receiving, FIFO layer creation, low-stock alert.
9. Part reservation, job completion, FIFO consumption, COGS, ledger review.
10. Adjustment approval/posting.
11. Transfer reservation/send/receive/variance/FIFO preservation.
12. Supplier purchase, partial receiving, AP, supplier payment, return.
13. Invoice, billing allocation, issue, tax/discount, payment.
14. Split payment, receipt, refund, inventory reversal, AR recalculation.
15. Expense create/edit/void/report impact.
16. Reminder/channel enforcement/delivery/notification.
17. File upload/download/delete/restore/export attachments.
18. Dashboard/reports with branch filters and plan restrictions.
19. Tenant read-only/suspended/pending-deletion/renewal/export/deletion.
20. Offline shell and read-only cache.

**Deliverables:** QA report, traceability evidence, UAT/security/DevOps/business/engineering signoffs, deployment checklist, rollback/incident plan, pilot checklist.

**Gate:** all P0 pass; all P1 pass or have waivers; no unresolved Critical/High defects; regression, security, DB integrity, migration, idempotency, concurrency tests pass; performance/ops evidence complete; backup/DR evidence complete; launch plan approved.

---

## 8. Cross-Milestone Definition of Done

A feature is done only when:

- Requirement matches source docs.
- API contract implemented.
- Database constraints/indexes exist where needed.
- Auth, tenant status, permission, branch access, and plan limits enforced where applicable.
- Audit logs written where required.
- Idempotency implemented where required.
- Frontend handles success, validation, forbidden, loading, read-only/offline, and conflict states.
- Appropriate unit, integration, contract, E2E, security, concurrency, performance, and operational tests are added.
- Observability events, metrics, and logs are added.
- Documentation is updated.

---

## 9. Sprint Execution Pattern

For each milestone:

1. Review relevant source docs.
2. Confirm dependencies are complete.
3. Confirm excluded scope has not entered backlog.
4. Break work into vertical slices.
5. Attach PRD, RTM, user story, API, schema, permission, UX, QA, ADR, and audit references.
6. Define acceptance tests before implementation.
7. Implement database/API first for core workflows.
8. Implement frontend against API contract.
9. Run applicable tests.
10. Run observability/operational checklist.
11. Review with Product, QA, Security, UX, DevOps, Engineering, Operations.
12. Close only after quality gate passes.

---

## 10. Parallelization Guidance

| Safe Parallel Track                      | Rule                                                 |
| ---------------------------------------- | ---------------------------------------------------- |
| Frontend shell + backend foundation      | Use mocked contracts until APIs are ready.           |
| UX wireframes + API refinement           | Keep screens aligned to documented endpoints/states. |
| DB migrations + API DTOs                 | Keep schema/API enum values aligned.                 |
| Master-data UI + backend modules         | Use contract-first development.                      |
| Reporting design + transactional modules | Let report formulas influence data capture early.    |
| DevOps environments + feature work       | Staging must exist before complex integrations.      |
| Security review + module work            | Threat modeling is continuous.                       |
| QA design + implementation               | Acceptance tests before code completion.             |

Avoid parallelizing workflows that share critical transaction boundaries until foundational services are stable.

---

## 11. Remaining Decisions Before Deeper Feature Development

| Decision                                             | Needed Before     | Action                                                         |
| ---------------------------------------------------- | ----------------- | -------------------------------------------------------------- |
| Migration tool: Kysely migrations vs node-pg-migrate | M1                | Decide once and enforce in CI.                                 |
| Non-owner role-template default grants               | M1/M2             | Product Manager/BA + Business Owner approval.                  |
| OpenAPI generation approach                          | M2                | Choose generation and drift strategy.                          |
| PWA token transport details                          | M2                | Resolve cookie/bearer, CSRF, XSS trade-offs.                   |
| Email/SMS/push providers                             | M10               | Use adapters before vendor lock-in.                            |
| Object storage provider                              | M11               | Choose S3-compatible private storage.                          |
| RLS timing and policy coverage                       | M1/M13            | Repository/service scoping from day one; RLS by ADR.           |
| Append-only DB protections                           | M13 before launch | Implement immutability triggers/protections before production. |

---

## 12. Highest-Risk Areas

Prioritize tests and reviews around:

- Tenant isolation.
- Branch access.
- Inventory/FIFO allocation and consumption.
- Invoice billing allocations.
- Payment/refund idempotency.
- Immutable receipts.
- File access and signed URLs.
- Export/deletion jobs.
- Background job retries and duplicate side effects.
- Sensitive logging.
- Subscription lifecycle gates.
- Permission and role-template behavior.

---

## 13. Final Recommendation

Build GarageOS in the milestone order above. Stabilize foundations first: database constraints, auth/session security, tenant context, subscription status gates, RBAC, branch access, plan enforcement, idempotency, audit logging, transaction orchestration, and observability.

Then deliver vertical slices in dependency order: master data, service operations, inventory/FIFO, purchasing/AP, invoicing/payments/AR, expenses/reminders/notifications, files/exports/offline cache, dashboard/reports/search, hardening, UAT, and launch readiness.

Keep GarageOS as a modular monolith through initial production launch. Consider distributed services only after production evidence proves a clear scaling or organizational need and an approved ADR exists.
