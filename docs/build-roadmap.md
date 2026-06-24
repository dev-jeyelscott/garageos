# GarageOS Build Roadmap v1.3

**Document:** `garageos-build-roadmap-v1.3.md`  
**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Generated:** 2026-06-24  
**Status:** Source-aligned implementation roadmap  
**Roadmap Type:** Engineering sequencing roadmap, not product-scope phasing  
**Target Platform:** Mobile-first Progressive Web App  
**Primary Database Target:** PostgreSQL 16+

---

## 1. Purpose

This roadmap defines a step-by-step implementation sequence for GarageOS. It is designed to help the team build the system safely from foundations to launch readiness while preserving the approved product scope.

This document is intended for engineering, architecture, QA, UX, DevOps, security, product, business stakeholders, and future AI-assisted implementation sessions.

The roadmap answers:

1. What must be built first.
2. Which modules depend on other modules.
3. Which workflows are on the critical path.
4. What each role must validate.
5. What acceptance gates must pass before moving forward.
6. How to avoid accidental scope expansion.

---

## 2. Source-of-Truth Rules

The roadmap follows these source documents in priority order:

1. `requirements-v2.4.md`
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
12. `garageos-architecture-records.md`
13. Existing `build-roadmap.md` / `build-roadmap-v1.2.md`

If this roadmap conflicts with `requirements-v2.4.md`, the PRD wins. If this roadmap conflicts with the schema, architecture, API contracts, QA plan, permission matrix, tech stack, or ARDs, update the dependent artifact instead of inventing undocumented behavior.

---

## 3. Scope Guardrails

GarageOS is a single approved build scope. The milestones below are engineering checkpoints only. They are not MVP phases, not optional product phases, and not permission to defer documented requirements.

### In Scope

The roadmap covers only documented GarageOS capabilities:

- Mobile-first PWA.
- Multi-tenant SaaS backend.
- PostgreSQL schema and migrations.
- Tenant lifecycle and subscription enforcement.
- Platform administration.
- Authentication, session management, email verification, password reset, RBAC, branch access, and support access.
- Shop onboarding, settings, branches, employees, roles, and permissions.
- Customers, motorcycles, service catalog, estimates, job orders, and mechanic sessions.
- Products, inventory, FIFO costing, reservations, adjustments, transfers, and ledger entries.
- Suppliers, purchases, supplier returns, accounts payable, supplier payments, and supplier credits.
- Invoices, billing allocations, payments, receipts, refunds, voids, discounts, tax, and accounts receivable.
- Expenses.
- Customer reminders and internal notifications.
- Files, private object storage, signed URLs, tenant exports, and offline read-only cache.
- Dashboard, reports, search, report exports, and report calculation verification.
- Audit logs, idempotency, background jobs, observability, backup, retention, and disaster recovery.
- Security hardening, performance validation, UAT, and launch readiness.

### Explicitly Out of Scope

Do not implement or imply:

- Native iOS or Android applications.
- Offline transaction creation, editing, approval, sync queues, or conflict resolution.
- General ledger accounting, chart of accounts, journal entries, bank reconciliation, or formal accounting close.
- Payroll, commissions, payslips, or government payroll contribution workflows.
- Direct BIR or tax authority filing.
- E-commerce marketplace, online store, public checkout, or delivery workflow.
- Customer portal or customer self-service login.
- Loyalty points, rewards, membership tiers, or redemption.
- Service packages with package-level pricing or package redemption tracking.
- Predictive analytics, AI recommendations, forecasting, or custom BI dashboards beyond defined reports.
- Automated subscription payment collection through a payment gateway.
- Standalone walk-in retail POS/cart checkout independent of job orders or service invoices.
- Two-factor authentication.
- Microservices-first implementation.

---

## 4. Multi-Agent Roadmap Brainstorm Summary

