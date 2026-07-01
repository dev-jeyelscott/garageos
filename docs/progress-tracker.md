# GarageOS Progress Tracker

**File:** `docs/progress-tracker.md`  
**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Updated:** 2026-07-01  
**Status:** Working tracker for engineering handoffs
**Source Mode:** Documentation-first, repository verification pending in this chat

---

## Tracker Rules

- This tracker follows the approved GarageOS source documents and previous handoff context.
- Product scope comes from `requirements-v2.4.md` and the roadmap; implementation sequencing comes from `garageos-build-roadmap-v1.3.md`.
- Backend/API/database remain authoritative. UI behavior improves usability but does not replace backend authorization, tenant isolation, branch access, tenant lifecycle gates, plan limits, audit logging, idempotency, or database constraints.
- Do not mark implementation as fully done unless confirmed by repository state, command output, committed code review, or explicit user-provided validation.
- Current repository state was not inspected in this chat. Items previously completed in handoff context are marked as `Needs Review` where fresh repo verification is still required.
- Explicit exclusions remain out of scope: native apps, offline writes, customer portal, standalone POS, payroll, full accounting/general ledger, direct BIR filing, e-commerce marketplace, loyalty, service packages, automatic subscription payment collection, 2FA, microservices-first architecture, and undocumented AI/advanced analytics.

---

# 1. Project Progress Summary

## Overall Completion Snapshot

| Area                                 | Status             | Evidence / Notes                                                                                                                                                                    |
| ------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation baseline               | Done               | Approved source documents are available and define full build scope, roadmap, API, schema, UX, QA, permissions, stack, and ARDs.                                                    |
| Repository verification in this chat | Needs Review       | No live repository inspection or validation commands were run while creating this tracker.                                                                                          |
| Current implementation baseline      | Needs Review       | Prior handoff context indicates backend foundations through Milestone 7 Step 7.15 were completed and user reported validation passed, but this tracker does not re-verify the repo. |
| Current active workstream            | In Progress        | User paused Milestone 8 backend work and shifted focus to implementing platform UIs first.                                                                                          |
| Recommended next slice               | In Progress / Next | Platform Tenant Management UI: `/platform/tenants`, `/platform/tenants/{tenant_id}`, `/platform/tenants/new`.                                                                       |
| Frontend UI coverage                 | Needs Review       | Platform Overview UI extraction/refactor has been discussed; most documented platform and tenant screens need inventory/verification.                                               |
| Validation status                    | Needs Review       | Run web/API validation commands locally before marking any UI or backend slice done.                                                                                                |

## Current Milestone / Workstream

| Field                                           | Value                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Roadmap milestone currently paused              | Milestone 8 — Purchasing, Suppliers, and AP                                            |
| Active workstream                               | Platform UI implementation before continuing Milestone 8                               |
| Current UI slice                                | Platform Tenant Management UI                                                          |
| Last reported completed roadmap step            | Milestone 7 Step 7.15 — Audit and status history, with user-reported validation passed |
| Next recommended roadmap step after UI catch-up | Resume Milestone 8 Step 8.1 — Supplier create/read/update/deactivate/reactivate        |

## Known Blockers

| Blocker                                                                             | Impact                                                           | Resolution                                                                                           |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Current repo state not inspected in this chat                                       | Cannot safely mark implementation as fully verified              | Run local validation and inspect current files before changing code.                                 |
| Platform UI module coverage not fully verified                                      | Need to identify missing/existing UI pages before implementation | Build or update a UI inventory against `ux-sreen-map.md`, `ui-registry.md`, and actual routes.       |
| Platform tenant management pages are next but require exact existing shell patterns | Risk of duplicating shell or adding undocumented widgets         | Keep `/platform/*` inside authenticated platform shell and reuse existing source-aligned components. |
| Some platform admin account APIs are not fully detailed                             | Risk of inventing undocumented platform admin workflows          | Treat `/platform/admin-users` as conditional and confirm API support before building.                |

## Validation Status Summary

| Validation Area               | Status       | Command / Evidence                       |
| ----------------------------- | ------------ | ---------------------------------------- |
| API typecheck                 | Needs Review | `pnpm --filter @garageos/api typecheck`  |
| API tests                     | Needs Review | `pnpm --filter @garageos/api test`       |
| Web typecheck                 | Needs Review | `pnpm --filter @garageos/web typecheck`  |
| Web lint                      | Needs Review | `pnpm --filter @garageos/web lint`       |
| Web tests                     | Needs Review | `pnpm --filter @garageos/web test`       |
| Web build                     | Needs Review | `pnpm --filter @garageos/web build`      |
| Database migration validation | Needs Review | `pnpm db:migrate && pnpm db:validate`    |
| Full workspace validation     | Needs Review | `pnpm lint && pnpm test` where available |

---

# 2. Milestone Tracker

## Milestone Status Legend

| Status         | Meaning                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `Done`         | Confirmed complete by repository state and passing validation.                                                 |
| `In Progress`  | Actively being implemented or refactored.                                                                      |
| `Needs Review` | Previously reported complete or partially complete, but current repo/validation was not verified in this chat. |
| `Blocked`      | Cannot continue without a documented dependency or decision.                                                   |
| `Not Started`  | No confirmed implementation yet.                                                                               |

## Milestone Overview

| Milestone | Name                                               | Goal                                                                                                                      | Status       | Dependencies           | Notes                                                                                                       |
| --------: | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
|         0 | Project Foundation and Engineering Decisions       | Establish repo, standards, ADRs, CI, local dev, UX/QA planning.                                                           | Needs Review | Approved documentation | Prior work appears to have advanced beyond this milestone; verify current repo.                             |
|         1 | Database Foundation and Core Migrations            | Implement schema foundations, seed data, constraints, indexes, migration process, and fixtures.                           | Needs Review | M0                     | Backend work through inventory implies substantial completion; verify migrations and seed state.            |
|         2 | API Foundation, Auth, Tenant Context, RBAC         | Build secure request pipeline, auth/session flows, permission architecture, branch guard, idempotency, and audit helpers. | Needs Review | M0-M1                  | Must remain authoritative for all future UI work.                                                           |
|         3 | Tenant Lifecycle, Onboarding, Platform Admin       | Enable tenant creation, setup, subscription gates, plan enforcement, support access, export/deletion controls.            | In Progress  | M1-M2                  | Platform UI work is currently active. Backend/API likely partially present; UI coverage needs verification. |
|         4 | Core Master Data                                   | Build branches, employees, roles, permissions, customers, motorcycles, services, and categories.                          | Needs Review | M2-M3                  | Previous handoff context indicates branch service work exists; verify UI/API coverage.                      |
|         5 | Service Operations                                 | Build estimates, job orders, mechanic sessions, status transitions, notes/files, and assignment workflows.                | Needs Review | M4                     | Inventory workflows depended on service operations; verify current implementation.                          |
|         6 | Inventory Foundation and FIFO                      | Build products, stock balances, ledger, reservations, FIFO layers, and allocation logic.                                  | Needs Review | M1-M5 partial          | Prior work indicates inventory foundation exists; verify ledger/FIFO tests.                                 |
|         7 | Inventory Workflows                                | Build adjustments, approval/posting, transfers, variance handling, low-stock alerts, cancellation rules.                  | Needs Review | M6                     | User reported Step 7.15 passed. Mark final done only after repo validation.                                 |
|         8 | Purchasing, Suppliers, and AP                      | Build suppliers, purchase orders, receiving, supplier payments/credits, supplier returns, and AP basis.                   | Not Started  | M6                     | Paused before start to focus platform UIs.                                                                  |
|         9 | Invoicing, Payments, Receipts, Refunds, AR         | Build billing allocations, invoices, discounts/tax, payments, receipts, refunds, voids, and AR.                           | Not Started  | M5-M8                  | Depends on M8 and earlier service/inventory workflows.                                                      |
|        10 | Expenses, Reminders, Notifications, Integrations   | Build expenses, reminder rules, notification preferences, delivery tracking, and plan-channel enforcement.                | Not Started  | M3-M9                  | Provider choices may remain ADR-backed.                                                                     |
|        11 | Files, Exports, Offline PWA Cache                  | Build attachments, signed URLs, tenant exports, export jobs, and read-only offline cache.                                 | Not Started  | M2-M10                 | Must not introduce offline writes.                                                                          |
|        12 | Dashboard, Reports, Search, Export Formats         | Build dashboard, reports, search/read models, export formats, and formula verification.                                   | Not Started  | M6-M11                 | Some dashboard/platform overview UI may exist but requires verification.                                    |
|        13 | Security, Observability, Performance, DR Hardening | Harden security, logs, metrics, alerts, performance, backups, restore tests, runbooks.                                    | Not Started  | All previous           | Continuous review should happen, but milestone closure is later.                                            |
|        14 | End-to-End UAT and Launch Readiness                | Execute full acceptance, defect burn-down, sign-offs, production smoke, controlled launch readiness.                      | Not Started  | All previous           | Launch readiness only after full validation evidence.                                                       |

## Milestone 0 — Project Foundation and Engineering Decisions

**Goal:** Establish repo, standards, ADRs, CI, local dev, UX/QA planning.

**Status:** `Needs Review`

**Dependencies:** Approved documentation.

**Done Checklist**

- [x] Approved documentation package exists.
- [x] Tech stack and ARD package exist as source documents.
- [x] Roadmap defines repository, ADR, CI, QA, and UX planning requirements.

**Pending Checklist**

- [ ] Verify current repo monorepo structure.
- [ ] Verify CI baseline and local dev setup.
- [ ] Verify ADR directory and accepted foundational records in repository.
- [ ] Verify `.env.example` contains no real secrets.

**Blockers**

- Current repository state not inspected in this chat.

**Validation / QA Gates**

```bash
pnpm install
pnpm lint
pnpm test
```

**Notes / Handoff Context**

- Foundational requirements must stay documentation-first and should not be rewritten unless repo verification proves gaps.

## Milestone 1 — Database Foundation and Core Migrations

**Goal:** Implement PostgreSQL schema foundations, seed data, constraints, indexes, migration process, and fixtures.

**Status:** `Needs Review`

**Dependencies:** Milestone 0.

**Done Checklist**

- [x] Database schema source document exists.
- [x] Roadmap defines migration, enum/check, seed, constraint, index, fixture, and drift requirements.
- [x] Later inventory work implies some database foundation likely exists.

**Pending Checklist**

- [ ] Verify migrations exist and run cleanly from empty database.
- [ ] Verify tenant-owned tables include `tenant_id`.
- [ ] Verify branch-specific tables include both `tenant_id` and `branch_id`.
- [ ] Verify seed data for plans, plan limits, permissions, and protected Shop Owner role behavior.
- [ ] Verify document-number uniqueness and precision constraints.

**Blockers**

- Non-owner role-template default grants require product approval if not already approved.
- Current migration tool and schema drift checks need repo verification.

**Validation / QA Gates**

```bash
pnpm db:migrate
pnpm db:validate
pnpm --filter @garageos/api test
```

**Notes / Handoff Context**

- Database invariants must protect tenant isolation, branch scoping, ledger-first inventory, financial immutability, and idempotency.

## Milestone 2 — API Foundation, Auth, Tenant Context, RBAC

**Goal:** Build secure request pipeline, auth/session flows, permission architecture, branch guard, idempotency, and audit helpers.

**Status:** `Needs Review`

**Dependencies:** M0-M1.

**Done Checklist**

- [x] API contracts define `/api/v1`, envelopes, errors, auth/session, tenant context, branch access, subscription guard, permissions, idempotency, and locking conventions.
- [x] Prior backend work implies shared guards/services exist.

**Pending Checklist**

- [ ] Verify auth APIs and session payload.
- [ ] Verify request/correlation ID middleware.
- [ ] Verify tenant status guard runs before operational permission checks.
- [ ] Verify permission guard and branch access guard are used across protected modules.
- [ ] Verify idempotency service for critical writes.
- [ ] Verify shared audit service and transaction wrapper.

**Blockers**

- Any weak foundation here blocks all operational modules and UI wiring.

