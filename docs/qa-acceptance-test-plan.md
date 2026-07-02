# GarageOS QA Acceptance Test Plan

**Document:** `qa-acceptance-test-plan.md`  
**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Generated:** 2026-06-24  
**Status:** Draft for team review  
**Source of Truth:** `requirements-v2.4.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`  
**Scope Rule:** This plan covers only functionality, workflows, constraints, and non-functional requirements documented in the approved source documents. It does not introduce new modules, product phases, or excluded capabilities.

---

## 1. Purpose

This QA Acceptance Test Plan defines the acceptance testing approach for the full single-scope GarageOS build. It translates the approved PRD, database design, physical schema, architecture, and API contracts into a coordinated QA plan covering functional acceptance, workflow correctness, API contract validation, database integrity, concurrency, security, offline read-only behavior, observability, reports, exports, and operational readiness.

The plan is intended for QA engineers, product managers, business stakeholders, software engineers, DevOps engineers, security reviewers, and release approvers.

---

## 2. Source Document Alignment

| Source Document        | QA Usage                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `requirements-v2.4.md` | Primary source for business scope, exclusions, workflows, acceptance criteria, security, non-functional targets, and operational rules.                                  |
| `database-design.md`   | Source for data integrity expectations, transactional boundaries, isolation, indexing, and database-level QA strategy.                                                   |
| `database-schema.md`   | Source for physical schema validation, enums, constraints, seed data, immutable records, idempotency tables, background job tables, and schema QA checklist.             |
| `architecture.md`      | Source for test pyramid, deployment assumptions, mobile-first PWA architecture, background jobs, observability, security controls, and architecture acceptance criteria. |
| `api-contracts.md`     | Source for endpoint behavior, request/response envelopes, error semantics, idempotency, authorization, workflow endpoints, and API contract testing.                     |

### 2.1 Scope Included

The acceptance plan covers the documented GarageOS build scope, including:

- Multi-tenant SaaS lifecycle and subscription enforcement.
- Authentication, onboarding, users, roles, permissions, and branch access.
- Customers, motorcycles, services, estimates, job orders, mechanic sessions.
- Products, inventory, FIFO costing, reservations, adjustments, transfers.
- Suppliers, purchases, supplier returns, accounts payable.
- Invoices, billing allocations, payments, receipts, refunds, accounts receivable, tax.
- Expenses, reminders, notifications, reports, dashboard, files, exports, audit logs.
- Offline PWA shell with read-only recent-record cache.
- Security controls, observability, background job reliability, backup, and disaster recovery targets.

### 2.2 Explicitly Excluded from QA Acceptance Scope

The following must not be tested as product deliverables because they are excluded from the build scope:

- Native iOS or Android application.
- Full offline transaction creation, editing, approval, or sync conflict resolution.
- Full accounting system, general ledger, chart of accounts, journal entries, or bank reconciliation.
- Payroll.
- Direct BIR filing.
- E-commerce marketplace, online store, checkout, or delivery workflow.
- Customer portal or customer self-service login.
- Loyalty program.
- Service packages.
- Predictive analytics, AI recommendations, forecasting, or custom BI dashboards.
- Automatic subscription payment collection.
- Standalone retail POS/cart checkout independent of job orders or service invoices.
- Two-factor authentication.

---

## 3. Multi-Agent Panel Brainstorm Summary

### 3.1 Business Owner

**Goal:** Prove the system supports recurring SaaS revenue, operational continuity, tenant lifecycle control, plan monetization, export access, and data deletion rules.

**Acceptance emphasis:** subscription lifecycle, plan limits, branch limits, renewal behavior, tenant export, read-only/suspension behavior, and deletion lifecycle.

### 3.2 Product Manager / Business Analyst

**Goal:** Ensure every acceptance test traces to a documented requirement and every workflow follows explicit status transitions.

**Acceptance emphasis:** traceability, acceptance criteria, blocked-action messages, workflow status history, documented enums, and exclusion discipline.

### 3.3 SMEs

**Goal:** Validate motorcycle shop workflows from intake through repair, parts usage, invoice, payment, supplier purchasing, and service history.

**Acceptance emphasis:** job order lifecycle, mechanic work sessions, service history, inventory reservation/consumption, AP/AR accuracy, and customer reminders.

### 3.4 End Users

**Goal:** Confirm the mobile-first workflows are usable for shop owners, managers, advisors, mechanics, cashiers, and inventory clerks.

**Acceptance emphasis:** mobile usability at 360px minimum width, touch-friendly workflows, clear blocked-action prompts, offline read-only behavior, and role-appropriate screens.

### 3.5 Architect

**Goal:** Validate the modular monolith, PostgreSQL transactional source of truth, background jobs, tenant isolation, and operational boundaries.

**Acceptance emphasis:** transaction boundaries, idempotency, retry safety, strict module behavior, data ownership, and source-of-truth consistency.

### 3.6 Senior Engineers

**Goal:** Ensure implementation is maintainable, deterministic, testable, and aligned with API/schema contracts.

**Acceptance emphasis:** API envelopes, stable error codes, optimistic locking, idempotency keys, rollback behavior, database constraints, and integration tests.

### 3.7 UX Designer

**Goal:** Validate mobile-first task completion without adding undocumented screens or workflows.

**Acceptance emphasis:** PWA installability, offline shell messaging, read-only cache indicators, permission-disabled actions, validation clarity, and renewal/plan prompts.

### 3.8 QA

**Goal:** Build a layered test suite that proves business acceptance, data integrity, API contracts, concurrency safety, and regression readiness.

**Acceptance emphasis:** PRD Section 37 criteria, API contract tests, database/schema QA checks, E2E happy paths, blocked paths, concurrency, and regression gates.

### 3.9 Security

**Goal:** Prove tenant isolation, branch access, authentication safety, token secrecy, file privacy, platform support auditability, and rate limits.

**Acceptance emphasis:** cross-tenant blocking, branch-scoped access blocking, private signed file URLs, sensitive-data log checks, rate limiting, support access sessions, and audit immutability.