| Role                 | Review Output                                                                                                                                                                                     | Roadmap Decision                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Business Owner       | GarageOS must support SaaS revenue, plan monetization, subscription lifecycle, support access, exports, and deletion rules.                                                                       | Build tenant lifecycle, platform admin, subscriptions, plan enforcement, export/deletion scaffolding, and support access early.             |
| Product Manager / BA | The roadmap must preserve full documented scope and avoid undocumented functionality.                                                                                                             | Treat milestones as engineering sequencing only and require traceability for every ticket.                                                  |
| SMEs                 | Motorcycle shop workflows require coherent service intake, repair execution, parts reservation, purchasing, invoicing, payments, AP/AR, reminders, and service history.                           | Sequence master data, service operations, inventory/FIFO, purchasing/AP, invoicing/payments/AR, reminders, and reports by dependency order. |
| End Users            | Owners, managers, advisors, mechanics, cashiers, and inventory clerks need fast mobile workflows with role boundaries.                                                                            | UX must support role-based landing, branch context, quick actions, blocked states, and small-screen completion.                             |
| Architect            | Modular monolith, PostgreSQL source of truth, tenant isolation, command-driven workflows, background jobs, and private object storage are the approved direction.                                 | Keep one backend deployable with strict module boundaries and explicit transaction orchestration.                                           |
| Senior Engineers     | Complex workflows need idempotency, locks, document-number safety, immutable ledgers, FIFO correctness, billing allocation safety, and clean service boundaries.                                  | Build transaction, idempotency, audit, policy, and locking utilities before high-risk workflows.                                            |
| UX Designer          | Screen map should drive routes, wireframes, offline/read-only states, permission-aware UI, lifecycle banners, and support markers.                                                                | Complete low-fidelity wireframes and a reusable component baseline before heavy frontend build.                                             |
| QA                   | Acceptance must cover tenant isolation, branch access, permissions, workflow transitions, idempotency, concurrency, FIFO, financial immutability, reports, exports, offline mode, and operations. | A milestone closes only after relevant QA evidence exists.                                                                                  |
| Security             | Highest-risk areas are tenant isolation, support access, token handling, file access, audit logs, rate limits, role assignment, refunds, voids, exports, and sensitive logs.                      | Run security review continuously and require high-risk signoff before closure.                                                              |
| DevOps               | CI/CD, environments, workers, schedulers, observability, backups, restore tests, provider failure tracking, runbooks, and DR evidence must be active throughout the build.                        | DevOps starts at Milestone 0 and remains active through launch.                                                                             |
| Project Manager      | Delivery must follow dependency order while preserving full-scope delivery.                                                                                                                       | Use milestone gates, dependency tracking, and signoffs as delivery controls.                                                                |

---

## 5. Critical Path

```text
Project foundation
  -> database migrations and seed data
  -> auth/session/security middleware
  -> tenant context + subscription gate + RBAC + branch access
  -> idempotency + audit + transaction utilities
  -> tenant lifecycle + onboarding + platform administration
  -> master data
  -> job orders and estimates
  -> inventory/FIFO reservations
  -> job completion with FIFO consumption
  -> purchasing/AP and supplier returns
  -> invoicing/billing allocations
  -> payments/receipts/refunds/AR
  -> expenses/reminders/notifications
  -> files, exports, offline read-only cache
  -> dashboard, reports, search, export formats
  -> security, observability, performance, DR hardening
  -> end-to-end UAT and launch readiness
```

The foundational rule is simple: do not build operational workflows on top of weak tenancy, weak authorization, weak migrations, weak transaction handling, weak idempotency, or weak audit logging.

---

## 6. Roadmap Principles

1. **Documentation first.** Implement documented behavior only.
2. **No invented scope.** Missing details become ADRs, clarification tickets, or downstream artifacts.
3. **Foundations first.** Auth, tenant context, subscription gates, RBAC, branch access, idempotency, audit logging, transaction utilities, observability, and database constraints come before operational modules.
4. **Multi-layer invariant protection.** Enforce critical rules through API validation, service policies, repository scoping, database constraints, indexes, row locks, optimistic locking, audit logs, and tests.
5. **Vertical slices after foundations.** Each feature slice must include database, API, domain logic, frontend, tests, observability, and docs.
6. **Backend and database are authoritative.** UI restrictions improve UX but must never be the only enforcement.
7. **Critical writes must be retry-safe.** Financial, inventory, billing, export, deletion, and irreversible background jobs require idempotency or equivalent duplicate-side-effect protection.
8. **Reports and exports are first-class.** Report formulas affect earlier data capture and must not be deferred as an afterthought.
9. **Mobile-first is mandatory.** Core workflows must work on small touch screens and unstable networks.
10. **Concurrency must be tested early.** The riskiest defects are duplicate numbers, FIFO over-allocation, overbilling, overpayment, over-refund, double consumption, and duplicated background side effects.

---

## 7. Milestone Overview

| Milestone | Name                                               | Primary Goal                                                                                                              | Main Dependencies      |
| --------: | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
|         0 | Project Foundation and Engineering Decisions       | Establish repo, standards, ADRs, CI, local dev, UX/QA planning.                                                           | Approved documentation |
|         1 | Database Foundation and Core Migrations            | Implement schema foundations, seed data, constraints, indexes, migration process, and fixtures.                           | M0                     |
|         2 | API Foundation, Auth, Tenant Context, RBAC         | Build secure request pipeline, auth/session flows, permission architecture, branch guard, idempotency, and audit helpers. | M0-M1                  |
|         3 | Tenant Lifecycle, Onboarding, Platform Admin       | Enable tenant creation, setup, subscription gates, plan enforcement, support access, export/deletion controls.            | M1-M2                  |
|         4 | Core Master Data                                   | Build branches, employees, roles, permission assignment, customers, motorcycles, services, and categories.                | M2-M3                  |
|         5 | Service Operations                                 | Build estimates, job orders, mechanic sessions, status transitions, notes/files, and assignment workflows.                | M4                     |
|         6 | Inventory Foundation and FIFO                      | Build products, stock balances, inventory ledger, reservations, FIFO layers, and FIFO allocation logic.                   | M1-M5 partial          |
|         7 | Inventory Workflows                                | Build adjustments, approval/posting flow, transfers, variance handling, low-stock alerts, and cancellation rules.         | M6                     |
|         8 | Purchasing, Suppliers, and AP                      | Build suppliers, purchase orders, receiving, supplier payments/credits, supplier returns, and AP basis.                   | M6                     |
|         9 | Invoicing, Payments, Receipts, Refunds, AR         | Build billing allocations, invoices, discounts/tax, payments, immutable receipts, refunds, voids, and AR.                 | M5-M8                  |
|        10 | Expenses, Reminders, Notifications, Integrations   | Build expenses, reminder rules, notification preferences, provider delivery tracking, and plan-based channel enforcement. | M3-M9                  |
|        11 | Files, Exports, Offline PWA Cache                  | Build attachments, private object storage, signed URLs, tenant exports, export jobs, and read-only offline cache.         | M2-M10                 |
|        12 | Dashboard, Reports, Search, Export Formats         | Build dashboard, reports, search/read models, CSV/PDF/Excel exports, and formula verification.                            | M6-M11                 |
|        13 | Security, Observability, Performance, DR Hardening | Harden security, logs, metrics, alerts, performance, backups, restore tests, RPO/RTO, and runbooks.                       | All previous           |
|        14 | End-to-End UAT and Launch Readiness                | Execute full acceptance, defect burn-down, sign-offs, production smoke, and controlled launch readiness.                  | All previous           |