**Validation / QA Gates**

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
```

**Notes / Handoff Context**

- Do not build UI-only permissions. Backend authorization remains authoritative.

## Milestone 3 — Tenant Lifecycle, Onboarding, Platform Admin

**Goal:** Enable tenant creation, setup, subscription gates, plan enforcement, support access, export/deletion controls.

**Status:** `In Progress`

**Dependencies:** M1-M2.

**Done Checklist**

- [x] Documentation defines tenant statuses, lifecycle, pending setup access, renewal rules, platform admin capabilities, and support access safeguards.
- [x] Platform overview UI extraction/refactor has been discussed in prior handoff context.
- [x] Platform Tenant Management UI has been selected as the next UI foundation slice.

**Pending Checklist**

- [ ] Verify existing `/platform` overview route and authenticated platform shell.
- [ ] Implement or verify `/platform/tenants` tenant list UI.
- [ ] Implement or verify `/platform/tenants/{tenant_id}` tenant detail UI.
- [ ] Implement or verify `/platform/tenants/new` tenant creation UI.
- [ ] Keep subscription, support access, export, deletion, and audit context attached naturally to tenant detail.
- [ ] Keep unsupported aggregate support sessions and activity feed clearly labeled as planned placeholders if shown.

**Blockers**

- Need exact current UI route/component state before code changes.
- Must avoid payment-gateway language or automatic subscription collection copy.

**Validation / QA Gates**

```bash
pnpm --filter @garageos/web typecheck
pnpm --filter @garageos/web lint
pnpm --filter @garageos/web test
pnpm --filter @garageos/web build
```

**Notes / Handoff Context**

- Current active work should prioritize platform pages before resuming Milestone 8 backend.

## Milestone 4 — Core Master Data

**Goal:** Build branches, employees, roles, permission assignment, customers, motorcycles, services, and categories.

**Status:** `Needs Review`

**Dependencies:** M2-M3.

**Done Checklist**

- [x] Prior handoff context indicates branch module work exists.
- [x] Branch deactivation stock blockers were reviewed during Milestone 7 work.

**Pending Checklist**

- [ ] Verify branch management API and UI coverage.
- [ ] Verify employee invitation and role assignment flows.
- [ ] Verify customer and motorcycle APIs/UI.
- [ ] Verify service catalog and product category UI/API.
- [ ] Verify duplicate warnings and audit logs.

**Blockers**

- UI coverage may lag behind backend implementation.

**Validation / QA Gates**

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm --filter @garageos/web typecheck
pnpm --filter @garageos/web test
```

**Notes / Handoff Context**

- Branch access and plan branch limits remain high-risk access-control areas.

## Milestone 5 — Service Operations

**Goal:** Build estimates, job orders, mechanic sessions, status transitions, notes/files, and assignment workflows.

**Status:** `Needs Review`

**Dependencies:** M4.

**Done Checklist**

- [x] Prior inventory work implies job order integration points likely exist.

**Pending Checklist**

- [ ] Verify estimate APIs/screens.
- [ ] Verify job order APIs/screens.
- [ ] Verify mechanic session APIs/screens.
- [ ] Verify status history and audit history UI.
- [ ] Verify job completion integration with FIFO consumption.

**Blockers**

- File attachments may remain placeholders until Milestone 11.

**Validation / QA Gates**

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm --filter @garageos/web typecheck
pnpm --filter @garageos/web test
```

**Notes / Handoff Context**

- Estimates must not affect revenue, AR, stock, or FIFO layers.

## Milestone 6 — Inventory Foundation and FIFO

**Goal:** Build products, stock balances, inventory ledger, reservations, FIFO layers, and FIFO allocation logic.

**Status:** `Needs Review`

**Dependencies:** M1-M5 partial.

**Done Checklist**

- [x] Prior Milestone 7 work depends on inventory foundation and suggests implementation exists.

**Pending Checklist**

- [ ] Verify product/category management.
- [ ] Verify stock balances and inventory ledger write service.
- [ ] Verify FIFO layer locking and allocation.
- [ ] Verify reservation/release/consumption services.
- [ ] Verify reconciliation and concurrency tests.

**Blockers**

- FIFO correctness is a production-critical risk if not covered by tests.

**Validation / QA Gates**

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
```

**Notes / Handoff Context**

- Stock-changing operations must always write immutable ledger entries.

## Milestone 7 — Inventory Workflows

**Goal:** Build adjustments, approval/posting flow, transfers, variance handling, low-stock alerts, and cancellation rules.

**Status:** `Needs Review`

**Dependencies:** M6.

**Done Checklist**

- [x] Step 7.13 — Low-stock alerts backend workflow was reported completed in prior context.
- [x] Step 7.14 — Branch deactivation stock blockers was reported completed in prior context.
- [x] Step 7.15 — Audit and status history was reported as passing by user context.
- [x] User previously reported validation passed for Step 7.15.

**Pending Checklist**

- [ ] Re-run repository validation before marking Milestone 7 fully `Done`.
- [ ] Verify all adjustment and transfer APIs/screens if UI exists.
- [ ] Verify audit/status history UI coverage where applicable.

**Blockers**

- Current repository state not inspected in this chat.

**Validation / QA Gates**

```bash
pnpm db:migrate
pnpm db:validate
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm dev:api
```

**Notes / Handoff Context**

- The next roadmap backend milestone would normally be Milestone 8, but the current instruction is to focus platform UIs first.

## Milestone 8 — Purchasing, Suppliers, and Accounts Payable

**Goal:** Build suppliers, purchase orders, receiving, supplier payments/credits, supplier returns, and AP basis.

**Status:** `Not Started`

**Dependencies:** M6.

**Done Checklist**

- [x] Supplier list/search route scaffold added at `/suppliers`.
- [x] Supplier list/search screen wired to documented `GET /api/v1/suppliers` endpoint.
- [x] Supplier search supports `q`, `status`, cursor pagination, loading, empty, forbidden, and error states.
- [x] Tenant navigation includes Suppliers behind `suppliers.read`.
- [x] Supplier write/payment/credit/return actions remain disabled or planned in this slice.

**Pending Checklist**

- [ ] Supplier create/read/update/deactivate/reactivate.
- [ ] Purchase order draft/create/update/cancel.
- [ ] Purchase receiving with stock and FIFO layer creation.
- [ ] Cash purchase behavior without AP liability.
- [ ] Credit purchase AP behavior.
- [ ] Supplier payment/credit workflows.
- [ ] Supplier returns and valuation.
- [ ] AP balances and reports.
- [ ] Purchasing/AP mobile screens.

**Blockers**

- Paused by user to focus platform UI implementation first.

**Validation / QA Gates**

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm --filter @garageos/web typecheck
pnpm --filter @garageos/web test
```

**Notes / Handoff Context**

- Resume after platform UI foundation has been stabilized.

## Milestone 9 — Invoicing, Payments, Receipts, Refunds, Accounts Receivable

**Goal:** Build billing allocations, invoices, discounts/tax, payments, immutable receipts, refunds, voids, and AR.

**Status:** `Not Started`

**Dependencies:** M5-M8.

**Done Checklist**

- [ ] No confirmed implementation in this tracker.

**Pending Checklist**

- [ ] Invoice draft from job orders.
- [ ] Billing allocation service.
- [ ] Discount/tax calculations.
- [ ] Invoice issue/cancel/void with idempotency.
- [ ] Payment creation and immutable receipts.
- [ ] Partial and split payments.
- [ ] Refund workflow and inventory reversal where applicable.
- [ ] AR balances and reporting basis.
- [ ] Cashier mobile flows.

**Blockers**

- Depends on purchasing/AP and prior service/inventory completion.

**Validation / QA Gates**

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm --filter @garageos/web typecheck
pnpm --filter @garageos/web test
```

**Notes / Handoff Context**

- Financial immutability and idempotency are mandatory.

## Milestone 10 — Expenses, Reminders, Notifications, Integrations

**Goal:** Build expenses, reminder rules, notification preferences, provider delivery tracking, and plan-based channel enforcement.

**Status:** `Not Started`

**Dependencies:** M3-M9.

**Done Checklist**

- [ ] No confirmed implementation in this tracker.

**Pending Checklist**

- [ ] Expense categories and expense workflows.
- [ ] Reminder rules and scheduler.
- [ ] Notification preferences.
- [ ] In-app, push, email, and SMS adapter interfaces.
- [ ] Delivery attempts and failure tracking.
- [ ] Plan-channel enforcement and no-silent-downgrade behavior.

**Blockers**

- Email/SMS/push provider choices may remain ADR-backed until needed.

**Validation / QA Gates**

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm --filter @garageos/web typecheck
pnpm --filter @garageos/web test
```

**Notes / Handoff Context**

- Provider secrets and payloads must not leak to logs, exports, or UI error details.

## Milestone 11 — Files, Exports, Offline PWA Cache

**Goal:** Build attachments, private object storage, signed URLs, tenant exports, export jobs, and read-only offline cache.

**Status:** `Not Started`

**Dependencies:** M2-M10.

**Done Checklist**

- [ ] No confirmed implementation in this tracker.

**Pending Checklist**

- [ ] Object storage provider/configuration.
- [ ] Private tenant-scoped file paths.
- [ ] Upload intent and signed URL flows.
- [ ] File metadata lifecycle and entity linking.
- [ ] Full tenant export job and package format.
- [ ] Export status/download expiry.
- [ ] PWA manifest/service worker.
- [ ] Read-only recent-record cache.
- [ ] Offline write blocking.

**Blockers**

- Object storage provider must be selected before full implementation.

**Validation / QA Gates**

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm --filter @garageos/web typecheck
pnpm --filter @garageos/web test
pnpm --filter @garageos/web build
```

**Notes / Handoff Context**

- Offline cache is read-only only. Do not introduce sync queues or offline mutation flows.

## Milestone 12 — Dashboard, Reports, Search, Export Formats

**Goal:** Build dashboard, reports, search/read models, CSV/PDF/Excel exports, and formula verification.

**Status:** `Not Started`

**Dependencies:** M6-M11.

**Done Checklist**

- [ ] No confirmed full implementation in this tracker.

**Pending Checklist**

- [ ] Dashboard summary API/screen.
- [ ] Revenue chart and inventory alerts.
- [ ] Customer/service/inventory/AR/AP/financial reports.
- [ ] Branch comparison and advanced report plan gates.
- [ ] Search read models.
- [ ] CSV/PDF/Excel exports where documented.
- [ ] Formula verification fixtures.
- [ ] Performance tests.

**Blockers**

- Some dashboard/platform overview UI may exist but requires repo verification.

**Validation / QA Gates**

```bash
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm --filter @garageos/web typecheck
pnpm --filter @garageos/web test
pnpm --filter @garageos/web build
```

**Notes / Handoff Context**

- Reports must respect tenant, branch, role, and plan access.

## Milestone 13 — Security, Observability, Performance, DR Hardening

**Goal:** Harden security, logs, metrics, alerts, performance, backups, restore tests, RPO/RTO, and runbooks.

**Status:** `Not Started`

**Dependencies:** All previous.

**Done Checklist**

- [ ] No confirmed milestone-level hardening signoff in this tracker.

**Pending Checklist**

- [ ] Threat modeling by module.
- [ ] Tenant isolation tests across UI/API/repository/database/files/reports/exports.
- [ ] Branch access tests.
- [ ] Support access audit review.
- [ ] Sensitive log review.
- [ ] Rate-limit tests.
- [ ] Dependency/container scans.
- [ ] Logs, metrics, error monitoring, tracing, background job observability.
- [ ] Performance tests.
- [ ] Encrypted backups and restore rehearsal.
- [ ] Runbooks.

**Blockers**

- Requires completed feature surface.

**Validation / QA Gates**

```bash
pnpm lint
pnpm test
pnpm --filter @garageos/api test
pnpm --filter @garageos/web test
```

**Notes / Handoff Context**

- Continuous security review should happen before this milestone, but final signoff belongs here.

## Milestone 14 — End-to-End UAT and Launch Readiness

**Goal:** Execute full acceptance, defect burn-down, sign-offs, production smoke, and controlled launch readiness.

**Status:** `Not Started`

**Dependencies:** All previous.

**Done Checklist**

- [ ] No confirmed UAT/launch readiness signoff in this tracker.

**Pending Checklist**

- [ ] Freeze release candidate scope against approved docs.
- [ ] Run full regression suite.
- [ ] Run mobile-first E2E workflows.
- [ ] Run role-based UAT scenarios.
- [ ] Validate full service, inventory, purchasing, invoicing, payment, refund, expense, reminder, file/export/offline, dashboard/report, tenant lifecycle scenarios.
- [ ] Burn down release-blocking defects.
- [ ] Collect product, QA, security, DevOps, and engineering signoffs.
- [ ] Provision production and bootstrap first platform admin.
- [ ] Execute production smoke and pilot launch.

**Blockers**

- Requires full scope implementation and validation evidence.

**Validation / QA Gates**

```bash
pnpm lint
pnpm test
pnpm --filter @garageos/api test
pnpm --filter @garageos/web test
pnpm --filter @garageos/web build
```

**Notes / Handoff Context**

- No Critical or High defects may remain unresolved before launch approval.

---

# 3. Step-by-Step Task Tracker

## Status Defaults for Steps

- Steps under Milestones 0-7 are marked `Needs Review` unless explicitly confirmed by the prior handoff context.
- Steps under Milestone 8+ are marked `Not Started` unless later repo evidence proves otherwise.
- The current active UI slice is tracked under Milestone 3 because it belongs to platform administration.

## Milestone 0 Steps