### 3.10 DevOps

**Goal:** Validate deployability, observability, background job reliability, backup/restore, and disaster recovery readiness.

**Acceptance emphasis:** structured logs, metrics, correlation IDs, job failure tracking, retries, alerts, encrypted backups, quarterly restore evidence, RPO 24h, RTO 4h.

### 3.11 Project Manager

**Goal:** Sequence QA acceptance around implementation order and define release gates.

**Acceptance emphasis:** entry/exit criteria, staged acceptance, defect severity, release readiness evidence, and sign-off ownership.

### 3.12 Panel Resolution

No product-scope ambiguity blocks this QA plan. Remaining decisions identified in source documents are engineering implementation choices, not acceptance-scope gaps. Acceptance testing must therefore validate documented behavior and must not expand scope.

---

## 4. QA Objectives

The system is acceptable only when QA evidence proves that:

1. All documented required workflows are implemented and testable.
2. All explicit exclusions remain unimplemented as product capabilities.
3. Tenant isolation and branch access are enforced across UI, API, repository, and database behavior.
4. Role and permission behavior matches documented additive RBAC rules.
5. Subscription lifecycle status gates are enforced centrally.
6. Workflow transitions follow documented state machines.
7. Critical writes are atomic, idempotency-safe, and concurrency-safe.
8. Inventory uses ledger entries, stock balances, FIFO layers, reservations, FIFO allocations, and FIFO consumptions correctly.
9. Issued invoices, payments, receipts, refunds, inventory ledgers, and audit logs preserve immutability or correction-only behavior.
10. Reports, dashboards, exports, offline cache, files, reminders, background jobs, and observability meet documented requirements.
11. Non-functional targets for performance, availability, scalability, security, backup, and DR have objective verification evidence.

---

## 5. Test Strategy

### 5.1 Test Pyramid

| Test Type          | Purpose                                             | Required Coverage                                                                                                                             |
| ------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests         | Validate pure business rules and calculations.      | Status transitions, permission resolution, tax, money, FIFO allocation math, invoice discount allocation, report calculations.                |
| Integration tests  | Validate database-backed service behavior.          | Transactions, constraints, repositories, locks, idempotency, RLS if enabled, audit writes, outbox writes.                                     |
| API contract tests | Validate externally visible API behavior.           | Auth, permission, branch access, validation, response/error envelopes, idempotency, optimistic locking, error codes.                          |
| End-to-end tests   | Validate complete user workflows.                   | Mobile-first core workflows: onboarding, customer/motorcycle intake, job order, inventory reservation, completion, invoice, payment, receipt. |
| Concurrency tests  | Validate high-risk duplicate/over-allocation cases. | Document numbering, FIFO reservations, payments, refunds, invoice allocations, purchase receiving, tenant deletion.                           |
| Migration tests    | Validate schema readiness.                          | Migration order, seed data, constraints, indexes, immutability triggers if implemented, rollback rehearsal outside production.                |
| Performance tests  | Validate documented performance targets.            | Initial PWA load, API latency, report summaries, search, ledgers, dashboard, exports.                                                         |
| Security tests     | Validate access and sensitive data controls.        | Tenant isolation, branch isolation, token handling, rate limits, file access, support access, logs.                                           |
| Operational tests  | Validate production readiness.                      | Background jobs, alerts, backup, restore, RPO/RTO evidence, deployment health checks.                                                         |

### 5.2 Test Environment Requirements

| Environment | QA Use                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| Local       | Developer unit and integration tests.                                                                                    |
| Development | Early API and integration validation.                                                                                    |
| Staging     | Full acceptance, E2E, migration, background jobs, object storage, exports, observability, and release candidate testing. |
| Production  | Smoke validation only after release; no destructive QA scenarios.                                                        |

Staging should mirror production closely enough to test migrations, workers, scheduler, object storage permissions, provider integrations, exports, backup/restore procedure, and monitoring behavior.

### 5.3 Test Data Strategy

Minimum acceptance fixtures must include:

- Two or more tenants with separate owners, employees, branches, customers, motorcycles, products, suppliers, files, and operational records.
- Branch-scoped users and tenant-wide users.
- Seeded role templates: Shop Owner, Manager, Service Advisor, Mechanic, Cashier, Inventory Clerk.
- Custom roles with additive permission combinations.
- Basic, Mid, and High plans plus tenant plan override cases.
- Active, inactive, merged, soft-deleted, cancelled, voided, refunded, retained, quarantined, and deleted-state data where documented.
- FIFO inventory layers with multiple received dates and different unit costs.
- Open and closed job orders, estimates, transfers, adjustments, purchases, invoices, payments, refunds, reminders, files, exports, jobs, and audit logs.
- Large datasets for search, reports, dashboards, ledgers, and export performance testing.

---

## 6. Entry Criteria

Acceptance testing may begin only when:

1. Relevant source documents are reviewed and frozen for the release candidate.
2. Database migrations for the tested module are complete and applied to staging.
3. Required seed data exists for plans, permissions, role templates, and product categories.
4. API endpoints for the tested module expose stable request/response contracts.
5. Authentication, tenant context, permission guard, branch guard, and subscription guard are available for protected endpoints.
6. Test accounts and test tenants are provisioned.
7. Observability basics are enabled: request IDs, correlation IDs, structured logs, and background job status visibility.
8. Test automation can create and clean up isolated fixtures.

---

## 7. Exit Criteria

A release candidate is QA-acceptable only when:

1. All P0 acceptance tests pass.
2. All P1 acceptance tests pass or have approved release-blocker waivers.
3. No open Critical or High defects remain unresolved.
4. Regression tests pass for previously completed modules.
5. Security acceptance tests pass for tenant isolation, branch access, tokens, sensitive logs, file access, support access, and rate limits.
6. Database integrity tests pass for constraints, immutability, idempotency, and transaction rollback.
7. Concurrency tests pass for document numbering, FIFO allocation, payments, refunds, invoice billing allocation, and tenant deletion.
8. Performance tests meet documented targets or produce approved operational mitigation evidence.
9. Background job tests prove retry-safe behavior and failure visibility.
10. Backup/restore and disaster recovery evidence is available for release readiness.
11. Product Owner, QA, Security, DevOps, and Engineering sign off on release evidence.

