# GarageOS Progress Tracker

## Milestone 0 — Project Foundation and Engineering Decisions

- [x] Create approved documentation baseline
- [x] Create source-aligned build roadmap
- [x] Create tech stack and architecture record package
- [x] Initialize repository and workspace
- [x] Finalize monorepo structure
- [x] Create app packages: `web`, `api`, `worker`, `scheduler`
- [x] Create shared packages: `shared`, `api-client`, `config`, `test-utils`
- [x] Create database package: `db`
- [x] Configure root package scripts
- [x] Configure TypeScript baseline
- [x] Configure local Docker Compose
- [x] Add safe `.env.example`
- [x] Create CI baseline
- [ ] Verify ADR/runbook/API/testing docs directory coverage in repository
- [ ] Verify Definition of Done artifact in repository
- [ ] Verify traceability template in repository
- [ ] Verify UX wireframe backlog in repository
- [ ] Verify QA automation structure beyond package test scripts

## Milestone 1 — Database Foundation and Core Migrations

- [x] Create database schema source document
- [x] Finalize migration tool choice
- [x] Add migration scripts
- [x] Add schema validation script
- [x] Add seed script
- [x] Add PostgreSQL migration gate in CI
- [x] Add platform, tenant, and subscription schema
- [x] Add user, auth, session, and token schema
- [x] Add roles, permissions, role permissions, user roles, and branch assignments
- [x] Add shop profile, branches, and tenant settings schema
- [x] Add customer and motorcycle schema
- [x] Add service, estimate, job order, mechanic session, and status history schema
- [x] Add product, category, stock balance, inventory ledger, FIFO, reservation, and allocation schema
- [x] Add adjustment, transfer, supplier, purchase, return, payment, credit, and AP schema
- [x] Add invoice, billing allocation, payment, receipt, refund, and AR schema
- [x] Add expenses, reminders, notifications, files, exports, audit logs, idempotency keys, background jobs, and reporting/search scaffolds
- [x] Add constraints, indexes, foreign keys, precision checks, and document-number uniqueness
- [x] Add seed data for plans, plan limits, and permissions
- [x] Add schema drift/count validation
- [ ] Verify protected Shop Owner role seed behavior separately
- [ ] Verify database fixture factory coverage

## Milestone 2 — API Foundation, Auth, Tenant Context, RBAC

- [x] Create API contract source document
- [x] Create REST API skeleton under `/api/v1`
- [x] Implement response envelope interceptor
- [x] Implement error envelope filter
- [x] Add request context middleware
- [x] Implement auth module
- [x] Implement owner signup route
- [x] Implement login route
- [x] Implement refresh route
- [x] Implement logout and logout-all routes
- [x] Implement email verification routes
- [x] Implement forgot/reset/change password routes
- [x] Implement current session route
- [x] Implement password hashing and token hashing services
- [x] Implement access token signing
- [x] Implement refresh-token cookie transport
- [x] Implement rate-limit providers
- [x] Implement tenant context route guard
- [x] Implement tenant status access route guard
- [x] Implement permission access route guard
- [x] Implement branch access route guard
- [x] Implement Zod validation pipeline
- [x] Implement idempotency service
- [x] Implement shared transaction runner
- [x] Implement shared audit service
- [x] Add auth/session API tests where present
- [ ] Verify full auth UI screen coverage

## Milestone 3 — Tenant Lifecycle, Onboarding, Platform Admin

- [x] Define tenant lifecycle and platform admin source requirements
- [x] Implement platform tenant module
- [x] Implement platform tenant list endpoint
- [x] Implement platform tenant detail endpoint
- [x] Implement platform tenant creation endpoint
- [x] Implement subscription update endpoint
- [x] Implement read-only override endpoint
- [x] Implement suspension endpoint
- [x] Implement support access session start/end endpoints
- [x] Implement tenant export queue endpoint
- [x] Implement tenant deletion job queue endpoint
- [x] Implement platform audit log list endpoint
- [x] Implement tenant lifecycle evaluation service
- [x] Implement tenant lifecycle command service
- [x] Add idempotency to platform critical writes
- [x] Keep renewal/payment behavior external to GarageOS
- [x] Implement tenant onboarding completion UI workflow
- [ ] Implement or verify `/platform/tenants` UI
- [ ] Implement or verify `/platform/tenants/{tenant_id}` UI
- [ ] Implement or verify `/platform/tenants/new` UI
- [ ] Implement or verify subscription override UI
- [ ] Implement or verify support access UI
- [ ] Implement or verify tenant lifecycle worker scheduling

## Milestone 4 — Core Master Data

