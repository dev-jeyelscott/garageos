# GarageOS Requirements Traceability Matrix

**Document:** `requirements-traceability-matrix.md`  
**Version:** 1.0 token-reduced  
**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Generated:** 2026-06-24  
**Status:** Draft build-ready traceability artifact  
**Scope Mode:** Single build scope; no product phases

---

## 1. Purpose

Maps approved GarageOS requirements to architecture, database/schema, API, permissions/access, and validation artifacts. This file is a compact working reference. It does **not** add modules, workflows, roles, integrations, product phases, or undocumented behavior.

---

## 2. Source Order

1. `requirements.md`
2. `database-design.md`
3. `database-schema.md`
4. `architecture.md`
5. `api-contracts.md`
6. Downstream docs: RTM, user stories, permission matrix, UX map, QA plan, tech stack, ADRs, roadmap

Rules:

- PRD wins on product scope and business behavior.
- Architecture/schema/API traces must not override PRD rules.
- Explicit exclusions remain out of scope.
- Technical choices are ADR/implementation decisions, not product gaps.
- Every requirement needs at least one validation path.
- If behavior is defined but artifact is missing, mark **Covered — downstream artifact pending**.

---

## 3. Status Legend

| Status                                    | Meaning                                                             |
| ----------------------------------------- | ------------------------------------------------------------------- |
| Covered                                   | Requirement has PRD + downstream trace.                             |
| Covered — implementation decision pending | Product behavior is clear; technical decision remains.              |
| Covered — downstream artifact pending     | Requirement is clear; generated artifact/runbook/spec still needed. |
| Scope guard                               | Prevents accidental scope expansion.                                |

---

## 4. Scope / Ambiguity Resolutions

| ID     | Decision                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| AR-001 | No MVP/product phases. All documented requirements are build scope.                                                 |
| AR-002 | Offline mode is app shell + read-only cache only. No offline writes/sync conflict handling.                         |
| AR-003 | Subscription payment collection is external; platform admins update access manually.                                |
| AR-004 | Native apps, customer portal, loyalty, POS checkout, payroll, full accounting, and similar excluded scope stay out. |
| AR-005 | OpenAPI YAML is downstream; API behavior traces to `api-contracts.md`.                                              |
| AR-006 | Framework/ORM/RLS timing/queue/storage vendors are ADR decisions, not product ambiguity.                            |
| AR-007 | Pixel-level wireframes are downstream UX artifacts; do not add scope through UX.                                    |

---

## 5. Master RTM

### 5.1 Product Scope, Tenancy, Subscription, Access

| ID      | Area                          | Source             | Downstream Trace                                                                                  | Validation                      | Status      |
| ------- | ----------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------- | ----------- |
| RTM-001 | Scope/exclusions              | PRD 1.3–1.4        | Architecture scope guard; no excluded schema/API modules                                          | Backlog + API scope review      | Scope guard |
| RTM-002 | Multi-tenant SaaS             | PRD 3.1–3.2        | Tenant guard, branch guard, tenant/branch FK/indexes                                              | PRD 37.1–37.2; schema/API tests | Covered     |
| RTM-003 | Platform admin                | PRD 4.1            | Platform module; `tenants`, `subscription_*`, support sessions; `/platform/*`; platform perms     | Permission + audit tests        | Covered     |
| RTM-004 | Tenant creation               | PRD 4.2            | Tenant lifecycle/onboarding; duplicate index; `POST /auth/signup-owner`, `POST /platform/tenants` | Duplicate + onboarding tests    | Covered     |
| RTM-005 | Tenant lifecycle              | PRD 4.3–4.8        | Lifecycle worker; `tenants.status`, lifecycle events, deletion jobs; subscription guard           | Lifecycle + access-gate tests   | Covered     |
| RTM-006 | Subscription override/renewal | PRD 4.9, 4.12, 5.5 | Subscription module; overrides; renewal request; platform subscription update                     | Audit + recalculation tests     | Covered     |
| RTM-007 | Plans/limits                  | PRD 5.1–5.4        | Plan service; plan/limit/override tables; branch + channel gates                                  | Branch limit + channel tests    | Covered     |
| RTM-008 | Pending setup access          | PRD 4.11           | Setup gate; shop profile/onboarding APIs; Shop Owner setup access                                 | Onboarding gate tests           | Covered     |

