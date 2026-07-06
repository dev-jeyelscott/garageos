# GarageOS Progress Tracker

**Last Notion alignment:** 2026-07-06  
**Source of truth:** Notion database `GarageOS — Full Build Task Tracker`  
**Repository path:** `docs/progress-tracker.md`

This tracker is a repository snapshot of the current Notion cards. Notion remains the operational source for live card status; this file should be refreshed whenever Notion card statuses change materially.

## Status Summary

| Status                  |   Cards |
| ----------------------- | ------: |
| Done                    |     206 |
| In Progress             |       1 |
| Ready                   |       1 |
| Backlog                 |     100 |
| **Total tracked cards** | **308** |

## Milestone Status Summary

| Milestone    | Status Summary                        | Notes                                                         |
| ------------ | ------------------------------------- | ------------------------------------------------------------- |
| M0           | 41 Done, 1 In Progress, 1 In Progress | ENG-LOOP-22 done; ENG-LOOP-23 in progress; ENG-LOOP-24 queued |
| M1           | 18 Done                               | Complete                                                      |
| M2           | 22 Done                               | Complete                                                      |
| M3           | 19 Done                               | Complete                                                      |
| M4           | 15 Done                               | Complete                                                      |
| M5           | 16 Done                               | Complete                                                      |
| M6           | 16 Done                               | Complete                                                      |
| M7           | 16 Done                               | Complete                                                      |
| M8           | 14 Done                               | Complete                                                      |
| M9           | 28 Done                               | Complete                                                      |
| M10          | 15 Backlog, 1 Ready                   | M10.01 ready                                                  |
| M11          | 18 Backlog                            | Not started                                                   |
| M12          | 16 Backlog                            | Not started                                                   |
| M13          | 20 Backlog                            | Security and observability hardening backlog                  |
| M14          | 40 Backlog                            | Not started                                                   |
| No milestone | 1 Done                                | Review record                                                 |

## Current Focus

- [x] **Done** — ENG-LOOP-17 — Add engineering loop runner dry-run mode
- [x] **Done** — ENG-LOOP-18 — Add task claiming and run ledger
- [x] **Done** — ENG-LOOP-19 — Add local validation executor
- [x] **Done** — ENG-LOOP-20 — Add PR body and branch automation
- [x] **Done** — ENG-LOOP-21 — Add GitHub CI status watcher
- [x] **Done** — ENG-LOOP-22 — Add follow-up task creation
- [ ] **In Progress** — ENG-LOOP-23 — Add manual GitHub workflow entrypoint
- [ ] **Backlog** — ENG-LOOP-24 — Add first-5 batch mode
- [ ] **Ready** — M10.01 — Implement expense categories

---

## M0 — Project Foundation and Engineering Decisions