| Step ID | Step Name                           | Scope                                          | Status       | Affected Areas                                                                                                 | Done                               | Pending              | Blockers           | Validation Required      |
| ------- | ----------------------------------- | ---------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------- | ------------------ | ------------------------ |
| 0.1     | Initialize repository and workspace | Monorepo setup                                 | Needs Review | Database: N/A; API: scaffold; Services: N/A; UI: scaffold; Permissions: N/A; Tests: baseline; Docs: README/ADR | Source docs define requirement     | Verify repo          | Repo not inspected | `pnpm install`           |
| 0.2     | Choose final monorepo structure     | Workspace architecture                         | Needs Review | API/UI/shared packages/docs                                                                                    | Tech stack defines expected layout | Verify actual layout | Repo not inspected | `pnpm lint`              |
| 0.3     | Create app packages                 | `web`, `api`, `worker`, `scheduler`            | Needs Review | API/UI/workers                                                                                                 | Roadmap defines packages           | Verify packages      | Repo not inspected | Workspace typecheck      |
| 0.4     | Create shared packages              | `shared`, `api-client`, `config`, `test-utils` | Needs Review | Shared contracts/tests                                                                                         | Roadmap defines packages           | Verify packages      | Repo not inspected | Workspace typecheck      |
| 0.5     | Create docs directories             | ADR/runbooks/API/testing docs                  | Needs Review | Docs                                                                                                           | ARD package exists as source       | Verify repo docs     | Repo not inspected | Docs review              |
| 0.6     | Configure TS/lint/format/test       | Tooling                                        | Needs Review | API/UI/tests                                                                                                   | Tech stack defines tooling         | Verify scripts       | Repo not inspected | `pnpm lint && pnpm test` |
| 0.7     | Configure local Docker Compose      | Local PostgreSQL/dev services                  | Needs Review | Database/DevOps                                                                                                | Required by roadmap                | Verify compose       | Repo not inspected | Local startup            |
| 0.8     | Add `.env.example`                  | Config safety                                  | Needs Review | DevOps/security                                                                                                | Required by roadmap                | Verify no secrets    | Repo not inspected | Secret review            |
| 0.9     | Create CI baseline                  | CI validation                                  | Needs Review | Tests/DevOps                                                                                                   | Required by roadmap                | Verify workflows     | Repo not inspected | CI status                |
| 0.10    | Record foundational ADRs            | Architecture decisions                         | Needs Review | Docs/architecture                                                                                              | ARD source package exists          | Verify repo ADRs     | Repo not inspected | ADR review               |
| 0.11    | Create Definition of Done           | Delivery standard                              | Needs Review | Docs/QA                                                                                                        | Roadmap DoD exists                 | Verify repo artifact | Repo not inspected | Review checklist         |
| 0.12    | Create traceability template        | Ticket hygiene                                 | Needs Review | Docs/PM/QA                                                                                                     | RTM exists                         | Verify template      | Repo not inspected | Docs review              |
| 0.13    | Create UX wireframe backlog         | UI planning                                    | Needs Review | UI/UX                                                                                                          | UX map exists                      | Verify backlog       | Repo not inspected | UX review                |
| 0.14    | Create QA automation structure      | Test scaffolding                               | Needs Review | Tests                                                                                                          | QA plan exists                     | Verify tests dirs    | Repo not inspected | Test discovery           |

## Milestone 1 Steps

| Step ID | Step Name                           | Scope                                                                        | Status       | Affected Areas            | Done                                      | Pending                 | Blockers                                   | Validation Required  |
| ------- | ----------------------------------- | ---------------------------------------------------------------------------- | ------------ | ------------------------- | ----------------------------------------- | ----------------------- | ------------------------------------------ | -------------------- |
| 1.1     | Finalize migration tool             | Database migration strategy                                                  | Needs Review | Database/Docs             | Tech stack recommends SQL-visible tooling | Verify selected tool    | Repo not inspected                         | Migration command    |
| 1.2     | Add PostgreSQL extensions           | `pg_trgm`, `unaccent`, `pgcrypto`, optional `citext`                         | Needs Review | Database                  | Schema defines extensions                 | Verify migration        | Repo not inspected                         | `pnpm db:migrate`    |
| 1.3     | Define enum/check strategy          | Stable enum handling                                                         | Needs Review | Database/API/shared types | Schema defines enum catalog               | Verify implementation   | Repo not inspected                         | Migration validation |
| 1.4     | Platform/tenant/subscription schema | Tenant lifecycle persistence                                                 | Needs Review | Database/API/services     | Schema source exists                      | Verify migrations       | Repo not inspected                         | DB validation        |
| 1.5     | User/auth/session/token schema      | Auth persistence                                                             | Needs Review | Database/API/auth         | Schema source exists                      | Verify migrations       | Repo not inspected                         | Auth tests           |
| 1.6     | RBAC schema                         | Roles, permissions, branch assignments                                       | Needs Review | Database/API/permissions  | Permission matrix exists                  | Verify migrations/seeds | Product approval for non-owner seed grants | Permission tests     |
| 1.7     | Shop/branches/settings schema       | Shop setup and branches                                                      | Needs Review | Database/API/UI           | Schema source exists                      | Verify migrations       | Repo not inspected                         | Branch tests         |
| 1.8     | Customer/motorcycle schema          | Tenant-wide customer records                                                 | Needs Review | Database/API/UI           | Schema source exists                      | Verify migrations       | Repo not inspected                         | Customer tests       |
| 1.9     | Service operations schema           | Services, estimates, job orders, sessions                                    | Needs Review | Database/API/UI           | Schema source exists                      | Verify migrations       | Repo not inspected                         | Service tests        |
| 1.10    | Inventory/FIFO schema               | Products, balances, ledger, FIFO, reservations                               | Needs Review | Database/API/services     | Schema source exists                      | Verify migrations       | Repo not inspected                         | Inventory tests      |
| 1.11    | Purchasing/AP schema                | Suppliers, purchases, returns, AP                                            | Needs Review | Database/API/services     | Schema source exists                      | Verify migrations       | Repo not inspected                         | Future M8 tests      |
| 1.12    | Financial/AR schema                 | Invoices, payments, receipts, refunds, AR                                    | Needs Review | Database/API/services     | Schema source exists                      | Verify migrations       | Repo not inspected                         | Future M9 tests      |
| 1.13    | Cross-cutting schema                | Expenses, reminders, notifications, files, exports, audit, idempotency, jobs | Needs Review | Database/API/workers      | Schema source exists                      | Verify migrations       | Repo not inspected                         | DB validation        |
| 1.14    | Constraints/indexes/FKs             | Invariant protection                                                         | Needs Review | Database                  | Schema defines constraints                | Verify indexes          | Repo not inspected                         | Schema drift check   |
| 1.15    | Seed data                           | Plans, limits, permissions, Shop Owner protections                           | Needs Review | Database/auth/RBAC        | Docs define seeds                         | Verify idempotency      | Product approval if missing                | Seed tests           |
| 1.16    | Fixture factory/migration tests     | Test data                                                                    | Needs Review | Tests                     | QA plan requires fixtures                 | Verify tests            | Repo not inspected                         | Test suite           |
| 1.17    | Schema drift checklist              | DB governance                                                                | Needs Review | Docs/CI                   | Roadmap requires drift checklist          | Verify CI/checklist     | Repo not inspected                         | CI validation        |

## Milestone 2 Steps

| Step ID | Step Name                | Scope                                                                 | Status       | Affected Areas        | Done                                            | Pending                   | Blockers           | Validation Required    |
| ------- | ------------------------ | --------------------------------------------------------------------- | ------------ | --------------------- | ----------------------------------------------- | ------------------------- | ------------------ | ---------------------- |
| 2.1     | REST API skeleton        | `/api/v1` backend                                                     | Needs Review | API/services/tests    | API contract exists                             | Verify route prefix       | Repo not inspected | API typecheck          |
| 2.2     | Response/error envelopes | API conventions                                                       | Needs Review | API/shared/errors     | API contract defines envelopes                  | Verify implementation     | Repo not inspected | Contract tests         |
| 2.3     | Request/correlation IDs  | Observability foundation                                              | Needs Review | API/logging/tests     | API contract requires metadata                  | Verify middleware         | Repo not inspected | API tests              |
| 2.4     | Auth routes              | Signup, login, refresh, logout, verification, password flows, session | Needs Review | API/UI/auth/tests     | API contract defines endpoints                  | Verify routes/screens     | Repo not inspected | Auth tests             |
| 2.5     | Password/token hashing   | Security                                                              | Needs Review | API/security/database | PRD requires strong hashing                     | Verify implementation     | Repo not inspected | Security tests         |
| 2.6     | Access/refresh tokens    | Session lifecycle                                                     | Needs Review | API/auth              | Contract defines expiration/rotation            | Verify behavior           | Repo not inspected | Auth tests             |
| 2.7     | Remember-me sessions     | Session duration                                                      | Needs Review | API/auth/UI           | PRD defines remember-me                         | Verify behavior           | Repo not inspected | Auth tests             |
| 2.8     | Rate limits              | Login/reset abuse protection                                          | Needs Review | API/security          | PRD/API define lockouts                         | Verify rate limiting      | Repo not inspected | Security tests         |
| 2.9     | Tenant context           | Session-derived tenant scope                                          | Needs Review | API/services/repos    | Contract forbids client tenant switching        | Verify guard/repositories | Repo not inspected | Tenant isolation tests |
| 2.10    | Tenant status guard      | Subscription/lifecycle gate                                           | Needs Review | API/services/UI       | Docs define status matrix                       | Verify guard ordering     | Repo not inspected | Subscription tests     |
| 2.11    | Platform/support context | Platform admin support access                                         | Needs Review | API/platform/audit/UI | Docs define safeguards                          | Verify implementation     | Repo not inspected | Support access tests   |
| 2.12    | Permission guard         | RBAC enforcement                                                      | Needs Review | API/authz/tests       | Permission matrix exists                        | Verify guard              | Repo not inspected | Permission tests       |
| 2.13    | Branch access guard      | Branch-specific authorization                                         | Needs Review | API/authz/repos       | Docs require branch scoping                     | Verify guard              | Repo not inspected | Branch tests           |
| 2.14    | Validation pipeline      | DTO/schema validation                                                 | Needs Review | API/validation        | API contract defines validation errors          | Verify pipes/schemas      | Repo not inspected | Contract tests         |
| 2.15    | Idempotency service      | Critical write retry safety                                           | Needs Review | API/services/database | Contract defines required matrix                | Verify service            | Repo not inspected | Idempotency tests      |
| 2.16    | Optimistic locking       | Mutable update conflict handling                                      | Needs Review | API/database          | Contract defines `lock_version`                 | Verify implementation     | Repo not inspected | Conflict tests         |
| 2.17    | Transaction wrapper      | Multi-record writes                                                   | Needs Review | API/services/database | Architecture requires transaction orchestration | Verify wrapper            | Repo not inspected | Integration tests      |
| 2.18    | Audit service            | Critical action audit                                                 | Needs Review | API/services/database | Docs require audit logs                         | Verify service            | Repo not inspected | Audit tests            |
| 2.19    | Auth/session UI screens  | Frontend auth                                                         | Needs Review | UI/auth               | UX map defines screens                          | Verify screens            | Repo not inspected | Web tests/build        |
| 2.20    | Contract/security tests  | QA baseline                                                           | Needs Review | Tests                 | QA plan requires tests                          | Verify coverage           | Repo not inspected | Test suite             |

## Milestone 3 Steps

| Step ID | Step Name                          | Scope                                              | Status       | Affected Areas                                  | Done                                  | Pending                        | Blockers                 | Validation Required           |
| ------- | ---------------------------------- | -------------------------------------------------- | ------------ | ----------------------------------------------- | ------------------------------------- | ------------------------------ | ------------------------ | ----------------------------- |
| 3.1     | Platform-created tenant flow       | Tenant creation by platform admin                  | Needs Review | Database/API/services/UI/permissions/tests/docs | Docs define flow                      | Verify API/UI                  | Repo not inspected       | Platform tests                |
| 3.2     | Owner signup tenant flow           | Public owner signup                                | Needs Review | Database/API/services/UI/tests                  | Docs define flow                      | Verify implementation          | Repo not inspected       | Auth tests                    |
| 3.3     | Default plan/duration validation   | Signup gating                                      | Needs Review | API/services/database/tests                     | Docs define block condition           | Verify behavior                | Repo not inspected       | Subscription tests            |
| 3.4     | Onboarding state machine           | Pending setup setup gates                          | Needs Review | API/services/UI/tests                           | Docs define allowed areas             | Verify implementation          | Repo not inspected       | Onboarding tests              |
| 3.5     | Shop profile setup                 | Shop profile UI/API                                | Needs Review | Database/API/UI/tests                           | Docs define fields                    | Verify implementation          | Repo not inspected       | Web/API tests                 |
| 3.6     | First branch setup                 | Required active branch                             | Needs Review | API/UI/branches/tests                           | Docs require one active branch        | Verify implementation          | Repo not inspected       | Branch tests                  |
| 3.7     | Tax/localization setup             | Tax profile/mode/timezone/currency                 | Needs Review | Database/API/UI/tests                           | Docs define rules                     | Verify implementation          | Repo not inspected       | Validation tests              |
| 3.8     | Invoice prefix setup               | Prefix before invoices                             | Needs Review | Database/API/UI/tests                           | Docs define prefix constraints        | Verify implementation          | Repo not inspected       | Validation tests              |
| 3.9     | Onboarding completion gate         | Move pending setup to active                       | Needs Review | API/services/audit/tests                        | Docs define conditions                | Verify implementation          | Repo not inspected       | Lifecycle tests               |
| 3.10    | Subscription status calculation    | Lifecycle computation                              | Needs Review | API/services/worker/tests                       | Docs define day ranges                | Verify implementation          | Repo not inspected       | Lifecycle tests               |
| 3.11    | Lifecycle gates                    | Grace/read-only/suspended/pending deletion/deleted | Needs Review | API/UI/services/tests                           | Docs define access matrix             | Verify implementation          | Repo not inspected       | Guard tests                   |
| 3.12    | Plan limit/override service        | Plan capability enforcement                        | Needs Review | API/services/database/tests                     | Docs define limits                    | Verify implementation          | Repo not inspected       | Plan tests                    |
| 3.13    | Platform tenant management screens | `/platform/tenants` foundation                     | In Progress  | UI/API/permissions/tests/docs                   | Selected as next slice                | Build/verify list/detail/new   | Need current route state | Web typecheck/lint/test/build |
| 3.14    | Subscription override UI/API       | Plan/status override                               | Not Started  | API/UI/audit/permissions/tests                  | Docs define reason/audit              | Build after tenant detail      | Need API support         | Platform tests                |
| 3.15    | Support access flow                | Reason, mode, expiry, marker, audit                | Not Started  | API/UI/audit/permissions/tests                  | Docs define safeguards                | Build after tenant detail      | Need API support         | Support access tests          |
| 3.16    | Tenant lifecycle worker            | Scheduled status changes                           | Needs Review | Worker/API/database/tests                       | Docs define lifecycle                 | Verify implementation          | Repo not inspected       | Worker tests                  |
| 3.17    | Export/deletion placeholders       | Future job controls                                | Needs Review | API/UI/workers/tests                            | Roadmap says placeholders until later | Verify placeholders            | Avoid fake full workflow | Web/API tests                 |
| 3.18    | Renewal request/instructions       | External payment only                              | Needs Review | API/UI/docs/tests                               | Docs prohibit payment collection      | Verify no payment-gateway flow | Repo not inspected       | Subscription tests            |