- [x] Implement branch list endpoint
- [x] Implement branch detail endpoint
- [x] Implement branch create endpoint
- [x] Implement branch update endpoint
- [x] Implement branch deactivate endpoint
- [x] Implement branch reactivate endpoint
- [x] Enforce branch idempotency for critical branch writes
- [x] Implement employee list endpoint
- [x] Implement employee create endpoint
- [x] Implement employee invitation list/create/revoke endpoints
- [x] Implement employee detail/update endpoints
- [x] Implement employee role assignment endpoint
- [x] Implement employee branch assignment endpoint
- [x] Implement employee deactivate/reactivate endpoints
- [x] Implement role list endpoint
- [x] Implement permission list endpoint
- [x] Implement role create/detail/update/deactivate endpoints
- [x] Implement customer list/search endpoint
- [x] Implement customer create endpoint
- [x] Implement customer detail endpoint
- [x] Implement customer update endpoint
- [x] Implement motorcycle list/search endpoint
- [x] Implement motorcycle create endpoint
- [x] Implement motorcycle detail endpoint
- [x] Implement motorcycle update endpoint
- [x] Implement service list endpoint
- [x] Implement service create/detail/update endpoints
- [x] Implement service deactivate/reactivate endpoints
- [x] Implement product category list/create/detail/update/deactivate/reactivate endpoints
- [x] Implement product list/create/detail/update/deactivate/reactivate endpoints
- [ ] Implement customer merge endpoint
- [ ] Implement customer soft-delete/restore endpoints
- [ ] Implement motorcycle soft-delete/restore endpoints
- [ ] Implement full mobile screens for branches, employees, roles, customers, motorcycles, and services
- [ ] Replace planned tenant route scaffolds with real tenant UIs where still planned

## Milestone 5 — Service Operations

- [x] Implement estimate list endpoint
- [x] Implement estimate create endpoint
- [x] Implement estimate detail endpoint
- [x] Implement estimate update endpoint
- [x] Implement estimate present endpoint
- [x] Implement estimate approve endpoint
- [x] Implement estimate convert endpoint
- [x] Implement job order list endpoint
- [x] Implement job order create endpoint
- [x] Implement job order detail endpoint
- [x] Implement job order update endpoint
- [x] Implement job order status events endpoint
- [x] Implement job order audit events endpoint
- [x] Implement job attachment placeholder list/create endpoints
- [x] Implement mechanic assignment endpoint
- [x] Implement service note endpoint
- [x] Implement job order status transition endpoint
- [x] Implement job order completion endpoint
- [x] Implement job order service line endpoint
- [x] Implement job order part line endpoint
- [x] Implement job order line update, complete, and remove endpoints
- [x] Implement mechanic session module
- [ ] Implement estimate cancel endpoint if not present elsewhere
- [ ] Implement estimate expiration worker/action if not present elsewhere
- [ ] Implement full mobile service intake screens
- [ ] Implement full mechanic assigned-jobs UI

## Milestone 6 — Inventory Foundation and FIFO

- [x] Implement inventory module
- [x] Implement product and category management backend
- [x] Implement branch stock balances service
- [x] Implement stock balance read endpoint
- [x] Implement immutable inventory ledger service
- [x] Implement inventory ledger read endpoint
- [x] Implement FIFO layer service
- [x] Implement FIFO layer read endpoint
- [x] Implement FIFO consumption service
- [x] Implement inventory reservation service
- [x] Implement inventory read service
- [x] Implement product stock read endpoint
- [x] Implement available stock calculation support
- [x] Implement inventory reconciliation service
- [x] Implement low-stock alert service
- [x] Implement low-stock alert read endpoint
- [x] Add schema validation for stock balances, ledger, FIFO layers, and low-stock alerts
- [x] Add FIFO/concurrency coverage in repo history
- [x] Add inventory stock balance UI foundation
- [ ] Replace inventory planned-route scaffolds with full inventory workflow UIs

## Milestone 7 — Inventory Workflows

- [x] Implement inventory adjustment draft/create workflow
- [x] Implement inventory adjustment submit workflow
- [x] Implement inventory adjustment approve workflow
- [x] Implement inventory adjustment reject workflow
- [x] Implement inventory adjustment cancel workflow
- [x] Implement inventory adjustment post workflow
- [x] Implement positive adjustment FIFO effects
- [x] Implement negative adjustment FIFO effects
- [x] Implement force adjustment workflow
- [x] Implement transfer draft/create workflow
- [x] Implement transfer submit workflow
- [x] Implement transfer send workflow
- [x] Implement transfer receive workflow
- [x] Implement transfer variance handling
- [x] Implement transfer cancel workflow
- [x] Implement transfer reservation and release behavior
- [x] Implement low-stock alerts
- [x] Implement branch deactivation stock blockers
- [x] Implement inventory audit and status history coverage
- [ ] Implement full inventory adjustment UI
- [ ] Implement full inventory transfer UI

## Milestone 8 — Purchasing, Suppliers, and AP