- [x] **Done** — M0.01 — Initialize repository and workspace
- [x] **Done** — M0.02 — Choose final monorepo structure
- [x] **Done** — M0.03 — Create app packages web, api, worker, scheduler
- [x] **Done** — M0.04 — Create shared packages shared, api-client, config, test-utils
- [x] **Done** — M0.05 — Create docs directories for ADRs, runbooks, API, and testing
- [x] **Done** — M0.06 — Configure TypeScript, linting, formatting, commit hooks, and test runner
- [x] **Done** — M0.07 — Configure local Docker Compose for PostgreSQL and local service execution
- [x] **Done** — M0.08 — Add env example with no real secrets
- [x] **Done** — M0.09 — Create CI pipeline for lint, typecheck, unit tests, dependency scan, and migration placeholder
- [x] **Done** — M0.10 — Record foundational ADRs
- [x] **Done** — M0.11 — Create Definition of Done
- [x] **Done** — M0.12 — Create feature-ticket traceability template
- [x] **Done** — M0.13 — Create initial UX wireframe backlog from UX screen map
- [x] **Done** — M0.14 — Create baseline QA automation structure
- [x] **Done** — M0 — Project Foundation and Engineering Decisions
- [x] **Done** — CI — Add OpenAI AI reviewer to pull request pipeline
- [x] **Done** — ENG-LOOP-01 — Add PR template and branch protection checklist
- [x] **Done** — ENG-LOOP-02 — Add validation profiles and risk-class matrix
- [x] **Done** — ENG-LOOP-03 — Add dedicated security validation profile
- [x] **Done** — ENG-LOOP-04 — Add E2E validation profile
- [x] **Done** — ENG-LOOP-05 — Wire validation profiles into GitHub Actions
- [x] **Done** — ENG-LOOP-06 — Enforce branch protection for main and develop
- [x] **Done** — ENG-LOOP-07 — Add PR validation evidence guard
- [x] **Done** — ENG-LOOP-08 — Expand E2E coverage beyond landing page smoke
- [x] **Done** — ENG-LOOP-09 — Add dependency and security automation
- [x] **Done** — ENG-LOOP-10 — Add CI status check naming and required-check matrix
- [x] **Done** — ENG-LOOP-11 — Add engineering loop runbook
- [x] **Done** — ENG-LOOP-12 — Add release and milestone readiness checklist
- [x] **Done** — ENG-LOOP-13 — Plan OWASP ZAP baseline scanning
- [x] **Done** — ENG-LOOP-14 — Add observability validation profile
- [x] **Done** — ENG-LOOP-15 — Define automatic engineering-loop contract
- [x] **Done** — ENG-LOOP-16 — Add machine-readable Notion task schema
- [x] **Done** — ENG-LOOP-17 — Add engineering loop runner dry-run mode
- [x] **Done** — ENG-LOOP-18 — Add task claiming and run ledger
- [x] **Done** — ENG-LOOP-19 — Add local validation executor
- [x] **Done** — ENG-LOOP-20 — Add PR body and branch automation
- [x] **Done** — ENG-LOOP-21 — Add GitHub CI status watcher
- [x] **Done** — ENG-LOOP-22 — Add follow-up task creation
- [ ] **In Progress** — ENG-LOOP-23 — Add manual GitHub workflow entrypoint
- [ ] **Backlog** — ENG-LOOP-24 — Add first-5 batch mode

## M1 — Database Foundation and Core Migrations

- [x] **Done** — M1.01 — Finalize migration tool choice
- [x] **Done** — M1.02 — Add PostgreSQL extensions
- [x] **Done** — M1.03 — Define enum/check strategy
- [x] **Done** — M1.04 — Create platform, tenant, and subscription schema
- [x] **Done** — M1.05 — Create user, auth, session, and token schema
- [x] **Done** — M1.06 — Create RBAC and branch assignment schema
- [x] **Done** — M1.07 — Create shop profile, branches, and tenant settings tables
- [x] **Done** — M1.08 — Create customer and motorcycle tables
- [x] **Done** — M1.09 — Create service, estimate, job order, mechanic session, and status history tables
- [x] **Done** — M1.10 — Create product, inventory ledger, FIFO, reservation, and allocation tables
- [x] **Done** — M1.11 — Create adjustment, transfer, supplier, purchase, return, AP, payment, and credit tables
- [x] **Done** — M1.12 — Create invoice, billing allocation, payment, receipt, refund, and AR tables
- [x] **Done** — M1.13 — Create expenses, reminders, notifications, outbox, files, exports, audit, idempotency, jobs, and report scaffolds
- [x] **Done** — M1.14 — Add constraints, indexes, document-number uniqueness, and foreign keys
- [x] **Done** — M1.15 — Add seed data for plans, limits, permissions, and Shop Owner protections
- [x] **Done** — M1.16 — Add database fixture factory and migration tests
- [x] **Done** — M1.17 — Add schema drift checklist
- [x] **Done** — M1 — Database Foundation and Core Migrations

## M2 — API Foundation, Auth, Tenant Context, RBAC