---

# 8. Detailed Milestone Plan

## Milestone 0 — Project Foundation and Engineering Decisions

### Goal

Prepare the engineering organization and codebase for predictable execution.

### Step-by-Step Build Sequence

1. Initialize repository and workspace.
2. Choose final monorepo structure.
3. Create app packages: `web`, `api`, `worker`, `scheduler`.
4. Create shared packages: `shared`, `api-client`, `config`, `test-utils`.
5. Create `/docs/adr`, `/docs/runbooks`, `/docs/api`, and `/docs/testing`.
6. Configure TypeScript, linting, formatting, commit hooks, and test runner.
7. Configure local Docker Compose for PostgreSQL and local service execution.
8. Add `.env.example` with no real secrets.
9. Create CI pipeline for lint, typecheck, unit tests, dependency scan, and migration validation placeholder.
10. Record foundational ADRs: frontend, backend, query layer, migrations, enum strategy, token transport, RLS timing, append-only protections, background jobs, OpenAPI strategy, object storage, provider adapter strategy, and deployment model.
11. Create Definition of Done.
12. Create feature-ticket traceability template.
13. Create initial UX wireframe backlog from `ux-sreen-map.md`.
14. Create baseline QA automation structure.

### Deliverables

- Running local development setup.
- CI baseline.
- ADR directory and foundational ADRs.
- Initial README.
- Traceability template.
- Definition of Done.
- UX wireframe backlog.
- QA test folder structure.

### Acceptance Gate

- New developer can run the app locally using documented steps.
- CI blocks lint/type/unit-test failures.
- No secrets are committed.
- Foundational ADRs are accepted before database work starts.
- Feature tickets include PRD, RTM, user story, API, schema, permission, UX, QA, ADR, and audit references where applicable.

---

## Milestone 1 — Database Foundation and Core Migrations

### Goal

Implement the PostgreSQL foundation required by all modules.

### Step-by-Step Build Sequence

1. Finalize migration tool choice.
2. Add PostgreSQL extensions: `pg_trgm`, `unaccent`, `pgcrypto`, and optional `citext` if approved.
3. Define enum/check strategy.
4. Create platform/tenant/subscription schema.
5. Create user/auth/session/token schema.
6. Create roles, permissions, role permissions, user roles, and branch assignments.
7. Create shop profile, branches, and tenant settings tables.
8. Create customer and motorcycle tables.
9. Create services, estimates, job orders, mechanic sessions, and status history tables.
10. Create products, categories, stock balances, inventory ledger, FIFO layers, reservations, and allocations.
11. Create adjustments, transfers, suppliers, purchases, supplier returns, supplier payments, supplier credits, AP tables.
12. Create invoices, billing allocations, payments, receipts, refunds, AR tables.
13. Create expenses, reminders, notifications, outbox, files, exports, audit logs, idempotency keys, background jobs, and reporting/search read-model scaffolds.
14. Add constraints, unique indexes, tenant indexes, branch indexes, document-number uniqueness, and foreign keys.
15. Add seed data for plans, plan limits, permissions, and protected Shop Owner role behavior.
16. Add database fixture factory and migration tests.
17. Add schema drift checklist.

### Deliverables

- Versioned migrations.
- Seed data.
- Database integrity test suite.
- Migration validation in CI.
- Document-number strategy.
- Role-template seed-grant approval record.

### Acceptance Gate

- Empty database migrates successfully.
- Seed scripts are idempotent.
- Tenant-owned tables include `tenant_id`.
- Branch-specific tables include both `tenant_id` and `branch_id`.
- Money and quantity precision rules are implemented.
- Required constraints and indexes exist.
- Non-owner role default grants are not finalized without explicit approval.

---

## Milestone 2 — API Foundation, Auth, Tenant Context, RBAC

### Goal

Build the secure API foundation used by every module.

### Step-by-Step Build Sequence