### 5.2 Auth, Users, Roles, Permissions, Branch Access

| ID      | Area                           | Source             | Downstream Trace                                                                    | Validation                           | Status                                |
| ------- | ------------------------------ | ------------------ | ----------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------- |
| RTM-009 | Auth features                  | PRD 6.1            | Auth module; users/tokens/sessions/login attempts; `/auth/*`                        | Auth contract + rate-limit tests     | Covered                               |
| RTM-010 | Password/token security        | PRD 6.4–6.8        | Token hash tables; reset/verify endpoints; security middleware                      | Security + sensitive-log tests       | Covered                               |
| RTM-011 | First platform admin bootstrap | PRD 6.2.1          | Deployment bootstrap runbook; platform admin user                                   | Bootstrap/audit validation           | Covered — downstream artifact pending |
| RTM-012 | Employee invites/direct create | PRD 6.2.2          | Invitations/users/employees; `/employees/invitations`, `/employees`; `users.create` | Expiry/revoke/accept tests           | Covered                               |
| RTM-013 | Deactivation/email change      | PRD 6.9–6.10       | Session revocation; user status; audit; user/profile update APIs                    | Revocation + history tests           | Covered                               |
| RTM-014 | Roles/custom roles             | PRD 7.1–7.13       | RBAC resolver; role/permission/user-role tables; `/roles/*`                         | Permission matrix + role audit tests | Covered                               |
| RTM-015 | Shop Owner protections         | PRD 7.2            | RBAC policy; seeded owner role; last-owner guard                                    | Last-owner demote/deactivate tests   | Covered                               |
| RTM-016 | Branch access                  | PRD 7.10–7.11, 9.4 | Tenant/permission/branch guards; branch assignments; branch-scoped APIs             | API branch access tests              | Covered                               |

### 5.3 Shop, Branch, Employee, Customer, Motorcycle, Services

| ID      | Area                       | Source             | Downstream Trace                                                               | Validation                             | Status  |
| ------- | -------------------------- | ------------------ | ------------------------------------------------------------------------------ | -------------------------------------- | ------- |
| RTM-017 | Shop onboarding/profile    | PRD 8.1            | Onboarding module; profiles, branches, settings; onboarding APIs               | Completeness tests                     | Covered |
| RTM-018 | Shop settings/immutability | PRD 8.3, 36.2–36.4 | Settings/time service; country/currency/timezone/profile fields                | Immutability tests                     | Covered |
| RTM-019 | Invoice/receipt prefixes   | PRD 8.4–8.5        | Numbering service; profile prefix; document sequences                          | Format + immutability tests            | Covered |
| RTM-020 | Branch management          | PRD 9              | Branch module; branch status events + linked operational blockers; branch APIs | Deactivate/reactivate tests            | Covered |
| RTM-021 | Employee management        | PRD 10             | Users/employees module; employee profiles, roles, branches                     | Employee lifecycle tests               | Covered |
| RTM-022 | Customers                  | PRD 11             | Customer module/search; customers/tags/merge events; `/customers/*`            | Merge/delete/restore tests             | Covered |
| RTM-023 | Motorcycles                | PRD 12             | Motorcycle module; mileage events; `/motorcycles/*`                            | Odometer/restore/active-customer tests | Covered |
| RTM-024 | Service catalog            | PRD 13             | Services module; service lines/snapshots; `/services/*`                        | Reference/deactivation tests           | Covered |

### 5.4 Service Operations