- [x] **Done** — M2.01 — Create REST API skeleton under api/v1
- [x] **Done** — M2.02 — Implement response and error envelopes
- [x] **Done** — M2.03 — Add request ID and correlation ID middleware
- [x] **Done** — M2.04 — Implement auth routes
- [x] **Done** — M2.05 — Implement password hashing and token hashing
- [x] **Done** — M2.06 — Implement access token expiration and refresh token rotation
- [x] **Done** — M2.07 — Implement remember-me session rules
- [x] **Done** — M2.08 — Implement login and password-reset rate limits
- [x] **Done** — M2.09 — Implement tenant context resolution from authenticated session
- [x] **Done** — M2.10 — Implement tenant status/subscription guard
- [x] **Done** — M2.11 — Implement platform admin and support access context
- [x] **Done** — M2.12 — Implement permission guard
- [x] **Done** — M2.13 — Implement branch access guard
- [x] **Done** — M2.14 — Implement validation pipeline
- [x] **Done** — M2.15 — Implement idempotency service for critical writes
- [x] **Done** — M2.16 — Implement optimistic locking convention
- [x] **Done** — M2.17 — Implement shared transaction wrapper
- [x] **Done** — M2.18 — Implement shared audit service
- [x] **Done** — M2.19 — Implement auth/session UI screens
- [x] **Done** — M2.20 — Add contract, integration, and security tests
- [x] **Done** — M2 — API Foundation, Auth, Tenant Context, RBAC

## M3 — Tenant Lifecycle, Onboarding, Platform Admin

- [x] **Done** — M3.01 — Implement platform-created tenant flow
- [x] **Done** — M3.02 — Implement owner signup tenant flow
- [x] **Done** — M3.03 — Validate configured default plan and default subscription duration
- [x] **Done** — M3.04 — Implement onboarding state machine
- [x] **Done** — M3.05 — Implement shop profile setup
- [x] **Done** — M3.06 — Implement first branch setup
- [x] **Done** — M3.07 — Implement tax/localization setup
- [x] **Done** — M3.08 — Implement invoice prefix setup
- [x] **Done** — M3.09 — Implement onboarding completion gate
- [x] **Done** — M3.10 — Implement subscription status calculation
- [x] **Done** — M3.11 — Implement grace/read-only/suspended/pending-deletion/deleted gates
- [x] **Done** — M3.12 — Implement plan limit and tenant override service
- [x] **Done** — M3.13 — Implement platform tenant management screens
- [x] **Done** — M3.14 — Implement subscription override UI/API
- [x] **Done** — M3.15 — Implement support access session flow
- [x] **Done** — M3.16 — Implement tenant lifecycle worker
- [x] **Done** — M3.17 — Implement tenant export/deletion job placeholders
- [x] **Done** — M3.18 — Implement renewal request/instructions flow without payment collection
- [x] **Done** — M3 — Tenant Lifecycle, Onboarding, Platform Admin

## M4 — Core Master Data

- [x] **Done** — M4.01 — Implement branch list/detail/create/update/deactivate/reactivate
- [x] **Done** — M4.02 — Enforce plan branch limits and last-active-branch rule
- [x] **Done** — M4.03 — Implement employee invitation, creation, deactivation, and reactivation
- [x] **Done** — M4.04 — Implement role and permission management
- [x] **Done** — M4.05 — Implement role-template edit protections
- [x] **Done** — M4.06 — Implement branch assignment and tenant-wide branch access management
- [x] **Done** — M4.07 — Implement customer create/search/detail/update/merge/soft-delete/restore
- [x] **Done** — M4.08 — Implement customer tags if supported by current schema/design
- [x] **Done** — M4.09 — Implement motorcycle create/search/detail/update/soft-delete/restore
- [x] **Done** — M4.10 — Implement service catalog create/read/update/deactivate
- [x] **Done** — M4.11 — Implement product category management where needed by inventory
- [x] **Done** — M4.12 — Add duplicate warnings without automatic merge
- [x] **Done** — M4.13 — Add audit logs for high-risk changes
- [x] **Done** — M4.14 — Add mobile-first screens for branches, employees, roles, customers, motorcycles, and services
- [x] **Done** — M4 — Core Master Data

## M5 — Service Operations