## Milestone 4 Steps

| Step ID | Step Name                     | Scope                                                        | Status       | Affected Areas                                  | Done                                  | Pending                        | Blockers                 | Validation Required |
| ------- | ----------------------------- | ------------------------------------------------------------ | ------------ | ----------------------------------------------- | ------------------------------------- | ------------------------------ | ------------------------ | ------------------- |
| 4.1     | Branch management             | List/detail/create/update/deactivate/reactivate              | Needs Review | Database/API/services/UI/permissions/tests/docs | Prior branch work mentioned           | Verify full flow               | Repo not inspected       | Branch tests        |
| 4.2     | Branch plan/last-active rules | Plan branch limits and safety                                | Needs Review | API/services/database/tests                     | Docs define rules                     | Verify implementation          | Repo not inspected       | Branch tests        |
| 4.3     | Employee lifecycle            | Invite/create/deactivate/reactivate                          | Needs Review | Database/API/services/UI/permissions/tests      | Docs define invite rules              | Verify implementation          | Repo not inspected       | Employee tests      |
| 4.4     | Role/permission management    | RBAC UI/API                                                  | Needs Review | API/UI/permissions/tests                        | Permission matrix exists              | Verify implementation          | Seed grant approval      | Permission tests    |
| 4.5     | Role-template protections     | Shop Owner safety                                            | Needs Review | API/services/tests                              | Docs require protections              | Verify implementation          | Repo not inspected       | RBAC tests          |
| 4.6     | Branch assignment             | Branch access management                                     | Needs Review | API/UI/services/tests                           | Docs require branch access            | Verify implementation          | Repo not inspected       | Branch access tests |
| 4.7     | Customer management           | Create/search/detail/update/merge/delete/restore             | Needs Review | Database/API/UI/tests                           | UX/API docs define screens            | Verify implementation          | Repo not inspected       | Customer tests      |
| 4.8     | Customer tags if supported    | Optional only if schema/design supports                      | Needs Review | Database/API/UI/docs                            | Roadmap conditional                   | Verify support before building | Avoid undocumented scope | Docs/API review     |
| 4.9     | Motorcycle management         | Create/search/detail/update/delete/restore                   | Needs Review | Database/API/UI/tests                           | UX/API docs define screens            | Verify implementation          | Repo not inspected       | Motorcycle tests    |
| 4.10    | Service catalog               | Create/read/update/deactivate                                | Needs Review | Database/API/UI/tests                           | UX docs define `/services/*`          | Verify implementation          | Repo not inspected       | Service tests       |
| 4.11    | Product categories            | Category management for inventory                            | Needs Review | Database/API/UI/tests                           | Inventory docs include categories     | Verify implementation          | Repo not inspected       | Category tests      |
| 4.12    | Duplicate warnings            | Customers/motorcycles/tenants where documented               | Needs Review | API/UI/services/tests                           | Docs require warnings, not auto-merge | Verify implementation          | Repo not inspected       | Duplicate tests     |
| 4.13    | Master-data audit logs        | High-risk changes                                            | Needs Review | API/audit/tests                                 | Docs require audit                    | Verify implementation          | Repo not inspected       | Audit tests         |
| 4.14    | Mobile screens                | Branches, employees, roles, customers, motorcycles, services | Needs Review | UI/tests                                        | UX map defines screens                | Verify/build UI                | UI coverage unclear      | Web tests/build     |

## Milestone 5 Steps

| Step ID | Step Name                      | Scope                                 | Status       | Affected Areas              | Done                                             | Pending                     | Blockers           | Validation Required |
| ------- | ------------------------------ | ------------------------------------- | ------------ | --------------------------- | ------------------------------------------------ | --------------------------- | ------------------ | ------------------- |
| 5.1     | Estimate number generation     | Tenant-scoped numbering               | Needs Review | Database/API/services/tests | Docs define numbering                            | Verify implementation       | Repo not inspected | Estimate tests      |
| 5.2     | Estimate draft/create/update   | Estimate CRUD                         | Needs Review | API/UI/services/tests       | Docs define estimate non-revenue                 | Verify implementation       | Repo not inspected | Estimate tests      |
| 5.3     | Estimate workflow              | Present/approve/convert/cancel/expire | Needs Review | API/UI/services/audit/tests | Docs define states                               | Verify implementation       | Repo not inspected | Workflow tests      |
| 5.4     | Job order number generation    | Tenant-scoped numbering               | Needs Review | Database/API/services/tests | Docs define numbering                            | Verify implementation       | Repo not inspected | Job order tests     |
| 5.5     | Job order create/detail/update | Core service record                   | Needs Review | API/UI/services/tests       | Docs define one engagement per motorcycle/branch | Verify implementation       | Repo not inspected | Job tests           |
| 5.6     | Job order lines                | Service/labor/part scaffolding        | Needs Review | API/UI/services/tests       | Docs define line types                           | Verify implementation       | Repo not inspected | Line tests          |
| 5.7     | Assignment                     | Employees/mechanics                   | Needs Review | API/UI/services/tests       | Docs define mechanic workflows                   | Verify implementation       | Repo not inspected | Assignment tests    |
| 5.8     | Job status transitions         | Workflow state machine                | Needs Review | API/UI/services/audit/tests | Docs define explicit transitions                 | Verify implementation       | Repo not inspected | Workflow tests      |
| 5.9     | Correction workflow            | Permission and audit reason           | Needs Review | API/UI/services/audit/tests | Docs require reason                              | Verify implementation       | Repo not inspected | Audit tests         |
| 5.10    | Mechanic assigned jobs         | Mechanic UI/API                       | Needs Review | API/UI/permissions/tests    | UX defines role landing                          | Verify implementation       | Repo not inspected | Mechanic tests      |
| 5.11    | Mechanic sessions              | Start/pause/resume/finish             | Needs Review | API/UI/services/tests       | Docs define session states                       | Verify implementation       | Repo not inspected | Session tests       |
| 5.12    | Service notes/tasks            | Repair notes and task completion      | Needs Review | API/UI/services/tests       | Docs define notes/tasks                          | Verify implementation       | Repo not inspected | Service tests       |
| 5.13    | Job attachment placeholders    | Until file module                     | Needs Review | UI/API/docs                 | Roadmap allows placeholder                       | Verify placeholder labeling | Avoid fake upload  | Web tests           |
| 5.14    | Status/audit UI                | History panels                        | Needs Review | UI/API/audit/tests          | UX registry requires history                     | Verify implementation       | Repo not inspected | Web/API tests       |
| 5.15    | Mobile service workflows       | Intake and mechanic flows             | Needs Review | UI/tests                    | UX requires mobile-first                         | Verify implementation       | Repo not inspected | Web build/E2E       |

## Milestone 6 Steps

| Step ID | Step Name                       | Scope                                     | Status       | Affected Areas                    | Done                               | Pending               | Blockers           | Validation Required           |
| ------- | ------------------------------- | ----------------------------------------- | ------------ | --------------------------------- | ---------------------------------- | --------------------- | ------------------ | ----------------------------- |
| 6.1     | Product/category management     | Inventory master data                     | Needs Review | Database/API/UI/tests             | Prior inventory work likely exists | Verify implementation | Repo not inspected | Inventory tests               |
| 6.2     | Branch stock balances           | Stock summaries                           | Needs Review | Database/API/services/tests       | Docs define branch stock           | Verify implementation | Repo not inspected | Stock tests                   |
| 6.3     | Inventory ledger service        | Immutable stock ledger                    | Needs Review | Database/API/services/audit/tests | Docs require ledger-first          | Verify implementation | Repo not inspected | Ledger tests                  |
| 6.4     | FIFO layer creation/locking     | FIFO costing                              | Needs Review | Database/API/services/tests       | Docs require FIFO                  | Verify implementation | Repo not inspected | FIFO tests                    |
| 6.5     | Available stock calculation     | On-hand minus reserved                    | Needs Review | API/services/tests                | Docs define no over-reservation    | Verify implementation | Repo not inspected | Stock tests                   |
| 6.6     | Reservation command             | Reserve inventory                         | Needs Review | API/services/idempotency/tests    | Docs require reservations          | Verify implementation | Repo not inspected | Reservation tests             |
| 6.7     | FIFO reservation allocation     | Oldest available layers                   | Needs Review | API/services/database/tests       | Docs require FIFO allocations      | Verify implementation | Repo not inspected | FIFO tests                    |
| 6.8     | Reservation release             | Release stock reservations                | Needs Review | API/services/tests                | Docs require release workflow      | Verify implementation | Repo not inspected | Reservation tests             |
| 6.9     | FIFO consumption records        | COGS basis                                | Needs Review | API/services/database/tests       | Docs require FIFO consumption      | Verify implementation | Repo not inspected | Consumption tests             |
| 6.10    | Job order part reservation      | Service/inventory integration             | Needs Review | API/services/tests                | Docs require reservation from jobs | Verify implementation | Repo not inspected | Integration tests             |
| 6.11    | Job completion FIFO consumption | Inventory effect on completion            | Needs Review | API/services/idempotency/tests    | Docs require atomic completion     | Verify implementation | Repo not inspected | Integration/concurrency tests |
| 6.12    | Inventory read/search APIs      | Product/stock lookup                      | Needs Review | API/UI/tests                      | UX defines inventory screens       | Verify implementation | Repo not inspected | API tests                     |
| 6.13    | Deterministic FIFO fixtures     | Test data                                 | Needs Review | Tests                             | QA requires fixtures               | Verify fixtures       | Repo not inspected | Test suite                    |
| 6.14    | Concurrency tests               | Reservation/allocation/consumption safety | Needs Review | Tests/database                    | Docs require concurrency safety    | Verify tests          | Repo not inspected | Concurrency tests             |
| 6.15    | Reconciliation checks           | Balance/ledger/FIFO consistency           | Needs Review | API/services/tests                | Docs require correctness           | Verify implementation | Repo not inspected | Reconciliation tests          |

## Milestone 7 Steps

| Step ID | Step Name                          | Scope                         | Status       | Affected Areas                                  | Done                                   | Pending        | Blockers           | Validation Required    |
| ------- | ---------------------------------- | ----------------------------- | ------------ | ----------------------------------------------- | -------------------------------------- | -------------- | ------------------ | ---------------------- |
| 7.1     | Adjustment draft/request           | Inventory adjustment workflow | Needs Review | Database/API/services/UI/permissions/tests/docs | Prior M7 work likely implemented       | Verify repo    | Repo not inspected | API tests              |
| 7.2     | Adjustment approval/rejection      | Approval workflow             | Needs Review | API/services/audit/permissions/tests            | Prior M7 work likely implemented       | Verify repo    | Repo not inspected | Workflow tests         |
| 7.3     | Adjustment posting                 | Idempotency and locks         | Needs Review | API/services/database/idempotency/tests         | Prior M7 work implemented during chats | Verify repo    | Repo not inspected | Posting tests          |
| 7.4     | Positive adjustment FIFO           | FIFO layer creation           | Needs Review | API/services/database/tests                     | Prior M7 work likely implemented       | Verify repo    | Repo not inspected | FIFO tests             |
| 7.5     | Negative adjustment FIFO           | FIFO consumption              | Needs Review | API/services/database/tests                     | Prior M7 work likely implemented       | Verify repo    | Repo not inspected | FIFO tests             |
| 7.6     | Force adjustment                   | Permission/reason/audit       | Needs Review | API/services/permissions/audit/tests            | Prior M7 work likely implemented       | Verify repo    | Repo not inspected | Permission/audit tests |
| 7.7     | Transfer draft/request             | Transfer workflow             | Needs Review | API/services/UI/tests                           | Prior M7 work likely implemented       | Verify repo    | Repo not inspected | Transfer tests         |
| 7.8     | Transfer reservation               | Reservation workflow          | Needs Review | API/services/database/tests                     | Prior M7 work likely implemented       | Verify repo    | Repo not inspected | Reservation tests      |
| 7.9     | Transfer send                      | In-transit transition         | Needs Review | API/services/idempotency/tests                  | Prior M7 work likely implemented       | Verify repo    | Repo not inspected | Transfer tests         |
| 7.10    | Transfer receive                   | Receiving transition          | Needs Review | API/services/database/tests                     | Prior M7 work likely implemented       | Verify repo    | Repo not inspected | Transfer tests         |
| 7.11    | Variance loss handling             | Transfer loss/variance        | Needs Review | API/services/audit/tests                        | Prior M7 work likely implemented       | Verify repo    | Repo not inspected | Variance tests         |
| 7.12    | Transfer cancellation rules        | Cancellation dispositions     | Needs Review | API/services/audit/idempotency/tests            | Prior M7 work likely implemented       | Verify repo    | Repo not inspected | Cancellation tests     |
| 7.13    | Low-stock alerts                   | Branch-specific alerts        | Needs Review | API/services/database/tests                     | Prior context reports completed        | Re-verify repo | Repo not inspected | Low-stock tests        |
| 7.14    | Branch deactivation stock blockers | Branch safety blockers        | Needs Review | API/services/database/tests                     | Prior context reports completed        | Re-verify repo | Repo not inspected | Branch tests           |
| 7.15    | Audit and status history           | Audit/status history coverage | Needs Review | API/services/UI/audit/tests                     | User reported all pass                 | Re-verify repo | Repo not inspected | API typecheck/test/dev |