| ID      | Area                   | Source         | Downstream Trace                                                                   | Validation                                 | Status  |
| ------- | ---------------------- | -------------- | ---------------------------------------------------------------------------------- | ------------------------------------------ | ------- |
| RTM-025 | Estimates              | PRD 15         | Estimate state machine; estimate tables/status events; `/estimates/*`              | Transition + no-stock-effect tests         | Covered |
| RTM-026 | Job order lifecycle    | PRD 14         | Job-order state machine; jobs/lines/status/events/mechanics; action APIs           | PRD 37.4 + transition tests                | Covered |
| RTM-027 | Job order numbering    | PRD 14.3       | Numbering service; sequence/unique constraints; create endpoint                    | Concurrent numbering tests                 | Covered |
| RTM-028 | Parts reservation      | PRD 14.9, 17.8 | Reservation service; reservations, FIFO allocations, stock, ledger; part-line APIs | No over-reservation/FIFO tests             | Covered |
| RTM-029 | Completion/consumption | PRD 14.10      | Critical transaction; stock, FIFO consumption, ledgers, layers; complete action    | Atomic completion/COGS/FIFO tests          | Covered |
| RTM-030 | Release/immutability   | PRD 14.8       | Release command; job status/invoice links; release permissions                     | Release rule tests                         | Covered |
| RTM-031 | Job line editing       | PRD 14.11.1    | Line policy; reservations/billing allocations; line APIs                           | Reservation release + billing safety tests | Covered |
| RTM-032 | Mechanic sessions      | PRD 16         | Session module; sessions/pauses; `/mechanic-sessions/*`                            | One-unfinished-session + duration tests    | Covered |

### 5.5 Inventory, FIFO, Transfers, Suppliers, Purchases, AP

| ID      | Area                | Source                     | Downstream Trace                                                                        | Validation                        | Status  |
| ------- | ------------------- | -------------------------- | --------------------------------------------------------------------------------------- | --------------------------------- | ------- |
| RTM-033 | Products/categories | PRD 17.1–17.4              | Inventory module; product/category tables + seed; product APIs                          | SKU/barcode + deactivation tests  | Covered |
| RTM-034 | Stock/ledger        | PRD 17.5–17.7              | Ledger-first architecture; stock balances + immutable ledger; inventory APIs            | Non-negative stock + ledger tests | Covered |
| RTM-035 | Low stock alerts    | PRD 17.9                   | Alert worker/evaluator; low-stock read model; alerts API                                | Alert uniqueness/resolution tests | Covered |
| RTM-036 | Adjustments         | PRD 17.10–17.12            | Adjustment state machine; lines/status/ledger; force endpoint                           | Approval/post/FIFO/audit tests    | Covered |
| RTM-037 | FIFO costing        | PRD 18                     | FIFO service; layers/reservations/consumptions; report endpoints                        | Oldest-first + valuation tests    | Covered |
| RTM-038 | Transfers           | PRD 19                     | Transfer state machine; transfers/lines/status/reservations/ledger/FIFO; transfer APIs  | Variance/FIFO/cancel tests        | Covered |
| RTM-039 | Suppliers           | PRD 20                     | Supplier module/table; `/suppliers/*`; supplier perms                                   | Deactivate/reactivate tests       | Covered |
| RTM-040 | Purchases/AP        | PRD 21.1–21.8, 21.10–21.11 | Purchases/AP module; POs, receiving, payables, payments; purchase/supplier payment APIs | Receiving/AP/cash no-AP tests     | Covered |
| RTM-041 | Supplier returns    | PRD 21.9–21.9.1            | Return command; returns, credits/payables, ledger; return APIs                          | Valuation/AP/credit tests         | Covered |

### 5.6 Sales, Invoicing, Payments, Refunds, Tax, Expenses

| ID      | Area                        | Source                     | Downstream Trace                                                               | Validation                                            | Status  |
| ------- | --------------------------- | -------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------- | ------- |
| RTM-042 | Invoice relationships       | PRD 22.1–22.3              | Invoicing/allocation service; invoice tables/links/allocations; invoice APIs   | Overbilling + branch/customer tests                   | Covered |
| RTM-043 | Billing allocations         | PRD 22.3.1                 | Allocation locks; billing allocations; invoice create/update/issue/cancel/void | Concurrent overbilling tests                          | Covered |
| RTM-044 | Invoice lifecycle/numbering | PRD 22.4–22.10             | Invoice state machine; status events/sequence; action APIs                     | Lifecycle/blocker/numbering tests                     | Covered |
| RTM-045 | Discounts/tax               | PRD 22.11–22.13, 24        | Money/tax service; invoice tax fields; invoice APIs                            | Tax formula + immutable issued tax tests              | Covered |
| RTM-046 | Payments/receipts           | PRD 23.1–23.6              | Payment/receipt transaction; payment/receipt tables; payment/receipt APIs      | One receipt/payment + overpayment + idempotency tests | Covered |
| RTM-047 | Refunds/AR                  | PRD 23.7–23.9              | Refund state machine + AR model; refund/payment/invoice sources; AR APIs       | Over-refund/status/AR tests                           | Covered |
| RTM-048 | Refund inventory reversal   | PRD 23.8                   | Refund + inventory reversal command; ledger/FIFO layers/refund records         | Quantity + FIFO recreation tests                      | Covered |
| RTM-049 | Expenses                    | PRD 25                     | Expenses module; expense/categories/audit/status; `/expenses/*`                | Edit/void/category tests                              | Covered |
| RTM-050 | AP/supplier balances        | PRD 21.6–21.7, 29.7, 29.10 | AP reporting; payables/payments/credits; AP APIs                               | AP calculation tests                                  | Covered |