1. Create REST API skeleton under `/api/v1`.
2. Implement response and error envelopes.
3. Add request ID and correlation ID middleware.
4. Implement auth routes: signup-owner, login, refresh, logout, logout-all, email verification, forgot/reset/change password, and session.
5. Implement password hashing and token hashing.
6. Implement access token expiration and refresh token rotation.
7. Implement remember-me session rules.
8. Implement login and password-reset rate limits.
9. Implement tenant context resolution from authenticated session.
10. Implement tenant status/subscription guard.
11. Implement platform admin and support access context.
12. Implement permission guard.
13. Implement branch access guard.
14. Implement validation pipeline.
15. Implement idempotency service for critical writes.
16. Implement optimistic locking convention.
17. Implement shared transaction wrapper.
18. Implement shared audit service.
19. Implement auth/session UI screens.
20. Add contract, integration, and security tests.

### Deliverables

- Auth APIs and screens.
- Shared authorization/policy engine.
- Shared transaction, idempotency, audit, and logging utilities.
- Stable error codes and response envelopes.
- API contract tests.

### Acceptance Gate

- Passwords and tokens are stored securely.
- Access tokens expire within documented limit.
- Refresh rotation works.
- Deactivated users cannot log in.
- Tenant clients cannot switch scope by passing `tenant_id`.
- Branch and permission denial responses are stable.
- Every response includes request/correlation metadata.
- Sensitive logs do not expose passwords, tokens, provider secrets, or sensitive payment/provider data.

---

## Milestone 3 — Tenant Lifecycle, Onboarding, Platform Admin

### Goal

Enable SaaS lifecycle operations before tenant business modules are widely used.

### Step-by-Step Build Sequence

1. Implement platform-created tenant flow.
2. Implement owner signup tenant flow.
3. Validate configured default plan and default subscription duration.
4. Implement onboarding state machine.
5. Implement shop profile setup.
6. Implement first branch setup.
7. Implement tax/localization setup.
8. Implement invoice prefix setup.
9. Implement onboarding completion gate.
10. Implement subscription status calculation.
11. Implement grace/read-only/suspended/pending-deletion/deleted gates.
12. Implement plan limit and tenant override service.
13. Implement platform tenant management screens.
14. Implement subscription override UI/API.
15. Implement support access session flow with reason, mode, expiry, visible marker, and audit logging.
16. Implement tenant lifecycle worker.
17. Implement tenant export/deletion job placeholders for later completion.
18. Implement renewal request/instructions flow without payment collection.

### Deliverables

- Platform tenant APIs and UI.
- Owner signup and onboarding flow.
- Subscription lifecycle worker.
- Plan enforcement service.
- Support access flow.
- Renewal request flow.
- Lifecycle audit/system logs.

### Acceptance Gate

- Owner signup is blocked if default plan/duration is missing.
- Pending setup tenant can access only allowed setup areas.
- Tenant becomes active only after onboarding and subscription requirements pass.
- Lifecycle dates use tenant timezone.
- Grace period allows operations with warnings.
- Read-only blocks operational writes.
- Suspended blocks non-owner users and allows owner renewal/export only.
- Pending deletion/deleted block tenant operational access.
- Subscription payment collection is not implemented in GarageOS.

---

## Milestone 4 — Core Master Data

### Goal

Build the tenant master-data foundation required by service, inventory, financial, reminder, and reporting workflows.

### Step-by-Step Build Sequence

1. Implement branch list/detail/create/update/deactivate/reactivate.
2. Enforce plan branch limits and last-active-branch rule.
3. Implement employee invitation, creation, deactivation, and reactivation.
4. Implement role and permission management.
5. Implement role-template edit protections.
6. Implement branch assignment and tenant-wide branch access management.
7. Implement customer create/search/detail/update/merge/soft-delete/restore.
8. Implement customer tags if supported by current schema/design.
9. Implement motorcycle create/search/detail/update/soft-delete/restore.
10. Implement service catalog create/read/update/deactivate.
11. Implement product category management where needed by inventory.
12. Add duplicate warnings without automatic merge.
13. Add audit logs for high-risk changes.
14. Add mobile-first screens for branches, employees, roles, customers, motorcycles, and services.

### Deliverables

- Master-data APIs and screens.
- Role-template seed configuration applied.
- Duplicate-warning services.
- Branch-access tests.
- Master-data audit events.

### Acceptance Gate

- Last Shop Owner cannot be deactivated or demoted.
- Branch limit rules are enforced.
- Customers and motorcycles are tenant-wide, but linked operational history is branch-filtered.
- Employee invitations are single-use, tenant-scoped, expiring, and audited.
- Role permissions resolve additively with no explicit deny.
- Shop Owner role protections cannot be bypassed.

---

## Milestone 5 — Service Operations

### Goal

Implement motorcycle service intake and repair execution workflows.

### Step-by-Step Build Sequence

1. Implement estimate number generation.
2. Implement estimate draft/create/update.
3. Implement estimate present, approve, convert, cancel, and expiration flows.
4. Implement job order number generation.
5. Implement job order create/detail/update.
6. Implement job order service, labor, and part line scaffolding.
7. Implement job order assignment to employees/mechanics.
8. Implement job order status transitions.
9. Implement correction workflow with permissions and audit reason.
10. Implement mechanic assigned-jobs view.
11. Implement mechanic session start/pause/resume/finish.
12. Implement service notes and labor task completion.
13. Implement job attachments placeholders until full file module.
14. Add status history and audit history UI.
15. Add mobile-first intake and mechanic workflows.