## Milestone 8 Steps

| Step ID | Step Name                                 | Scope                                    | Status      | Affected Areas                                  | Done           | Pending                  | Blockers  | Validation Required     |
| ------- | ----------------------------------------- | ---------------------------------------- | ----------- | ----------------------------------------------- | -------------- | ------------------------ | --------- | ----------------------- |
| 8.1     | Supplier lifecycle                        | Create/read/update/deactivate/reactivate | Not Started | Database/API/services/UI/permissions/tests/docs | None confirmed | Implement after UI focus | M8 paused | API/web tests           |
| 8.2     | Purchase order draft/create/update/cancel | Purchase workflow                        | Not Started | Database/API/services/UI/tests                  | None confirmed | Implement                | M8 paused | PO tests                |
| 8.3     | PO transitions                            | Ordered/partial/received/closed          | Not Started | API/services/audit/tests                        | None confirmed | Implement                | M8 paused | Workflow tests          |
| 8.4     | Purchase receiving                        | Stock and FIFO layer creation            | Not Started | API/services/database/idempotency/tests         | None confirmed | Implement                | M8 paused | Receiving tests         |
| 8.5     | Cash purchase behavior                    | No AP liability                          | Not Started | API/services/database/tests                     | None confirmed | Implement                | M8 paused | AP tests                |
| 8.6     | Credit purchase AP                        | AP liability                             | Not Started | API/services/database/tests                     | None confirmed | Implement                | M8 paused | AP tests                |
| 8.7     | Supplier payment                          | Payment recording                        | Not Started | API/services/database/audit/tests               | None confirmed | Implement                | M8 paused | Supplier payment tests  |
| 8.8     | Supplier credits                          | Credit tracking                          | Not Started | API/services/database/tests                     | None confirmed | Implement                | M8 paused | Credit tests            |
| 8.9     | Supplier returns                          | Return workflow                          | Not Started | API/services/database/audit/tests               | None confirmed | Implement                | M8 paused | Return tests            |
| 8.10    | Supplier return valuation                 | Costing basis                            | Not Started | API/services/database/tests                     | None confirmed | Implement                | M8 paused | Valuation tests         |
| 8.11    | AP balances/report basis                  | Accounts payable                         | Not Started | API/services/reports/tests                      | None confirmed | Implement                | M8 paused | AP report tests         |
| 8.12    | Status history/audit/idempotency          | Purchasing safeguards                    | Not Started | API/services/audit/idempotency/tests            | None confirmed | Implement                | M8 paused | Audit/idempotency tests |
| 8.13    | Purchasing/AP screens                     | Mobile UI                                | Not Started | UI/tests                                        | None confirmed | Implement                | M8 paused | Web tests/build         |

## Milestone 9 Steps

| Step ID | Step Name                         | Scope                             | Status      | Affected Areas                          | Done           | Pending   | Blockers                  | Validation Required    |
| ------- | --------------------------------- | --------------------------------- | ----------- | --------------------------------------- | -------------- | --------- | ------------------------- | ---------------------- |
| 9.1     | Invoice draft from job orders     | Billing start                     | Not Started | Database/API/services/UI/tests          | None confirmed | Implement | Depends M5/M8             | Invoice tests          |
| 9.2     | Billing allocation                | Prevent overbilling               | Not Started | API/services/database/tests             | None confirmed | Implement | Depends M5/M8             | Allocation tests       |
| 9.3     | Invoice calculations              | Line types/totals                 | Not Started | API/services/tests                      | None confirmed | Implement | Depends M5/M8             | Calculation tests      |
| 9.4     | Discount allocation               | Invoice-level discount            | Not Started | API/services/tests                      | None confirmed | Implement | Depends M5/M8             | Discount tests         |
| 9.5     | Tax calculation                   | Tenant tax settings               | Not Started | API/services/tests                      | None confirmed | Implement | Depends shop settings     | Tax tests              |
| 9.6     | Invoice issue                     | Idempotent issuance               | Not Started | API/services/idempotency/audit/tests    | None confirmed | Implement | Depends allocations       | Issue tests            |
| 9.7     | Cancel/void rules                 | Correction workflow               | Not Started | API/services/audit/tests                | None confirmed | Implement | Depends invoice issue     | Void tests             |
| 9.8     | Payment creation                  | Payment against invoice           | Not Started | API/services/database/idempotency/tests | None confirmed | Implement | Depends invoices          | Payment tests          |
| 9.9     | Immutable receipt                 | One receipt per payment           | Not Started | API/services/database/tests             | None confirmed | Implement | Depends payment           | Receipt tests          |
| 9.10    | Partial/split payments            | Payment support                   | Not Started | API/services/UI/tests                   | None confirmed | Implement | Depends payment           | Payment tests          |
| 9.11    | Overpayment blocking              | Financial safety                  | Not Started | API/services/database/concurrency/tests | None confirmed | Implement | Depends payment           | Concurrency tests      |
| 9.12    | Refund creation                   | Refund workflow                   | Not Started | API/services/audit/tests                | None confirmed | Implement | Depends receipts          | Refund tests           |
| 9.13    | Refund inventory reversal         | Stock reversal where applicable   | Not Started | API/services/database/tests             | None confirmed | Implement | Depends inventory         | Refund inventory tests |
| 9.14    | Paid-invoice refund recalculation | Invoice status update             | Not Started | API/services/tests                      | None confirmed | Implement | Depends refunds           | Status tests           |
| 9.15    | AR balances/report basis          | Accounts receivable               | Not Started | API/services/reports/tests              | None confirmed | Implement | Depends invoices/payments | AR tests               |
| 9.16    | Financial immutability            | Append-only/correction-only       | Not Started | Database/API/tests                      | None confirmed | Implement | Requires protections      | Immutability tests     |
| 9.17    | Cashier mobile flows              | Invoice/payment/receipt/refund UI | Not Started | UI/tests                                | None confirmed | Implement | Depends APIs              | Web/E2E tests          |

## Milestones 10-14 Steps

| Step ID    | Step Name                                             | Scope                                      | Status      | Affected Areas                                          | Done           | Pending                    | Blockers                         | Validation Required              |
| ---------- | ----------------------------------------------------- | ------------------------------------------ | ----------- | ------------------------------------------------------- | -------------- | -------------------------- | -------------------------------- | -------------------------------- |
| 10.1-10.15 | Expenses, reminders, notifications, provider adapters | Expense/reminder/notification module       | Not Started | Database/API/services/UI/permissions/tests/docs/workers | None confirmed | Implement milestone slices | Depends M3-M9                    | API/web/provider tests           |
| 11.1-11.17 | Files, exports, offline PWA cache                     | File storage, export jobs, read-only cache | Not Started | Database/API/services/UI/workers/tests/docs             | None confirmed | Implement milestone slices | Provider choice/object storage   | API/web/offline tests            |
| 12.1-12.15 | Dashboard, reports, search, export formats            | Reporting, search, exports, performance    | Not Started | Database/API/services/UI/reports/tests/docs             | None confirmed | Implement milestone slices | Depends M6-M11                   | Report/performance tests         |
| 13.1-13.18 | Security, observability, performance, DR              | Production hardening                       | Not Started | Security/API/UI/database/DevOps/tests/docs              | None confirmed | Implement milestone slices | Requires full feature surface    | Security/performance/DR evidence |
| 14.1-14.19 | E2E UAT and launch readiness                          | Full acceptance and controlled launch      | Not Started | Product/QA/Security/DevOps/Engineering/UI/API/database  | None confirmed | Execute UAT and signoffs   | Requires all previous milestones | Full regression/UAT/smoke        |

---

# 4. Backend/API Tracker

## Backend/API Status Legend

| Status       | Meaning                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------- |
| Needs Review | There is prior context or documentation, but current repo was not verified in this chat. |
| In Progress  | Active workstream or known partial implementation.                                       |
| Not Started  | No confirmed implementation yet.                                                         |
| Blocked      | Cannot safely proceed without a decision or dependency.                                  |