---

## 8. Defect Severity Model

| Severity | Definition                                                                                                           | Examples                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Critical | Blocks release; causes data leakage, financial corruption, stock corruption, security breach, or system-wide outage. | Cross-tenant data access, duplicate receipts, negative stock, overpayment accepted, plaintext token logged. |
| High     | Blocks affected workflow; no safe workaround for documented requirement.                                             | Read-only tenant can write data, job completion fails to consume inventory, branch access bypass.           |
| Medium   | Requirement partially fails but controlled workaround exists and no data integrity risk occurs.                      | Incorrect validation copy, missing non-critical filter, UI displays unclear blocked-action message.         |
| Low      | Cosmetic or minor usability issue that does not affect documented business correctness.                              | Layout spacing, non-blocking label issue, minor help text issue.                                            |

---

## 9. Acceptance Test Matrix

### 9.1 Tenant Isolation and Branch Access

| ID        | Priority | Acceptance Test                                                                                                                | Expected Result                                                                                             | Source Trace                        |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| QA-TI-001 | P0       | Tenant A user attempts to read Tenant B customer, motorcycle, product, invoice, file, report, and export records.              | Access is blocked with tenant-scoped not found or forbidden behavior; no Tenant B data is exposed.          | PRD §37.1, API §15.1, DB Schema §24 |
| QA-TI-002 | P0       | Attempt to submit tenant-owned write request using a different `tenant_id` in payload.                                         | Server ignores or rejects client-supplied tenant scope; authenticated session tenant remains authoritative. | API §5.2                            |
| QA-TI-003 | P0       | Branch-scoped user reads job orders, invoices, purchases, inventory, transfers, expenses, and files from an unassigned branch. | Access is blocked with `branch_access_denied` or scoped not found behavior.                                 | PRD §37.2, API §15.1                |
| QA-TI-004 | P0       | Tenant-wide user reads branch-specific operational records across active branches.                                             | Access is allowed when required permission exists.                                                          | PRD §37.2                           |
| QA-TI-005 | P1       | Branch-scoped user views tenant-wide customer/motorcycle profile linked to other branch histories.                             | Profile is visible when permitted; inaccessible branch histories are hidden or blocked.                     | PRD §37.2                           |
| QA-TI-006 | P0       | File download URL is requested by unauthorized tenant or unauthorized branch user.                                             | Signed URL is not generated; tenant file remains private.                                                   | PRD §37.1, Security §33.1-33.2      |

### 9.2 Subscription, Plan, and Tenant Lifecycle

| ID         | Priority | Acceptance Test                                                                      | Expected Result                                                                                                    | Source Trace           |
| ---------- | -------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| QA-SUB-001 | P0       | Basic tenant attempts to create a second active branch.                              | Creation is blocked with `plan_limit_exceeded`; upgrade prompt is available; blocked attempt is audit logged.      | PRD §5.3, §37.3        |
| QA-SUB-002 | P0       | Mid tenant creates up to three active branches, then attempts a fourth.              | First three are allowed; fourth is blocked.                                                                        | PRD §5.2, §37.3        |
| QA-SUB-003 | P0       | High tenant creates up to ten active branches, then attempts an eleventh.            | First ten are allowed; eleventh is blocked.                                                                        | PRD §5.2, §37.3        |
| QA-SUB-004 | P0       | Tenant plan override changes branch limit or channel availability.                   | Effective limit/channel is enforced and override is audit logged.                                                  | PRD §5.2, §37.3        |
| QA-SUB-005 | P0       | Basic tenant enables or sends customer email/SMS reminders.                          | Disabled channels are blocked; no silent fallback occurs.                                                          | PRD §5.4, §37.3, §37.9 |
| QA-SUB-006 | P0       | Expired tenant enters Day 1-14 after expiration.                                     | Status is `grace_period`; operational writes remain allowed with renewal warnings.                                 | PRD §4.4-4.5           |
| QA-SUB-007 | P0       | Expired tenant enters Day 15-30 after expiration.                                    | Status is `read_only`; operational writes are blocked; reads/export/renewal/password change/logout remain allowed. | PRD §4.4, §4.6         |
| QA-SUB-008 | P0       | Expired tenant enters Day 31-60 after expiration.                                    | Status is `suspended`; owner can renew/export only; non-owner users are blocked.                                   | PRD §4.4, §4.7         |
| QA-SUB-009 | P0       | Expired tenant enters Day 61-67 after expiration.                                    | Status is `pending_deletion`; tenant is queued for deletion; export access follows emergency-extension rule.       | PRD §4.4, §4.8         |
| QA-SUB-010 | P0       | Tenant reaches Day 68 or later and deletion job succeeds.                            | Eligible production records and files are removed; tenant is marked `deleted`; retained audit policy is respected. | PRD §4.8, §31.3        |
| QA-SUB-011 | P0       | Tenant renews before permanent deletion completes.                                   | Platform admin confirmation updates expiration/status and restores tenant to `active`.                             | PRD §4.4, §4.12        |
| QA-SUB-012 | P0       | Pending setup owner attempts operational module access before onboarding completion. | Access is blocked; setup, profile, subscription info, password management, and logout remain allowed.              | PRD §4.11              |
| QA-SUB-013 | P0       | Owner signup occurs when default plan or default subscription duration is missing.   | Signup is blocked.                                                                                                 | PRD §4.12, §37.3       |
| QA-SUB-014 | P0       | Owner submits renewal request.                                                       | No automatic access restoration occurs until platform admin confirms external payment/update.                      | PRD §4.12, §37.3       |

### 9.3 Authentication, Users, Roles, and Permissions

