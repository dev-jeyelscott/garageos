# GarageOS UX Screen Map

**Document:** `ux-sreen-map.md`  
**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Status:** Source-aligned UX screen inventory  
**Primary Sources:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`

---

## 1. Purpose

Defines the GarageOS screen inventory for the mobile-first PWA. It maps documented modules, workflows, tenant lifecycle states, permissions, branch access, plan limits, offline behavior, and API boundaries into frontend navigation and screen groups.

This document does not add product scope.

---

## 2. Source Rules

1. Product requirements are highest authority.
2. Architecture and API contracts define implementation alignment.
3. Database schema confirms entity/workflow boundaries.
4. Screens must not imply excluded product capabilities.
5. Screens must respect tenant status, role permissions, branch access, plan limits, support-access context, and offline restrictions.
6. Backend/API/database remain authoritative; UI checks improve usability only.

---

## 3. Explicit UX Non-Scope

Do not design screens or flows for:

- Native iOS/Android apps.
- Offline create/edit/sync queues or conflict resolution.
- Customer portal or customer login.
- Standalone retail POS/cart checkout.
- Payroll.
- Full accounting/general ledger/chart of accounts/bank reconciliation/formal close.
- Direct BIR/tax filing submission.
- E-commerce marketplace, public checkout, or delivery.
- Loyalty, points, rewards, tiers, or redemption.
- Service packages.
- Automatic subscription charging or customer payment-gateway charge flows.
- Two-factor authentication.
- AI forecasting/custom BI beyond documented reports.

---

## 4. Global UX Principles

| Rule                   | Requirement                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Mobile-first           | Core shop workflows must work on small touch screens.                                                         |
| Permission-aware       | Hide/disable unavailable actions; backend remains authoritative.                                              |
| Tenant lifecycle-aware | Tenant status gates apply before module permissions.                                                          |
| Branch-aware           | Branch-scoped screens show branch context/filtering.                                                          |
| Workflow-first         | Status changes use explicit actions/modals, not freeform status edits.                                        |
| Immutable records      | Receipts, issued financial records, refunds, inventory ledgers, and audit logs are view-only/correction-only. |
| Offline-safe           | Offline mode is clearly read-only and blocks all writes.                                                      |
| Error recovery         | API errors must map to actionable field/global messages and correlation IDs where available.                  |
| Audit visibility       | Critical workflows expose status history/audit history with actor, timestamp, and reason.                     |

---

## 5. Global Application Shell

| Shell Component             | Purpose                                                                          |
| --------------------------- | -------------------------------------------------------------------------------- |
| Auth gate                   | Blocks unauthenticated access and redirects to auth screens.                     |
| Tenant status banner        | Shows grace, read-only, suspended, renewal, and pending-deletion states.         |
| Branch selector/indicator   | Shows active branch context on branch-scoped or multi-branch screens.            |
| Permission-aware navigation | Shows allowed groups/actions only.                                               |
| Offline indicator           | Shows offline state and blocks create/edit/submit/delete/approve/upload actions. |
| Notification indicator      | Entry to internal notifications.                                                 |
| User menu                   | Profile, change password, logout, logout all.                                    |
| Support-access marker       | Visibly marks audited platform support sessions.                                 |

### Mobile Navigation

| Area           | Items                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Bottom nav     | Dashboard, Job Orders, Customers, Inventory, More                                                      |
| Primary action | Contextual CTA such as New Job Order, Add Customer, Record Payment, New Transfer                       |
| More menu      | Invoices, Payments, Purchases, Suppliers, Reports, Reminders, Employees, Settings, Audit Logs, Exports |
| Platform shell | Tenants, Plans, Support Access, Exports, Deletion Jobs, Platform Audit Logs                            |

---

## 6. Tenant Lifecycle Access

| Status             | Allowed UX                                                                                | Blocked UX                                                              | Required State           |
| ------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------ |
| `pending_setup`    | Login, email verification, onboarding, profile setup, subscription info, password, logout | Operational modules                                                     | Setup progress/blockers  |
| `active`           | Full access by permissions/branch access                                                  | Unauthorized actions                                                    | Normal                   |
| `grace_period`     | Full access by permissions/branch access                                                  | Unauthorized actions                                                    | Renewal warnings         |
| `read_only`        | View/search, reports, export, renewal request, password, logout                           | Operational writes, uploads, employee/role/settings operational changes | Read-only banner         |
| `suspended`        | Shop Owner renewal/export/password/logout; platform support                               | Non-owner access; all operational writes                                | Suspended screen         |
| `pending_deletion` | Platform-controlled deletion/emergency extension only                                     | Tenant operational access; export unless extension                      | Pending deletion message |
| `deleted`          | None for tenant users                                                                     | All tenant access                                                       | Tenant unavailable       |

---

## 7. Role Landings

| Role            | Landing                 | Quick Actions                                                | Restrictions                                           |
| --------------- | ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| Shop Owner      | Dashboard               | Renew, export, branches, employees, reports, audit logs      | Plan/lifecycle gates still apply                       |
| Manager         | Dashboard or Job Orders | Assign, approve adjustments/refunds, branch reports          | Permission/branch dependent                            |
| Service Advisor | Job Orders              | Customer/motorcycle/job/estimate intake, notes, parts/labor  | No finance unless granted                              |
| Mechanic        | Assigned Jobs           | Start/pause/resume/finish sessions, notes/photos/tasks       | No finance/supplier/subscription unless custom-granted |
| Cashier         | Invoices/Payments       | Invoice, payment, receipt, permitted refund                  | Receipts immutable                                     |
| Inventory Clerk | Inventory               | Product lookup, receiving, adjustments, transfers, low stock | Finance reports only if granted                        |
| Platform Admin  | Platform Tenants        | Tenants, plans, subscriptions, support, exports, deletion    | No silent impersonation                                |

---

## 8. Master Screen Groups

| Group                     | Route Prefix                                           | Primary Users                                                 |
| ------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| Public/Auth               | `/auth/*`                                              | All users                                                     |
| Onboarding                | `/onboarding/*`                                        | Shop Owner                                                    |
| Dashboard                 | `/dashboard`                                           | Authorized tenant users                                       |
| Customers                 | `/customers/*`                                         | Owner, Manager, Service Advisor                               |
| Motorcycles               | `/motorcycles/*`                                       | Owner, Manager, Service Advisor, permitted Mechanic read-only |
| Service Catalog           | `/services/*`                                          | Owner, Manager, Service Advisor                               |
| Estimates                 | `/estimates/*`                                         | Owner, Manager, Service Advisor                               |
| Job Orders                | `/job-orders/*`                                        | Owner, Manager, Service Advisor, Mechanic                     |
| Mechanic Sessions         | `/mechanic-sessions/*`                                 | Mechanic, Manager                                             |
| Products/Inventory        | `/products/*`, `/product-categories/*`, `/inventory/*` | Inventory Clerk, Manager, Owner                               |
| Inventory Adjustments     | `/inventory-adjustments/*`                             | Inventory Clerk, Manager                                      |
| Inventory Transfers       | `/inventory-transfers/*`                               | Inventory Clerk, Manager                                      |
| Suppliers                 | `/suppliers/*`                                         | Inventory Clerk, Manager, Owner                               |
| Purchases                 | `/purchase-orders/*`                                   | Inventory Clerk, Manager, Owner                               |
| Supplier Returns          | `/supplier-returns/*`                                  | Inventory Clerk, Manager, Owner                               |
| Invoices                  | `/invoices/*`                                          | Cashier, Manager, Owner                                       |
| Payments/Receipts/Refunds | `/payments/*`, `/receipts/*`, `/refunds/*`             | Cashier, Manager, Owner                                       |
| AR/AP                     | `/accounts-receivable/*`, `/accounts-payable/*`        | Cashier, Manager, Owner                                       |
| Expenses                  | `/expenses/*`                                          | Owner, Manager, authorized users                              |
| Reminders                 | `/reminders/*`                                         | Owner, Manager, Service Advisor                               |
| Notifications             | `/notifications/*`                                     | Tenant users                                                  |
| Files                     | `/files/*`                                             | Authorized tenant users                                       |
| Reports                   | `/reports/*`                                           | Owner, Manager, authorized users                              |
| Exports                   | `/exports/*`                                           | Shop Owner                                                    |
| Audit Logs                | `/audit-logs/*`                                        | Owner, authorized users, platform admins                      |
| Settings                  | `/settings/*`                                          | Owner, authorized users                                       |
| Employees/Roles           | `/employees/*`, `/roles/*`                             | Owner, authorized managers                                    |
| Background Jobs           | `/background-jobs/*`                                   | Authorized users/platform admins                              |
| Offline Cache             | `/offline-cache/*`                                     | Authenticated users                                           |
| Platform Admin            | `/platform/*`                                          | Platform admins                                               |

---

## 9. Standard Screen Patterns

Use these patterns instead of redefining layout per module.

| Pattern                      | Applies To                                     | Required UX                                                                                     |
| ---------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| List/Search                  | Most modules                                   | Search, filters, pagination, empty/loading/error states, permission-aware create action         |
| Detail                       | Most records                                   | Header, status badge, branch/tenant context, primary actions, related tabs/panels               |
| Create/Edit Form             | Mutable records                                | Required fields, validation, cancel/back, optimistic-lock handling where applicable             |
| Workflow Action Modal/Wizard | Status transitions and critical actions        | Action summary, required reason/metadata, confirmation, blockers, idempotency/conflict recovery |
| Status History               | Workflow resources                             | From/to status, actor, timestamp, reason                                                        |
| Audit Panel                  | Critical records                               | Actor, action, timestamp, sanitized previous/new values                                         |
| Export/Job Status            | Exports, reports, background jobs              | Job status, safe error summary, attempts where allowed, download link when complete             |
| Blocked Access State         | Permission/branch/status/plan/offline blockers | Clear reason and recovery path                                                                  |
| Read-Only Detail             | Offline/read-only/final records                | View-only content, disabled actions, read-only explanation                                      |

---

## 10. Screen Group Details

### 10.1 Public/Auth

| Screen                      | Route                              | API                                          |
| --------------------------- | ---------------------------------- | -------------------------------------------- |
| Owner Signup                | `/auth/signup-owner`               | `POST /auth/signup-owner`                    |
| Login                       | `/auth/login`                      | `POST /auth/login`                           |
| Email Verification Required | `/auth/email-verification`         | `POST /auth/email-verification/resend`       |
| Email Verification Result   | `/auth/email-verification/confirm` | `POST /auth/email-verification/confirm`      |
| Forgot Password             | `/auth/password/forgot`            | `POST /auth/password/forgot`                 |
| Reset Password              | `/auth/password/reset`             | `POST /auth/password/reset`                  |
| Change Password             | `/auth/password/change`            | `POST /auth/password/change`                 |
| Current Session             | internal state                     | `GET /auth/session`                          |
| Logout Confirmation         | modal or `/auth/logout`            | `POST /auth/logout`, `POST /auth/logout-all` |

Required states: invalid credentials, rate limit/lockout, unverified email, deactivated user, tenant blocked, password policy errors, expired/used tokens.

### 10.2 Onboarding and Shop Setup

Routes: `/onboarding`, `/onboarding/shop-profile`, `/onboarding/tax-localization`, `/onboarding/invoice-prefix`, `/onboarding/branch`, `/onboarding/owner-check`, `/onboarding/complete`, `/onboarding/subscription`.

APIs: `GET /shop/onboarding-state`, `PUT /shop/profile`, `POST /branches`, `POST /shop/complete-onboarding`, `GET /auth/session`, `POST /shop/renewal-request`.

Required states: missing profile/branch/owner/subscription, invalid tax combination, invalid invoice prefix, pending setup blocks operational modules.

### 10.3 Dashboard

Routes: `/dashboard`, `/dashboard/revenue`, `/dashboard/inventory-alerts`.

APIs: `GET /dashboard/summary`, `GET /dashboard/charts/revenue`, `GET /dashboard/inventory-alerts`, session/renewal APIs.

Required states: branch-scoped dashboard, multi-branch filters, plan-restricted report links, grace/read-only warnings, empty new-tenant dashboard.

### 10.4 Customers

Routes: `/customers`, `/customers/new`, `/customers/{id}`, `/customers/{id}/edit`, `/customers/{id}/history`, `/customers/{id}/motorcycles`, `/customers/merge`; soft-delete/restore modals.

APIs: `GET/POST/PATCH /customers`, `POST /customers/merge`, `POST /customers/{id}/soft-delete`, `POST /customers/{id}/restore`.

Required states: duplicate warnings, soft-deleted excluded by default, branch-filtered history, delete/restore blockers.

### 10.5 Motorcycles

Routes: `/motorcycles`, `/motorcycles/new`, `/motorcycles/{id}`, `/motorcycles/{id}/edit`, `/motorcycles/{id}/service-history`; mileage correction, soft-delete, restore modals.

APIs: `GET/POST/PATCH /motorcycles`, `GET /motorcycles/{id}/service-history`, `POST /motorcycles/{id}/mileage-corrections`, soft-delete/restore endpoints.

Required states: active linked customer, duplicate identifier warnings, branch-filtered history, delete/restore blockers.

### 10.6 Service Catalog

Routes: `/services`, `/services/new`, `/services/{id}`, `/services/{id}/edit`; deactivate/reactivate modals.

APIs: `GET/POST/PATCH /services`, `POST /services/{id}/deactivate`, `POST /services/{id}/reactivate`.

Required states: variable-price disclaimer, deactivation blocked by open workflows, historical records keep copied service details.

### 10.7 Estimates

Routes: `/estimates`, `/estimates/new`, `/estimates/{id}`, `/estimates/{id}/edit`, `/estimates/{id}/status-events`; present/approve/convert/cancel actions.

APIs: `GET/POST/PATCH /estimates`, `POST /estimates/{id}/present|approve|convert|cancel`, `GET /estimates/{id}/status-events`.

Required states: draft/presented/approved/converted/cancelled/expired handling; no inventory reservation, revenue, AR, tax, FIFO, or stock effect.

### 10.8 Job Orders

Routes: `/job-orders`, `/job-orders/new`, `/job-orders/{id}`, `/job-orders/{id}/edit`, `/job-orders/{id}/files`, `/job-orders/{id}/status-events`; line, mechanic, status, complete, release, cancel actions.

APIs: `GET/POST/PATCH /job-orders`, line endpoints, part reservation endpoint, mechanic assignment, status transition, complete, release, cancel, file, status-events endpoints.

Required states: primary mechanic before `in_progress`, waiting-for-parts reason, insufficient stock blocker, FIFO/ledger consumption on completion, final released/cancelled records, restricted edits after completion.

### 10.9 Mechanic Sessions

Routes: `/mechanic-sessions/my-jobs` or filtered `/job-orders`, `/mechanic-sessions/{id}`, `/mechanic-sessions`; start/pause/resume/finish actions.

APIs: `GET/POST /mechanic-sessions`, `POST /mechanic-sessions/{id}/pause|resume|finish`.

Required states: one unfinished session per mechanic, state-valid pause/resume, manager override permission-gated.

### 10.10 Products and Inventory

Routes: `/products`, `/products/new`, `/products/{id}`, `/products/{id}/edit`, `/products/{id}/stock`, `/products/{id}/fifo-layers`, `/product-categories`, `/inventory/stock-balances`, `/inventory/ledger`, `/inventory/low-stock-alerts`.

APIs: products, product-categories, stock, FIFO, ledger, stock-balances, low-stock endpoints.

Required states: available = on-hand minus reserved; no direct stock edits; product deactivation blocked by stock/reservations/open refs; ledger immutable.

### 10.11 Inventory Adjustments

Routes: `/inventory-adjustments`, `/inventory-adjustments/new`, `/inventory-adjustments/{id}`, `/inventory-adjustments/{id}/edit`, `/inventory-adjustments/force`; submit/approve/reject/cancel/post actions.

APIs: `GET/POST/PATCH /inventory-adjustments`, `POST /inventory-adjustments/{id}/submit|approve|reject|cancel|post`, `POST /inventory-adjustments/force`.

Required states: stock changes only when posted, approval threshold, cannot reduce on-hand below reserved, posted is final.

### 10.12 Inventory Transfers

Routes: `/inventory-transfers`, `/inventory-transfers/new`, `/inventory-transfers/{id}`, `/inventory-transfers/{id}/edit`, `/inventory-transfers/{id}/status-events`; submit/send/receive/cancel actions.

APIs: transfer list/create/update/detail plus submit/send/receive/cancel/status-events endpoints.

Required states: source/destination active and different; submit blocks insufficient source stock; variance loss has no AP/AR/revenue/expense; received/cancelled final.

### 10.13 Suppliers, Purchases, Supplier Returns

Supplier routes: `/suppliers`, `/suppliers/new`, `/suppliers/{id}`, `/suppliers/{id}/edit`, `/suppliers/{id}/payments`, `/suppliers/{id}/credits`; deactivate/reactivate actions.  
Purchase routes: `/purchase-orders`, `/purchase-orders/new`, `/purchase-orders/{id}`, `/purchase-orders/{id}/edit`, `/purchase-orders/{id}/receivings/new`, receiving detail.  
Supplier return routes: `/supplier-returns`, `/supplier-returns/new`, `/supplier-returns/{id}`, `/supplier-returns/{id}/edit`; post/cancel actions.

APIs: supplier, supplier payment/credit, purchase order, receiving, supplier return endpoints.

Required states: received purchases increase on-hand/FIFO; credit purchases increase AP; cash purchases do not; received POs cannot be cancelled; supplier returns reduce stock and AP or create supplier credit; posted returns final.

### 10.14 Invoices, Payments, Receipts, Refunds

Invoice routes: `/invoices`, `/invoices/new`, `/invoices/{id}`, `/invoices/{id}/edit`, `/invoices/{id}/print`; issue/cancel/void actions.  
Payment/receipt/refund routes: `/invoices/{id}/payments/new`, `/payments`, `/payments/{id}`, `/receipts`, `/receipts/{id}`, `/refunds/{id}`, `/payments/{id}/refunds/new`.

APIs: invoice, invoice action, invoice payment, payment, receipt, refund endpoints.

Required states: billing allocation prevents overbilling; issued invoices copy tax fields; paid invoices not directly edited; payment cannot exceed collectible balance; each payment creates one immutable receipt; corrections use refund/new payment; refund does not restore inventory unless selected.

### 10.15 AR/AP

Routes: `/accounts-receivable`, `/accounts-receivable/customers/{id}`, `/accounts-payable`, `/accounts-payable/suppliers/{id}`.

APIs: AR/AP APIs and reports.

Required states: AR reflects invoices/payments/refunds/voids; AP reflects credit purchases, supplier payments, returns, credits; branch access filters histories.

### 10.16 Expenses

Routes: `/expenses`, `/expenses/new`, `/expenses/{id}`, `/expenses/{id}/edit`, `/settings/expense-categories`; void action.

APIs: expense and expense-category endpoints.

Required states: voided expenses excluded from profit reports; edits/voids audit logged; read-only blocks create/update/void.

### 10.17 Reminders and Notifications

Reminder routes: `/reminders`, `/reminders/new`, `/reminders/{id}`, `/reminders/{id}/edit`; send/cancel actions.  
Notification routes: `/notifications`, `/notifications/{id}`, `/settings/notifications` or `/settings/notification-preferences`.

APIs: reminder, reminder delivery, notification, notification preference endpoints.

Required states: plan-enforced channels; disabled channels show required plan and are not silently downgraded; reminder sends blocked offline/read-only; delivery failures visible where documented.

### 10.18 Files

Routes/components: upload intent modal, linked files panel, `/files/{id}`, quarantined file state.

APIs: `/files/upload-intents`, `/files/complete-upload`, file metadata, download-url, soft-delete, restore, link endpoints.

Required states: private files via signed URLs; signed URLs not cached beyond expiration; uploads blocked offline/read-only; linked entity permissions and branch access apply.

### 10.19 Reports and Exports

Report routes: `/reports`, `/reports/sales`, `/reports/services`, `/reports/inventory`, `/reports/customers`, `/reports/financial`, `/reports/branch-comparison`, `/reports/advanced/{report_code}`, `/reports/exports/{job_id}`.  
Tenant export routes: `/exports`, `/exports/new`, `/exports/{id}`, `/exports/{id}/download`.

APIs: report endpoints, `POST /reports/exports`, background job status, tenant export endpoints.

Required states: branch comparison requires plan/permission; advanced reports require High plan unless overridden; export formats PDF/Excel/CSV where documented; large reports/tenant exports are async; tenant export ZIP includes documented data/attachments/manifest/README when configured; download links expire.

### 10.20 Audit Logs

Routes: `/audit-logs`, `/audit-logs/{id}`, embedded entity audit panels.

APIs: audit log endpoints.

Required states: immutable audit logs; no sensitive secrets; platform support actions attributed to platform admin actor type.

### 10.21 Settings

Routes: `/settings`, `/settings/shop-profile`, `/settings/tax`, `/settings/billing`, `/settings/notifications`, `/settings/files`, `/settings/subscription`, `/settings/data-export`, `/settings/expense-categories`.

APIs: shop profile/settings/billing, notification preferences, export, category endpoints.

Required states: invoice prefix immutable after onboarding; country/currency immutability rules; tax changes affect future invoices only; read-only blocks most settings except documented billing settings.

### 10.22 Employees, Roles, Permissions

Employee routes: `/employees`, `/employees/invitations/new`, `/employees/new`, `/employees/{id}`, `/employees/{id}/edit`, `/employees/{id}/activity`; deactivate/reactivate/reset password actions.  
Role routes: `/roles`, `/roles/new`, `/roles/{id}`, `/roles/{id}/edit`, `/roles/permissions`; deactivate role action.

APIs: employee, invitation, role, permission catalog endpoints.

Required states: last active Shop Owner protected; employee needs active role and branch assignment unless tenant-wide branch access; role changes show impact and are audited; Shop Owner role cannot lose required capabilities.

### 10.23 Background Jobs

Routes: `/background-jobs/{id}`, `/background-jobs/{id}/attempts`; cancel action.

APIs: job status, attempts, cancel endpoints.

Required states: queued/running/succeeded/failed/cancelled/dead-lettered; safe failure metadata and correlation ID only; tenant users see only authorized tenant-visible jobs.

### 10.24 Offline

Routes/states: app shell offline state, `/offline-cache/recent-records`, offline manifest, clear offline cache, global blocked-action message.

APIs: `/offline-cache/manifest`, `/offline-cache/recent-records`, `DELETE /offline-cache/current-user`.

Required states: cached recent customers/motorcycles/job orders/invoices only; read-only; user-scoped; cleared on logout; expires after 7 days; blocks all write/submit/delete/approve/upload workflows.

### 10.25 Platform Admin

Routes: `/platform/tenants`, `/platform/tenants/new`, `/platform/tenants/{id}`, `/platform/tenants/{id}/subscription`, `/platform/tenants/{id}/support-access`, `/platform/tenants/{id}/exports`, `/platform/tenants/{id}/deletion-jobs`, `/platform/audit-logs`, `/platform/plans`, `/platform/admin-users` if included by implementation.

APIs: `/platform/tenants`, subscription/read-only/suspend/support-access/export/deletion/audit/plans APIs, platform admin account APIs where documented.

Required states: platform admins are not tenant employees; no silent impersonation; write-allowed support access requires explicit reason; all tenant data access and changes audited.

---

## 11. Required Error and Blocking States

| API/Error State                          | UX Requirement                                          |
| ---------------------------------------- | ------------------------------------------------------- |
| `forbidden`                              | Show missing permission without leaking protected data. |
| `branch_access_denied`                   | Explain branch limitation.                              |
| `subscription_access_blocked`            | Show renewal/upgrade path where applicable.             |
| `plan_limit_exceeded`                    | Show current limit and required plan.                   |
| `validation_failed`                      | Show field-level errors.                                |
| `workflow_transition_blocked`            | Explain blocker and required condition.                 |
| `inventory_insufficient_available_stock` | Show requested vs available quantity.                   |
| `invoice_overpayment_blocked`            | Show remaining collectible balance.                     |
| `invoice_overbilling_blocked`            | Show remaining billable quantity/amount.                |
| `version_conflict`                       | Prompt reload/retry.                                    |
| `idempotency_conflict`                   | Explain duplicate/retry conflict safely.                |
| Offline write attempt                    | Explain offline is read-only and reconnect is required. |

---

## 12. Module Traceability

| Product Module                            | Screen Groups                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| SaaS tenancy/subscription                 | Platform Admin, tenant banners, settings subscription, exports/deletion |
| Auth/account                              | Auth screens, user menu, password flows                                 |
| Onboarding/settings                       | Onboarding, settings                                                    |
| Branches/employees/RBAC                   | Branch/settings, employees, roles, permissions                          |
| Customers/motorcycles/services            | Customer, motorcycle, service catalog                                   |
| Estimates/job orders/mechanic work        | Estimates, job orders, mechanic sessions                                |
| Inventory/FIFO/reservations               | Products, inventory, job part reservation, ledger, FIFO layers          |
| Adjustments/transfers                     | Inventory adjustments, inventory transfers                              |
| Suppliers/purchases/AP/returns            | Suppliers, purchases, supplier returns, AP                              |
| Invoices/payments/receipts/refunds/AR/tax | Invoices, payments, receipts, refunds, AR, reports, tax settings        |
| Expenses                                  | Expenses, expense categories, reports                                   |
| Reminders/notifications                   | Reminders, notifications, preferences                                   |
| Files/exports/offline                     | Files, tenant exports, report exports, offline cache                    |
| Reports/dashboard                         | Dashboard, reports, async export jobs                                   |
| Audit/jobs/observability                  | Audit logs, background jobs, safe errors/correlation IDs                |

---

## 13. Acceptance Criteria

This screen map is acceptable when:

1. Every documented product module has a mapped screen group.
2. Workflow-controlled resources use explicit action screens/modals.
3. Branch-scoped screens show branch context/filtering.
4. Every tenant lifecycle status has an access state.
5. Every role has a landing recommendation.
6. Offline UX is strictly read-only and limited to recent customers, motorcycles, job orders, and invoices.
7. Plan-limited capabilities show disabled/upgrade states without silent downgrade.
8. Financial/inventory immutability is represented through view-only/correction-only UX.
9. Export and large-report flows use background job status UX.
10. No excluded scope appears as a screen or flow.

---

## 14. Risks / Follow-Ups

| Risk / Gap                                                | Follow-Up                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| Exact visual layouts are not defined.                     | Create low-fidelity wireframes and design-system guidance. |
| Permission/action visibility needs precise mapping.       | Use `permission-matrix.md`.                                |
| Role landings are recommendations.                        | Confirm in UX wireframe review.                            |
| Platform admin account APIs may need route confirmation.  | Confirm during OpenAPI/API generation.                     |
| Report DTOs affect table/chart layouts.                   | Produce report specs/wireframes.                           |
| Branch routes may be `/branches` or `/settings/branches`. | Decide in frontend routing ADR.                            |
| Framework/component decisions affect implementation.      | Finalize frontend architecture ADR.                        |

---

## 15. Final Recommendation

Use this as the compact master UX inventory. Next UX artifacts should be:

1. Low-fidelity mobile-first wireframes for login, onboarding, dashboard, customer/motorcycle lookup, job order creation, mechanic session update, inventory lookup, payment recording, and receipt viewing.
2. Information architecture/routing ADR.
3. QA screen-state matrix for loading, empty, validation, forbidden, branch denied, subscription blocked, plan blocked, offline, conflict, and async job failure states.