| Module                          | API Endpoints                                                                                                                        | Service / Application Logic                                                       | Repository / Database Work                       | Tenant Isolation                           | Branch Access                                               | Permission Enforcement            | Tenant Lifecycle Enforcement               | Idempotency Requirements                                | Audit Logging                                    | Tests                 | Current Status | Pending Work                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------- | --------------------------------- | ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------ | --------------------- | -------------- | ------------------------------------------------------------------ |
| Auth                            | `/auth/signup-owner`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, verification/password/session endpoints    | Session, token rotation, hashing, rate limits                                     | Users, sessions/tokens                           | Session-derived tenant                     | N/A                                                         | Authenticated gates               | Email verification and tenant access gates | Login not idempotent; critical auth tokens safe         | Auth failures and account changes where required | Auth/security tests   | Needs Review   | Verify implementation and UI screens.                              |
| Tenant Lifecycle                | `/shop/onboarding-state`, `/shop/profile`, `/shop/complete-onboarding`, `/shop/renewal-request`, lifecycle worker APIs/internal jobs | Status calculation, onboarding, renewal request, read-only/suspended gates        | Tenants, subscriptions, lifecycle events         | Required                                   | N/A except branch setup                                     | Owner/platform permissions        | Central authority                          | Export/lifecycle jobs where applicable                  | Lifecycle changes audit/system logged            | Lifecycle tests       | Needs Review   | Verify worker, gates, and platform UI integration.                 |
| Platform Admin                  | `/platform/tenants`, `/platform/tenants/{id}`, subscription/read-only/suspend/support/export/deletion routes                         | Tenant management, overrides, support access                                      | Tenant, overrides, support sessions, jobs        | Platform context explicitly selects tenant | Support access branch rules where applicable                | Platform permissions only         | Platform support retained                  | Export/deletion recommended/required depending action   | Required for all platform actions                | Platform tests        | In Progress    | Implement Platform Tenant Management UI; verify backend endpoints. |
| RBAC / Permissions              | Roles, permissions, user role APIs                                                                                                   | Additive permission resolution, protected Shop Owner behavior                     | Permissions, roles, role_permissions, user_roles | Required                                   | Branch assignment separate                                  | Core responsibility               | Lifecycle gate before permission           | N/A                                                     | High-risk changes audited                        | Permission tests      | Needs Review   | Verify role UI/API and non-owner seed grants.                      |
| Branches                        | `/branches/*`                                                                                                                        | Create/update/deactivate/reactivate, plan limit, last-active rule, stock blockers | Branches and linked blockers                     | Required                                   | Required                                                    | `branches.*`                      | Writes blocked by lifecycle                | N/A unless critical retryable create/update implemented | Required for blocked/high-risk actions           | Branch tests          | Needs Review   | Verify branch UI and deactivation blockers.                        |
| Customers                       | `/customers/*`                                                                                                                       | Customer CRUD, merge, soft-delete, restore, duplicate warning                     | Customers and histories                          | Required                                   | Linked histories branch-filtered                            | `customers.*`                     | Writes blocked by lifecycle/offline        | N/A unless critical writes retried                      | Merge/delete/restore audited                     | Customer tests        | Needs Review   | Verify UI/API coverage.                                            |
| Motorcycles                     | `/motorcycles/*`                                                                                                                     | Motorcycle CRUD, soft-delete/restore, customer link                               | Motorcycles                                      | Required                                   | Linked histories branch-filtered                            | `motorcycles.*`                   | Writes blocked by lifecycle/offline        | N/A                                                     | Critical changes audited                         | Motorcycle tests      | Needs Review   | Verify UI/API coverage.                                            |
| Services / Catalog              | `/services/*`                                                                                                                        | Service create/read/update/deactivate                                             | Service catalog                                  | Required                                   | N/A unless branch-scoped history                            | `services.*`                      | Writes blocked by lifecycle/offline        | N/A                                                     | Deactivation audited                             | Service tests         | Needs Review   | Verify UI/API coverage.                                            |
| Estimates                       | `/estimates/*` and workflow actions                                                                                                  | Draft/present/approve/convert/cancel/expire                                       | Estimates and status history                     | Required                                   | Branch context through related job/service where applicable | `estimates.*`                     | Writes blocked by lifecycle/offline        | Critical conversion/actions where required              | Required for workflow actions                    | Estimate tests        | Needs Review   | Verify non-revenue behavior.                                       |
| Job Orders                      | `/job-orders/*` and workflow actions                                                                                                 | Intake, assignment, transitions, correction, completion                           | Job orders, lines, histories                     | Required                                   | Required                                                    | `job_orders.*`                    | Writes blocked by lifecycle/offline        | Completion requires idempotency                         | Required for transitions/corrections             | Job tests             | Needs Review   | Verify UI/API and inventory integration.                           |
| Mechanic Sessions               | `/mechanic-sessions/*`                                                                                                               | Start/pause/resume/finish sessions                                                | Mechanic sessions                                | Required                                   | Required through job branch                                 | Mechanic/session permissions      | Writes blocked by lifecycle/offline        | N/A                                                     | Session history/audit where critical             | Session tests         | Needs Review   | Verify mechanic mobile flow.                                       |
| Products & Inventory Foundation | `/products/*`, `/inventory/*`                                                                                                        | Product/category CRUD, stock balances, ledger reads                               | Products, categories, balances, ledger, FIFO     | Required                                   | Required for stock                                          | Inventory permissions             | Writes blocked by lifecycle/offline        | Stock-changing writes where critical                    | Ledger/audit required                            | Inventory/FIFO tests  | Needs Review   | Verify foundation and UI coverage.                                 |
| Inventory Adjustments           | `/inventory-adjustments/*`, approve/reject/post/cancel actions                                                                       | Draft, approval, posting, FIFO effects, force adjustment                          | Adjustments, ledger, FIFO                        | Required                                   | Required                                                    | Adjustment permissions            | Writes blocked by lifecycle/offline        | Posting requires idempotency                            | Required                                         | Adjustment tests      | Needs Review   | Re-verify Milestone 7 completion.                                  |
| Inventory Transfers             | `/inventory-transfers/*`, submit/send/receive/cancel actions                                                                         | Draft, reservation, send, receive, variance, cancellation                         | Transfers, lines, reservations, ledger, FIFO     | Required                                   | Source and destination branches                             | Transfer permissions              | Writes blocked by lifecycle/offline        | Stock-affecting transitions require idempotency         | Required                                         | Transfer tests        | Needs Review   | Re-verify Milestone 7 completion and UI.                           |
| Low-Stock Alerts                | `/inventory/low-stock-alerts` or documented equivalent                                                                               | Generate, de-duplicate, resolve alerts                                            | Stock balances/alerts                            | Required                                   | Required                                                    | Inventory read permissions        | Read allowed by lifecycle rules            | N/A                                                     | System/audit where applicable                    | Low-stock tests       | Needs Review   | Prior context says complete; verify endpoint/UI.                   |
| Suppliers                       | `/suppliers/*`                                                                                                                       | Supplier lifecycle                                                                | Suppliers                                        | Required                                   | N/A unless branch-linked history                            | Supplier permissions              | Writes blocked by lifecycle/offline        | N/A                                                     | Deactivation/reactivation audited                | Supplier tests        | Not Started    | First backend slice after UI focus.                                |
| Purchases                       | `/purchase-orders/*`, receivings/actions                                                                                             | PO lifecycle, receiving, stock/FIFO/AP effects                                    | Purchases, receivings, ledger, FIFO, AP          | Required                                   | Required for receiving branch                               | Purchase permissions              | Writes blocked by lifecycle/offline        | Receiving requires idempotency                          | Required                                         | Purchase tests        | Not Started    | Implement M8.                                                      |
| Supplier Returns                | `/supplier-returns/*`, post/cancel                                                                                                   | Return workflow and valuation                                                     | Supplier returns, stock/AP/credits               | Required                                   | Required where branch stock affected                        | Supplier return permissions       | Writes blocked by lifecycle/offline        | Posting requires idempotency                            | Required                                         | Return tests          | Not Started    | Implement M8.                                                      |
| AP / Supplier Payments          | Supplier payments/credits/AP routes                                                                                                  | Supplier balances, payments, credits                                              | AP/payment/credit tables                         | Required                                   | Branch where applicable                                     | AP/supplier payment permissions   | Writes blocked by lifecycle/offline        | Payments require retry-safety                           | Required                                         | AP tests              | Not Started    | Implement M8.                                                      |
| Invoices                        | `/invoices/*`, issue/cancel/void                                                                                                     | Billing allocation, tax/discount, issue/void                                      | Invoices, lines, allocations                     | Required                                   | Required through branch/job                                 | Invoice permissions               | Writes blocked by lifecycle/offline        | Issue/cancel/void idempotent                            | Required                                         | Invoice tests         | Not Started    | Implement M9.                                                      |
| Payments / Receipts             | `/invoices/{id}/payments`, `/payments/*`, `/receipts/*`                                                                              | Payment creation, immutable receipt                                               | Payments, receipts                               | Required                                   | Required through invoice branch                             | Payment permissions               | Writes blocked by lifecycle/offline        | Payment requires idempotency                            | Required                                         | Payment/receipt tests | Not Started    | Implement M9.                                                      |
| Refunds                         | `/payments/{id}/refunds`, `/refunds/*`                                                                                               | Refunds, inventory reversal, status recalculation                                 | Refunds, ledger, invoice status                  | Required                                   | Required through invoice/payment branch                     | Refund permissions                | Writes blocked by lifecycle/offline        | Refund requires idempotency                             | Required                                         | Refund tests          | Not Started    | Implement M9.                                                      |
| Expenses                        | `/expenses/*`                                                                                                                        | Expense create/update/void                                                        | Expenses                                         | Required                                   | Branch where applicable                                     | Expense permissions               | Writes blocked by lifecycle/offline        | N/A                                                     | Void/edit audited                                | Expense tests         | Not Started    | Implement M10.                                                     |
| Reminders                       | `/reminders/*`                                                                                                                       | Time/mileage/birthday/follow-up reminders                                         | Reminders, jobs, delivery attempts               | Required                                   | Related records branch-filtered                             | Reminder permissions              | Writes blocked by lifecycle/offline        | Delivery retry-safe                                     | Required for send/failures                       | Reminder tests        | Not Started    | Implement M10.                                                     |
| Notifications                   | `/notifications/*`                                                                                                                   | In-app/push/email/SMS preferences and delivery                                    | Notifications, delivery attempts                 | Required                                   | N/A or related branch                                       | Notification permissions          | Plan/lifecycle gates                       | Delivery retry-safe                                     | Delivery attempts logged                         | Notification tests    | Not Started    | Implement M10.                                                     |
| Files                           | `/files/*`, upload/download intents                                                                                                  | Private signed URLs, file lifecycle                                               | File metadata/object paths                       | Required                                   | Branch/entity access                                        | File permissions                  | Uploads blocked by lifecycle/offline       | Upload intent safe                                      | File changes audited where required              | File tests            | Not Started    | Implement M11.                                                     |
| Exports                         | `/exports/*`, platform export routes                                                                                                 | Async export jobs and packages                                                    | Export jobs/files                                | Required                                   | Export respects branch/tenant rules                         | Owner/platform permissions        | Export allowed only documented states      | Export generation recommended idempotency               | Required                                         | Export tests          | Not Started    | Implement M11.                                                     |
| Reports / Dashboard             | `/dashboard/*`, `/reports/*`                                                                                                         | Summaries, formulas, read models                                                  | Reporting/search models                          | Required                                   | Required for branch reports                                 | Report permissions and plan gates | Read allowed per lifecycle                 | Async report exports where needed                       | Report access logged where required              | Report tests          | Not Started    | Implement M12.                                                     |
| Audit Logs                      | `/audit-logs/*`, `/platform/audit-logs`                                                                                              | Immutable audit search/detail                                                     | Audit logs                                       | Required                                   | Branch/entity context where applicable                      | Audit permissions                 | Read allowed per lifecycle rules           | N/A                                                     | Core artifact                                    | Audit tests           | Needs Review   | Verify existing audit infrastructure and UI.                       |
| Background Jobs                 | `/background-jobs/*`                                                                                                                 | Job status, attempts, safe errors                                                 | Background jobs                                  | Required                                   | Related tenant/branch context                               | Job read permissions              | Read allowed per lifecycle rules           | Retry-safe jobs                                         | Job attempts/errors logged                       | Job tests             | Not Started    | Implement with job-backed modules.                                 |

---

# 5. Frontend/UI Screen Tracker

## UI Status Legend

| Status           | Meaning                                                     |
| ---------------- | ----------------------------------------------------------- |
| Done             | Confirmed implemented, wired, tested, and validated.        |
| In Progress      | Active UI implementation/refactor.                          |
| Needs Review     | Existing UI may exist but was not verified in this chat.    |
| Missing UI       | No confirmed screen implementation.                         |
| Placeholder Only | Screen exists only as static/planned placeholder.           |
| Blocked          | Depends on missing backend/API or unresolved documentation. |

## Screen Group Tracker