| ID          | Priority | Acceptance Test                                                                             | Expected Result                                                                                                     | Source Trace    |
| ----------- | -------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------- |
| QA-AUTH-001 | P0       | User logs in before email verification.                                                     | Operational access is blocked; verification and logout remain available.                                            | PRD §6.3        |
| QA-AUTH-002 | P0       | Five failed login attempts occur within 15 minutes for account/IP.                          | Login is temporarily blocked for 15 minutes; audit/rate-limit evidence exists.                                      | PRD §6.7        |
| QA-AUTH-003 | P0       | Password reset is requested more than three times per account per hour.                     | Request is rate-limited.                                                                                            | PRD §6.8        |
| QA-AUTH-004 | P0       | Password is created or changed without required complexity.                                 | Password is rejected.                                                                                               | PRD §6.4        |
| QA-AUTH-005 | P0       | User is deactivated while sessions are active.                                              | Login is blocked and active sessions are revoked.                                                                   | PRD §6.9, §10.3 |
| QA-AUTH-006 | P0       | Last active Shop Owner is deactivated or demoted.                                           | Operation is blocked.                                                                                               | PRD §7.2        |
| QA-AUTH-007 | P0       | User with multiple roles performs action from any assigned active role.                     | Effective permissions are additive; action is allowed if any role grants it.                                        | PRD §7.9        |
| QA-AUTH-008 | P0       | Custom role is deactivated while active users depend solely on it.                          | Deactivation is blocked until users have another active role.                                                       | PRD §7.8, §7.13 |
| QA-AUTH-009 | P0       | Shop Owner role is edited to remove required owner capabilities.                            | Operation is blocked.                                                                                               | PRD §7.13       |
| QA-AUTH-010 | P1       | Role permission change is saved.                                                            | Impact warning is shown before save; assigned users receive updated permissions; audit records old/new safe values. | PRD §7.13       |
| QA-AUTH-011 | P0       | Employee invitation link is expired, revoked, reused, or wrong tenant scoped.               | Acceptance is blocked.                                                                                              | PRD §6.2.2      |
| QA-AUTH-012 | P0       | Employee reactivation violates email uniqueness, active role, or active branch requirement. | Reactivation is blocked.                                                                                            | PRD §10.5       |

### 9.4 Onboarding, Shop Settings, and Branch Management

| ID         | Priority | Acceptance Test                                                                                                                                                                     | Expected Result                                                              | Source Trace    |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------- |
| QA-SET-001 | P0       | Complete onboarding without shop profile, active branch, invoice prefix, tax profile, country, timezone, currency, or active Shop Owner.                                            | Completion is blocked until all required records exist.                      | PRD §8.1        |
| QA-SET-002 | P0       | Invoice prefix violates pattern, length, uppercase, or trailing dash rule.                                                                                                          | Save is blocked.                                                             | PRD §8.4        |
| QA-SET-003 | P0       | Invoice prefix is changed after onboarding completion.                                                                                                                              | Change is blocked.                                                           | PRD §8.4        |
| QA-SET-004 | P0       | Tax profile, tax mode, or VAT rate changes after issued invoices exist.                                                                                                             | Future invoices use new values; issued invoices retain copied tax settings.  | PRD §8.3, §37.7 |
| QA-SET-005 | P0       | Last active branch is deactivated.                                                                                                                                                  | Deactivation is blocked.                                                     | PRD §9.3        |
| QA-SET-006 | P0       | Branch with open job orders, open purchase orders, draft/pending/in-transit transfers, active reservations, non-zero stock, or unreconciled stock-affecting records is deactivated. | Deactivation is blocked.                                                     | PRD §9.3        |
| QA-SET-007 | P0       | Deactivated branch is selected for new job order, invoice, purchase, or transfer.                                                                                                   | Selection is blocked.                                                        | PRD §9.3        |
| QA-SET-008 | P0       | Branch reactivation would exceed active branch plan limit.                                                                                                                          | Reactivation is blocked.                                                     | PRD §9.5        |
| QA-SET-009 | P1       | Employee assigned only to deactivated branch attempts branch-specific action.                                                                                                       | Action is blocked until reassignment to active branch or tenant-wide access. | PRD §9.3        |

### 9.5 Customers and Motorcycles

| ID        | Priority | Acceptance Test                                                                                                 | Expected Result                                                                           | Source Trace |
| --------- | -------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------ |
| QA-CM-001 | P0       | Customer is created without name or without any contact method.                                                 | Save is blocked.                                                                          | PRD §11.2    |
| QA-CM-002 | P1       | Customer creation/update matches duplicate mobile/email/similar name.                                           | Duplicate warning appears; automatic merge does not occur.                                | PRD §11.5    |
| QA-CM-003 | P0       | Customers from different tenants are merged.                                                                    | Merge is blocked.                                                                         | PRD §11.6    |
| QA-CM-004 | P0       | Customer with open job orders, unpaid invoices, active reminders, or active motorcycles is soft deleted.        | Soft delete is blocked.                                                                   | PRD §11.7    |
| QA-CM-005 | P0       | Soft-deleted customer is restored with exact active duplicate conflict.                                         | Restoration is blocked; duplicate rules are rechecked.                                    | PRD §11.8    |
| QA-CM-006 | P0       | Motorcycle is created for merged or soft-deleted customer.                                                      | Creation is blocked.                                                                      | PRD §12.6    |
| QA-CM-007 | P0       | Motorcycle mileage is updated lower than latest without permission/reason.                                      | Update is blocked.                                                                        | PRD §12.7    |
| QA-CM-008 | P0       | Motorcycle with open job orders, active reminders, or unpaid invoice through active job orders is soft deleted. | Soft delete is blocked.                                                                   | PRD §12.8    |
| QA-CM-009 | P0       | Motorcycle restoration is attempted while linked customer is merged or soft-deleted.                            | Restoration is blocked until customer is restored or changed through authorized workflow. | PRD §12.9    |

### 9.6 Services, Estimates, Job Orders, and Mechanic Sessions