### Deliverables

- Estimate APIs/screens.
- Job order APIs/screens.
- Mechanic session APIs/screens.
- Workflow validators.
- Status history services.
- Service workflow tests.

### Acceptance Gate

- Estimates do not affect revenue, AR, on-hand stock, or FIFO layers.
- Job order represents one service engagement for one motorcycle at one branch.
- Job order transitions are explicit and validated.
- Mechanics do not see financial/supplier/subscription modules unless custom-granted.
- Status corrections require permission and reason.
- Branch and tenant isolation are enforced.

---

## Milestone 6 — Inventory Foundation and FIFO

### Goal

Build the authoritative inventory foundation before stock-affecting workflows depend on it.

### Step-by-Step Build Sequence

1. Implement product and category management.
2. Implement branch stock balances.
3. Implement immutable inventory ledger write service.
4. Implement FIFO layer creation and locking strategy.
5. Implement available stock calculation.
6. Implement inventory reservation command.
7. Implement FIFO reservation allocation from oldest available layers.
8. Implement reservation release.
9. Implement FIFO consumption records.
10. Integrate job order part reservation.
11. Integrate job order completion with FIFO consumption.
12. Implement inventory read/search APIs.
13. Add deterministic FIFO fixtures.
14. Add concurrency tests for reservation, allocation, and consumption.
15. Add reconciliation checks between balances, ledger, reservations, and FIFO layers.

### Deliverables

- Product/inventory APIs and screens.
- Ledger services.
- FIFO services.
- Reservation/release/consumption services.
- Job completion inventory integration.
- FIFO and stock concurrency tests.

### Acceptance Gate

- Stock-changing operations write ledger entries.
- FIFO consumes oldest available stock first.
- Reservations cannot exceed available stock.
- On-hand cannot drop below reserved quantity.
- Job completion consumes FIFO allocations atomically.
- COGS is calculated from consumed FIFO layers.
- Concurrent reservations cannot over-allocate stock.

---

## Milestone 7 — Inventory Workflows

### Goal

Implement adjustments, approvals, transfers, variance handling, and low-stock controls.

### Step-by-Step Build Sequence

1. Implement inventory adjustment draft/request flow.
2. Implement approval/rejection flow.
3. Implement posting flow with idempotency and locks.
4. Implement positive adjustment FIFO layer creation.
5. Implement negative adjustment FIFO consumption.
6. Implement force adjustment permission and reason handling.
7. Implement transfer draft/request flow.
8. Implement transfer reservation.
9. Implement transfer send.
10. Implement transfer receive.
11. Implement variance loss handling.
12. Implement transfer cancellation rules.
13. Implement low-stock alerts.
14. Integrate branch deactivation stock blockers.
15. Add audit and status history.

### Deliverables

- Adjustment APIs/screens.
- Transfer APIs/screens.
- Transfer and adjustment state machines.
- Low-stock alerts.
- Variance tests.
- Approval and audit tests.

### Acceptance Gate

- Posted adjustments are immutable and corrected only by new adjustments.
- Transfers preserve FIFO cost references as documented.
- Variance loss does not create AP, AR, revenue, or expense.
- Cancellation rules are enforced.
- Force adjustment is permission-protected, reasoned, and audited.

---

## Milestone 8 — Purchasing, Suppliers, and Accounts Payable

### Goal

Implement supplier, purchasing, receiving, supplier return, and AP workflows.

### Step-by-Step Build Sequence

1. Implement supplier create/read/update/deactivate/reactivate where documented.
2. Implement purchase order draft/create/update/cancel.
3. Implement ordered/received/partially received/closed transitions.
4. Implement purchase receiving with stock and FIFO layer creation.
5. Implement cash purchase behavior without AP liability.
6. Implement credit purchase AP behavior.
7. Implement supplier payment recording.
8. Implement supplier credits.
9. Implement supplier returns.
10. Implement supplier return valuation from documented costing basis.
11. Implement AP balances and report basis.
12. Add status history, audit logs, and idempotency.
13. Add purchasing and AP mobile screens.

### Deliverables

- Supplier APIs/screens.
- Purchase order APIs/screens.
- Receiving command service.
- Supplier payment/credit APIs.
- Supplier return APIs/screens.
- AP basis/report scaffolding.
- Receiving and supplier return tests.

### Acceptance Gate

- Purchase receiving updates stock and FIFO layers transactionally.
- Cash purchases do not create AP balances.
- Credit purchases create AP balances.
- Supplier returns adjust stock and supplier balance/credits according to documented rules.
- Receiving cannot over-receive purchase lines.
- Supplier balances and payment history are permission-protected.

---

## Milestone 9 — Invoicing, Payments, Receipts, Refunds, Accounts Receivable

### Goal

Implement billing, payment collection records, immutable receipts, refunds, voids, and AR.

### Step-by-Step Build Sequence