- [x] Implement supplier list/search UI
- [x] Implement supplier create/edit/status actions UI
- [x] Implement purchase order list/search UI
- [x] Implement purchase order detail UI
- [x] Implement purchase receiving backend/API and FIFO/AP effects
- [x] Harden purchase receiving validation coverage
- [x] Add database-backed purchase receiving integration/concurrency tests
- [x] Verify supplier lifecycle backend/API coverage
- [x] Implement purchase order draft/create/update workflow
- [x] Implement purchase order order/cancel/close workflow actions
- [x] Implement purchase receiving UI workflow
- [x] Implement supplier payment workflow
- [x] Implement supplier credit workflow
- [x] Implement supplier return workflow
- [x] Implement supplier return valuation
- [x] Implement AP balances/report basis
- [x] Complete purchasing/AP mobile screens beyond existing supplier and purchase order pages

## Milestone 9 — Invoicing, Payments, Receipts, Refunds, AR

- [x] Implement invoice draft from job orders
- [x] Implement billing allocation service
- [ ] Implement invoice calculations
- [ ] Implement invoice-level discount allocation
- [ ] Implement tax calculation from tenant tax settings
- [ ] Implement invoice issuance
- [ ] Implement invoice cancel and void rules
- [ ] Implement payment creation
- [ ] Implement immutable receipt generation
- [ ] Implement partial and split payments
- [ ] Implement overpayment blocking
- [ ] Implement refund creation
- [ ] Implement refund inventory reversal where applicable
- [ ] Implement paid-invoice refund status recalculation
- [ ] Implement AR balances/report basis
- [ ] Implement financial immutability protections
- [ ] Implement cashier mobile flows

## Milestone 10 — Expenses, Reminders, Notifications, Integrations

- [ ] Implement expense categories and expense workflows
- [ ] Implement expense edit and void rules
- [ ] Implement reminder rules
- [ ] Implement reminder scheduler
- [ ] Implement notification preferences
- [ ] Implement in-app notification delivery
- [ ] Implement push notification adapter interface
- [ ] Implement email notification adapter interface
- [ ] Implement SMS notification adapter interface
- [ ] Implement delivery attempts and failure tracking
- [ ] Implement plan-channel enforcement
- [ ] Implement no-silent-downgrade notification behavior
- [ ] Implement provider failure observability
- [ ] Implement mobile screens for expenses, reminders, and notifications

## Milestone 11 — Files, Exports, Offline PWA Cache

- [ ] Select object storage provider
- [ ] Implement private tenant-scoped file paths
- [ ] Implement upload intent and signed URL flows
- [ ] Implement file metadata lifecycle
- [ ] Implement entity file attachments
- [ ] Implement full tenant export job
- [ ] Implement tenant export package format
- [ ] Implement export status and download expiry
- [ ] Implement PWA manifest
- [ ] Implement service worker
- [ ] Implement read-only recent-record cache
- [ ] Implement offline write blocking
- [ ] Implement file/export/offline mobile screens

## Milestone 12 — Dashboard, Reports, Search, Export Formats

- [ ] Implement dashboard summary API and screen
- [ ] Implement revenue chart
- [ ] Implement inventory alerts dashboard widget
- [ ] Implement customer reports
- [ ] Implement service reports
- [ ] Implement inventory reports
- [ ] Implement AR reports
- [ ] Implement AP reports
- [ ] Implement financial reports
- [ ] Implement branch comparison report plan gates
- [ ] Implement advanced report plan gates
- [ ] Implement search read models
- [ ] Implement CSV export formats
- [ ] Implement PDF/Excel export formats where documented
- [ ] Implement formula verification fixtures
- [ ] Implement report performance tests

## Milestone 13 — Security, Observability, Performance, DR Hardening

- [ ] Complete threat modeling by module
- [ ] Complete tenant isolation tests
- [ ] Complete branch access tests
- [ ] Complete support access audit review
- [ ] Complete sensitive log review
- [ ] Complete rate-limit tests
- [ ] Complete dependency and container scans
- [ ] Implement structured logs
- [ ] Implement metrics
- [ ] Implement error monitoring
- [ ] Implement tracing/correlation visibility
- [ ] Implement background job observability
- [ ] Complete performance tests
- [ ] Configure encrypted backups
- [ ] Complete restore rehearsal
- [ ] Create production runbooks
- [ ] Verify append-only protections before launch

## Milestone 14 — End-to-End UAT and Launch Readiness

- [ ] Freeze release candidate scope against approved documentation
- [ ] Run full regression suite
- [ ] Run mobile-first E2E workflows
- [ ] Run role-based UAT scenarios
- [ ] Validate service workflows
- [ ] Validate inventory workflows
- [ ] Validate purchasing/AP workflows
- [ ] Validate invoicing/payment/refund/AR workflows
- [ ] Validate expense/reminder/notification workflows
- [ ] Validate file/export/offline workflows
- [ ] Validate dashboard/report workflows
- [ ] Validate tenant lifecycle workflows
- [ ] Burn down release-blocking defects
- [ ] Collect product/QA/security/DevOps/engineering signoffs
- [ ] Provision production
- [ ] Bootstrap first platform admin
- [ ] Execute production smoke test
- [ ] Execute pilot launch