- [x] **Done** — M5.01 — Implement estimate number generation
- [x] **Done** — M5.02 — Implement estimate draft/create/update
- [x] **Done** — M5.03 — Implement estimate present, approve, convert, cancel, and expiration flows
- [x] **Done** — M5.04 — Implement job order number generation
- [x] **Done** — M5.05 — Implement job order create/detail/update
- [x] **Done** — M5.06 — Implement job order service, labor, and part line scaffolding
- [x] **Done** — M5.07 — Implement job order assignment to employees/mechanics
- [x] **Done** — M5.08 — Implement job order status transitions
- [x] **Done** — M5.09 — Implement correction workflow with permissions and audit reason
- [x] **Done** — M5.10 — Implement mechanic assigned-jobs view
- [x] **Done** — M5.11 — Implement mechanic session start/pause/resume/finish
- [x] **Done** — M5.12 — Implement service notes and labor task completion
- [x] **Done** — M5.13 — Implement job attachments placeholders until full file module
- [x] **Done** — M5.14 — Add status history and audit history UI
- [x] **Done** — M5.15 — Add mobile-first intake and mechanic workflows
- [x] **Done** — M5 — Service Operations

## M6 — Inventory Foundation and FIFO

- [x] **Done** — M6.01 — Implement product and category management
- [x] **Done** — M6.02 — Implement branch stock balances
- [x] **Done** — M6.03 — Implement immutable inventory ledger write service
- [x] **Done** — M6.04 — Implement FIFO layer creation and locking strategy
- [x] **Done** — M6.05 — Implement available stock calculation
- [x] **Done** — M6.06 — Implement inventory reservation command
- [x] **Done** — M6.07 — Implement FIFO reservation allocation from oldest available layers
- [x] **Done** — M6.08 — Implement reservation release
- [x] **Done** — M6.09 — Implement FIFO consumption records
- [x] **Done** — M6.10 — Integrate job order part reservation
- [x] **Done** — M6.11 — Integrate job order completion with FIFO consumption
- [x] **Done** — M6.12 — Implement inventory read/search APIs
- [x] **Done** — M6.13 — Add deterministic FIFO fixtures
- [x] **Done** — M6.14 — Add concurrency tests for reservation, allocation, and consumption
- [x] **Done** — M6.15 — Add reconciliation checks between balances, ledger, reservations, and FIFO layers
- [x] **Done** — M6 — Inventory Foundation and FIFO

## M7 — Inventory Workflows

- [x] **Done** — M7.01 — Implement inventory adjustment draft/request flow
- [x] **Done** — M7.02 — Implement approval/rejection flow
- [x] **Done** — M7.03 — Implement posting flow with idempotency and locks
- [x] **Done** — M7.04 — Implement positive adjustment FIFO layer creation
- [x] **Done** — M7.05 — Implement negative adjustment FIFO consumption
- [x] **Done** — M7.06 — Implement force adjustment permission and reason handling
- [x] **Done** — M7.07 — Implement transfer draft/request flow
- [x] **Done** — M7.08 — Implement transfer reservation
- [x] **Done** — M7.09 — Implement transfer send
- [x] **Done** — M7.10 — Implement transfer receive
- [x] **Done** — M7.11 — Implement variance loss handling
- [x] **Done** — M7.12 — Implement transfer cancellation rules
- [x] **Done** — M7.13 — Implement low-stock alerts
- [x] **Done** — M7.14 — Integrate branch deactivation stock blockers
- [x] **Done** — M7.15 — Add audit and status history
- [x] **Done** — M7 — Inventory Workflows

## M8 — Purchasing, Suppliers, and Accounts Payable

- [x] **Done** — M8.01 — Implement supplier create/read/update/deactivate/reactivate
- [x] **Done** — M8.02 — Implement purchase order draft/create/update/cancel
- [x] **Done** — M8.03 — Implement ordered/received/partially received/closed transitions
- [x] **Done** — M8.04 — Implement purchase receiving with stock and FIFO layer creation
- [x] **Done** — M8.05 — Implement cash purchase behavior without AP liability
- [x] **Done** — M8.06 — Implement credit purchase AP behavior
- [x] **Done** — M8.07 — Implement supplier payment recording
- [x] **Done** — M8.08 — Implement supplier credits
- [x] **Done** — M8.09 — Implement supplier returns
- [x] **Done** — M8.10 — Implement supplier return valuation from documented costing basis
- [x] **Done** — M8.11 — Implement AP balances and report basis
- [x] **Done** — M8.12 — Add status history, audit logs, and idempotency
- [x] **Done** — M8.13 — Add purchasing and AP mobile screens
- [x] **Done** — M8 — Purchasing, Suppliers, and Accounts Payable