1. Implement invoice draft from job orders.
2. Implement billing allocation service to prevent overbilling.
3. Implement invoice line types and calculations.
4. Implement invoice-level discount allocation.
5. Implement tax calculation according to tenant tax settings.
6. Implement invoice issue action with idempotency.
7. Implement invoice cancellation/void rules.
8. Implement payment creation against invoice.
9. Generate exactly one immutable receipt per payment.
10. Implement partial and split payments.
11. Enforce overpayment blocking.
12. Implement refund creation with approval controls where documented.
13. Implement refund inventory reversal where applicable.
14. Implement paid-invoice refund status recalculation.
15. Implement AR balances and reporting basis.
16. Add financial immutability protections.
17. Add cashier mobile flows for invoice/payment/receipt/refund.

### Deliverables

- Invoice APIs/screens.
- Billing allocation service.
- Payment APIs/screens.
- Receipt APIs/screens.
- Refund APIs/screens.
- AR APIs/report scaffolding.
- Financial idempotency and concurrency tests.

### Acceptance Gate

- Invoice issuance cannot overbill job order lines.
- Payments cannot exceed collectible invoice balance.
- Every payment creates exactly one immutable receipt.
- Refunds cannot exceed refundable amount.
- Issued financial records are immutable or correction-only.
- Concurrent payments cannot overpay.
- Concurrent refunds cannot over-refund.

---

## Milestone 10 — Expenses, Reminders, Notifications, Integrations

### Goal

Implement operating expenses, customer reminders, internal notifications, provider adapters, delivery tracking, and plan-channel enforcement.

### Step-by-Step Build Sequence

1. Implement expense categories.
2. Implement expense create/read/update/void.
3. Implement expense financial report basis.
4. Implement reminder rules: time-based, mileage-based, birthday, and follow-up where documented.
5. Implement reminder scheduling worker.
6. Implement notification preferences.
7. Implement in-app notification delivery.
8. Implement push notification adapter.
9. Implement email adapter.
10. Implement SMS adapter.
11. Implement delivery attempts and failure tracking.
12. Enforce plan channels for reminders and notifications.
13. Implement no-silent-downgrade behavior for unavailable channels.
14. Add provider sandbox/test adapters.
15. Add sanitized logging for provider payloads.

### Deliverables

- Expense APIs/screens.
- Reminder APIs/screens.
- Notification APIs/screens.
- Provider adapter interfaces.
- Reminder/notification workers.
- Delivery attempt tracking.
- Plan-channel enforcement tests.

### Acceptance Gate

- Voided expenses are excluded from profit reports.
- Reminder channels obey plan limits.
- Disabled channels are blocked with clear plan/upgrade messaging.
- No silent fallback occurs when a channel is unavailable.
- Provider failures are observable and retry-safe.
- Provider secrets and sensitive payloads are not logged.

---

## Milestone 11 — Files, Exports, Offline PWA Cache

### Goal

Implement attachments, private file access, tenant export packages, export jobs, and read-only offline cache.

### Step-by-Step Build Sequence

1. Finalize object storage provider/configuration.
2. Implement private tenant-scoped object paths.
3. Implement upload intent API.
4. Implement signed upload/download URL flow.
5. Implement file metadata lifecycle.
6. Implement file linking to documented entities.
7. Implement file soft-delete and restore.
8. Implement retention rules for financial/audit-relevant files.
9. Implement full tenant export job.
10. Package structured data, relationship data, audit export, attachment manifest, README, and attachments unless metadata-only selected.
11. Implement export job status and safe error summaries.
12. Implement export download expiry.
13. Implement PWA manifest and service worker.
14. Implement app-shell cache.
15. Implement read-only recent-record cache.
16. Clear user-scoped cache on logout/session invalidation.
17. Block offline writes, uploads, approvals, payments, refunds, inventory actions, settings changes, and role changes.

### Deliverables

- File APIs/screens.
- Signed URL services.
- Export worker.
- Export job screens.
- Offline PWA shell and read-only cache.
- File access and offline tests.

### Acceptance Gate

- No permanent public tenant file URLs exist.
- Signed URLs are time-limited.
- File access respects tenant, permission, and branch scope.
- Tenant exports include required data and attachments where selected.
- Large exports are asynchronous.
- Offline cache is read-only, user-scoped, and cleared on logout.
- Cached records do not bypass permissions after reconnect.

---

## Milestone 12 — Dashboard, Reports, Search, Export Formats

### Goal

Implement operational visibility, search, reports, exports, and calculation verification.

### Step-by-Step Build Sequence

1. Implement dashboard summary API and screen.
2. Implement revenue chart.
3. Implement inventory alerts.
4. Implement customer reports.
5. Implement service reports.
6. Implement inventory reports.
7. Implement AR/AP reports.
8. Implement revenue, collection, COGS, gross profit, expenses, and variance reports.
9. Implement branch comparison reports where plan allows.
10. Implement advanced operational reports where plan allows.
11. Implement search read models for documented entities.
12. Implement CSV/PDF/Excel export formats where documented.
13. Implement report export jobs for large exports.
14. Add formula verification fixtures.
15. Add performance tests for high-volume lists, dashboards, ledgers, search, and exports.