### 5.7 Reminders, Notifications, Files, Reports, Audit, Export, Offline

| ID      | Area                   | Source             | Downstream Trace                                                            | Validation                             | Status  |
| ------- | ---------------------- | ------------------ | --------------------------------------------------------------------------- | -------------------------------------- | ------- |
| RTM-051 | Customer reminders     | PRD 26             | Reminder worker/adapters; reminders/delivery/outbox; reminder APIs          | Channel gate + retry tests             | Covered |
| RTM-052 | Internal notifications | PRD 27             | Notification module/outbox; notification tables/status; notification APIs   | Preference/status tests                | Covered |
| RTM-053 | Files                  | PRD 28             | Files module; private storage/signed URLs; file table/lifecycle; file APIs  | Type/size/access/quarantine tests      | Covered |
| RTM-054 | Dashboard/reports      | PRD 29             | Dashboard/report read models; report/dashboard/export APIs; report perms    | Access/filter/export tests             | Covered |
| RTM-055 | Financial calculations | PRD 29.10          | Financial reporting service; invoice/payment/refund/FIFO/AP/expense sources | Calculation fixture tests              | Covered |
| RTM-056 | Audit logs             | PRD 30             | Audit module; immutable tenant/platform audit tables; audit APIs            | Immutability + retention tests         | Covered |
| RTM-057 | Tenant export          | PRD 31             | Export worker/storage packaging; export jobs/files/manifests; export APIs   | Package + permission tests             | Covered |
| RTM-058 | Retention/deletion     | PRD 4.8, 31.3–31.4 | Lifecycle/deletion worker; deletion jobs/status/retained audit              | Deletion idempotency + retention tests | Covered |
| RTM-059 | Offline support        | PRD 32             | PWA service worker/read-only cache; offline APIs if implemented             | Offline restriction tests              | Covered |

### 5.8 Security, NFRs, Integrations, Operations, Readiness

| ID      | Area                           | Source         | Downstream Trace                                                                                     | Validation                              | Status                                |
| ------- | ------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------- |
| RTM-060 | Security controls              | PRD 33         | Security middleware; token hashes, tenant/branch FKs, audit; guards/errors                           | PRD 37.13 + security tests              | Covered                               |
| RTM-061 | Rate limits                    | PRD 33.6       | Rate-limit middleware; login attempts/logs; auth/file/reminder/export endpoints                      | Rate-limit tests                        | Covered                               |
| RTM-062 | Transactions/idempotency       | PRD 33.9       | Critical transaction architecture; idempotency records, locks, constraints, ledgers; Idempotency-Key | API 15.6 + contract/concurrency tests   | Covered                               |
| RTM-063 | Performance/availability/scale | PRD 34.1–34.4  | Containers, indexes, pagination, read models, async exports, partition-ready ledgers                 | Load/performance tests                  | Covered                               |
| RTM-064 | Mobile experience              | PRD 34.5       | PWA frontend; cache/shell; `/api/v1`; permission-aware UX                                            | Mobile E2E workflow tests               | Covered — downstream artifact pending |
| RTM-065 | Observability                  | PRD 34.6       | Structured logs/metrics/alerts; job/delivery status; correlation IDs                                 | Telemetry + alert validation            | Covered                               |
| RTM-066 | Background jobs/outbox         | PRD 34.7       | Worker services; jobs/outbox/events/attempts; async job APIs                                         | Retry/idempotency/failure tests         | Covered                               |
| RTM-067 | Integrations                   | PRD 35         | Provider adapters; delivery status; no subscription payment gateway                                  | Provider failure + sensitive-data tests | Covered                               |
| RTM-068 | Backup/DR                      | PRD 33.7–33.8  | DevOps runbooks; managed DB/storage backups                                                          | Restore evidence                        | Covered — downstream artifact pending |
| RTM-069 | API foundation                 | API 3–7        | API middleware/order; schema enums/IDs; `/api/v1`; auth/tenant/permission/branch guards              | Contract tests                          | Covered                               |
| RTM-070 | Schema/seed data               | Schema 1–4, 23 | Database source; migrations/enums/indexes/seeds; DTO enum alignment                                  | Migration/schema QA                     | Covered                               |
| RTM-071 | Build readiness artifacts      | PRD 40         | Documentation-first process; derived artifacts from schema/API/permissions                           | Artifact completion checklist           | Covered — downstream artifact pending |