| Route Prefix                                           | Screen / Page Group           | Status                       | Existing UI?                            | Missing UI?                  | Static / Mock Only?                | Wired to API?                                           | Permission-aware Behavior                           | Tenant Lifecycle States                                      | Offline / Read-only State                    | Empty / Loading / Error / Conflict States | Mobile Behavior                | Pending Components                                               | Notes                                                              |
| ------------------------------------------------------ | ----------------------------- | ---------------------------- | --------------------------------------- | ---------------------------- | ---------------------------------- | ------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------- | ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `/auth/*`                                              | Public/Auth screens           | Needs Review                 | Unknown                                 | Unknown                      | Unknown                            | Unknown                                                 | Required                                            | Email verification and tenant blocked states required        | Password/change/logout allowed as documented | Required                                  | Mobile single-column forms     | Auth layout, form alerts                                         | Verify current auth UI.                                            |
| `/onboarding/*`                                        | Onboarding/shop setup         | Needs Review                 | Unknown                                 | Unknown                      | Unknown                            | Unknown                                                 | Shop Owner setup access                             | `pending_setup` only operational gate                        | Writes blocked outside allowed setup         | Required                                  | Mobile-first setup checklist   | Onboarding gate/checklist                                        | Verify pending setup flow.                                         |
| `/dashboard`                                           | Tenant dashboard              | Needs Review                 | Likely exists from prior dashboard work | Unknown                      | Possible placeholders              | Unknown                                                 | Required by report/widget permission                | Grace/read-only/suspended banners                            | Read-only/offline banners                    | Required                                  | Mobile cards and filters       | Dashboard summary cards, renewal warning                         | Some dashboard UI changes were discussed/stashed in prior context. |
| `/customers/*`                                         | Customers                     | Needs Review                 | Unknown                                 | Unknown                      | Unknown                            | Unknown                                                 | `customers.*`                                       | Writes blocked in read-only/suspended/offline                | Required                                     | Required                                  | Mobile list/detail/forms       | List/detail/form/action menus                                    | Verify UI coverage.                                                |
| `/motorcycles/*`                                       | Motorcycles                   | Needs Review                 | Unknown                                 | Unknown                      | Unknown                            | Unknown                                                 | `motorcycles.*`                                     | Writes blocked by lifecycle                                  | Required                                     | Required                                  | Mobile list/detail/forms       | Detail/history panels                                            | Verify UI coverage.                                                |
| `/services/*`                                          | Service Catalog               | Needs Review                 | Unknown                                 | Unknown                      | Unknown                            | Unknown                                                 | `services.*`                                        | Writes blocked by lifecycle                                  | Required                                     | Required                                  | Mobile list/forms              | Catalog list/detail/form                                         | Verify UI coverage.                                                |
| `/estimates/*`                                         | Estimates                     | Needs Review                 | Unknown                                 | Unknown                      | Unknown                            | Unknown                                                 | `estimates.*`                                       | Writes blocked by lifecycle                                  | Required                                     | Required                                  | Mobile workflow actions        | Workflow action modals                                           | Verify UI coverage.                                                |
| `/job-orders/*`                                        | Job Orders                    | Needs Review                 | Unknown                                 | Unknown                      | Unknown                            | Unknown                                                 | `job_orders.*`                                      | Writes blocked by lifecycle                                  | Required                                     | Required                                  | Core mobile workflow           | List/detail/intake/status actions                                | Verify UI coverage.                                                |
| `/mechanic-sessions/*`                                 | Mechanic Sessions             | Needs Review                 | Unknown                                 | Unknown                      | Unknown                            | Unknown                                                 | Mechanic/session permissions                        | Writes blocked by lifecycle                                  | Required                                     | Required                                  | Mechanic mobile focused view   | Assigned jobs/session controls                                   | Verify UI coverage.                                                |
| `/inventory/*`, `/products/*`, `/product-categories/*` | Products & Inventory          | Needs Review                 | Unknown                                 | Unknown                      | Unknown                            | Unknown                                                 | Inventory permissions                               | Writes blocked by lifecycle                                  | Required                                     | Required                                  | Inventory clerk mobile lookup  | Product list/detail/stock ledger                                 | Verify UI coverage.                                                |
| `/inventory-adjustments/*`                             | Inventory Adjustments         | Needs Review                 | Unknown                                 | Unknown                      | Unknown                            | Unknown                                                 | Adjustment permissions                              | Writes blocked by lifecycle                                  | Required                                     | Required                                  | Mobile workflow sheets/dialogs | Request/approve/post/cancel actions                              | Backend likely exists; UI needs verification.                      |
| `/inventory-transfers/*`                               | Inventory Transfers           | Needs Review                 | Unknown                                 | Unknown                      | Unknown                            | Unknown                                                 | Transfer permissions                                | Writes blocked by lifecycle                                  | Required                                     | Required                                  | Mobile transfer workflow       | Draft/send/receive/cancel actions                                | Backend likely exists; UI needs verification.                      |
| `/suppliers/*`                                         | Suppliers                     | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | Supplier permissions                                | Required                                                     | Required                                     | Required                                  | Mobile supplier cards          | Supplier list/detail/form                                        | Backend M8 not started.                                            |
| `/purchase-orders/*`                                   | Purchases                     | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | Purchase permissions                                | Required                                                     | Required                                     | Required                                  | Mobile receiving workflow      | PO list/detail/receiving actions                                 | Backend M8 not started.                                            |
| `/supplier-returns/*`                                  | Supplier Returns              | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | Supplier return permissions                         | Required                                                     | Required                                     | Required                                  | Mobile return workflow         | Return forms/actions                                             | Backend M8 not started.                                            |
| `/invoices/*`                                          | Invoices                      | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | Invoice permissions                                 | Required                                                     | Required                                     | Required                                  | Cashier mobile flow            | Invoice list/detail/issue/void                                   | Backend M9 not started.                                            |
| `/payments/*`, `/receipts/*`, `/refunds/*`             | Payments / Receipts / Refunds | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | Payment/refund permissions                          | Required                                                     | Required                                     | Required                                  | Cashier mobile flow            | Payment/refund dialogs, receipt detail                           | Backend M9 not started.                                            |
| `/accounts-receivable/*`, `/accounts-payable/*`        | AR / AP                       | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | AR/AP report permissions                            | Plan/report gates                                            | Read-only allowed where documented           | Required                                  | Mobile report summaries        | AR/AP lists/reports                                              | Depends M8/M9.                                                     |
| `/expenses/*`                                          | Expenses                      | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | Expense permissions                                 | Required                                                     | Required                                     | Required                                  | Mobile forms                   | Expense list/detail/void                                         | Backend M10 not started.                                           |
| `/reminders/*`                                         | Reminders                     | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | Reminder permissions and plan channel gates         | Required                                                     | Required                                     | Required                                  | Mobile reminder cards          | Reminder rules/forms                                             | Backend M10 not started.                                           |
| `/notifications/*`                                     | Notifications                 | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | Notification access                                 | Required                                                     | Offline behavior required                    | Required                                  | Mobile notification list       | Notification center                                              | Backend M10 not started.                                           |
| `/files/*`                                             | Files                         | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | File permissions                                    | Uploads blocked by lifecycle                                 | Offline upload blocked                       | Required                                  | Mobile attachments             | Upload/download components                                       | Backend M11 not started.                                           |
| `/reports/*`                                           | Reports                       | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | Report permissions and plan gates                   | Read allowed per lifecycle                                   | Offline read-only cache if available         | Required                                  | Mobile filters/cards           | Report list/detail/export controls                               | Backend M12 not started.                                           |
| `/exports/*`                                           | Tenant Exports                | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | Shop Owner export access                            | Suspended owner export rules                                 | Offline blocked for generation               | Required                                  | Mobile job status              | Export trigger/status/download                                   | Backend M11 not started.                                           |
| `/audit-logs/*`                                        | Tenant Audit Logs             | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | Audit log permissions                               | Read allowed per lifecycle                                   | Read-only                                    | Required                                  | Mobile audit table/cards       | Audit filters/detail                                             | Audit backend may exist; verify.                                   |
| `/settings/*`                                          | Settings                      | Needs Review                 | Unknown                                 | Unknown                      | Unknown                            | Unknown                                                 | Shop/settings permissions                           | Settings writes blocked except documented billing exceptions | Offline writes blocked                       | Required                                  | Mobile settings sections       | Profile/billing/preferences                                      | Verify coverage.                                                   |
| `/employees/*`, `/roles/*`                             | Employees & Roles             | Needs Review                 | Unknown                                 | Unknown                      | Unknown                            | Unknown                                                 | User/role permissions                               | Writes blocked by lifecycle                                  | Offline writes blocked                       | Required                                  | Mobile admin lists/forms       | Employee invite, role editor                                     | Verify coverage.                                                   |
| `/background-jobs/*`                                   | Background Jobs               | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | Job read permissions                                | Read allowed where documented                                | Read-only                                    | Required                                  | Mobile status cards            | Job list/detail/attempts                                         | Backend jobs may exist; UI likely pending.                         |
| `/offline-cache/*`                                     | Offline Cache                 | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | Authenticated user only                             | Lifecycle must still apply after reconnect                   | Strict read-only                             | Required                                  | Mobile offline view            | Offline indicator/cache list                                     | M11. Must not add offline writes.                                  |
| `/platform`                                            | Platform Overview             | In Progress / Needs Review   | Prior refactor discussed                | Unknown                      | Some placeholders allowed          | Existing platform tenant APIs where available           | Platform permissions only                           | Platform support/lifecycle indicators                        | N/A                                          | Required                                  | Responsive platform dashboard  | Extracted overview components                                    | Unsupported aggregates must be clearly planned placeholders.       |
| `/platform/tenants`                                    | Platform Tenant List          | In Progress / Next           | Unknown                                 | Likely missing or incomplete | Avoid fake data if API exists      | Should use `GET /platform/tenants` where available      | `platform.tenants.read`                             | Tenant status states visible                                 | N/A                                          | Required                                  | Mobile cards/table hybrid      | Tenant list, filters, status badges                              | Current recommended next slice.                                    |
| `/platform/tenants/new`                                | Create Tenant                 | In Progress / Next           | Unknown                                 | Likely missing or incomplete | No fake unsupported flows          | Should use `POST /platform/tenants` where available     | `platform.tenants.create`                           | Creates pending setup/active based documented rules          | N/A                                          | Required                                  | Mobile form                    | Tenant form, plan/expiration, owner setup                        | Must avoid payment collection language.                            |
| `/platform/tenants/{tenant_id}`                        | Tenant Admin Detail           | In Progress / Next           | Unknown                                 | Likely missing or incomplete | Placeholders only when API missing | Should use `GET /platform/tenants/{id}` where available | `platform.tenants.read` and action permissions      | Status, subscription, export/deletion/support panels         | N/A                                          | Required                                  | Mobile detail sections         | Metadata, subscription, support, export, deletion, audit context | Foundation for later platform pages.                               |
| `/platform/plans`                                      | Platform Plan Management      | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | `platform.plans.update` or read policy              | N/A                                                          | N/A                                          | Required                                  | Mobile table/forms             | Plan limit editor                                                | Build after tenant pages.                                          |
| `/platform/audit-logs`                                 | Platform Audit Logs           | Missing UI                   | No confirmed                            | Yes                          | No confirmed                       | No confirmed                                            | `platform.audit_logs.read`                          | N/A                                                          | N/A                                          | Required                                  | Mobile audit cards/table       | Audit filters/detail                                             | Build after tenant detail/support access.                          |
| `/platform/admin-users`                                | Platform Admin Accounts       | Blocked / Needs Confirmation | Unknown                                 | Conditional                  | Unknown                            | API not fully detailed                                  | Platform admin account permission where implemented | N/A                                                          | N/A                                          | Required                                  | Mobile admin list/forms        | Needs API confirmation                                           | Do not implement until API support is confirmed.                   |

## UI Checklists

### Done Screens

- [ ] No screen is marked fully `Done` in this tracker because current repository state and validation were not inspected in this chat.

### Pending Screens

- [ ] `/platform/tenants`
- [ ] `/platform/tenants/{tenant_id}`
- [ ] `/platform/tenants/new`
- [ ] `/platform/plans`
- [ ] `/platform/audit-logs`
- [ ] `/suppliers/*`
- [ ] `/purchase-orders/*`
- [ ] `/supplier-returns/*`
- [ ] `/invoices/*`
- [ ] `/payments/*`, `/receipts/*`, `/refunds/*`
- [ ] `/accounts-receivable/*`, `/accounts-payable/*`
- [ ] `/expenses/*`
- [ ] `/reminders/*`
- [ ] `/notifications/*`
- [ ] `/files/*`
- [ ] `/reports/*`
- [ ] `/exports/*`
- [ ] `/audit-logs/*`
- [ ] `/background-jobs/*`
- [ ] `/offline-cache/*`

### Screens That Exist But Need Refactor / Verification

- [ ] `/platform` overview — prior extraction/refactor discussed; verify source alignment and validation.
- [ ] `/dashboard` — dashboard UI work was discussed; verify current state and whether changes were stashed.
- [ ] `/branches/*` — likely backend exists; UI needs verification.
- [ ] `/inventory-adjustments/*` — backend likely exists; UI needs verification.
- [ ] `/inventory-transfers/*` — backend likely exists; UI needs verification.
- [ ] `/customers/*`, `/motorcycles/*`, `/services/*`, `/job-orders/*`, `/mechanic-sessions/*` — verify UI coverage before marking status.

### Placeholder-Only Screens

- [ ] Platform Overview aggregate support sessions, if shown, must remain clearly labeled planned placeholders.
- [ ] Platform Overview activity feed, if shown, must remain clearly labeled planned placeholder unless backed by documented API.
- [ ] Job attachments may remain placeholder-only until Milestone 11 file module.
- [ ] Export/deletion panels may be placeholder-only until backend support exists, but must not imply complete unsupported behavior.

### Screens Blocked by Missing Backend/API Support

- [ ] Supplier and purchasing screens — blocked by Milestone 8 backend if no API exists.
- [ ] Invoice/payment/refund/AR screens — blocked by Milestone 9 backend if no API exists.
- [ ] Expense/reminder/notification screens — blocked by Milestone 10 backend if no API exists.
- [ ] Files/exports/offline cache screens — blocked by Milestone 11 backend/PWA infrastructure if no API exists.
- [ ] Reports/search/export format screens — blocked by Milestone 12 backend/read models if no API exists.
- [ ] Platform admin accounts — blocked until platform admin account API support is confirmed.

---

# 6. Validation Tracker

| Area                           | Command or Test Type                                       | Status       | Last Verified Date        | Notes                                                        |
| ------------------------------ | ---------------------------------------------------------- | ------------ | ------------------------- | ------------------------------------------------------------ |
| API typecheck                  | `pnpm --filter @garageos/api typecheck`                    | Needs Review | Not verified in this chat | Run before backend handoff.                                  |
| API unit tests                 | `pnpm --filter @garageos/api test`                         | Needs Review | Not verified in this chat | Required before marking backend slices done.                 |
| API verbose tests              | `pnpm --filter @garageos/api test -- --reporter=verbose`   | Needs Review | Not verified in this chat | Useful after failing test diagnostics.                       |
| API dev startup                | `pnpm dev:api`                                             | Needs Review | Not verified in this chat | Required after DI/module changes.                            |
| Web typecheck                  | `pnpm --filter @garageos/web typecheck`                    | Needs Review | Not verified in this chat | Required for UI refactor/platform pages.                     |
| Web lint                       | `pnpm --filter @garageos/web lint`                         | Needs Review | Not verified in this chat | Required for UI work.                                        |
| Web tests                      | `pnpm --filter @garageos/web test`                         | Needs Review | Not verified in this chat | Required for component/page tests.                           |
| Web build                      | `pnpm --filter @garageos/web build`                        | Needs Review | Not verified in this chat | Required before UI slice completion.                         |
| Database migrations            | `pnpm db:migrate`                                          | Needs Review | Not verified in this chat | Required after schema changes.                               |
| Database validation            | `pnpm db:validate`                                         | Needs Review | Not verified in this chat | Required before backend milestone close.                     |
| Workspace lint                 | `pnpm lint`                                                | Needs Review | Not verified in this chat | Use when cross-package changes occur.                        |
| Unit tests                     | Unit test suites                                           | Needs Review | Not verified in this chat | Business rules, calculations, guards.                        |
| Integration tests              | DB-backed service tests                                    | Needs Review | Not verified in this chat | Transactions, constraints, locks, idempotency.               |
| API contract tests             | Envelope/error/endpoint tests                              | Needs Review | Not verified in this chat | Required by API contracts.                                   |
| E2E tests                      | Playwright or equivalent                                   | Needs Review | Not verified in this chat | Required for mobile workflows and UAT.                       |
| Security checks                | Tenant isolation, branch access, tokens, logs, file access | Needs Review | Not verified in this chat | Mandatory before launch.                                     |
| Tenant isolation checks        | Cross-tenant access denial tests                           | Needs Review | Not verified in this chat | Must cover UI/API/repository/database/files/reports/exports. |
| Branch access checks           | Assigned branch vs tenant-wide access tests                | Needs Review | Not verified in this chat | Must cover branch-specific records and histories.            |
| Permission checks              | Endpoint/screen action authorization                       | Needs Review | Not verified in this chat | Must verify backend authoritative behavior.                  |
| Idempotency/concurrency checks | Critical write retry/concurrency tests                     | Needs Review | Not verified in this chat | Required for inventory/financial/export/deletion actions.    |
| Offline/read-only checks       | PWA offline shell and tenant read-only tests               | Needs Review | Not verified in this chat | Offline writes must remain blocked.                          |
| Build                          | Web/API production build where applicable                  | Needs Review | Not verified in this chat | Required before handoff/merge.                               |