| ID          | Priority | Acceptance Test                                                                              | Expected Result                                                                                                                   | Source Trace        |
| ----------- | -------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| QA-SVC-001  | P0       | Variable-price service is saved without price disclaimer.                                    | Save is blocked.                                                                                                                  | PRD §13.2           |
| QA-SVC-002  | P0       | Service referenced by open job orders or draft/presented estimates is deactivated.           | Deactivation is blocked.                                                                                                          | PRD §13.5           |
| QA-EST-001  | P0       | Estimate is presented with no line items.                                                    | Presentation is blocked.                                                                                                          | PRD §15.3           |
| QA-EST-002  | P0       | Presented estimate passes valid-until date.                                                  | Expiration job marks it `Expired`; draft and approved estimates do not automatically expire.                                      | PRD §15.3           |
| QA-EST-003  | P0       | Estimate includes part lines.                                                                | No inventory reservation, revenue, AR, stock, FIFO, tax, or financial report effect occurs.                                       | PRD §15.4-15.5      |
| QA-EST-004  | P0       | Estimate approval omits approval method or approved-by customer name.                        | Approval is blocked.                                                                                                              | PRD §15.6           |
| QA-JO-001   | P0       | Job order is created.                                                                        | Number follows `JO-YYYYMMDD-000001`; initial status is `Pending`; tenant-wide daily sequence is unique.                           | PRD §14.3-14.4      |
| QA-JO-002   | P0       | Job order moves from `Pending` to `In Progress` without primary mechanic.                    | Transition is blocked.                                                                                                            | PRD §14.5           |
| QA-JO-003   | P0       | User performs unsupported job order status transition.                                       | Transition is blocked with clear validation error.                                                                                | PRD §14.5           |
| QA-JO-004   | P0       | Parts are added to job order with insufficient available stock.                              | Reservation is blocked and available quantity is shown.                                                                           | PRD §14.9           |
| QA-JO-005   | P0       | Parts are added to job order with sufficient available stock.                                | Reservation is created; reserved stock increases; available stock decreases; on-hand remains unchanged.                           | PRD §14.9, §17.8    |
| QA-JO-006   | P0       | Job order completes from `In Progress` or `Waiting For Parts`.                               | Reserved parts consume on-hand and reserved quantities, create ledger entries, consume FIFO layers oldest-first, and record COGS. | PRD §14.10          |
| QA-JO-007   | P0       | Completed job order is released while unpaid and user lacks release-with-balance permission. | Release is blocked.                                                                                                               | PRD §14.8           |
| QA-JO-008   | P0       | Released job order is edited or cancelled.                                                   | Operation is blocked.                                                                                                             | PRD §14.8, §14.11.1 |
| QA-JO-009   | P0       | Job order cancellation has consumed inventory.                                               | Cancellation requires authorized inventory reversal before cancellation.                                                          | PRD §14.7           |
| QA-MECH-001 | P0       | Mechanic starts a second unfinished session in the same tenant.                              | New session is blocked and existing session is shown.                                                                             | PRD §16.3           |
| QA-MECH-002 | P0       | Paused mechanic session is finished.                                                         | Active duration excludes pause time.                                                                                              | PRD §16.4-16.5      |

### 9.7 Inventory, FIFO, Adjustments, Transfers, Products, and Categories

| ID         | Priority | Acceptance Test                                                                                                       | Expected Result                                                                                                                    | Source Trace              |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| QA-INV-001 | P0       | Any stock-changing operation completes.                                                                               | Immutable inventory ledger entry is created.                                                                                       | PRD §17.6, §37.5          |
| QA-INV-002 | P0       | Operation would make available stock negative.                                                                        | Operation is blocked.                                                                                                              | PRD §17.5, §37.5          |
| QA-INV-003 | P0       | Operation would make on-hand lower than reserved.                                                                     | Operation is blocked.                                                                                                              | PRD §17.10, DB Schema §24 |
| QA-INV-004 | P0       | Concurrent reservations target same FIFO layers.                                                                      | FIFO reservation allocations do not exceed allocatable layer quantity.                                                             | PRD §17.8, §37.5          |
| QA-INV-005 | P0       | Product has stock, active reservations, open job orders, open purchase orders, or draft/pending/in-transit transfers. | Product deactivation is blocked.                                                                                                   | PRD §17.3.1               |
| QA-INV-006 | P0       | Product category has active products assigned.                                                                        | Category deactivation is blocked.                                                                                                  | PRD §17.4.1               |
| QA-INV-007 | P0       | Low stock condition becomes `available <= reorder_level`.                                                             | One branch-specific low-stock alert is generated and resolves when available exceeds reorder level.                                | PRD §17.9                 |
| QA-ADJ-001 | P0       | Adjustment value impact reaches configured threshold and creator lacks approval authority.                            | Adjustment moves to `Pending Approval`; stock/FIFO/ledger remain unchanged.                                                        | PRD §17.10-17.11          |
| QA-ADJ-002 | P0       | Approved adjustment is posted.                                                                                        | Stock, FIFO, ledger, status event, and audit log update in one transaction.                                                        | PRD §17.11                |
| QA-ADJ-003 | P0       | Posted adjustment is edited or cancelled.                                                                             | Operation is blocked; correction requires new adjustment.                                                                          | PRD §17.11                |
| QA-ADJ-004 | P0       | Force adjustment would make on-hand negative or lower than reserved.                                                  | Operation is blocked.                                                                                                              | PRD §17.12                |
| QA-TR-001  | P0       | Transfer from source branch to same destination branch or inactive branch.                                            | Creation/submission is blocked.                                                                                                    | PRD §19.1, §19.3          |
| QA-TR-002  | P0       | Transfer moves from `Draft` to `Pending`.                                                                             | Source available stock is checked; source stock is reserved; on-hand unchanged; reservation ledger entry created.                  | PRD §19.5                 |
| QA-TR-003  | P0       | Transfer moves from `Pending` to `In Transit` with sent quantity lower than reserved.                                 | Difference is released and source available increases.                                                                             | PRD §19.6                 |
| QA-TR-004  | P0       | Transfer is received with lower received quantity than sent.                                                          | Transfer variance loss ledger is created; missing quantity is not added to destination stock; no AR/AP/revenue/expense is created. | PRD §19.7-19.8            |
| QA-TR-005  | P0       | In-transit transfer is cancelled as lost/damaged.                                                                     | Reserved stock is released; source on-hand decreases; FIFO is consumed; variance loss ledger and audit reason are recorded.        | PRD §19.9                 |