## M9 — Invoicing, Payments, Receipts, Refunds, AR

- [x] **Done** — M9.01 — Review invoice/payment source alignment and repo patterns
- [x] **Done** — M9.02 — Implement invoice domain types, schemas, and repository basis
- [x] **Done** — M9.03 — Implement invoice draft from job orders
- [x] **Done** — M9.04 — Implement billing allocation service and concurrency protection
- [x] **Done** — M9.05 — Implement invoice line, discount, and tax calculation service
- [x] **Done** — M9.06 — Implement invoice issue, cancel, and void workflows
- [x] **Done** — M9.07 — Implement payment creation and overpayment blocking
- [x] **Done** — M9.08 — Generate exactly one immutable receipt per payment
- [x] **Done** — M9.09 — Implement partial and split payment behavior
- [x] **Done** — M9.10 — Implement refund creation and invoice status recalculation
- [x] **Done** — M9.11 — Implement refund/void inventory reversal where documented
- [x] **Done** — M9.12 — Implement AR balances and report basis
- [x] **Done** — M9.13 — Add financial immutability protections and audit coverage
- [x] **Done** — M9.14 — Implement invoice frontend list/detail/draft/issue flows
- [x] **Done** — M9.15 — Implement payment and receipt frontend flows
- [x] **Done** — M9.16 — Implement refund and void frontend flows
- [x] **Done** — M9.17 — Add Milestone 9 E2E, mobile, permission, and blocked-state coverage
- [x] **Done** — M9.18 — Final Milestone 9 regression, documentation, and handoff
- [x] **Done** — M9.BUG — Add database-backed billing allocation concurrency proof
- [x] **Done** — M9.BUG — Add invoice workflow UI regression coverage
- [x] **Done** — M9.BUG — Disabled New invoice link remains navigable
- [x] **Done** — M9.BUG — Invoice draft UI/API contract mismatch needs resolution
- [x] **Done** — M9.BUG — Invoice list lacks cursor pagination UI
- [x] **Done** — M9.BUG — Invoice UI blocks pending invoice cancellation
- [x] **Done** — M9.BUG — Refund UI estimates per-receipt refundable amount from invoice totals
- [x] **Done** — [Review] garageos@eff0b976 — No actionable findings

## M10 — Expenses, Reminders, Notifications, Integrations

- [ ] **Ready** — M10.01 — Implement expense categories
- [ ] **Backlog** — M10.02 — Implement expense create/read/update/void
- [ ] **Backlog** — M10.03 — Implement expense financial report basis
- [ ] **Backlog** — M10.04 — Implement reminder rules
- [ ] **Backlog** — M10.05 — Implement reminder scheduling worker
- [ ] **Backlog** — M10.06 — Implement notification preferences
- [ ] **Backlog** — M10.07 — Implement in-app notification delivery
- [ ] **Backlog** — M10.08 — Implement push notification adapter
- [ ] **Backlog** — M10.09 — Implement email adapter
- [ ] **Backlog** — M10.10 — Implement SMS adapter
- [ ] **Backlog** — M10.11 — Implement delivery attempts and failure tracking
- [ ] **Backlog** — M10.12 — Enforce plan channels for reminders and notifications
- [ ] **Backlog** — M10.13 — Implement no-silent-downgrade behavior for unavailable channels
- [ ] **Backlog** — M10.14 — Add provider sandbox/test adapters
- [ ] **Backlog** — M10.15 — Add sanitized logging for provider payloads
- [ ] **Backlog** — M10 — Expenses, Reminders, Notifications, Integrations

## M11 — Files, Exports, Offline PWA Cache