### Deliverables

- Dashboard APIs/screens.
- Report APIs/screens.
- Search APIs/screens.
- Report calculation services.
- Read-model generation jobs.
- Export format fixtures.
- Report access tests.

### Acceptance Gate

- Reports respect tenant, branch, role, and plan access.
- Branch comparison reports are blocked unless plan allows.
- Advanced reports are blocked unless plan allows.
- Search excludes soft-deleted records by default.
- Large reports/exports run asynchronously where required.
- Dashboard handles empty data, branch filters, renewal warnings, read-only banners, and low-stock alerts.
- Stock valuation uses remaining FIFO quantities and unit costs.
- COGS comes from FIFO consumption records.

---

## Milestone 13 — Security, Observability, Performance, DR Hardening

### Goal

Harden the full system for production readiness.

### Step-by-Step Build Sequence

1. Run threat modeling by module.
2. Run tenant isolation tests across UI, API, repository, database, files, reports, and exports.
3. Run branch access tests across branch-specific records and linked histories.
4. Run support access audit review.
5. Run sensitive log review.
6. Run rate-limit tests.
7. Run dependency and container scans.
8. Add/verify structured logs.
9. Add/verify metrics.
10. Add/verify error monitoring.
11. Add/verify traces and correlation IDs.
12. Verify background job observability.
13. Run API performance tests.
14. Run report/export performance tests.
15. Configure encrypted backups.
16. Perform restore rehearsal.
17. Validate or formally waive RPO 24h and RTO 4h targets.
18. Complete runbooks: deployment, rollback, backup/restore, incident response, support access, tenant lifecycle, provider failures.

### Deliverables

- Security test report.
- Sensitive log review evidence.
- Performance test report.
- Observability dashboard/runbook.
- Background job retry/failure evidence.
- Backup and restore evidence.
- DR readiness checklist.
- Launch support runbooks.
- Incident response baseline.

### Acceptance Gate

- Tenant isolation and branch access tests pass.
- Sensitive passwords, tokens, provider secrets, and card/provider details are not logged, exported, or returned.
- Support access sessions are explicit, reasoned, visible, expiring, and audited.
- Background jobs are observable, retry-safe, and do not duplicate irreversible side effects.
- Performance targets have evidence or approved mitigation.
- Encrypted backups and restore evidence exist.
- RPO/RTO targets are validated or formally waived.

---

## Milestone 14 — End-to-End UAT and Launch Readiness

### Goal

Validate the full approved product scope, resolve release-blocking defects, and prepare controlled production launch.

### Step-by-Step Build Sequence

1. Freeze release-candidate scope against approved source docs.
2. Run full regression suite.
3. Run mobile-first E2E workflows.
4. Run role-based UAT scenarios for owner, manager, service advisor, mechanic, cashier, inventory clerk, and platform admin.
5. Validate tenant lifecycle states end to end.
6. Validate full service workflow from customer/motorcycle intake through job order, inventory consumption, invoice, payment, receipt, and report impact.
7. Validate purchasing/AP workflow.
8. Validate refunds/voids/AR recalculation.
9. Validate reminders/notifications and plan channels.
10. Validate files, exports, offline cache, and deletion lifecycle.
11. Burn down release-blocking defects.
12. Collect product, QA, security, DevOps, and engineering signoffs.
13. Provision production environment.
14. Bootstrap first platform admin.
15. Verify seeds, plans, permissions, role templates, provider configs, storage, analytics, error monitoring, backups, and restore procedures.
16. Execute production smoke plan.
17. Onboard limited pilot tenants manually.
18. Monitor errors, latency, background jobs, reports, exports, and provider delivery.
19. Fix launch defects before broader sales rollout.

### Required UAT Scenarios

1. Owner signup, email verification, onboarding, and first branch setup.
2. Platform-created tenant, owner invitation, subscription assignment, and onboarding.
3. Employee invitation, role assignment, branch assignment, and access restriction.
4. Customer and motorcycle creation, duplicate warning, service history, and restore workflow.
5. Estimate creation, presentation, approval, expiration, cancellation, and conversion.
6. Job order creation, mechanic assignment, status transitions, service/labor lines, and release.
7. Mechanic session start, pause, resume, finish, and productivity reporting.
8. Product creation, purchase receiving, FIFO layer creation, and low-stock alert.
9. Job order part reservation, completion, FIFO consumption, COGS calculation, and ledger review.
10. Inventory adjustment approval and posting.
11. Branch transfer reservation, send, receive, variance loss, and FIFO cost preservation.
12. Supplier purchase, partial receiving, AP creation, supplier payment, and supplier return.
13. Invoice creation, billing allocation, issuance, tax/discount calculation, and payment.
14. Split payment, receipt generation, refund, refund inventory reversal, and AR recalculation.
15. Expense creation, edit, void, and financial report impact.
16. Reminder creation, channel enforcement, delivery tracking, and notification display.
17. File upload, signed download, soft deletion, restoration, and export attachment packaging.
18. Dashboard and reports with branch filters and plan restrictions.
19. Tenant read-only, suspended, pending-deletion, renewal, export, and deletion lifecycle.
20. Offline app shell and read-only recent-record cache behavior.