### 9.8 Suppliers, Purchases, Supplier Returns, and Accounts Payable

| ID        | Priority | Acceptance Test                                                                                               | Expected Result                                                                                                    | Source Trace          |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------- |
| QA-AP-001 | P0       | Supplier with active open purchase orders or unpaid payable balance is deactivated.                           | Deactivation is blocked.                                                                                           | PRD §20.4             |
| QA-AP-002 | P0       | Supplier reactivation would conflict with active supplier name uniqueness.                                    | Reactivation is blocked.                                                                                           | PRD §20.5             |
| QA-PO-001 | P0       | Purchase order is created.                                                                                    | Number follows `PO-YYYYMMDD-000001`; sequence is tenant-wide, daily, unique, and immutable.                        | PRD §21.3.2           |
| QA-PO-002 | P0       | Purchase receiving is posted for credit purchase.                                                             | Branch on-hand increases, FIFO layers are created, inventory ledger entries exist, and supplier payable increases. | PRD §21.5-21.6, §37.8 |
| QA-PO-003 | P0       | Purchase receiving is posted for cash purchase.                                                               | Branch on-hand and FIFO increase, but AP is not created; payment method/reference is recorded.                     | PRD §21.11, §37.8     |
| QA-PO-004 | P0       | Purchase order with received stock is cancelled.                                                              | Cancellation is blocked.                                                                                           | PRD §21.8, §37.8      |
| QA-SR-001 | P0       | Supplier return is posted.                                                                                    | Stock decreases, FIFO is consumed, ledger entry is created, and AP/credit effect follows original payment status.  | PRD §21.9-21.9.1      |
| QA-SR-002 | P0       | Supplier return exceeds returnable quantity or attempts reserved/consumed/transferred/already returned stock. | Return is blocked.                                                                                                 | DB Design §27.1       |
| QA-AP-003 | P0       | Supplier payment is created.                                                                                  | Supplier payable balance decreases and payment method enum is valid.                                               | PRD §21.7, §23.1      |

### 9.9 Invoices, Payments, Receipts, Refunds, Tax, AR

| ID            | Priority | Acceptance Test                                                                                            | Expected Result                                                                                         | Source Trace         |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------- |
| QA-INVFIN-001 | P0       | Invoice is issued without at least one linked job order.                                                   | Issuance is blocked.                                                                                    | PRD §22.1, §37.6     |
| QA-INVFIN-002 | P0       | Two concurrent invoices attempt to bill the same job order line beyond remaining billable quantity/amount. | Billing allocation prevents overbilling.                                                                | PRD §22.3.1, §37.6   |
| QA-INVFIN-003 | P0       | Issued invoice is directly edited.                                                                         | Direct edit is blocked; correction workflow required.                                                   | PRD §22.8            |
| QA-INVFIN-004 | P0       | Payment amount exceeds remaining invoice balance without documented customer-credit behavior implemented.  | Payment is blocked with overpayment error.                                                              | PRD §23.2, API §4.6  |
| QA-INVFIN-005 | P0       | Payment is created.                                                                                        | Exactly one immutable receipt is created; invoice paid/remaining/status recalculates.                   | PRD §23.2, §23.6     |
| QA-INVFIN-006 | P0       | Same payment request is retried with same idempotency key and same intent.                                 | Original result is returned; no duplicate payment or receipt is created.                                | API §7.3             |
| QA-INVFIN-007 | P0       | Same idempotency key is reused with different payment request intent.                                      | Request is rejected with `409 idempotency_conflict`.                                                    | API §7.3             |
| QA-INVFIN-008 | P0       | Refund exceeds refundable payment amount.                                                                  | Refund is blocked.                                                                                      | PRD §23.7, API §15.4 |
| QA-INVFIN-009 | P0       | Refund is posted without inventory reversal selected.                                                      | Refund records are created and invoice status recalculates; inventory remains unchanged.                | PRD §23.7-23.8       |
| QA-INVFIN-010 | P0       | Refund is posted with inventory reversal selected.                                                         | Inventory reversal follows documented stock/FIFO/ledger rules.                                          | PRD §23.8            |
| QA-INVFIN-011 | P0       | Paid invoice is partially refunded while collection continues.                                             | Status recalculates to `Pending`, `Partially Paid`, or `Overdue`, not incorrectly forced to `Refunded`. | PRD §37.6            |
| QA-TAX-001    | P0       | VAT-registered tenant issues tax-inclusive and tax-exclusive invoices.                                     | Tax is calculated per line, rounded to two decimals, and copied tax settings are retained.              | PRD §24, §37.7       |
| QA-TAX-002    | P0       | Non-VAT or No Tax tenant issues invoice.                                                                   | No-tax behavior applies.                                                                                | PRD §24.2, §37.7     |
| QA-AR-001     | P0       | Invoice due date passes with remaining balance.                                                            | Invoice status is computed as `Overdue`.                                                                | PRD §22.7, §23.9     |

### 9.10 Expenses, Reminders, Notifications, Files, Reports, Dashboard