- [ ] **Backlog** — M11.01 — Finalize object storage provider/configuration
- [ ] **Backlog** — M11.02 — Implement private tenant-scoped object paths
- [ ] **Backlog** — M11.03 — Implement upload intent API
- [ ] **Backlog** — M11.04 — Implement signed upload/download URL flow
- [ ] **Backlog** — M11.05 — Implement file metadata lifecycle
- [ ] **Backlog** — M11.06 — Implement file linking to documented entities
- [ ] **Backlog** — M11.07 — Implement file soft-delete and restore
- [ ] **Backlog** — M11.08 — Implement retention rules for financial/audit-relevant files
- [ ] **Backlog** — M11.09 — Implement full tenant export job
- [ ] **Backlog** — M11.10 — Package structured data, relationships, audit export, attachment manifest, README, and attachments
- [ ] **Backlog** — M11.11 — Implement export job status and safe error summaries
- [ ] **Backlog** — M11.12 — Implement export download expiry
- [ ] **Backlog** — M11.13 — Implement PWA manifest and service worker
- [ ] **Backlog** — M11.14 — Implement app-shell cache
- [ ] **Backlog** — M11.15 — Implement read-only recent-record cache
- [ ] **Backlog** — M11.16 — Clear user-scoped cache on logout/session invalidation
- [ ] **Backlog** — M11.17 — Block offline writes, uploads, approvals, payments, refunds, inventory actions, settings changes, and role changes
- [ ] **Backlog** — M11 — Files, Exports, Offline PWA Cache

## M12 — Dashboard, Reports, Search, Export Formats

- [ ] **Backlog** — M12.01 — Implement dashboard summary API and screen
- [ ] **Backlog** — M12.02 — Implement revenue chart
- [ ] **Backlog** — M12.03 — Implement inventory alerts
- [ ] **Backlog** — M12.04 — Implement customer reports
- [ ] **Backlog** — M12.05 — Implement service reports
- [ ] **Backlog** — M12.06 — Implement inventory reports
- [ ] **Backlog** — M12.07 — Implement AR/AP reports
- [ ] **Backlog** — M12.08 — Implement revenue, collection, COGS, gross profit, expenses, and variance reports
- [ ] **Backlog** — M12.09 — Implement branch comparison reports where plan allows
- [ ] **Backlog** — M12.10 — Implement advanced operational reports where plan allows
- [ ] **Backlog** — M12.11 — Implement search read models for documented entities
- [ ] **Backlog** — M12.12 — Implement CSV/PDF/Excel export formats where documented
- [ ] **Backlog** — M12.13 — Implement report export jobs for large exports
- [ ] **Backlog** — M12.14 — Add formula verification fixtures
- [ ] **Backlog** — M12.15 — Add performance tests for high-volume lists, dashboards, ledgers, search, and exports
- [ ] **Backlog** — M12 — Dashboard, Reports, Search, Export Formats

## M13 — Security, Observability, Performance, DR Hardening

- [ ] **Backlog** — M13.01 — Run threat modeling by module
- [ ] **Backlog** — M13.02 — Run tenant isolation tests across UI, API, repository, database, files, reports, and exports
- [ ] **Backlog** — M13.03 — Run branch access tests across branch-specific records and linked histories
- [ ] **Backlog** — M13.04 — Run support access audit review
- [ ] **Backlog** — M13.05 — Run sensitive log review
- [ ] **Backlog** — M13.06 — Run rate-limit tests
- [ ] **Backlog** — M13.07 — Run dependency and container scans
- [ ] **Backlog** — M13.08 — Add or verify structured logs
- [ ] **Backlog** — M13.09 — Add or verify metrics
- [ ] **Backlog** — M13.10 — Add or verify error monitoring
- [ ] **Backlog** — M13.11 — Add or verify traces and correlation IDs
- [ ] **Backlog** — M13.12 — Verify background job observability
- [ ] **Backlog** — M13.13 — Run API performance tests
- [ ] **Backlog** — M13.14 — Run report/export performance tests
- [ ] **Backlog** — M13.15 — Configure encrypted backups
- [ ] **Backlog** — M13.16 — Perform restore rehearsal
- [ ] **Backlog** — M13.17 — Validate or formally waive RPO 24h and RTO 4h targets
- [ ] **Backlog** — M13.18 — Complete operational runbooks
- [ ] **Backlog** — M13 — Security, Observability, Performance, DR Hardening

## M14 — End-to-End UAT and Launch Readiness

