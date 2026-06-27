# GarageOS QA Acceptance Test Plan

**Document:** `qa-acceptance-test-plan.md`  
**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Status:** Draft for team review  
**Source of Truth:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`  
**Scope Rule:** Validate only documented GarageOS behavior. Do not add product phases, modules, workflows, roles, permissions, or excluded capabilities.

---

## 1. Purpose

Define the acceptance-testing baseline for the full GarageOS build: functional workflows, API contracts, database integrity, concurrency, tenant/branch security, offline read-only behavior, observability, reports, exports, and release readiness.

---

## 2. Source Alignment

| Source               | QA Use                                                                                |
| -------------------- | ------------------------------------------------------------------------------------- |
| `requirements.md`    | Product scope, exclusions, workflows, acceptance criteria, security, NFRs.            |
| `database-design.md` | Data integrity, transactions, isolation, indexing, DB QA strategy.                    |
| `database-schema.md` | Tables, enums, constraints, seed data, immutability, idempotency, jobs.               |
| `architecture.md`    | Test pyramid, PWA/backend/jobs/observability/security architecture.                   |
| `api-contracts.md`   | REST behavior, envelopes, errors, auth, permissions, idempotency, workflow endpoints. |

### Included Scope

Multi-tenant SaaS lifecycle, subscriptions, auth, onboarding, users, RBAC, branch access, customers, motorcycles, services, estimates, job orders, mechanic sessions, products, inventory, FIFO, reservations, adjustments, transfers, suppliers, purchases, supplier returns, AP, invoices, billing allocations, payments, receipts, refunds, AR, tax, expenses, reminders, notifications, reports, dashboard, files, exports, audit logs, offline read-only PWA cache, security, observability, jobs, backups, and DR.

### Excluded Scope

Do not test as deliverables: native mobile apps, offline writes/sync, full accounting/GL, payroll, direct BIR filing, e-commerce marketplace, customer portal, loyalty, service packages, predictive AI/custom BI beyond defined reports, automatic subscription collection, standalone POS checkout, or 2FA.

---

## 3. QA Objectives

The build is acceptable only when objective evidence proves:

1. Required workflows are implemented and traceable.
2. Explicit exclusions remain absent.
3. Tenant isolation and branch access hold across UI/API/service/repository/DB/files/reports/exports.
4. RBAC is additive and permission-gated.
5. Tenant lifecycle and plan gates override normal permissions.
6. Workflow transitions follow documented state machines.
7. Critical writes are atomic, idempotent, rollback-safe, and concurrency-safe.
8. Inventory uses ledger, balances, FIFO layers, reservations, allocations, and consumption correctly.
9. Financial records, receipts, refunds, inventory ledgers, FIFO records, and audit logs are immutable or correction-only.
10. Reports, dashboard, exports, files, reminders, offline cache, jobs, observability, backup, and DR meet documented targets.

---

## 4. Test Strategy

| Type         | Required Coverage                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit         | Status transitions, permission resolution, tax, money, FIFO math, invoice discounts, report calculations.                                    |
| Integration  | Transactions, constraints, repositories, locks, idempotency, audit/outbox writes, optional RLS.                                              |
| API contract | Auth, email verification, subscription/tenant/branch/permission guards, validation, envelopes, error codes, idempotency, optimistic locking. |
| E2E          | Mobile-first onboarding, customer/motorcycle intake, job order, reservation, completion, invoice, payment, receipt.                          |
| Concurrency  | Document numbers, FIFO reservations, job completion, invoices, payments, refunds, purchase receiving, tenant deletion.                       |
| Migration    | Migration order, seed data, constraints, indexes, immutability triggers, rollback rehearsal outside production.                              |
| Performance  | PWA load, API latency, search, ledgers, dashboard, report summaries, exports.                                                                |
| Security     | Tenant/branch isolation, token/log safety, file access, support access, rate limits.                                                         |
| Operational  | Jobs, retries, alerts, health checks, backups, restore, RPO/RTO evidence.                                                                    |

### Environments

| Environment | Use                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| Local       | Developer unit/integration tests.                                                                                        |
| Development | Early API and service validation.                                                                                        |
| Staging     | Full acceptance, E2E, migrations, workers, scheduler, object storage, exports, observability, release candidate testing. |
| Production  | Smoke only after release; no destructive QA.                                                                             |

### Minimum Test Data

Use fixtures with: at least two tenants, owners/employees, tenant-wide and branch-scoped users, multiple branches, role templates, custom roles, Basic/Mid/High plans, plan override cases, lifecycle statuses, customers, motorcycles, products, suppliers, files, operational records, FIFO layers with different costs/dates, open/closed workflows, audit logs, jobs, and large datasets for search/report/export performance.

---

## 5. Entry and Exit Gates

### Entry Criteria

Acceptance starts only when relevant docs are frozen, migrations are applied to staging, seed data exists, API contracts are stable, auth/tenant/permission/branch/subscription guards work, test tenants/accounts exist, observability basics are enabled, and automation can create/clean isolated fixtures.

### Exit Criteria

Release candidate approval requires:

1. All P0 tests pass.
2. All P1 tests pass or have approved waivers.
3. No unresolved Critical/High defects.
4. Regression tests pass.
5. Tenant/branch/token/file/log/support/rate-limit security tests pass.
6. DB integrity, immutability, idempotency, rollback, and concurrency tests pass.
7. Performance targets pass or have approved mitigations.
8. Job retry/failure visibility is proven.
9. Backup/restore and DR evidence exists.
10. Product Owner, QA, Security, DevOps, and Engineering sign off.

---

## 6. Defect Severity

| Severity | Definition                                                                                    | Examples                                                                                            |
| -------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Critical | Release blocker causing data leakage, financial/stock corruption, security breach, or outage. | Cross-tenant access, duplicate receipt, negative stock, accepted overpayment, plaintext token logs. |
| High     | Blocks documented workflow with no safe workaround.                                           | Read-only tenant can write, job completion skips inventory, branch bypass.                          |
| Medium   | Partial requirement failure with workaround and no integrity risk.                            | Unclear validation copy, missing non-critical filter.                                               |
| Low      | Cosmetic/minor usability issue.                                                               | Spacing, label, minor help text.                                                                    |

---

## 7. Acceptance Suites

### 7.1 Tenant Isolation and Branch Access — P0/P1

Validate that users cannot read/write another tenant's customers, motorcycles, products, invoices, files, reports, or exports. Client-supplied `tenant_id` must be ignored or rejected. Branch-scoped users must be blocked from unassigned branch records while tenant-wide users with permission may access branch records. Tenant-wide customer/motorcycle profiles may be visible when permitted, but inaccessible branch histories must be hidden or blocked. Unauthorized file downloads must not generate signed URLs.

### 7.2 Subscription, Plan, and Tenant Lifecycle — P0

Validate plan limits, branch limits, notification/reminder channel gates, plan overrides, lifecycle states, renewal, pending setup, tenant deletion, and owner signup defaults:

- Basic/Mid/High branch limits are enforced.
- Disabled plan channels are blocked without silent fallback.
- `grace_period` allows normal access with warnings.
- `read_only` blocks operational writes but allows documented read/export/renew/password/logout paths.
- `suspended` allows owner renewal/export only; non-owners are blocked.
- `pending_deletion` queues deletion and applies export/emergency-extension rules.
- Day 68+ deletion removes eligible data/files and marks tenant `deleted`.
- Renewal before deletion restores `active` only after platform admin confirmation.
- Pending setup blocks operational modules.
- Owner signup is blocked if default plan/duration is missing.

### 7.3 Authentication, Users, Roles, Permissions — P0/P1

Validate email verification gates, login lockout, password reset limits, password policy, deactivated-user session revocation, last-owner protections, additive multi-role permissions, custom role deactivation rules, protected Shop Owner capabilities, permission-change impact warnings/audit logs, employee invitation expiry/revocation/reuse/tenant scope, and employee reactivation blockers.

### 7.4 Onboarding, Shop Settings, Branches — P0/P1

Validate onboarding blockers, required shop profile fields, invoice prefix format/immutability, tax settings copied to issued invoices, last-active-branch protection, branch deactivation blockers, deactivated-branch selection blockers, reactivation plan-limit checks, and branch-scoped employee access after branch deactivation.

### 7.5 Customers and Motorcycles — P0/P1

Validate required customer contact/name, duplicate warnings without automatic merge, cross-tenant merge blocking, soft-delete blockers, restoration duplicate checks, motorcycle creation blockers for inactive customer states, mileage decrease permission/reason checks, motorcycle soft-delete blockers, and restoration blockers when linked customer is inactive.

### 7.6 Services, Estimates, Job Orders, Mechanic Sessions — P0

Validate variable-price service disclaimer, service deactivation blockers, estimate presentation/expiration/no-stock-effect rules, estimate approval required fields, job order number uniqueness, supported status transitions, primary mechanic requirement, part reservation stock checks, reservation stock effects, job completion inventory/FIFO/COGS effects, release-with-balance permission, released-record immutability, cancellation reversal rules, one unfinished mechanic session per tenant, and paused-session duration calculation.

### 7.7 Inventory, FIFO, Adjustments, Transfers — P0

Validate ledger creation for all stock changes, non-negative available stock, on-hand >= reserved, concurrent FIFO allocation safety, product/category deactivation blockers, low-stock alert generation/resolution, adjustment approval thresholds, posting transactionality, posted-adjustment immutability, force-adjustment blockers, transfer branch validation, transfer reservation/send/receive variance behavior, lost/damaged cancellation, FIFO consumption, variance ledger, and audit reasons.

### 7.8 Suppliers, Purchases, Supplier Returns, AP — P0

Validate supplier deactivation/reactivation rules, purchase number uniqueness, credit receiving stock/FIFO/AP effects, cash purchase receiving without AP, cancellation blockers after receiving, supplier return stock/FIFO/ledger/AP-or-credit effects, returnable-quantity blockers, reserved/consumed/transferred/already-returned stock blockers, and supplier payment balance/payment-method behavior.

### 7.9 Invoices, Payments, Receipts, Refunds, Tax, AR — P0

Validate invoice issuance requires job order linkage, billing allocation prevents overbilling under concurrency, issued invoices cannot be directly edited, overpayment blocking, payment creates exactly one immutable receipt, payment idempotency replay/conflict behavior, refund amount blockers, refund with/without inventory reversal behavior, paid-invoice refund status recalculation, VAT inclusive/exclusive and no-tax behavior, tax-setting snapshotting, and overdue status computation.

### 7.10 Expenses, Reminders, Notifications, Files, Reports, Dashboard — P0/P1

Validate expense required fields/enums/edit/void audit behavior, time/mileage/birthday reminders by tenant timezone, permanent delivery failure handling, notification recipient scoping, upload type/size limits, signed file URLs after access checks, soft-delete/restore/retention behavior, revenue/payment/gross-profit report formulas, async export threshold for long reports, and branch-scoped dashboard metrics.

### 7.11 Offline PWA — P0/P1

Validate offline app shell loading, clear offline indicator, user-scoped valid cached recent records, blocked offline create/edit/delete/upload/approve/pay/refund/adjust/transfer/settings actions, cache clearing on logout, and 7-day cache expiry.

### 7.12 Audit, Export, Retention, Jobs, Observability — P0

Validate audit records for critical/corrective/destructive actions, audit immutability, full tenant export package contents, lifecycle-restricted exports, tenant deletion retention rules, deleted-tenant resubscription as a new tenant, retry-safe job attempt/error/status/correlation tracking, unsafe permanent failure behavior, structured API logs, and provider delivery failure visibility.

### 7.13 Security, Performance, Scale, Backup, DR — P0/P1

Validate HTTPS enforcement, sensitive data exclusion from logs, support access reason/session requirements, explicit write-enabled support access permissions, initial PWA load < 3s on modern mobile/4G, API latency targets P50 < 200ms / P95 < 500ms / P99 < 1000ms excluding documented exceptions, report summary < 5s for default 90-day range, high-volume indexed query usability, daily encrypted backups retained >= 30 days, quarterly restore evidence, RPO 24h, and RTO 4h.

---

## 8. API Contract Acceptance

Every protected endpoint requires automated tests for:

1. Auth requirement.
2. Email verification guard.
3. Tenant status/subscription guard.
4. Platform/support access guard.
5. Permission guard.
6. Branch guard.
7. Request validation.
8. Success envelope.
9. Error envelope.
10. Stable status/error code.
11. Idempotency where required.
12. Optimistic locking for mutable updates.
13. Audit creation where required.
14. Rollback on partial failure.
15. Critical concurrency behavior.

---

## 9. Critical Concurrency Set

| ID         | Scenario                                                                           | Required Proof                                            |
| ---------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| QA-CON-001 | Concurrent job order, estimate, invoice, receipt, purchase, and transfer creation. | No duplicate tenant-scoped document numbers.              |
| QA-CON-002 | Concurrent FIFO reservations.                                                      | No over-allocation; stock/FIFO invariants hold.           |
| QA-CON-003 | Concurrent completion/consumption of same job order/reservation.                   | No double consumption.                                    |
| QA-CON-004 | Concurrent invoice issuance for same job order lines.                              | No overbilling.                                           |
| QA-CON-005 | Concurrent payments on one invoice.                                                | No overpayment; each success has exactly one receipt.     |
| QA-CON-006 | Concurrent refunds on one payment.                                                 | No over-refund; invoice status recalculates.              |
| QA-CON-007 | Concurrent purchase receiving.                                                     | No over-receiving.                                        |
| QA-CON-008 | Concurrent tenant deletion execution.                                              | Idempotent deletion; irreversible effects not duplicated. |
| QA-CON-009 | Stale `lock_version` update.                                                       | `409 version_conflict`.                                   |
| QA-CON-010 | Idempotency key reused for different intent.                                       | `409 idempotency_conflict`.                               |

---

## 10. Release Evidence

Retain: test execution report, requirement-test traceability, API contract results, migration/schema validation, concurrency logs and invariant checks, mobile E2E evidence, security results, performance results, job retry/failure/alert evidence, export package samples and manifest checks, backup/restore/DR evidence, defect report, approved waivers, and final sign-off.

---

## 11. Risks and Mitigations

| Risk                          | Impact                                                 | Mitigation                                                                      |
| ----------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| FIFO/inventory complexity     | Stock, COGS, valuation errors.                         | Deterministic FIFO fixtures, concurrency tests, reconciliation, rollback tests. |
| Billing/refund edge cases     | Overbilling, overpayment, wrong AR.                    | P0 financial integrity and concurrency tests.                                   |
| Tenant isolation defects      | Data leakage.                                          | Test UI/API/service/repository/DB/file/report/export isolation.                 |
| Offline cache risk            | Stale or unauthorized data.                            | Read-only, user-scoped, 7-day expiry, clear on logout, refresh after reconnect. |
| Job retries duplicate effects | Duplicate exports/reminders/receipts/deletion effects. | Idempotent jobs, locks, attempt tracking, safe retry classification.            |
| Large reports/exports         | Timeouts and poor UX.                                  | Async threshold and performance tests.                                          |
| Support access misuse         | Privacy/compliance risk.                               | Reason, explicit mode, visible marker, permissions, audit logs.                 |

---

## 12. Final QA Recommendation

Use this plan as the acceptance baseline. Automate highest-risk P0 suites first: tenant isolation, branch access, subscription gates, idempotency, FIFO correctness, billing allocation, payments/receipts, refunds, audit logs, exports, tenant deletion, and offline read-only restrictions. Do not approve release until all P0 tests pass and source-of-truth acceptance criteria have objective evidence.