| ID           | Priority | Acceptance Test                                                            | Expected Result                                                                                                 | Source Trace       |
| ------------ | -------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------ |
| QA-EXP-001   | P0       | Expense is created without required fields or invalid payment method enum. | Save is blocked.                                                                                                | PRD §25.2, §23.1   |
| QA-EXP-002   | P0       | Expense is edited after report period or after voiding.                    | Behavior follows documented expense editing/void rules; audit logs are written.                                 | PRD §25.3-25.3.1   |
| QA-REM-001   | P0       | Time-based reminder reaches due date in tenant timezone.                   | Reminder becomes due on or after due date.                                                                      | PRD §26.6, §37.9   |
| QA-REM-002   | P0       | Mileage reminder due mileage is reached by latest motorcycle mileage.      | Reminder becomes due.                                                                                           | PRD §26.7, §37.9   |
| QA-REM-003   | P0       | Birthday reminder evaluation runs.                                         | Due reminders evaluate daily by tenant timezone.                                                                | PRD §26.8, §37.9   |
| QA-REM-004   | P0       | Permanent delivery failure occurs.                                         | Delivery is not retried automatically; attempt/failure status is recorded.                                      | PRD §26.10         |
| QA-NOTIF-001 | P0       | Low stock notification is generated for Branch A.                          | Recipients are limited by tenant, branch access, permissions, type, preferences, and plan channel availability. | PRD §27.2          |
| QA-FILE-001  | P0       | Unsupported file type or oversized file is uploaded.                       | Upload is blocked.                                                                                              | PRD §28.2-28.3     |
| QA-FILE-002  | P0       | Authorized user downloads linked file.                                     | Time-limited signed URL is generated only after access checks.                                                  | PRD §28.4          |
| QA-FILE-003  | P0       | File is soft deleted.                                                      | It is hidden from default lists, restorable for 30 days, and retained where financial/audit retention requires. | PRD §28.5          |
| QA-RPT-001   | P0       | Revenue report is generated.                                               | Draft, cancelled, and voided invoices are excluded.                                                             | PRD §29.10, §37.14 |
| QA-RPT-002   | P0       | Payment collection report is generated.                                    | It uses payment records minus refund records.                                                                   | PRD §37.14         |
| QA-RPT-003   | P0       | Gross profit report is generated.                                          | Net service and parts revenue minus consumed inventory cost is used.                                            | PRD §37.14         |
| QA-RPT-004   | P0       | Report requires more than 10 seconds.                                      | It runs as a background export instead of synchronous report response.                                          | PRD §34.2          |
| QA-DASH-001  | P1       | Dashboard is accessed by branch-scoped user.                               | Metrics are limited to assigned branch access.                                                                  | PRD §29.2          |

### 9.11 Offline PWA Acceptance

| ID         | Priority | Acceptance Test                                                                                                            | Expected Result                                                                      | Source Trace      |
| ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------- |
| QA-OFF-001 | P0       | PWA is opened without network.                                                                                             | Offline app shell loads and clearly indicates offline status.                        | PRD §32.2, §37.10 |
| QA-OFF-002 | P0       | Recently viewed customer, motorcycle, job order, or invoice is opened offline.                                             | Cached read-only view is available when cache is valid and scoped to logged-in user. | PRD §32.3         |
| QA-OFF-003 | P0       | User attempts to create, edit, submit, delete, upload, approve, pay, refund, adjust, transfer, or change settings offline. | Action is blocked with clear offline-unavailable message.                            | PRD §32.4         |
| QA-OFF-004 | P0       | User logs out.                                                                                                             | Offline cache is cleared.                                                            | PRD §32.3, §37.10 |
| QA-OFF-005 | P1       | Cached records are older than 7 days.                                                                                      | Expired cached records are not displayed.                                            | PRD §32.3         |

### 9.12 Audit, Export, Retention, Background Jobs, and Observability

| ID                | Priority | Acceptance Test                                                  | Expected Result                                                                                                                                   | Source Trace              |
| ----------------- | -------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| QA-AUD-001        | P0       | Critical, corrective, or destructive action is performed.        | Audit log records actor, action, entity, timestamp, and affected data where applicable.                                                           | PRD §30, §37.11           |
| QA-AUD-002        | P0       | User attempts to edit audit log.                                 | Audit log is immutable.                                                                                                                           | PRD §30.4, §37.11         |
| QA-EXP-EXPORT-001 | P0       | Shop Owner requests full tenant export.                          | ZIP contains CSV, JSON relationship data, audit export, attachment manifest, optional attachment binaries, and README.                            | PRD §31.1-31.2, §37.12    |
| QA-EXP-EXPORT-002 | P0       | Expired tenant requests export outside allowed lifecycle window. | Export access follows lifecycle restrictions and emergency-extension rules.                                                                       | PRD §4.4, §31.1           |
| QA-RET-001        | P0       | Tenant deletion job runs after eligible deletion window.         | Eligible tenant production data/files are deleted; platform-retained audit records remain; tenant marked deleted.                                 | PRD §4.8, §31.3           |
| QA-RET-002        | P0       | Deleted tenant resubscribes.                                     | New tenant record is created; old tenant data is not restored.                                                                                    | PRD §31.4                 |
| QA-BG-001         | P0       | Retry-safe background job fails transiently.                     | Attempt count, last error, status, correlation ID, and retry behavior are recorded.                                                               | PRD §34.7                 |
| QA-BG-002         | P0       | Permanent background job failure occurs.                         | Job is not retried automatically when unsafe; platform/admin alert is generated for critical failures.                                            | PRD §34.7                 |
| QA-OBS-001        | P0       | API request succeeds or fails.                                   | Structured log contains request ID, correlation ID, tenant/user context when applicable, status code, path, duration, and error code when failed. | Architecture §23, API §13 |
| QA-OBS-002        | P0       | Provider delivery fails.                                         | Delivery failure is recorded and visible to authorized users.                                                                                     | API §15.7                 |

### 9.13 Security, Performance, Scalability, Backup, and DR