---

## 6. Cross-Cutting Enforcement

| Concern                | Applies To                                                                 | Enforcement                                                                                |
| ---------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Tenant isolation       | All tenant-owned modules                                                   | Session tenant context, service policies, repository scoping, FK/index constraints, tests. |
| Branch access          | Jobs, invoices, purchases, inventory, transfers, expenses, reports/history | Branch assignments, tenant-wide access, branch guard, scoped queries.                      |
| Subscription gate      | All operational modules                                                    | Central guard before business validation; `subscription_access_blocked` errors.            |
| Permissions            | All protected actions                                                      | Additive RBAC, no explicit deny, endpoint permission tests.                                |
| Auditability           | Critical actions + support access                                          | Immutable sanitized audit records.                                                         |
| Idempotency            | Critical writes                                                            | Tenant/user/endpoint/intent-scoped keys and safe replay.                                   |
| Financial immutability | Invoices, payments, receipts, refunds, ledgers                             | Append-only/correction-only plus void/refund/cancel workflows.                             |
| Ledger-first inventory | Inventory, jobs, purchases, transfers, returns, refunds                    | Immutable ledger entries + transactional stock balance updates.                            |
| FIFO correctness       | Consumption/valuation                                                      | FIFO layers, reservations, consumptions, locks, concurrency tests.                         |
| Offline read-only      | PWA/cache                                                                  | Frontend disables writes; backend remains authoritative.                                   |
| Privacy/sensitive data | Auth, support, files, analytics, monitoring                                | Hash tokens, private storage, signed URLs, sanitized logs/errors/audit.                    |
| Observability          | API, jobs, providers, inventory, auth                                      | Logs, metrics, alerts, correlation IDs.                                                    |

---

## 7. Downstream Artifact Backlog

These are source-derived build artifacts, not new product scope.

| Artifact                           | Purpose                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| User stories                       | Convert PRD/RTM rows into backlog items.                                     |
| Permission matrix                  | Expand PRD permission catalog into endpoint/role access.                     |
| Role template configuration matrix | Define approved seeded role grants, especially Shop Owner protections.       |
| ERD                                | Visualize schema relationships.                                              |
| Status transition diagrams         | Visualize workflow state machines.                                           |
| Background job design              | Define schedule, retry, idempotency, dead-letter handling.                   |
| Subscription lifecycle job design  | Detail tenant status transitions and deletion warnings.                      |
| Transaction/idempotency design     | Define lock order, idempotency storage, replay behavior.                     |
| Notification delivery design       | Define email/SMS/push/in-app attempts and retries.                           |
| Export/package design              | Define ZIP layout, manifests, file inclusion/exclusion.                      |
| Financial calculation spec         | Turn PRD 29.10 into exact formulas and fixtures.                             |
| Security test plan                 | Convert security requirements into executable tests.                         |
| QA acceptance cases                | Convert PRD acceptance/schema/API rules into test cases.                     |
| Deployment/operations plan         | Define environments, backup/restore, monitoring, rollout, incident response. |
| ADR set                            | Resolve implementation decisions without scope changes.                      |
| UX flow/wireframes                 | Derive screens/interactions from documented workflows.                       |

---

## 8. Final Assessment

The traceability chain remains:

```text
PRD / business rules
  -> architecture constraints
  -> schema invariants
  -> API contracts and workflow endpoints
  -> tenant/branch/subscription/permission guards
  -> QA, contract, security, and operational validation
```

No product-scope ambiguity requiring a new feature decision was found. Remaining open items are ADRs or downstream artifacts, not functional gaps.