### Deliverables

- Full QA execution report.
- Traceability evidence from requirements to tests.
- UAT signoff.
- Security signoff.
- DevOps signoff.
- Product/Business signoff.
- Production deployment checklist.
- Rollback/incident plan.
- Pilot tenant onboarding checklist.

### Acceptance Gate

- All P0 tests pass.
- All P1 tests pass or have approved release waivers.
- No unresolved Critical or High defects remain.
- Regression suite passes.
- Security acceptance tests pass.
- Database integrity, migration, idempotency, and concurrency tests pass.
- Performance and operational readiness evidence is complete.
- Backup/restore and DR evidence is complete.
- Product Owner, QA, Security, DevOps, and Engineering sign off.
- Controlled production launch plan is approved.

---

# 9. Cross-Milestone Definition of Done

A feature is done only when:

- Requirement is implemented according to source docs.
- API contract is implemented.
- Database constraints and indexes are present where applicable.
- Authorization and branch access are enforced.
- Tenant status behavior is enforced where applicable.
- Plan limits are enforced where applicable.
- Audit logs are written where required.
- Idempotency is implemented where required.
- Frontend handles success, validation errors, forbidden states, loading states, read-only/offline states, and conflict states.
- Unit, integration, contract, E2E, security, and concurrency tests are added as appropriate.
- Observability events, metrics, and logs are added.
- Documentation is updated.

---

# 10. Sprint Execution Pattern

For each milestone:

1. Review relevant source documentation.
2. Confirm dependencies are complete.
3. Confirm no excluded scope has entered the backlog.
4. Break milestone into vertical slices.
5. Attach PRD, RTM, user story, API, schema, permission, UX, QA, and ADR references.
6. Define acceptance tests before implementation.
7. Implement database and API first for core workflows.
8. Implement frontend against API contract.
9. Run unit, integration, contract, E2E, security, concurrency, performance, and operational tests as applicable.
10. Run observability and operational checklist.
11. Review with Product, QA, Security, UX, DevOps, Engineering, and Operations.
12. Close milestone only after the quality gate passes.

---

# 11. Parallelization Guidance

Safe parallel work:

| Parallel Track                              | Rule                                                       |
| ------------------------------------------- | ---------------------------------------------------------- |
| Frontend shell and backend foundation       | Use mocked contracts until APIs are ready.                 |
| UX wireframes and API refinement            | Keep screens aligned to documented endpoints and states.   |
| Database migrations and API DTOs            | Keep schema/API enum values aligned.                       |
| Master-data UI and backend modules          | Use contract-first development.                            |
| Reporting design and transactional modules  | Report formulas should influence data capture early.       |
| DevOps environments and feature development | Staging must exist before complex integrations.            |
| Security review and module development      | Threat modeling happens continuously.                      |
| QA design and implementation                | Acceptance tests should be written before code completion. |

Avoid parallelizing workflows that share critical transaction boundaries until foundational services are stable.

---

# 12. Remaining Decisions Before Deeper Feature Development

These are not product-scope gaps. They are implementation decisions that must be recorded through ADRs or approval artifacts.

| Decision                                                   | Needed Before              | Recommended Action                                                                |
| ---------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| Final migration tool: Kysely migrations vs node-pg-migrate | Milestone 1                | Decide once and enforce in CI.                                                    |
| Non-owner role-template default seed grants                | Milestone 1 / 2            | Product Manager / BA + Business Owner approval required.                          |
| OpenAPI generation approach                                | Milestone 2                | Choose generation/contract drift strategy.                                        |
| PWA token transport details                                | Milestone 2                | Resolve secure cookie vs bearer handling and CSRF/XSS trade-offs.                 |
| Email/SMS/push provider choices                            | Milestone 10               | Use adapter interface before vendor lock-in.                                      |
| Object storage provider                                    | Milestone 11               | Choose S3-compatible private storage.                                             |
| RLS timing and policy coverage                             | Milestone 1 / 13           | Repository/service scoping required from day one; RLS as defense-in-depth by ADR. |
| Append-only database protections                           | Milestone 13 before launch | Implement approved immutability triggers/protections before production.           |

---

# 13. Final Recommendation

Build GarageOS in the milestone order above. Start with foundations that protect the entire system: database constraints, auth/session security, tenant context, subscription status gates, RBAC, branch access, plan capability enforcement, idempotency, audit logging, transaction orchestration, and observability.

After foundations are stable, implement vertical slices in dependency order: master data, service operations, inventory/FIFO, purchasing/AP, invoicing/payments/AR, expenses/reminders/notifications, files/exports/offline cache, dashboard/reports/search, hardening, UAT, and launch readiness.

The highest-risk areas are tenant isolation, branch access, inventory/FIFO, invoice billing allocations, payment/refund idempotency, immutable receipts, file access, export/deletion jobs, and background job retries. These require the strongest automated test coverage, concurrency tests, rollback tests, security checks, and operational evidence.

GarageOS should remain a modular monolith through initial production launch. Distributed services should be considered only after production usage proves a clear scaling or organizational need and only through an approved ADR.