| ID           | Priority | Acceptance Test                                                                   | Expected Result                                                                    | Source Trace |
| ------------ | -------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------ |
| QA-SEC-001   | P0       | Production HTTP request is sent.                                                  | HTTP is redirected to HTTPS or blocked; HTTPS is enforced.                         | PRD §33.3    |
| QA-SEC-002   | P0       | Passwords, tokens, card numbers, CVV, or secrets appear in request/response logs. | Sensitive data is absent from logs.                                                | PRD §33.5    |
| QA-SEC-003   | P0       | Platform admin starts support access without reason or audit session.             | Access is blocked; support access requires reason and session.                     | PRD §4.10    |
| QA-SEC-004   | P0       | Platform support access is write-enabled without explicit mode and permission.    | Access is blocked.                                                                 | PRD §4.10    |
| QA-PERF-001  | P1       | Initial PWA load over modern mobile browser on 4G.                                | Initial page load is less than 3 seconds under normal load.                        | PRD §34.1    |
| QA-PERF-002  | P1       | API latency is measured under normal operating load.                              | P50 < 200ms, P95 < 500ms, P99 < 1000ms, excluding documented exceptions.           | PRD §34.1    |
| QA-PERF-003  | P1       | Interactive report summary for default date range up to 90 days.                  | Summary loads within 5 seconds.                                                    | PRD §34.2    |
| QA-SCALE-001 | P1       | High-volume indexed queries are exercised with target-scale fixture data.         | Tenant/branch/date/status-indexed paths remain usable for documented target scale. | PRD §34.4    |
| QA-DR-001    | P0       | Backup policy is verified.                                                        | Daily encrypted backups exist and are retained at least 30 days.                   | PRD §33.7    |
| QA-DR-002    | P0       | Restore test evidence is reviewed.                                                | Backup restoration is tested at least quarterly.                                   | PRD §33.7    |
| QA-DR-003    | P0       | Disaster recovery procedure is assessed.                                          | RPO 24 hours and RTO 4 hours are supported by documented evidence.                 | PRD §33.8    |

---

## 10. API Contract Acceptance Requirements

Every protected endpoint must have automated contract tests for:

1. Authentication requirement.
2. Email verification guard where applicable.
3. Tenant status/subscription guard where applicable.
4. Platform/support access guard where applicable.
5. Required permission enforcement.
6. Branch access enforcement where applicable.
7. Request validation.
8. Successful response envelope shape.
9. Error response envelope shape.
10. Stable HTTP status and machine-readable error code.
11. Idempotency behavior for required critical writes.
12. Optimistic locking behavior for mutable updates.
13. Audit log creation where required.
14. Transaction rollback on simulated partial failure.
15. Concurrency behavior for critical workflow endpoints.

---

## 11. Critical Concurrency Test Set

The following scenarios must be automated before release:

| ID         | Priority | Concurrent Scenario                                                                                       | Required Proof                                                           |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| QA-CON-001 | P0       | Multiple users create job orders, estimates, invoices, receipts, purchases, and transfers simultaneously. | No duplicate tenant-scoped document numbers.                             |
| QA-CON-002 | P0       | Multiple users reserve the same FIFO layer stock simultaneously.                                          | No over-allocation; stock balance and FIFO allocation invariants hold.   |
| QA-CON-003 | P0       | Multiple users complete the same job order or consume same reservation.                                   | No double inventory consumption.                                         |
| QA-CON-004 | P0       | Multiple users issue invoices for the same job order lines.                                               | Billing allocations prevent overbilling.                                 |
| QA-CON-005 | P0       | Multiple payment submissions are made against one invoice.                                                | No overpayment; each successful payment has exactly one receipt.         |
| QA-CON-006 | P0       | Multiple refund submissions are made against one payment.                                                 | No over-refund; invoice status recalculates correctly.                   |
| QA-CON-007 | P0       | Multiple purchase receiving submissions target same purchase lines.                                       | No over-receiving.                                                       |
| QA-CON-008 | P0       | Multiple tenant deletion executions are triggered.                                                        | Deletion is idempotent and irreversible side effects are not duplicated. |
| QA-CON-009 | P0       | Stale update attempts use old `lock_version`.                                                             | `409 version_conflict` is returned.                                      |
| QA-CON-010 | P0       | Idempotency key reused with different request intent.                                                     | `409 idempotency_conflict` is returned.                                  |

---

## 12. Release Readiness Evidence

QA must collect and retain:

- Test execution report with pass/fail status by test ID.
- Traceability matrix mapping requirements to automated/manual tests.
- API contract test results.
- Database migration and schema validation results.
- Concurrency test logs and database invariant checks.
- E2E workflow execution evidence for mobile-first scenarios.
- Security test results including tenant/branch/file/token/rate-limit checks.
- Performance test results against documented targets.
- Background job failure/retry/alert evidence.
- Export package samples and manifest validation evidence.
- Backup/restore test evidence and DR readiness confirmation.
- Defect report and accepted waivers, if any.
- Final sign-off record.

---

## 13. Remaining Risks and Mitigations

| Risk                                                             | Impact                                                    | Mitigation                                                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| FIFO and inventory workflows are complex.                        | Stock, COGS, and valuation errors.                        | Use deterministic FIFO fixtures, concurrency tests, reconciliation checks, and transaction rollback tests.  |
| Billing allocations and refunds can create financial edge cases. | Overbilling, overpayment, wrong AR status.                | Use high-priority financial integrity tests and concurrent allocation/payment/refund tests.                 |
| Tenant isolation defects are severe.                             | Data leakage and trust failure.                           | Test isolation at API, service, repository, database, file, report, and export layers.                      |
| Offline cache can expose stale or unauthorized data.             | User confusion or access risk after reconnect.            | Keep cache read-only, user-scoped, expiring after 7 days, cleared on logout, and refreshed after reconnect. |
| Background job retries can duplicate side effects.               | Duplicate exports, reminders, receipts, deletion effects. | Require idempotent job design, job locks, attempt tracking, and safe retry classification.                  |
| Large reports and exports can degrade UX.                        | Timeouts and poor mobile experience.                      | Enforce async export threshold and performance tests for reports/search/ledgers.                            |
| Platform support access can be misused.                          | Privacy and compliance risk.                              | Require support reason, explicit mode, visible support UI, permission checks, and audit logs.               |

---

## 14. Final QA Recommendation

Proceed with QA implementation using this plan as the acceptance baseline. The highest-risk areas must be automated first: tenant isolation, branch access, subscription gates, critical transaction idempotency, FIFO inventory correctness, billing allocation correctness, payment/receipt immutability, refunds, audit logs, exports, tenant deletion, and offline read-only restrictions.

The release should not be approved until all P0 acceptance tests pass and all documented source-of-truth acceptance criteria have objective evidence.