- [ ] **Backlog** — M14.01 — Freeze release-candidate scope against approved source docs
- [ ] **Backlog** — M14.02 — Run full regression suite
- [ ] **Backlog** — M14.03 — Run mobile-first E2E workflows
- [ ] **Backlog** — M14.04 — Run role-based UAT scenarios
- [ ] **Backlog** — M14.05 — Validate tenant lifecycle states end to end
- [ ] **Backlog** — M14.06 — Validate full service workflow from intake through report impact
- [ ] **Backlog** — M14.07 — Validate purchasing/AP workflow
- [ ] **Backlog** — M14.08 — Validate refunds, voids, and AR recalculation
- [ ] **Backlog** — M14.09 — Validate reminders/notifications and plan channels
- [ ] **Backlog** — M14.10 — Validate files, exports, offline cache, and deletion lifecycle
- [ ] **Backlog** — M14.11 — Burn down release-blocking defects
- [ ] **Backlog** — M14.12 — Collect product, QA, security, DevOps, and engineering signoffs
- [ ] **Backlog** — M14.13 — Provision production environment
- [ ] **Backlog** — M14.14 — Bootstrap first platform admin
- [ ] **Backlog** — M14.15 — Verify seeds, plans, permissions, role templates, provider configs, storage, analytics, error monitoring, backups, and restore procedures
- [ ] **Backlog** — M14.16 — Execute production smoke plan
- [ ] **Backlog** — M14.17 — Onboard limited pilot tenants manually
- [ ] **Backlog** — M14.18 — Monitor errors, latency, background jobs, reports, exports, and provider delivery
- [ ] **Backlog** — M14.19 — Fix launch defects before broader sales rollout
- [ ] **Backlog** — M14.UAT01 — Owner signup, email verification, onboarding, and first branch setup
- [ ] **Backlog** — M14.UAT02 — Platform-created tenant, owner invitation, subscription assignment, and onboarding
- [ ] **Backlog** — M14.UAT03 — Employee invitation, role assignment, branch assignment, and access restriction
- [ ] **Backlog** — M14.UAT04 — Customer and motorcycle creation, duplicate warning, service history, and restore workflow
- [ ] **Backlog** — M14.UAT05 — Estimate creation, presentation, approval, expiration, cancellation, and conversion
- [ ] **Backlog** — M14.UAT06 — Job order creation, mechanic assignment, status transitions, service/labor lines, and release
- [ ] **Backlog** — M14.UAT07 — Mechanic session start, pause, resume, finish, and productivity reporting
- [ ] **Backlog** — M14.UAT08 — Product creation, purchase receiving, FIFO layer creation, and low-stock alert
- [ ] **Backlog** — M14.UAT09 — Job order part reservation, completion, FIFO consumption, COGS calculation, and ledger review
- [ ] **Backlog** — M14.UAT10 — Inventory adjustment approval and posting
- [ ] **Backlog** — M14.UAT11 — Branch transfer reservation, send, receive, variance loss, and FIFO cost preservation
- [ ] **Backlog** — M14.UAT12 — Supplier purchase, partial receiving, AP creation, supplier payment, and supplier return
- [ ] **Backlog** — M14.UAT13 — Invoice creation, billing allocation, issuance, tax/discount calculation, and payment
- [ ] **Backlog** — M14.UAT14 — Split payment, receipt generation, refund, refund inventory reversal, and AR recalculation
- [ ] **Backlog** — M14.UAT15 — Expense creation, edit, void, and financial report impact
- [ ] **Backlog** — M14.UAT16 — Reminder creation, channel enforcement, delivery tracking, and notification display
- [ ] **Backlog** — M14.UAT17 — File upload, signed download, soft deletion, restoration, and export attachment packaging
- [ ] **Backlog** — M14.UAT18 — Dashboard and reports with branch filters and plan restrictions
- [ ] **Backlog** — M14.UAT19 — Tenant read-only, suspended, pending-deletion, renewal, export, and deletion lifecycle
- [ ] **Backlog** — M14.UAT20 — Offline app shell and read-only recent-record cache behavior
- [ ] **Backlog** — M14 — End-to-End UAT and Launch Readiness

## Unmilestoned Notion Records

- [x] **Done** — [Review] garageos@aa88188 — AI code review completed with 10 findings