---

# 7. Blocker Log

| Blocker ID | Description                                                               | Affected Milestone / Module    | Severity | Owner               | Status                    | Required Resolution                                                                     | Notes                                                                          |
| ---------- | ------------------------------------------------------------------------- | ------------------------------ | -------- | ------------------- | ------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| BLK-001    | Current repository state not inspected while generating this tracker      | All                            | High     | Engineering         | Open                      | Inspect repo and run relevant validation commands                                       | Prevents marking implementation fully done.                                    |
| BLK-002    | Platform UI coverage is not fully inventoried against current repo routes | M3 / Platform Admin UI         | High     | Frontend            | Open                      | Compare actual `apps/web` routes/components to UX screen map and UI registry            | Needed before implementing tenant pages cleanly.                               |
| BLK-003    | Platform Tenant Management UI not yet confirmed implemented               | M3 / Platform Admin UI         | High     | Frontend            | Open                      | Implement `/platform/tenants`, `/platform/tenants/{tenant_id}`, `/platform/tenants/new` | Current recommended slice.                                                     |
| BLK-004    | Milestone 8 backend paused                                                | M8 / Purchasing, Suppliers, AP | Medium   | Engineering/Product | Open                      | Resume after platform UI foundation reaches validation gate                             | User intentionally paused M8.                                                  |
| BLK-005    | Platform admin account APIs not fully detailed in current screen map      | Platform Admin Accounts        | Medium   | Product/API         | Open                      | Confirm API contract before building `/platform/admin-users`                            | Do not invent undocumented behavior.                                           |
| BLK-006    | Role-template default seed grants require approval if not already done    | M1-M2 / RBAC                   | Medium   | Product/BA          | Needs Verification        | Verify approval artifact or keep grants conservative                                    | Permission matrix warns non-owner grants are eligible, not confirmed defaults. |
| BLK-007    | External provider choices are deferred                                    | M10-M11                        | Low      | Architecture/DevOps | Not Blocking Current Work | Use adapter interfaces until providers are selected                                     | Email/SMS/push/object storage choices should be ADR-backed.                    |
| BLK-008    | Append-only protections must be verified before production                | M13                            | High     | Database/Security   | Future                    | Implement/verify immutability protections and tests                                     | Not blocking current UI work but critical before launch.                       |

---

# 8. Documentation Alignment Checklist

## Source Alignment

- [x] PRD scope reviewed as highest product authority.
- [x] Roadmap milestone sequence used as implementation sequencing authority.
- [x] RTM used for requirement traceability expectations.
- [x] User stories used for backlog and acceptance framing.
- [x] UX screen map used for route/screen inventory.
- [x] UI registry used for shell, list/detail/form/workflow patterns.
- [x] API contracts used for endpoint, envelope, idempotency, permission, and error behavior.
- [x] Permission matrix used for platform/tenant role and guard expectations.
- [x] QA acceptance plan used for validation gates.
- [x] Architecture used for modular monolith, tenant isolation, transaction, observability, and PWA constraints.
- [x] Database schema used for persistence boundaries and enum/status alignment.
- [x] Tech stack used for Next.js/React/Tailwind/shadcn UI, NestJS, PostgreSQL, Kysely/node-postgres baseline.
- [x] ARD package used for implementation decision baseline.

## Implementation Verification

- [ ] Current repository files inspected.
- [ ] Current Git status reviewed.
- [ ] Current route inventory generated from `apps/web`.
- [ ] Current backend module inventory generated from `apps/api`.
- [ ] Current validation commands run and recorded.
- [ ] Current completed milestones reconciled against repository state.
- [ ] UI placeholders reconciled against documented API support.
- [ ] Any documentation drift recorded and routed for approval.

## Scope Guardrails

- [x] No native mobile app scope added.
- [x] No offline write/sync queue scope added.
- [x] No customer portal scope added.
- [x] No standalone POS/cart checkout scope added.
- [x] No payroll scope added.
- [x] No full accounting/general ledger scope added.
- [x] No direct BIR filing scope added.
- [x] No e-commerce marketplace scope added.
- [x] No loyalty/service package scope added.
- [x] No automatic subscription payment collection scope added.
- [x] No 2FA scope added.
- [x] No microservices-first rewrite added.
- [x] No undocumented AI/forecasting/custom BI scope added.

---

# 9. Next Work Queue

## Priority 1 — Platform Tenant Management UI

| Field                         | Details                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Task title                    | Implement Platform Tenant Management UI foundation                                                                                                                       |
| Why it is next                | User paused Milestone 8 and chose platform UIs first. Tenant management is the foundation for subscription, support access, export, deletion, and audit context.         |
| Dependencies                  | Existing authenticated platform shell; platform tenant APIs where available; UI registry patterns; UX screen map platform routes.                                        |
| Likely affected files/modules | `apps/web/src/features/platform/tenants/`, `apps/web/src/features/platform/overview/`, existing app shell/platform route registry, platform API client/hooks if present. |
| Validation required           | `pnpm --filter @garageos/web typecheck`, `pnpm --filter @garageos/web lint`, `pnpm --filter @garageos/web test`, `pnpm --filter @garageos/web build`.                    |
| Suggested commit message      | `git commit -m "feat(web): add platform tenant management screens"`                                                                                                      |

**Next-chat handoff prompt**

```text
Read Instructions.txt first and follow GarageOS repository safety rules.

Do not push changes.
Do not create branches.
Do not open pull requests.
Do not mutate the remote repository.

Current workstream:
Platform UI implementation before resuming Milestone 8.

Current task:
Implement the Platform Tenant Management UI foundation.

Scope:
- /platform/tenants
- /platform/tenants/{tenant_id}
- /platform/tenants/new

Goal:
Create source-aligned, mobile-first, thin, reusable platform tenant screens under the existing authenticated platform shell.

Documentation to align with:
- requirements-v2.4.md
- ux-sreen-map.md
- ui-registry.md
- ui-tokens.md
- api-contracts.md
- permission-matrix.md
- architecture.md
- tech-stack.md
- garageos-architecture-records.md

Rules:
- Keep /platform rendering through the existing authenticated platform shell.
- Use existing platform tenant APIs where available.
- If an API is missing, use clearly labeled planned placeholders only.
- Do not add payment-gateway language or automatic subscription collection.
- Do not invent undocumented workflows, widgets, permissions, or routes.
- Keep files thin, separated, reusable, and source-aligned.
- Support permission-aware UI, tenant lifecycle statuses, loading, empty, error, forbidden, and mobile states.

Before coding:
1. Inspect the current repository state.
2. Inspect existing platform routes/components/API clients.
3. Run or capture current validation output if possible.
4. Identify the smallest safe implementation slice.

Validation to run:
pnpm --filter @garageos/web typecheck
pnpm --filter @garageos/web lint
pnpm --filter @garageos/web test
pnpm --filter @garageos/web build

Return copy-paste-ready changes only.
```

## Priority 2 — Platform Overview Verification / Cleanup

| Field                         | Details                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| Task title                    | Verify Platform Overview extraction and source alignment                                     |
| Why it is next                | Platform tenant pages should reuse the platform shell and not regress `/platform`.           |
| Dependencies                  | Existing platform overview extraction under `apps/web/src/features/platform/overview/`.      |
| Likely affected files/modules | `apps/web/src/features/platform/overview/`, authenticated shell platform routing/components. |
| Validation required           | Web typecheck/lint/test/build.                                                               |
| Suggested commit message      | `git commit -m "refactor(web): align platform overview shell integration"`                   |

**Next-chat handoff prompt**

```text
Read Instructions.txt first and follow GarageOS repository safety rules.

Do not push changes.
Do not create branches.
Do not open pull requests.
Do not mutate the remote repository.

Current task:
Review the Platform Overview UI extraction under:
apps/web/src/features/platform/overview/

Goal:
Verify the refactor is source-aligned, fix typecheck/lint/test/build issues, and keep /platform rendering through the existing authenticated platform shell.

Constraints:
- Keep unsupported aggregate support sessions and activity feed as clearly labeled planned placeholders.
- Use existing platform tenant APIs where available.
- Do not add payment-gateway language, automatic subscription collection, undocumented widgets, or excluded workflows.
- Keep files thin, reusable, and aligned with PRD, UX screen map, UI registry, UI tokens, API contracts, permission matrix, tech stack, and architecture records.

Run/verify:
pnpm --filter @garageos/web typecheck
pnpm --filter @garageos/web lint
pnpm --filter @garageos/web test
pnpm --filter @garageos/web build

Return copy-paste-ready fixes only.
```

## Priority 3 — UI Inventory Verification

| Field                         | Details                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Task title                    | Generate current frontend UI inventory versus documented screen map                                                  |
| Why it is next                | The tracker marks most UI screens as Needs Review because actual repo route coverage was not inspected in this chat. |
| Dependencies                  | Current `apps/web` repository state.                                                                                 |
| Likely affected files/modules | `apps/web/src`, `garageos-ui-inventory.md`, `ui-registry.md`, route constants if present.                            |
| Validation required           | Web typecheck/lint after any docs or route registry updates.                                                         |
| Suggested commit message      | `git commit -m "docs(web): update GarageOS UI inventory"`                                                            |

**Next-chat handoff prompt**

```text
Read Instructions.txt first and follow GarageOS repository safety rules.

Do not push changes.
Do not create branches.
Do not open pull requests.
Do not mutate the remote repository.

Current task:
Inspect the current frontend repository and compare actual routes/components against the documented GarageOS UX screen map and UI registry.

Goal:
Produce an accurate UI inventory showing:
- Existing screens
- Missing screens
- Placeholder-only screens
- Screens wired to APIs
- Screens using mock/static data
- Screens needing refactor
- Screens blocked by missing backend/API support

Source documents:
- ux-sreen-map.md
- ui-registry.md
- ui-tokens.md
- requirements-v2.4.md
- api-contracts.md
- permission-matrix.md

Validation:
pnpm --filter @garageos/web typecheck
pnpm --filter @garageos/web lint
pnpm --filter @garageos/web test

Return the inventory in Markdown and recommend the next UI implementation slice.
```

## Priority 4 — Resume Milestone 8 Backend: Suppliers Foundation

| Field                         | Details                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task title                    | Start Milestone 8 Step 8.1 — Supplier lifecycle backend                                                                                                                   |
| Why it is next                | After platform UI foundation, the roadmap continues with Purchasing, Suppliers, and AP. Suppliers are the prerequisite for purchases, returns, payments, credits, and AP. |
| Dependencies                  | Milestone 6 inventory foundation; Milestone 7 inventory workflows verified; auth/tenant/branch/permission/lifecycle/audit foundations.                                    |
| Likely affected files/modules | `apps/api/src/modules/suppliers/`, shared errors/validation/policies/tests; possible web supplier screens later.                                                          |
| Validation required           | API typecheck/tests, migration validation if schema changes occur.                                                                                                        |
| Suggested commit message      | `git commit -m "feat(api): add supplier lifecycle workflow"`                                                                                                              |

**Next-chat handoff prompt**

```text
Read Instructions.txt first and follow GarageOS repository safety rules.

Do not push changes.
Do not create branches.
Do not open pull requests.
Do not mutate the remote repository.

Current milestone:
Milestone 8 — Purchasing, Suppliers, and AP

Current task:
Implement Step 8.1 — Supplier create/read/update/deactivate/reactivate where documented.

Before coding:
1. Inspect the latest repository state.
2. Verify Milestone 7 is committed and validation still passes.
3. Review supplier requirements in PRD, database schema, API contracts, permission matrix, user stories, and QA plan.
4. Follow existing module patterns and avoid rewrites.

Required behavior:
- Tenant isolation.
- Permission enforcement.
- Tenant lifecycle operational-write gate.
- Validation and duplicate handling where documented.
- Deactivation/reactivation rules from source docs.
- Audit logging for critical status changes.
- Tests for allowed, forbidden, lifecycle-blocked, duplicate, inactive/reactivation, and tenant isolation cases.

Validation:
pnpm db:migrate
pnpm db:validate
pnpm --filter @garageos/api typecheck
pnpm --filter @garageos/api test
pnpm dev:api

Return copy-paste-ready changes only.
```

---

# Current Working Recommendation

Proceed with **Priority 1 — Platform Tenant Management UI**. Keep the slice intentionally narrow:

- `/platform/tenants` tenant list
- `/platform/tenants/{tenant_id}` tenant detail
- `/platform/tenants/new` create tenant

This gives the platform area a durable UI foundation while preserving the roadmap sequence and avoiding premature Milestone 8 backend work.
