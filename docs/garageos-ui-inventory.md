## Understanding

You want a **source-aligned GarageOS UI/page inventory** that can drive frontend route planning, wireframes, component planning, QA state coverage, and backlog creation.

This inventory is based on the approved GarageOS documentation only. I am **not adding** undocumented modules, workflows, permissions, native apps, customer portal, standalone POS checkout, payroll, full accounting, offline writes, 2FA, or automatic subscription payment collection. The UX source explicitly says the screen map does not introduce new scope and must respect tenant status, permissions, branch access, plan limits, and offline restrictions. The PRD also explicitly excludes native mobile apps, offline transactional writes, full accounting, payroll, customer portal, standalone POS, automatic subscription collection, and 2FA.

---

## Documentation Alignment

GarageOS UI should be treated as a **mobile-first PWA shell over the documented `/api/v1` REST API**. API conventions require `/api/v1`, `snake_case`, session-derived tenant context, explicit workflow action endpoints, idempotency for critical writes, optimistic locking for mutable records, and auditability for critical/corrective actions.

Core UI rules:

- Backend/API/database remain authoritative; UI permission checks improve UX but do not replace authorization.
- Tenant lifecycle gates run before operational permissions.
- Branch-scoped data must respect assigned branch access or tenant-wide branch access.
- Workflow transitions must use explicit action screens/modals, not arbitrary status edits.
- Offline mode is strictly read-only.
- Issued financial records, receipts, refunds, inventory ledgers, and audit logs are view-only or correction-only in UI.

The architecture reinforces these constraints: modular monolith, tenant isolation, database-enforced invariants, ledger-first inventory, FIFO correctness, financial immutability, retry-safe jobs, mobile-first operations, and operational visibility.

---

## Global UI Architecture

### Application Shell

GarageOS should use a **single authenticated PWA shell** with role-aware and tenant-aware navigation.

| Shell Area                  | Required UI Behavior                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| Auth gate                   | Blocks unauthenticated users and routes to auth screens.                                            |
| Header/top bar              | Shows current module, branch context, notification icon, tenant status indicator, and user menu.    |
| Tenant status banner        | Shows `grace_period`, `read_only`, `suspended`, renewal, and pending-deletion warnings.             |
| Branch selector / indicator | Visible on branch-scoped screens and for users with multi-branch or tenant-wide branch access.      |
| Permission-aware navigation | Shows only accessible navigation groups; disabled actions must explain missing access where useful. |
| Offline indicator           | Always visible when offline; all writes disabled.                                                   |
| Notification area           | Internal notification indicator and notification center entry.                                      |
| User/account menu           | Profile, change password, logout, logout all.                                                       |
| Support-access marker       | Mandatory when a platform admin is in support mode; must clearly avoid silent impersonation.        |

These shell components are explicitly documented in the UX screen map.

### Navigation Model

**Mobile bottom navigation**

| Slot       | Destination                                | Notes                                                                                                   |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Dashboard  | `/dashboard`                               | Role-specific widgets and warnings.                                                                     |
| Job Orders | `/job-orders`                              | High-frequency service workflow.                                                                        |
| Customers  | `/customers`                               | Fast lookup and intake.                                                                                 |
| Inventory  | `/inventory/stock-balances` or `/products` | Stock lookup, low stock, product search.                                                                |
| More       | Secondary module menu                      | Invoices, Payments, Purchases, Suppliers, Reports, Reminders, Employees, Settings, Audit Logs, Exports. |

**Primary floating/context action**

Use one contextual CTA per screen, for example:

- Job Orders: **New Job Order**
- Customers: **Add Customer**
- Invoices: **Record Payment** when invoice is payable
- Inventory Transfers: **New Transfer**
- Purchases: **Receive Purchase**

The UX map recommends bottom navigation for high-frequency tenant operations and a secondary menu for admin/configuration modules.

---

## Role-Based UI Map

| Role            | Default Landing                            | Key Widgets / Shortcuts                                                                     | Primary Actions                                                                                      | Restricted Actions                                                                                                        |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Platform Admin  | `/platform/tenants`                        | Tenant status summary, plans, support sessions, exports, deletion jobs, platform audit logs | Create tenants, update subscriptions, manage plans, start support access, queue exports/deletion     | Must not silently impersonate tenant users; tenant data access must be audited.                                           |
| Shop Owner      | `/dashboard`                               | Renewal status, sales, jobs, AR/AP, low stock, reports, branches, employees                 | Renew/request renewal, export data, manage branches, employees, roles, settings, reports, audit logs | Plan limits still apply; operational writes blocked in `read_only`, `suspended`, `pending_deletion`, `deleted`.           |
| Manager         | `/dashboard` or `/job-orders`              | Pending jobs, mechanic productivity, approvals, inventory alerts, branch reports            | Assign employees, approve adjustments/refunds, approve corrections, monitor branch ops               | Depends on assigned permissions and branch access.                                                                        |
| Service Advisor | `/job-orders`                              | Customer lookup, motorcycle lookup, open jobs, estimates                                    | Create customer/motorcycle/job order/estimate, add notes/parts/labor, attach service files           | No financial access unless explicitly granted.                                                                            |
| Mechanic        | `/mechanic-sessions/my-jobs`               | Assigned jobs, active session, parts assigned, labor tasks                                  | Start/pause/resume/finish sessions, add repair notes/photos, mark tasks complete                     | Must not access invoices, payments, supplier balances, financial reports, or subscription settings unless custom-granted. |
| Cashier         | `/invoices` or `/payments`                 | Payable invoices, recent payments, receipts, AR                                             | Issue invoices, record partial/split payments, view/print receipts, process refunds if permitted     | Receipts immutable; refund workflow required for corrections.                                                             |
| Inventory Clerk | `/inventory/stock-balances` or `/products` | Stock lookup, low stock, transfers, receiving, adjustments                                  | Create/edit products, receive stock, request/post approved adjustments, transfers, supplier records  | Financial reports only if granted.                                                                                        |

The role landing recommendations are directly mapped in the UX documentation. The PRD defines the supported role templates and role responsibilities for Shop Owner, Manager, Service Advisor, Mechanic, Cashier, and Inventory Clerk.

---

## Navigation Structure

### Primary Tenant Navigation

| Group                 | Route Prefix                                                     | Primary Users                                                       |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| Dashboard             | `/dashboard`                                                     | Owner, Manager, authorized users                                    |
| Job Orders            | `/job-orders/*`                                                  | Owner, Manager, Service Advisor, Mechanic                           |
| Customers             | `/customers/*`                                                   | Owner, Manager, Service Advisor                                     |
| Motorcycles           | `/motorcycles/*`                                                 | Owner, Manager, Service Advisor, Mechanic read-only where permitted |
| Inventory / Products  | `/inventory/*`, `/products/*`, `/product-categories/*`           | Inventory Clerk, Manager, Owner                                     |
| Invoices / Payments   | `/invoices/*`, `/payments/*`, `/receipts/*`, `/refunds/*`        | Cashier, Manager, Owner                                             |
| Purchases / Suppliers | `/purchase-orders/*`, `/suppliers/*`, `/supplier-returns/*`      | Inventory Clerk, Manager, Owner                                     |
| Reports               | `/reports/*`                                                     | Owner, Manager, authorized users                                    |
| More / Admin          | Employees, Roles, Settings, Audit Logs, Exports, Background Jobs | Permission-gated                                                    |

The documented screen inventory already defines these route groups and primary users.

### Platform Admin Navigation

| Group                   | Route Prefix                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Tenants                 | `/platform/tenants`                                                                       |
| Plans                   | `/platform/plans`                                                                         |
| Support Access          | `/platform/tenants/{tenant_id}/support-access`                                            |
| Exports                 | `/platform/tenants/{tenant_id}/exports`                                                   |
| Deletion Jobs           | `/platform/tenants/{tenant_id}/deletion-jobs`                                             |
| Platform Audit Logs     | `/platform/audit-logs`                                                                    |
| Platform Admin Accounts | `/platform/admin-users` if implemented under documented platform-admin account management |

---

## Detailed Screen Inventory

### Authentication

#### Auth Screens

| Screen                      | Route                              | Primary users       | Required permissions     | Access rules                                            | Sections / Components                          | Actions              | States                                                         | Related APIs                                 |
| --------------------------- | ---------------------------------- | ------------------- | ------------------------ | ------------------------------------------------------- | ---------------------------------------------- | -------------------- | -------------------------------------------------------------- | -------------------------------------------- |
| Owner Signup                | `/auth/signup-owner`               | Shop Owner prospect | Public                   | Blocked if default plan/duration missing                | Signup form, duplicate warning, password rules | Submit signup        | Validation, duplicate tenant, email verification required      | `POST /auth/signup-owner`                    |
| Login                       | `/auth/login`                      | All users           | Public                   | Deactivated users blocked; rate limits apply            | Email/password, remember me, forgot password   | Login                | Invalid credentials, lockout, unverified email, blocked tenant | `POST /auth/login`                           |
| Email Verification Required | `/auth/email-verification`         | Unverified users    | Authenticated/unverified | Only resend verification and logout before verification | Verification notice, resend CTA                | Resend, logout       | Token sent, rate-limited, expired                              | `POST /auth/email-verification/resend`       |
| Email Verification Result   | `/auth/email-verification/confirm` | Users with token    | Public token             | Token single-use                                        | Result page                                    | Continue             | Expired/used/invalid token                                     | `POST /auth/email-verification/confirm`      |
| Forgot Password             | `/auth/password/forgot`            | All users           | Public                   | Rate-limited                                            | Email form                                     | Submit reset request | Account not disclosed, rate-limited                            | `POST /auth/password/forgot`                 |
| Reset Password              | `/auth/password/reset`             | Users with token    | Public token             | Token single-use and expires                            | New password form                              | Submit               | Password policy, expired token                                 | `POST /auth/password/reset`                  |
| Change Password             | `/auth/password/change`            | Authenticated users | Authenticated            | Allowed in read-only; unavailable after invalid session | Current/new password form                      | Save                 | Password policy, session revoked where applicable              | `POST /auth/password/change`                 |
| Current Session             | Internal app state                 | Authenticated users | Authenticated            | Loads tenant, branches, permissions, plan, subscription | Session loader, access resolver                | Refresh context      | Tenant blocked, read-only, warning states                      | `GET /auth/session`                          |
| Logout Confirmation         | Modal / `/auth/logout`             | Authenticated users | Authenticated            | Always allowed for valid session                        | Confirmation modal                             | Logout, logout all   | Session expired                                                | `POST /auth/logout`, `POST /auth/logout-all` |

The auth screen map is documented with required states such as invalid credentials, lockout, email not verified, deactivated user, tenant blocked by status, password policy validation, and expired/used token. The API contract defines the auth endpoints and session payload including user, tenant, permissions, branches, plan, and subscription access flags.

---

### Onboarding

#### Shop Setup Screens

| Screen                     | Route                          | Primary users | Required permissions             | Access rules                                               | Sections / Components                                   | Actions                | States                                                      | Related APIs                                      |
| -------------------------- | ------------------------------ | ------------- | -------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- | ---------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| Onboarding Gate            | `/onboarding`                  | Shop Owner    | Setup owner access               | Only during `pending_setup` or incomplete setup            | Checklist, blockers, progress                           | Continue setup         | Missing profile, branch, owner, subscription                | `GET /shop/onboarding-state`                      |
| Shop Profile Setup         | `/onboarding/shop-profile`     | Shop Owner    | `shop.update` or setup owner     | Pending setup allowed                                      | Shop name, address, contact, hours, logo                | Save                   | Required fields, invalid contact                            | `PUT /shop/profile`                               |
| Tax and Localization Setup | `/onboarding/tax-localization` | Shop Owner    | `shop.update` or setup owner     | Pending setup allowed                                      | Tax profile, tax mode, VAT, country, timezone, currency | Save                   | Invalid tax combination, immutable fields after rules apply | `PUT /shop/profile`                               |
| Invoice Prefix Setup       | `/onboarding/invoice-prefix`   | Shop Owner    | `shop.update` or setup owner     | Must be completed before invoices                          | Prefix field, format help                               | Save                   | Invalid prefix                                              | `PUT /shop/profile`                               |
| First Branch Setup         | `/onboarding/branch`           | Shop Owner    | `branches.create` or setup owner | Must create at least one active branch                     | Branch form                                             | Create branch          | Plan limit, duplicate branch, validation                    | `POST /branches`                                  |
| Owner / Role Verification  | `/onboarding/owner-check`      | Shop Owner    | Shop Owner                       | Required before completion                                 | Owner/role validation panel                             | Resolve blockers       | No active Shop Owner                                        | Session / role APIs                               |
| Complete Onboarding        | `/onboarding/complete`         | Shop Owner    | Shop Owner                       | Requires complete profile, branch, owner, plan, expiration | Completion checklist                                    | Complete onboarding    | Missing subscription or setup blockers                      | `POST /shop/complete-onboarding`                  |
| Subscription Info          | `/onboarding/subscription`     | Shop Owner    | Shop Owner                       | Pending setup / owner access                               | Plan, expiration, renewal instructions                  | View / request renewal | Missing plan/expiration                                     | `GET /auth/session`, `POST /shop/renewal-request` |

Pending setup rules allow only onboarding, profile setup, subscription information, password management, and logout for Shop Owner; operational modules remain blocked until onboarding completion.

---

### Dashboard

#### Dashboard Screens

| Screen                | Route                         | Primary users                                  | Required permissions             | Access rules                     | Sections / Components                                                | Actions                              | States                                                 | Related APIs                                      |
| --------------------- | ----------------------------- | ---------------------------------------------- | -------------------------------- | -------------------------------- | -------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------ | ------------------------------------------------- |
| Dashboard Summary     | `/dashboard`                  | Owner, Manager, authorized users               | Report/dashboard read permission | Branch-filtered where applicable | Sales, revenue, pending jobs, AR/AP, low stock, transfers, receiving | Filter branch/date, navigate widgets | Empty new tenant, branch-scoped view, read-only banner | `GET /dashboard/summary`                          |
| Revenue Chart         | `/dashboard/revenue`          | Owner, Manager, authorized users               | Report permission                | Plan/report limits apply         | Revenue chart, date/branch filters                                   | Filter                               | No data, plan-blocked advanced reports                 | `GET /dashboard/charts/revenue`                   |
| Inventory Alerts      | `/dashboard/inventory-alerts` | Owner, Manager, Inventory Clerk                | Inventory read / alert access    | Branch-scoped                    | Low-stock cards/list                                                 | Open product/branch stock            | Empty, branch denied                                   | `GET /dashboard/inventory-alerts`                 |
| Renewal Warning Panel | Component                     | Shop Owner, tenant users where warning visible | Session access                   | Grace/read-only/suspended rules  | Status banner, expiration, renewal CTA                               | Request renewal                      | Grace warning, read-only prompt, suspended screen      | `GET /auth/session`, `POST /shop/renewal-request` |

Dashboard required states include branch-scoped dashboard, multi-branch filters, plan-restricted advanced report links, grace warning, read-only banner, and empty-state dashboard.

---

### Customers

#### Customer Screens

| Screen               | Route                                  | Primary users                            | Required permissions                              | Access rules                                 | Sections / Components                                    | Actions                            | States                                              | Related APIs                       |
| -------------------- | -------------------------------------- | ---------------------------------------- | ------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------- | ---------------------------------- | --------------------------------------------------- | ---------------------------------- |
| Customer List/Search | `/customers`                           | Owner, Manager, Service Advisor          | `customers.read`                                  | Tenant-wide entity; branch history filtered  | Search, filters, customer cards/table                    | Search, open, create if allowed    | Empty, loading, soft-deleted excluded               | `GET /customers`                   |
| Create Customer      | `/customers/new`                       | Owner, Service Advisor, authorized users | `customers.create`                                | Blocked read-only/offline                    | Customer form, duplicate warning                         | Save                               | Duplicate warning, validation                       | `POST /customers`                  |
| Customer Detail      | `/customers/{customer_id}`             | Authorized users                         | `customers.read`                                  | Tenant-wide profile; branch history filtered | Profile, motorcycles, notes, history, files, audit panel | Edit, add note/tag, add motorcycle | Branch histories hidden when denied                 | `GET /customers/{id}`              |
| Edit Customer        | `/customers/{customer_id}/edit`        | Authorized users                         | `customers.update`                                | Blocked read-only/offline                    | Form, lock version, duplicate warning                    | Save                               | Version conflict, validation                        | `PATCH /customers/{id}`            |
| Customer History     | `/customers/{customer_id}/history`     | Authorized users                         | `customers.read` plus related history permissions | Branch-filtered                              | Timeline, branch/date/type filters                       | Filter, open records               | Branch denied, empty history                        | `GET /customers/{id}/history`      |
| Customer Motorcycles | `/customers/{customer_id}/motorcycles` | Authorized users                         | `motorcycles.read`                                | Tenant-wide with active customer             | Motorcycle list                                          | Add motorcycle if allowed          | No motorcycles                                      | `GET /customers/{id}/motorcycles`  |
| Merge Customers      | `/customers/merge`                     | Owner / authorized users                 | `customers.merge`                                 | High-risk, audit required                    | Survivor selector, duplicate records, reason             | Confirm merge                      | Validation, open blockers                           | `POST /customers/merge`            |
| Soft Delete Customer | Modal                                  | Owner / authorized users                 | `customers.soft_delete`                           | Blocked if operational blockers exist        | Confirmation, reason                                     | Confirm                            | Open jobs/unpaid invoices/active reminders blockers | `POST /customers/{id}/soft-delete` |
| Restore Customer     | Modal                                  | Owner / authorized users                 | `customers.restore`                               | Duplicate re-check required                  | Confirmation, duplicate check                            | Restore                            | Active duplicate conflict                           | `POST /customers/{id}/restore`     |

The UX map defines customer screens and states including duplicate warnings, soft-delete blockers, restoration duplicate checks, and branch-specific history hiding.

---

### Motorcycles

| Screen                 | Route                                           | Primary users                                       | Required permissions                    | Access rules                                              | Sections / Components                           | Actions                                | States                                           | Related APIs                                 |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------- | --------------------------------------- | --------------------------------------------------------- | ----------------------------------------------- | -------------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| Motorcycle List/Search | `/motorcycles`                                  | Owner, Manager, Service Advisor, permitted Mechanic | `motorcycles.read`                      | Tenant-wide; branch history filtered                      | Search by plate/model/customer                  | Search, open, add                      | Empty, soft-deleted excluded                     | `GET /motorcycles`                           |
| Add Motorcycle         | `/motorcycles/new`                              | Owner, Service Advisor, authorized users            | `motorcycles.create`                    | Requires active customer                                  | Motorcycle form, customer selector              | Save                                   | Duplicate plate/engine/chassis warning           | `POST /motorcycles`                          |
| Motorcycle Detail      | `/motorcycles/{motorcycle_id}`                  | Authorized users                                    | `motorcycles.read`                      | Tenant-wide profile                                       | Profile, owner/customer, service history, files | Edit, view history, attach docs/photos | Branch-filtered history                          | `GET /motorcycles/{id}`                      |
| Edit Motorcycle        | `/motorcycles/{motorcycle_id}/edit`             | Authorized users                                    | `motorcycles.update`                    | Audit reason if customer link/mileage correction requires | Form, reason field                              | Save                                   | Duplicate conflict, version conflict             | `PATCH /motorcycles/{id}`                    |
| Service History        | `/motorcycles/{motorcycle_id}/service-history`  | Authorized users                                    | Related service/job read permissions    | Branch-filtered                                           | Timeline, filters                               | Open job/invoice/estimate              | Branch denied                                    | `GET /motorcycles/{id}/service-history`      |
| Mileage Correction     | Modal / `/motorcycles/{id}/mileage-corrections` | Authorized users                                    | Motorcycle update/correction permission | Audit required                                            | Current/latest mileage, correction reason       | Submit                                 | Lower mileage requires reason                    | `POST /motorcycles/{id}/mileage-corrections` |
| Soft Delete Motorcycle | Modal                                           | Authorized users                                    | `motorcycles.soft_delete`               | Blocked by open jobs/reminders/unpaid invoices            | Confirmation                                    | Confirm                                | Blockers                                         | `POST /motorcycles/{id}/soft-delete`         |
| Restore Motorcycle     | Modal                                           | Authorized users                                    | `motorcycles.restore`                   | Linked customer must be active                            | Confirmation, duplicate re-check                | Restore                                | Customer merged/soft-deleted, duplicate conflict | `POST /motorcycles/{id}/restore`             |

Motorcycle screens and required states are documented in the UX map.

---

### Service Catalog

| Screen             | Route                         | Primary users                   | Required permissions  | Access rules                                     | Sections / Components                   | Actions                     | States                                 | Related APIs                     |
| ------------------ | ----------------------------- | ------------------------------- | --------------------- | ------------------------------------------------ | --------------------------------------- | --------------------------- | -------------------------------------- | -------------------------------- |
| Service List       | `/services`                   | Owner, Manager, Service Advisor | `services.read`       | Tenant-scoped                                    | Search/list, status filters             | Search, create              | Empty                                  | `GET /services`                  |
| Create Service     | `/services/new`               | Authorized users                | `services.create`     | Blocked read-only/offline                        | Service form, variable price disclaimer | Save                        | Required disclaimer for variable price | `POST /services`                 |
| Service Detail     | `/services/{service_id}`      | Authorized users                | `services.read`       | Historical records retain copied service details | Details, status, linked references      | Edit, deactivate/reactivate | Inactive view                          | `GET /services/{id}`             |
| Edit Service       | `/services/{service_id}/edit` | Authorized users                | `services.update`     | Lock/version handling                            | Form                                    | Save                        | Version conflict                       | `PATCH /services/{id}`           |
| Deactivate Service | Modal                         | Authorized users                | `services.deactivate` | Blocked by open workflows                        | Confirmation                            | Deactivate                  | Open job/estimate blocker              | `POST /services/{id}/deactivate` |
| Reactivate Service | Modal                         | Authorized users                | `services.reactivate` | Name uniqueness re-check                         | Confirmation                            | Reactivate                  | Duplicate active name                  | `POST /services/{id}/reactivate` |

---

### Estimates

| Screen                 | Route                           | Primary users                            | Required permissions | Access rules              | Sections / Components                             | Actions                           | States                    | Related APIs                        |
| ---------------------- | ------------------------------- | ---------------------------------------- | -------------------- | ------------------------- | ------------------------------------------------- | --------------------------------- | ------------------------- | ----------------------------------- |
| Estimate List          | `/estimates`                    | Owner, Manager, Service Advisor          | `estimates.read`     | Branch-scoped             | Filters by status/branch/date                     | Search/open/create                | Empty                     | `GET /estimates`                    |
| Create Draft Estimate  | `/estimates/new`                | Owner, Service Advisor, authorized users | `estimates.create`   | Blocked read-only/offline | Branch, customer, motorcycle, lines               | Save draft                        | Validation                | `POST /estimates`                   |
| Estimate Detail        | `/estimates/{estimate_id}`      | Authorized users                         | `estimates.read`     | Branch access required    | Header, lines, status, customer, actions, history | Present, approve, convert, cancel | Status-based actions      | `GET /estimates/{id}`               |
| Edit Draft Estimate    | `/estimates/{estimate_id}/edit` | Authorized users                         | `estimates.update`   | Draft only                | Lines, valid-until                                | Save                              | Non-draft blocked         | `PATCH /estimates/{id}`             |
| Present Estimate       | Modal                           | Authorized users                         | `estimates.present`  | Draft only                | Line summary, valid-until                         | Confirm                           | Invalid date              | `POST /estimates/{id}/present`      |
| Approve Estimate       | Modal                           | Authorized users                         | `estimates.approve`  | Presented only            | Approval method, customer name, attachment        | Confirm                           | Expired/cancelled blocked | `POST /estimates/{id}/approve`      |
| Convert Estimate       | Wizard/modal                    | Authorized users                         | `estimates.convert`  | Approved only             | Target job order selector, line review            | Convert                           | Already converted blocked | `POST /estimates/{id}/convert`      |
| Cancel Estimate        | Modal                           | Authorized users                         | `estimates.cancel`   | Allowed statuses only     | Reason                                            | Confirm                           | Final status blocked      | `POST /estimates/{id}/cancel`       |
| Estimate Status Events | `/estimates/{id}/status-events` | Authorized users                         | `estimates.read`     | Branch access required    | Timeline                                          | View                              | Empty history             | `GET /estimates/{id}/status-events` |

Estimates must not reserve inventory or affect revenue, AR, tax, FIFO, or inventory.

---

### Job Orders

| Screen                        | Route                             | Primary users                             | Required permissions                                                | Access rules                                               | Sections / Components                                                                                     | Actions                                          | States                                        | Related APIs                               |
| ----------------------------- | --------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------- | ------------------------------------------ |
| Job Order Board/List          | `/job-orders`                     | Owner, Manager, Service Advisor, Mechanic | `job_orders.read`                                                   | Branch-scoped; mechanics see assigned jobs where permitted | Kanban/list, filters, status counts                                                                       | Filter, open, create                             | Empty, branch denied                          | `GET /job-orders`                          |
| Create Job Order              | `/job-orders/new`                 | Owner, Manager, Service Advisor           | `job_orders.create`                                                 | Requires branch access; blocked read-only/offline          | Intake form, branch/customer/motorcycle, mileage, concern, advisor, mechanic, lines                       | Save                                             | Required mechanic/status rules, validation    | `POST /job-orders`                         |
| Job Order Detail              | `/job-orders/{job_order_id}`      | Authorized users                          | `job_orders.read`                                                   | Branch access required                                     | Header, customer, motorcycle, lines, parts, mechanics, sessions, files, invoice status, audit/status tabs | Edit, assign, complete, release, cancel, invoice | Status-based disabled actions                 | `GET /job-orders/{id}`                     |
| Edit Job Order                | `/job-orders/{job_order_id}/edit` | Authorized users                          | `job_orders.update`                                                 | Restricted after completion/release/cancel                 | Form, lines                                                                                               | Save                                             | Line edit restrictions                        | `PATCH /job-orders/{id}`                   |
| Add Service/Labor Line        | Modal                             | Advisor/authorized users                  | `job_orders.update`                                                 | Branch access; status must allow edit                      | Service/labor selector, price, free reason                                                                | Add                                              | Free labor reason required if zero amount     | `POST /job-orders/{id}/service-lines`      |
| Add Part Line / Reserve Stock | Modal                             | Advisor/authorized users                  | `job_orders.update` plus inventory reservation                      | Available stock required                                   | Product selector, quantity, price, reservation summary                                                    | Add/reserve                                      | Insufficient stock                            | `POST /job-orders/{id}/part-lines`         |
| Edit Job Order Line           | Modal                             | Authorized users                          | `job_orders.update`                                                 | Status/line rules                                          | Line editor                                                                                               | Save                                             | Completed/final blocked                       | `PATCH /job-orders/{id}/lines/{line_id}`   |
| Remove Job Order Line         | Modal                             | Authorized users                          | `job_orders.update`                                                 | Releases reservation where applicable                      | Confirmation                                                                                              | Remove                                           | Final status blocked                          | `DELETE /job-orders/{id}/lines/{line_id}`  |
| Assign Mechanics              | Modal                             | Manager/authorized users                  | Assignment permission / `job_orders.update`                         | Branch access                                              | Primary/additional mechanic selectors                                                                     | Save                                             | Primary required for `in_progress`            | `POST /job-orders/{id}/assign-mechanics`   |
| Change Status                 | Modal                             | Manager/Advisor where permitted           | `job_orders.change_status`                                          | Explicit transition validation                             | Transition selector, reason                                                                               | Submit                                           | Transition blocked                            | `POST /job-orders/{id}/status-transitions` |
| Complete Job Order            | Wizard/modal                      | Manager/authorized users                  | `job_orders.complete` / documented complete action                  | Requires reserved inventory rules                          | Completed lines, inventory consumption, mileage, notes                                                    | Complete                                         | FIFO/ledger conflict, missing completed lines | `POST /job-orders/{id}/complete`           |
| Release Job Order             | Modal                             | Manager/authorized users                  | `job_orders.release`; balance release requires high-risk permission | Payment/release rules                                      | Release condition, reason                                                                                 | Release                                          | Balance not allowed, unpaid invoice           | `POST /job-orders/{id}/release`            |
| Cancel Job Order              | Modal                             | Manager/authorized users                  | `job_orders.cancel`                                                 | Releases reservations if allowed                           | Reason                                                                                                    | Cancel                                           | Final status blocked                          | `POST /job-orders/{id}/cancel`             |
| Attach Job Files              | `/job-orders/{id}/files`          | Advisor, Mechanic, authorized users       | `job_orders.attach_files` / file permission                         | Upload blocked offline/read-only                           | File list/upload intent                                                                                   | Upload/view/delete where allowed                 | Quarantine, signed URL errors                 | `POST /job-orders/{id}/files`              |
| Job Status Events             | `/job-orders/{id}/status-events`  | Authorized users                          | `job_orders.read`                                                   | Branch access required                                     | Timeline                                                                                                  | View                                             | Empty                                         | `GET /job-orders/{id}/status-events`       |

Job order screens and required states include mechanic assignment, waiting-for-parts reasons, stock reservation blocking, completion inventory consumption, final release/cancel states, and restricted line edits. Critical job completion with inventory consumption requires idempotency.

---

### Mechanic Sessions

| Screen               | Route                                                  | Primary users     | Required permissions                     | Access rules                            | Sections / Components                    | Actions                          | States                              | Related APIs                                |
| -------------------- | ------------------------------------------------------ | ----------------- | ---------------------------------------- | --------------------------------------- | ---------------------------------------- | -------------------------------- | ----------------------------------- | ------------------------------------------- |
| My Assigned Jobs     | `/mechanic-sessions/my-jobs` or filtered `/job-orders` | Mechanic, Manager | `job_orders.read`, mechanic session read | Mechanics see assigned jobs             | Assigned job cards, status, parts, tasks | Open, start work                 | No assigned jobs                    | `GET /job-orders`, `GET /mechanic-sessions` |
| Start Work Session   | Modal                                                  | Mechanic          | Mechanic session create/start permission | Assigned job/session rules              | Start notes                              | Start                            | Existing unfinished session blocked | `POST /mechanic-sessions`                   |
| Active Session       | `/mechanic-sessions/{session_id}`                      | Mechanic, Manager | Mechanic session read                    | Assigned mechanic or manager permission | Timer/status, notes, job summary         | Pause, resume, finish, add notes | Active/paused states                | `GET /mechanic-sessions`                    |
| Pause Session        | Modal/action                                           | Mechanic          | Session pause permission                 | Active only                             | Confirmation                             | Pause                            | Non-active blocked                  | `POST /mechanic-sessions/{id}/pause`        |
| Resume Session       | Modal/action                                           | Mechanic          | Session resume permission                | Paused only                             | Confirmation                             | Resume                           | Non-paused blocked                  | `POST /mechanic-sessions/{id}/resume`       |
| Finish Session       | Modal/action                                           | Mechanic          | Session finish permission                | Active/paused only                      | Finish notes                             | Finish                           | Already finished blocked            | `POST /mechanic-sessions/{id}/finish`       |
| Work Session History | `/mechanic-sessions`                                   | Mechanic, Manager | Mechanic session read                    | Branch/user filtering                   | Filters, table/cards                     | Filter                           | Empty                               | `GET /mechanic-sessions`                    |

Mechanics cannot have more than one unfinished session; pause/resume must respect state; manager overrides are permission-gated.

---

### Inventory and Products

| Screen                   | Route                                | Primary users                     | Required permissions             | Access rules                                  | Sections / Components                                   | Actions                                      | States                        | Related APIs                      |
| ------------------------ | ------------------------------------ | --------------------------------- | -------------------------------- | --------------------------------------------- | ------------------------------------------------------- | -------------------------------------------- | ----------------------------- | --------------------------------- |
| Product List/Search      | `/products`                          | Inventory Clerk, Manager, Owner   | `products.read`                  | Tenant-wide product catalog                   | Search SKU/barcode/name/category                        | Search/create                                | Empty                         | `GET /products`                   |
| Create Product           | `/products/new`                      | Inventory Clerk, authorized users | `products.create`                | Blocked read-only/offline                     | Product form, category, SKU/barcode                     | Save                                         | Duplicate SKU/barcode         | `POST /products`                  |
| Product Detail           | `/products/{product_id}`             | Authorized users                  | `products.read`                  | Tenant-wide; stock branch-filtered            | Product summary, branch stock, FIFO, ledger, references | Edit, deactivate/reactivate                  | Inactive product              | `GET /products/{id}`              |
| Edit Product             | `/products/{product_id}/edit`        | Authorized users                  | `products.update`                | Lock version required                         | Product form                                            | Save                                         | Version conflict              | `PATCH /products/{id}`            |
| Product Stock            | `/products/{product_id}/stock`       | Authorized users                  | Inventory read                   | Branch access filters stock                   | Stock by branch                                         | Filter                                       | Branch denied                 | `GET /products/{id}/stock`        |
| FIFO Layers              | `/products/{product_id}/fifo-layers` | Inventory Clerk, Manager, Owner   | Inventory/FIFO read              | Branch access                                 | FIFO layer list                                         | Filter                                       | Empty                         | `GET /products/{id}/fifo-layers`  |
| Deactivate Product       | Modal                                | Authorized users                  | `products.deactivate`            | Blocked by stock/reservations/open references | Confirmation                                            | Deactivate                                   | Stock/open reference blockers | `POST /products/{id}/deactivate`  |
| Reactivate Product       | Modal                                | Authorized users                  | `products.reactivate`            | SKU/barcode uniqueness re-check               | Confirmation                                            | Reactivate                                   | Duplicate conflict            | `POST /products/{id}/reactivate`  |
| Category List            | `/product-categories`                | Inventory Clerk, Manager, Owner   | Category read/update permissions | Tenant-scoped                                 | Category list                                           | Create/edit/deactivate/reactivate            | Deactivation blockers         | `GET /product-categories`         |
| Inventory Stock Balances | `/inventory/stock-balances`          | Inventory Clerk, Manager, Owner   | Inventory read                   | Branch-scoped                                 | Stock table/cards, filters                              | Filter/open product                          | Empty, branch denied          | `GET /inventory/stock-balances`   |
| Inventory Ledger         | `/inventory/ledger`                  | Inventory Clerk, Manager, Owner   | Inventory ledger read            | Branch-scoped; immutable                      | Ledger list, filters                                    | Filter/export if permitted                   | Empty                         | `GET /inventory/ledger`           |
| Low Stock Alerts         | `/inventory/low-stock-alerts`        | Inventory Clerk, Manager, Owner   | Inventory read                   | Branch-scoped                                 | Alert list/cards                                        | Open product, receive/transfer where allowed | Empty                         | `GET /inventory/low-stock-alerts` |

Inventory UI must not allow direct stock edits; stock changes happen through receiving, reservation, adjustment, transfer, return, refund/void reversal workflows. The schema defines ledger and FIFO-related inventory transaction/status enums.

---

### Inventory Adjustments

| Screen                  | Route                                    | Primary users            | Required permissions        | Access rules                 | Sections / Components                   | Actions                               | States                                  | Related APIs                               |
| ----------------------- | ---------------------------------------- | ------------------------ | --------------------------- | ---------------------------- | --------------------------------------- | ------------------------------------- | --------------------------------------- | ------------------------------------------ |
| Adjustment List         | `/inventory-adjustments`                 | Inventory Clerk, Manager | Adjustment read             | Branch-scoped                | Filters by status/branch/date           | Open/create                           | Empty                                   | `GET /inventory-adjustments`               |
| Create Draft Adjustment | `/inventory-adjustments/new`             | Inventory Clerk          | Adjustment create/request   | Branch access                | Branch, reason, lines                   | Save draft                            | Validation                              | `POST /inventory-adjustments`              |
| Adjustment Detail       | `/inventory-adjustments/{adjustment_id}` | Inventory Clerk, Manager | Adjustment read             | Branch access                | Header, lines, status, approvals, audit | Submit, approve, reject, cancel, post | Status-based actions                    | `GET /inventory-adjustments/{id}`          |
| Edit Draft Adjustment   | `/inventory-adjustments/{id}/edit`       | Creator/authorized users | Adjustment update           | Draft only                   | Lines editor                            | Save                                  | Non-draft blocked                       | `PATCH /inventory-adjustments/{id}`        |
| Submit Adjustment       | Modal                                    | Inventory Clerk          | Adjustment submit           | Draft only                   | Summary                                 | Submit                                | Threshold approval routing              | `POST /inventory-adjustments/{id}/submit`  |
| Approve Adjustment      | Modal                                    | Manager                  | Adjustment approve          | Pending approval             | Approval summary                        | Approve                               | Already final blocked                   | `POST /inventory-adjustments/{id}/approve` |
| Reject Adjustment       | Modal                                    | Manager                  | Adjustment reject           | Pending approval             | Reason                                  | Reject                                | Reason required                         | `POST /inventory-adjustments/{id}/reject`  |
| Cancel Adjustment       | Modal                                    | Authorized users         | Adjustment cancel           | Draft/pending before posting | Confirmation                            | Cancel                                | Posted blocked                          | `POST /inventory-adjustments/{id}/cancel`  |
| Post Adjustment         | Modal                                    | Authorized users         | Adjustment post             | Approved/direct permitted    | Ledger impact summary                   | Post                                  | On-hand below reserved blocked          | `POST /inventory-adjustments/{id}/post`    |
| Force Adjustment        | `/inventory-adjustments/force`           | Highly authorized users  | Force adjustment permission | High-risk audited action     | Reason, branch, lines                   | Submit                                | Reason required, stock invariant checks | `POST /inventory-adjustments/force`        |

Stock does not change until posted, approval thresholds route through approval, and posted adjustments are final.

---

### Inventory Transfers

| Screen                 | Route                                     | Primary users            | Required permissions | Access rules                                     | Sections / Components                             | Actions                       | States                      | Related APIs                                  |
| ---------------------- | ----------------------------------------- | ------------------------ | -------------------- | ------------------------------------------------ | ------------------------------------------------- | ----------------------------- | --------------------------- | --------------------------------------------- |
| Transfer List          | `/inventory-transfers`                    | Inventory Clerk, Manager | Transfer read        | Source/destination branch access                 | Filters                                           | Open/create                   | Empty                       | `GET /inventory-transfers`                    |
| Create Draft Transfer  | `/inventory-transfers/new`                | Inventory Clerk          | Transfer create      | Source/destination branches active and different | Branch selectors, product lines                   | Save draft                    | Same branch blocked         | `POST /inventory-transfers`                   |
| Transfer Detail        | `/inventory-transfers/{transfer_id}`      | Inventory Clerk, Manager | Transfer read        | Branch access                                    | Header, lines, status, source/destination, events | Submit, send, receive, cancel | Status-based actions        | `GET /inventory-transfers/{id}`               |
| Edit Draft Transfer    | `/inventory-transfers/{id}/edit`          | Authorized users         | Transfer update      | Draft only                                       | Lines editor                                      | Save                          | Non-draft blocked           | `PATCH /inventory-transfers/{id}`             |
| Submit Transfer        | Modal                                     | Inventory Clerk          | Transfer submit      | Reserves source stock                            | Summary                                           | Submit                        | Insufficient stock          | `POST /inventory-transfers/{id}/submit`       |
| Send Transfer          | Modal                                     | Inventory Clerk          | Transfer send        | Pending only                                     | Sent quantity confirmation                        | Send                          | Quantity mismatch           | `POST /inventory-transfers/{id}/send`         |
| Receive Transfer       | Wizard/modal                              | Inventory Clerk          | Transfer receive     | In-transit only                                  | Received quantities, variance reason              | Receive                       | Variance loss, finalization | `POST /inventory-transfers/{id}/receive`      |
| Cancel Transfer        | Modal                                     | Manager/authorized users | Transfer cancel      | Pending/in-transit disposition rules             | Disposition, reason                               | Cancel                        | Final status blocked        | `POST /inventory-transfers/{id}/cancel`       |
| Transfer Status Events | `/inventory-transfers/{id}/status-events` | Authorized users         | Transfer read        | Branch access                                    | Timeline                                          | View                          | Empty                       | `GET /inventory-transfers/{id}/status-events` |

Transfer stock-affecting transitions require idempotency.

---

### Suppliers, Purchases, Supplier Returns, AP

#### Supplier Screens

| Screen              | Route                           | Primary users                    | Required permissions                                     | Access rules                                            | Sections / Components                                 | Actions                                     | States                                     | Related APIs                        |
| ------------------- | ------------------------------- | -------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- | ------------------------------------------ | ----------------------------------- |
| Supplier List       | `/suppliers`                    | Inventory Clerk, Manager, Owner  | `suppliers.read`                                         | Tenant-wide supplier entity                             | Search/list/status filter                             | Create/open                                 | Empty                                      | `GET /suppliers`                    |
| Create Supplier     | `/suppliers/new`                | Inventory Clerk/authorized users | `suppliers.create`                                       | Blocked read-only/offline                               | Supplier form                                         | Save                                        | Duplicate active name                      | `POST /suppliers`                   |
| Supplier Detail     | `/suppliers/{supplier_id}`      | Authorized users                 | `suppliers.read` plus financial permissions for balances | Supplier profile tenant-wide; histories branch-filtered | Profile, purchases, balance, payments, credits, audit | Edit, deactivate/reactivate, payment/credit | Financial sections hidden if not permitted | `GET /suppliers/{id}`               |
| Edit Supplier       | `/suppliers/{supplier_id}/edit` | Authorized users                 | `suppliers.update`                                       | Lock/version                                            | Form                                                  | Save                                        | Duplicate/version conflict                 | `PATCH /suppliers/{id}`             |
| Deactivate Supplier | Modal                           | Authorized users                 | `suppliers.deactivate`                                   | Blockers apply                                          | Confirmation                                          | Deactivate                                  | Open purchase/AP blockers                  | `POST /suppliers/{id}/deactivate`   |
| Reactivate Supplier | Modal                           | Authorized users                 | `suppliers.reactivate`                                   | Active-name uniqueness check                            | Confirmation                                          | Reactivate                                  | Duplicate active name                      | `POST /suppliers/{id}/reactivate`   |
| Supplier Payments   | `/suppliers/{id}/payments`      | Owner, Manager, authorized users | Supplier payment permissions                             | Financial access required                               | Payment list/form                                     | Create payment                              | Validation/idempotency                     | `GET/POST /suppliers/{id}/payments` |
| Supplier Credits    | `/suppliers/{id}/credits`       | Owner, Manager, authorized users | Supplier credit permission                               | Financial access required                               | Credit list/form                                      | Create credit where permitted               | Validation                                 | `GET/POST /suppliers/{id}/credits`  |

#### Purchase Screens

| Screen                | Route                                             | Primary users                    | Required permissions          | Access rules                   | Sections / Components                                | Actions                            | States                                | Related APIs                            |
| --------------------- | ------------------------------------------------- | -------------------------------- | ----------------------------- | ------------------------------ | ---------------------------------------------------- | ---------------------------------- | ------------------------------------- | --------------------------------------- |
| Purchase Order List   | `/purchase-orders`                                | Inventory Clerk, Manager, Owner  | Purchase read                 | Branch-scoped                  | Filters by branch/supplier/status/date               | Create/open                        | Empty                                 | `GET /purchase-orders`                  |
| Create Purchase Order | `/purchase-orders/new`                            | Inventory Clerk/authorized users | Purchase create               | Branch access                  | Supplier, branch, terms, product lines               | Save                               | Validation                            | `POST /purchase-orders`                 |
| Purchase Order Detail | `/purchase-orders/{purchase_order_id}`            | Authorized users                 | Purchase read                 | Branch access                  | PO header, lines, receiving status, AP impact        | Edit, order, receive, cancel/close | Status-based actions                  | `GET /purchase-orders/{id}`             |
| Edit Purchase Order   | `/purchase-orders/{id}/edit`                      | Authorized users                 | Purchase update               | Draft/order where allowed      | Lines editor                                         | Save                               | Received stock cancellation blocked   | `PATCH /purchase-orders/{id}`           |
| Receive Purchase      | `/purchase-orders/{id}/receivings/new`            | Inventory Clerk                  | Purchase receiving permission | Branch access; stock-affecting | Receiving form, costs, quantities, cash payment info | Receive                            | FIFO/AP effects, idempotency required | `POST /purchase-orders/{id}/receivings` |
| Receiving Detail      | `/purchase-orders/{id}/receivings/{receiving_id}` | Authorized users                 | Purchase read                 | Branch access                  | Posted receiving, ledger/FIFO/AP effects             | View                               | Immutable posted view                 | `GET /purchase-orders/{id}`             |

#### Supplier Return Screens

| Screen                 | Route                                | Primary users                    | Required permissions   | Access rules            | Sections / Components                          | Actions     | States                          | Related APIs                         |
| ---------------------- | ------------------------------------ | -------------------------------- | ---------------------- | ----------------------- | ---------------------------------------------- | ----------- | ------------------------------- | ------------------------------------ |
| Supplier Return List   | `/supplier-returns`                  | Inventory Clerk, Manager, Owner  | Supplier return read   | Branch-scoped           | Filters                                        | Open/create | Empty                           | `GET /supplier-returns`              |
| Create Supplier Return | `/supplier-returns/new`              | Inventory Clerk/authorized users | Supplier return create | Branch access           | Supplier, branch, reason, lines                | Save draft  | Validation                      | `POST /supplier-returns`             |
| Supplier Return Detail | `/supplier-returns/{return_id}`      | Authorized users                 | Supplier return read   | Branch access           | Header, lines, value, AP/credit effect, status | Post/cancel | Posted final                    | `GET /supplier-returns/{id}`         |
| Edit Draft Return      | `/supplier-returns/{return_id}/edit` | Authorized users                 | Supplier return update | Draft only              | Lines editor                                   | Save        | Non-draft blocked               | `PATCH /supplier-returns/{id}`       |
| Post Supplier Return   | Modal                                | Authorized users                 | Supplier return post   | Stock/AP/credit effects | Summary                                        | Post        | Idempotency, insufficient stock | `POST /supplier-returns/{id}/post`   |
| Cancel Supplier Return | Modal                                | Authorized users                 | Supplier return cancel | Draft only              | Confirmation                                   | Cancel      | Posted blocked                  | `POST /supplier-returns/{id}/cancel` |

Purchase receiving and supplier return posting are idempotent critical writes.

---

### Invoices, Payments, Receipts, Refunds, AR

#### Invoice Screens

| Screen                 | Route                         | Primary users            | Required permissions | Access rules                                           | Sections / Components                                                                      | Actions                                     | States                                | Related APIs                 |
| ---------------------- | ----------------------------- | ------------------------ | -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------- | ---------------------------- |
| Invoice List           | `/invoices`                   | Cashier, Manager, Owner  | `invoices.read`      | Branch-scoped                                          | Filters by status/date/customer/branch                                                     | Create/open                                 | Empty                                 | `GET /invoices`              |
| Create Draft Invoice   | `/invoices/new`               | Cashier/authorized users | `invoices.create`    | Branch access; job order line billing allocation rules | Job order selector, billable lines, discount, tax, due date                                | Save draft                                  | Overbilling blocked                   | `POST /invoices`             |
| Invoice Detail         | `/invoices/{invoice_id}`      | Cashier, Manager, Owner  | `invoices.read`      | Branch access                                          | Header, lines, billing allocations, status, payments, receipts, refund/void history, audit | Issue, cancel, void, refund, record payment | Status-based actions                  | `GET /invoices/{id}`         |
| Edit Draft Invoice     | `/invoices/{invoice_id}/edit` | Authorized users         | `invoices.update`    | Draft only                                             | Lines, discounts, due date                                                                 | Save                                        | Issued/paid blocked                   | `PATCH /invoices/{id}`       |
| Issue Invoice          | Modal                         | Cashier/authorized users | `invoices.issue`     | Draft/pending rules                                    | Final summary, tax, billing allocation confirmation                                        | Issue                                       | Idempotency, overbilling blocked      | `POST /invoices/{id}/issue`  |
| Cancel Invoice         | Modal                         | Authorized users         | `invoices.cancel`    | Allowed states only                                    | Reason                                                                                     | Cancel                                      | Final/paid constraints                | `POST /invoices/{id}/cancel` |
| Void Invoice           | Modal                         | Authorized users         | `invoices.void`      | Corrective action                                      | Reason, reversal summary                                                                   | Void                                        | Idempotency, inventory reversal rules | `POST /invoices/{id}/void`   |
| Invoice Printable View | `/invoices/{id}/print`        | Authorized users         | `invoices.read`      | Branch access                                          | Print layout                                                                               | Print/download                              | Read-only                             | `GET /invoices/{id}`         |

Invoice screens require billing allocation and tax state visibility; issued invoices copy tax profile/mode/VAT rate, overbilling is blocked, and paid invoices cannot be directly edited.

#### Payment, Receipt, Refund Screens

| Screen          | Route                                 | Primary users                          | Required permissions                   | Access rules                                              | Sections / Components                                               | Actions           | States                                                 | Related APIs                   |
| --------------- | ------------------------------------- | -------------------------------------- | -------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- | ----------------- | ------------------------------------------------------ | ------------------------------ |
| Record Payment  | `/invoices/{invoice_id}/payments/new` | Cashier, Manager, Owner                | `payments.create`                      | Invoice payable; branch access; blocked read-only/offline | Amount, date, method, reference, notes, remaining balance           | Record payment    | Overpayment blocked, idempotency required              | `POST /invoices/{id}/payments` |
| Payment Detail  | `/payments/{payment_id}`              | Cashier, Manager, Owner                | `payments.read`                        | Branch access                                             | Payment summary, receipt, refundable amount                         | Refund if allowed | Immutable payment fields                               | `GET /payments/{id}`           |
| Payment History | `/payments`                           | Cashier, Manager, Owner                | `payments.read`                        | Branch-scoped                                             | Filters by method/date/invoice/customer                             | Search/open       | Empty                                                  | `GET /payments`                |
| Receipt Detail  | `/receipts/{receipt_id}`              | Cashier, Manager, Owner                | `receipts.read`                        | Branch access                                             | Immutable receipt view                                              | View/print        | No edit/delete                                         | `GET /receipts/{id}`           |
| Receipt List    | `/receipts`                           | Cashier, Manager, Owner                | `receipts.read`                        | Branch-scoped                                             | Filters                                                             | Search/open       | Empty                                                  | `GET /receipts`                |
| Create Refund   | `/payments/{payment_id}/refunds/new`  | Cashier with permission, Manager/Owner | `payments.refund` or `invoices.refund` | Refundable amount rules                                   | Amount, reason, collection flags, optional inventory reversal lines | Submit refund     | Refund amount exceeds refundable, idempotency required | `POST /payments/{id}/refunds`  |
| Refund Detail   | `/refunds/{refund_id}`                | Authorized users                       | Refund read/payment read               | Branch access                                             | Refund summary, invoice recalculation, optional inventory reversal  | View audit        | Immutable posted refund                                | `GET /refunds/{id}`            |

Payment and refund API validation requires payment amount > 0, not exceeding invoice remaining collectible balance, no payments on draft/cancelled/voided/refunded invoices, and each payment creates exactly one receipt. Receipts expose no update/delete endpoints. The UX map requires payment corrections through refund plus new payment, not direct edit.

#### AR / AP Screens

| Screen                      | Route                                          | Primary users                    | Required permissions                          | Access rules                                          | Sections / Components                     | Actions                            | States                                     | Related APIs      |
| --------------------------- | ---------------------------------------------- | -------------------------------- | --------------------------------------------- | ----------------------------------------------------- | ----------------------------------------- | ---------------------------------- | ------------------------------------------ | ----------------- |
| Accounts Receivable Summary | `/accounts-receivable`                         | Cashier, Manager, Owner          | AR/report permission                          | Branch-scoped                                         | Customer balances, invoices, aging/filter | Filter/open invoice/customer       | Empty                                      | AR APIs / reports |
| Customer AR Detail          | `/accounts-receivable/customers/{customer_id}` | Cashier, Manager, Owner          | AR/report permission                          | Customer tenant-wide; invoice history branch-filtered | Balance history                           | Open invoice/payment               | Branch-filtered gaps                       | AR APIs / reports |
| Accounts Payable Summary    | `/accounts-payable`                            | Manager, Owner, authorized users | AP/report permission                          | Branch-scoped                                         | Supplier balances, purchases, credits     | Filter/open supplier               | Empty                                      | AP APIs / reports |
| Supplier AP Detail          | `/accounts-payable/suppliers/{supplier_id}`    | Manager, Owner, authorized users | AP/report permission or supplier payment read | Supplier tenant-wide; histories branch-filtered       | Payable/payment/credit history            | Record supplier payment if allowed | Hidden financial sections if not permitted | AP APIs / reports |

---

### Expenses

| Screen             | Route                          | Primary users                    | Required permissions         | Access rules                              | Sections / Components                          | Actions                | States                 | Related APIs               |
| ------------------ | ------------------------------ | -------------------------------- | ---------------------------- | ----------------------------------------- | ---------------------------------------------- | ---------------------- | ---------------------- | -------------------------- |
| Expense List       | `/expenses`                    | Owner, Manager, authorized users | Expenses read                | Branch-scoped                             | Filters by branch/category/date/status         | Create/open            | Empty                  | `GET /expenses`            |
| Create Expense     | `/expenses/new`                | Authorized users                 | Expenses create              | Blocked read-only/offline                 | Branch, category, date, payment method, amount | Save                   | Validation             | `POST /expenses`           |
| Expense Detail     | `/expenses/{expense_id}`       | Authorized users                 | Expenses read                | Branch access                             | Summary, audit, report inclusion               | Edit, void             | Voided state           | `GET /expenses/{id}`       |
| Edit Expense       | `/expenses/{expense_id}/edit`  | Authorized users                 | Expenses update              | Allowed fields only; audit where required | Form, reason                                   | Save                   | Version conflict       | `PATCH /expenses/{id}`     |
| Void Expense       | Modal                          | Authorized users                 | Expenses void                | Corrective action                         | Reason                                         | Void                   | Already voided blocked | `POST /expenses/{id}/void` |
| Expense Categories | `/settings/expense-categories` | Owner/authorized users           | Expense category permissions | Tenant-scoped                             | Category list/form                             | Create/edit/deactivate | In-use blockers        | Expense category APIs      |

Read-only tenant status blocks expense create/update/void, and expense edits/voids must be audit logged.

---

### Reminders and Notifications

#### Reminder Screens

| Screen          | Route                      | Primary users                   | Required permissions | Access rules                                        | Sections / Components                            | Actions            | States                                      | Related APIs                  |
| --------------- | -------------------------- | ------------------------------- | -------------------- | --------------------------------------------------- | ------------------------------------------------ | ------------------ | ------------------------------------------- | ----------------------------- |
| Reminder List   | `/reminders`               | Owner, Manager, Service Advisor | Reminder read        | Tenant/branch context as applicable                 | Filters by status/channel/date/customer          | Create/open        | Empty                                       | `GET /reminders`              |
| Create Reminder | `/reminders/new`           | Authorized users                | Reminder create      | Plan channel enforcement; blocked read-only/offline | Customer, motorcycle, channel, date/mileage/type | Save               | Plan channel disabled                       | `POST /reminders`             |
| Reminder Detail | `/reminders/{reminder_id}` | Authorized users                | Reminder read        | Tenant/branch context                               | Reminder details, delivery attempts              | Edit, cancel, send | Delivery failure, sent/final                | `GET /reminders/{id}`         |
| Edit Reminder   | `/reminders/{id}/edit`     | Authorized users                | Reminder update      | Allowed statuses only                               | Form                                             | Save               | Final/sent constraints                      | `PATCH /reminders/{id}`       |
| Send Reminder   | Modal                      | Authorized users                | Reminder send        | Plan channel enforcement                            | Channel confirmation                             | Send               | Disabled channel, read-only/offline blocked | `POST /reminders/{id}/send`   |
| Cancel Reminder | Modal                      | Authorized users                | Reminder cancel      | Allowed statuses only                               | Reason                                           | Cancel             | Already sent/cancelled blocked              | `POST /reminders/{id}/cancel` |

Plan-disabled channels must show the required plan level and must not silently downgrade.

#### Internal Notification Screens

| Screen                   | Route                                | Primary users    | Required permissions           | Access rules                        | Sections / Components               | Actions            | States                                | Related APIs                 |
| ------------------------ | ------------------------------------ | ---------------- | ------------------------------ | ----------------------------------- | ----------------------------------- | ------------------ | ------------------------------------- | ---------------------------- |
| Notification Center      | `/notifications`                     | Tenant users     | Notification read              | User-scoped/tenant-scoped           | Notification list, unread/read tabs | Mark read/dismiss  | Empty, delivery failure               | `GET /notifications`         |
| Notification Preferences | `/settings/notification-preferences` | Authorized users | Notification preference update | Plan channel enforcement            | Channel toggles                     | Save               | Disabled channel prompt               | Notification preference APIs |
| Notification Detail      | `/notifications/{notification_id}`   | Tenant users     | Notification read              | Linked record access still enforced | Detail, linked entity               | Open linked record | Linked record forbidden/branch denied | `GET /notifications/{id}`    |

---

### Files

| Screen                 | Route              | Primary users    | Required permissions                   | Access rules                                             | Sections / Components                      | Actions                               | States                                        | Related APIs                 |
| ---------------------- | ------------------ | ---------------- | -------------------------------------- | -------------------------------------------------------- | ------------------------------------------ | ------------------------------------- | --------------------------------------------- | ---------------------------- |
| File Upload Intent     | Contextual modal   | Authorized users | File upload / entity attach permission | Blocked offline/read-only; branch/entity access required | File picker, metadata, upload intent state | Request upload URL                    | File validation, provider failure             | `POST /files/upload-intents` |
| Linked Files Panel     | Embedded           | Authorized users | Entity read + file read                | Entity access required                                   | File list, status badges                   | View, soft delete, restore if allowed | Quarantined, soft-deleted, signed URL expired | File APIs                    |
| File Detail            | `/files/{file_id}` | Authorized users | File read                              | Tenant/branch/entity authorization                       | Metadata, security status, links           | Get signed URL, restore, soft delete  | Quarantined no download                       | File APIs                    |
| Quarantined File State | File detail state  | Authorized users | File read                              | No download                                              | Quarantine banner                          | None                                  | Safe failure                                  | File APIs                    |

Files must be private and accessed through signed URLs; uploads are blocked offline and in read-only tenant status.

---

### Reports

| Screen                 | Route                             | Primary users                                   | Required permissions                       | Access rules                               | Sections / Components                                        | Actions          | States                          | Related APIs                                         |
| ---------------------- | --------------------------------- | ----------------------------------------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------ | ---------------- | ------------------------------- | ---------------------------------------------------- |
| Reports Hub            | `/reports`                        | Owner, Manager, authorized users                | Report read                                | Plan/report access applies                 | Report category cards                                        | Open report      | Plan-blocked sections           | Report APIs                                          |
| Sales Reports          | `/reports/sales`                  | Owner, Manager, authorized users                | Sales report permission                    | Branch-scoped                              | Tables/charts, filters                                       | Filter/export    | Empty, async export             | `GET /reports/sales`                                 |
| Service Reports        | `/reports/services`               | Owner, Manager, authorized users                | Service report permission                  | Branch-scoped                              | Service/mechanic metrics                                     | Filter/export    | Empty                           | `GET /reports/services`                              |
| Inventory Reports      | `/reports/inventory`              | Owner, Manager, Inventory Clerk where permitted | Inventory report permission                | Branch-scoped                              | Stock/FIFO/movement/transfer/adjustment views                | Filter/export    | Empty                           | `GET /reports/inventory`                             |
| Customer Reports       | `/reports/customers`              | Owner, Manager, authorized users                | Customer report permission                 | Branch/customer filters                    | Customer activity/reminder views                             | Filter/export    | Empty                           | `GET /reports/customers`                             |
| Financial Reports      | `/reports/financial`              | Owner, Manager, authorized users                | Financial report permission                | Mechanics restricted unless custom-granted | Revenue, expenses, gross profit, COGS, AR/AP, refunds, voids | Filter/export    | Plan/permission blocked         | `GET /reports/financial`                             |
| Branch Comparison      | `/reports/branch-comparison`      | Owner, Manager                                  | Branch comparison report permission + plan | Requires Mid/High unless override          | Branch comparison charts/tables                              | Filter/export    | Plan blocked                    | `GET /reports/branch-comparison`                     |
| Advanced Report Detail | `/reports/advanced/{report_code}` | Owner, authorized users                         | Advanced report permission + plan          | Requires High unless override              | Report-specific table/chart                                  | Filter/export    | Plan blocked                    | `GET /reports/advanced/{report_code}`                |
| Report Export Job      | `/reports/exports/{job_id}`       | Authorized users                                | `reports.export` or context-specific       | Async job visibility                       | Job status, download when complete                           | Refresh/download | Queued/running/failed/succeeded | `POST /reports/exports`, `GET /background-jobs/{id}` |

Report exports can be PDF, Excel, or CSV, and large reports should use async job status UI.

---

### Tenant Exports

| Screen                 | Route                      | Primary users | Required permissions | Access rules                                                  | Sections / Components                                    | Actions          | States                             | Related APIs                     |
| ---------------------- | -------------------------- | ------------- | -------------------- | ------------------------------------------------------------- | -------------------------------------------------------- | ---------------- | ---------------------------------- | -------------------------------- |
| Export List            | `/exports`                 | Shop Owner    | `shop.export_data`   | Tenant status rules; owner export exceptions                  | Export job list                                          | Start new export | Empty, read-only allowed for owner | `GET /exports`                   |
| Create Tenant Export   | `/exports/new`             | Shop Owner    | `shop.export_data`   | Blocked in pending_deletion unless emergency extension; async | Include attachments, include soft-deleted, metadata-only | Queue export     | Validation, async queued           | `POST /exports`                  |
| Export Detail / Status | `/exports/{export_job_id}` | Shop Owner    | `shop.export_data`   | Tenant-visible job                                            | Status, attempts summary if allowed, safe error          | Refresh          | Queued/running/succeeded/failed    | `GET /exports/{id}`              |
| Export Download        | `/exports/{id}/download`   | Shop Owner    | `shop.export_data`   | Signed URL only when complete                                 | Download panel                                           | Download ZIP     | Expired link, failed job           | `GET /exports/{id}/download-url` |

Tenant export output must include ZIP, CSV, JSON, attachment manifest, audit log export, README, and attachments directory when binaries are included; download links expire after 7 days.

---

### Audit Logs

| Screen             | Route                        | Primary users           | Required permissions                                  | Access rules                | Sections / Components                                             | Actions     | States                    | Related APIs                    |
| ------------------ | ---------------------------- | ----------------------- | ----------------------------------------------------- | --------------------------- | ----------------------------------------------------------------- | ----------- | ------------------------- | ------------------------------- |
| Audit Log List     | `/audit-logs`                | Owner, authorized users | `audit_logs.read`                                     | Tenant/branch filters       | Filters by action/entity/actor/branch/date                        | Search/open | Empty                     | `GET /audit-logs`               |
| Audit Log Detail   | `/audit-logs/{audit_log_id}` | Owner, authorized users | `audit_logs.read`                                     | Sensitive payloads redacted | Actor, action, entity, timestamps, previous/new values where safe | View        | Redacted sensitive values | `GET /audit-logs/{id}`          |
| Entity Audit Panel | Embedded in detail screens   | Authorized users        | `audit_logs.read` or entity-specific audit visibility | Entity access required      | Audit timeline                                                    | View        | Empty                     | `GET /audit-logs?entity_id=...` |

Audit logs must not expose sensitive payloads such as passwords, tokens, card details, or unnecessary sensitive free text.

---

### Settings

| Screen                   | Route                     | Primary users                | Required permissions               | Access rules                                        | Sections / Components               | Actions                | States                           | Related APIs                                      |
| ------------------------ | ------------------------- | ---------------------------- | ---------------------------------- | --------------------------------------------------- | ----------------------------------- | ---------------------- | -------------------------------- | ------------------------------------------------- |
| Settings Hub             | `/settings`               | Owner, authorized users      | Permission-gated                   | Hidden/disabled per permission                      | Settings cards                      | Navigate               | Missing permission               | Settings APIs                                     |
| Shop Profile Settings    | `/settings/shop-profile`  | Owner, authorized users      | `shop.update` / `settings.update`  | Blocked read-only except billing-related exceptions | Shop profile form                   | Save                   | Validation                       | `PATCH /shop/settings` / `PUT /shop/profile`      |
| Tax Settings             | `/settings/tax`           | Owner, authorized users      | `settings.update`                  | Future invoices only                                | Tax profile/mode/VAT                | Save                   | Invalid combination              | `PATCH /shop/settings`                            |
| Billing Settings         | `/settings/billing`       | Shop Owner, authorized users | `shop.billing.update`              | Allowed in read-only where specified                | Billing fields                      | Save                   | Validation                       | `PATCH /shop/billing-settings`                    |
| Notification Preferences | `/settings/notifications` | Authorized users             | `notifications.update_preferences` | Plan channel enforcement                            | Channel toggles                     | Save                   | Plan disabled                    | Notification APIs                                 |
| File Upload Settings     | `/settings/files`         | Authorized users             | `settings.update`                  | Blocked read-only                                   | Upload settings                     | Save                   | Validation                       | File/settings APIs                                |
| Subscription Info        | `/settings/subscription`  | Shop Owner                   | Shop Owner                         | Owner renewal access in lifecycle states            | Plan, expiration, lifecycle warning | Submit renewal request | Grace/read-only/suspended states | `GET /auth/session`, `POST /shop/renewal-request` |
| Data Export Settings     | `/settings/data-export`   | Shop Owner                   | `shop.export_data`                 | Tenant status rules                                 | Export options                      | Queue export           | Async job                        | `POST /exports`                                   |

Settings required states include invoice prefix immutability after onboarding, country/currency immutability rules, future-only tax changes, and read-only blocking for most settings except billing-related settings.

---

### Employees, Roles, Permissions

| Screen                  | Route                           | Primary users              | Required permissions                               | Access rules                                         | Sections / Components                      | Actions                                     | States                                | Related APIs                          |
| ----------------------- | ------------------------------- | -------------------------- | -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------- | ------------------------------------- | ------------------------------------- |
| Employee List           | `/employees`                    | Owner, authorized managers | `users.read`                                       | Tenant-scoped; branch filters                        | Search/filter by status/branch/role        | Invite/create/open                          | Empty                                 | `GET /employees`                      |
| Invite Employee         | `/employees/invitations/new`    | Owner, authorized managers | `users.create`                                     | Invitation scoped to one tenant                      | Email, role, branch assignment             | Send invite                                 | Duplicate active email, validation    | `POST /employees/invitations`         |
| Create Employee         | `/employees/new`                | Owner, authorized managers | `users.create`                                     | No public self-registration into tenant              | Employee form, setup/reset link            | Create                                      | Validation                            | `POST /employees`                     |
| Employee Detail         | `/employees/{employee_id}`      | Owner, authorized managers | `users.read`                                       | Tenant-scoped                                        | Profile, roles, branches, status, activity | Edit, deactivate/reactivate, reset password | Inactive state                        | `GET /employees/{id}`                 |
| Edit Employee           | `/employees/{employee_id}/edit` | Owner, authorized managers | `users.update`, role/branch assignment permissions | Last owner protection                                | Profile, roles, branch access              | Save                                        | Last owner demotion blocked           | `PATCH /employees/{id}`               |
| Deactivate Employee     | Modal                           | Owner, authorized managers | `users.deactivate`                                 | Last active owner cannot be deactivated              | Confirmation                               | Deactivate, revoke sessions                 | Open jobs flagged                     | `POST /employees/{id}/deactivate`     |
| Reactivate Employee     | Modal                           | Owner, authorized managers | User reactivate permission                         | Requires valid role/branch/email/verification checks | Confirmation                               | Reactivate                                  | Missing role/branch/email conflict    | `POST /employees/{id}/reactivate`     |
| Reset Employee Password | Modal                           | Owner, authorized managers | `users.reset_password`                             | Sends reset link; no plaintext password              | Confirmation                               | Send reset                                  | Rate/validation                       | `POST /employees/{id}/password-reset` |
| Employee Activity       | `/employees/{id}/activity`      | Owner, authorized managers | Activity/audit permission                          | Tenant-scoped                                        | Activity timeline                          | Filter                                      | Empty                                 | `GET /employees/{id}/activity`        |
| Role List               | `/roles`                        | Owner, authorized managers | `roles.read`                                       | Tenant-scoped                                        | Seeded/custom roles                        | Create/open                                 | Empty                                 | `GET /roles`                          |
| Create Role             | `/roles/new`                    | Owner, authorized managers | `roles.create`                                     | Custom tenant role                                   | Name, permission selector                  | Save                                        | Duplicate role name                   | `POST /roles`                         |
| Role Detail             | `/roles/{role_id}`              | Owner, authorized managers | `roles.read`                                       | Tenant-scoped                                        | Role permissions, assigned users           | Edit/deactivate                             | Seeded role warnings                  | `GET /roles/{id}`                     |
| Edit Role               | `/roles/{role_id}/edit`         | Owner, authorized managers | `roles.update`                                     | Shop Owner capabilities protected                    | Permission matrix, impact warning          | Save                                        | Last owner capability removal blocked | `PATCH /roles/{id}`                   |
| Deactivate Role         | Modal                           | Owner, authorized managers | `roles.deactivate`                                 | Blocked if active user depends solely on role        | Confirmation                               | Deactivate                                  | Sole-role dependency blocked          | `POST /roles/{id}/deactivate`         |
| Permission Catalog      | `/roles/permissions`            | Owner, authorized managers | `permissions.read`                                 | Read-only                                            | Permission list/grouping                   | View                                        | N/A                                   | `GET /roles/permissions`              |

The permission matrix states that Shop Owner has all tenant permissions, platform permissions are not assignable to tenant roles, non-owner seeded roles are eligible mappings rather than final default grants, permissions are additive, branch access is separate from permission access, tenant lifecycle gates can override permissions, and plan limits can override permissions.

---

### Background Jobs

| Screen            | Route                                | Primary users                             | Required permissions        | Access rules                                         | Sections / Components                                          | Actions                    | States                                                | Related APIs                         |
| ----------------- | ------------------------------------ | ----------------------------------------- | --------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- | -------------------------- | ----------------------------------------------------- | ------------------------------------ |
| Job Status Detail | `/background-jobs/{job_id}`          | Authorized tenant users / platform admins | Context-specific            | Tenant users only see tenant-visible authorized jobs | Status, timestamps, attempts count, safe error, correlation ID | Refresh, cancel if allowed | Queued/running/succeeded/failed/cancelled/dead-letter | `GET /background-jobs/{id}`          |
| Job Attempts      | `/background-jobs/{job_id}/attempts` | Platform/support only                     | Platform/support permission | Sanitized errors only                                | Attempts list                                                  | View                       | Redacted payloads                                     | `GET /background-jobs/{id}/attempts` |
| Cancel Job        | Modal                                | Authorized users                          | Context-specific            | Only cancellable jobs                                | Confirmation                                                   | Cancel                     | Not cancellable                                       | `POST /background-jobs/{id}/cancel`  |

Background job API responses expose job type, status, attempt count, timestamps, last error, and correlation ID.

---

### Offline Cache

| Screen                         | Route                           | Primary users       | Required permissions         | Access rules               | Sections / Components                              | Actions               | States                                 | Related APIs                         |
| ------------------------------ | ------------------------------- | ------------------- | ---------------------------- | -------------------------- | -------------------------------------------------- | --------------------- | -------------------------------------- | ------------------------------------ |
| Offline App Shell              | App shell state                 | Authenticated users | Authenticated cached session | No writes                  | Cached navigation shell                            | Navigate cached views | Offline indicator                      | Service worker / PWA shell           |
| Offline Recent Records         | `/offline-cache/recent-records` | Authenticated users | Authenticated                | Recent records only        | Cached customer/motorcycle/job order/invoice cards | View only             | Stale/expired cache                    | `GET /offline-cache/recent-records`  |
| Offline Manifest               | Internal state                  | Authenticated users | Authenticated                | User-scoped                | Cache manifest                                     | Refresh when online   | Expired manifest                       | `GET /offline-cache/manifest`        |
| Clear Offline Cache            | Settings action                 | Authenticated users | Authenticated                | User-scoped                | Confirmation                                       | Clear cache           | Cleared on logout/session invalidation | `DELETE /offline-cache/current-user` |
| Offline Blocked Action Message | Global component                | Authenticated users | N/A                          | All writes blocked offline | Banner/toast/dialog                                | Retry when online     | Offline write attempt                  | UX state only                        |

Offline cache includes only recent customers, motorcycles, job orders, and invoices; it must not support offline create/edit/submission/deletion/approval/sync conflict resolution.

---

### Platform Administration

| Screen                   | Route                                   | Primary users  | Required permissions                                | Access rules                  | Sections / Components                                             | Actions                                    | States                                | Related APIs                                          |
| ------------------------ | --------------------------------------- | -------------- | --------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------- | ------------------------------------------ | ------------------------------------- | ----------------------------------------------------- |
| Platform Tenant List     | `/platform/tenants`                     | Platform Admin | `platform.tenants.read`                             | Platform admin only           | Tenant search/filter/status table                                 | Search, create tenant                      | Empty/loading                         | `GET /platform/tenants`                               |
| Create Tenant            | `/platform/tenants/new`                 | Platform Admin | `platform.tenants.create`                           | Platform admin only           | Business info, plan, expiration, owner invite/create              | Create                                     | Duplicate tenant approval, validation | `POST /platform/tenants`                              |
| Tenant Admin Detail      | `/platform/tenants/{tenant_id}`         | Platform Admin | `platform.tenants.read`                             | Platform admin only           | Metadata, subscription, lifecycle, export/deletion/support panels | Update, manage subscription, export/delete | Tenant status states                  | `GET /platform/tenants/{id}`                          |
| Subscription Management  | `/platform/tenants/{id}/subscription`   | Platform Admin | `platform.subscriptions.update`                     | Reason required               | Plan, expiration, override reason                                 | Save                                       | Audit required                        | `POST /platform/tenants/{id}/subscription`            |
| Apply Read-Only Override | Modal                                   | Platform Admin | `platform.subscriptions.update`                     | Reason/optional expiry        | Override form                                                     | Apply                                      | Audit required                        | `POST /platform/tenants/{id}/read-only`               |
| Suspend Tenant           | Modal                                   | Platform Admin | `platform.subscriptions.update`                     | Reason/optional expiry        | Suspension form                                                   | Suspend                                    | Audit required                        | `POST /platform/tenants/{id}/suspend`                 |
| Support Access Session   | `/platform/tenants/{id}/support-access` | Platform Admin | `platform.support_access`                           | Reason, mode, expiry required | Read-only/write-allowed selector, reason, expiry                  | Start session                              | Write mode explicit                   | `POST /platform/tenants/{id}/support-access-sessions` |
| End Support Access       | Modal                                   | Platform Admin | `platform.support_access`                           | Active session only           | Confirmation                                                      | End                                        | Already ended                         | `POST /platform/support-access-sessions/{id}/end`     |
| Tenant Export Trigger    | `/platform/tenants/{id}/exports`        | Platform Admin | `platform.tenants.update`                           | Platform admin only           | Export options                                                    | Queue export                               | Async status                          | `POST /platform/tenants/{id}/exports`                 |
| Tenant Deletion Job      | `/platform/tenants/{id}/deletion-jobs`  | Platform Admin | `platform.tenants.update`                           | Eligibility required          | Deletion eligibility, reason                                      | Queue deletion                             | Not eligible blocked                  | `POST /platform/tenants/{id}/deletion-jobs`           |
| Platform Audit Logs      | `/platform/audit-logs`                  | Platform Admin | `platform.audit_logs.read`                          | Platform admin only           | Filters actor/action/tenant/date                                  | Search/open                                | Empty                                 | `GET /platform/audit-logs`                            |
| Plan Management          | `/platform/plans`                       | Platform Admin | `platform.plans.update` or read policy              | Platform admin only           | Basic/Mid/High plans, limits, default plan                        | Update limits/default                      | Audit required                        | `GET/PATCH /platform/plans`                           |
| Platform Admin Accounts  | `/platform/admin-users`                 | Platform Admin | Platform admin account permission where implemented | Platform admin only           | Admin list/detail/form                                            | Create/update/deactivate                   | API details need OpenAPI confirmation | Platform admin account APIs if included               |

Platform admins must be able to create tenants, manage subscription status, configure plans, trigger read-only/suspension/export/deletion, view platform audit logs, and access tenant data only through audited support access. Support access requires tenant, platform admin, reason, access mode, timestamps/expiry, and audit logging; write access must be explicit and reasoned.

---

## Mobile-First Layout Recommendations

### Global Mobile Pattern

| Workflow                     | Mobile Layout                              | CTA Placement                                     | Form Grouping                                                   | List/Detail Behavior                       | Desktop/Tablet Behavior               |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------ | ------------------------------------- |
| Login / auth                 | Single-column centered form                | Full-width bottom button                          | Credentials, session option, recovery links                     | N/A                                        | Centered card                         |
| Onboarding                   | Stepper/checklist with one task per screen | Sticky bottom **Continue/Save**                   | Profile, tax/localization, invoice prefix, branch, completion   | Gate shows blockers                        | Side stepper + form panel             |
| Customer / motorcycle lookup | Search-first page with recent records      | Floating **Add Customer** / **Add Motorcycle**    | Minimal filters first                                           | Tap item opens detail; history in tabs     | Split list/detail optional            |
| Job order creation           | Wizard or segmented long form              | Sticky **Save Job Order**                         | Branch/customer/motorcycle, concern, lines, mechanic assignment | Detail uses status/action header           | Wider layout shows summary side panel |
| Mechanic session             | Task-focused cards                         | Large touch buttons for Start/Pause/Resume/Finish | Notes after primary action                                      | Active session top-pinned                  | Side panel for job context            |
| Inventory lookup             | Search + branch filter                     | Contextual **New Transfer/Adjustment**            | Product/category/branch filters                                 | Stock detail tabs for balances/FIFO/ledger | Table-first with drawer detail        |
| Purchase receiving           | Step-by-step receiving form                | Sticky **Receive Stock**                          | Supplier/PO, quantities, costs, payment terms                   | Receiving detail immutable after post      | Spreadsheet-like table                |
| Invoice / payment            | Invoice detail with balance summary        | Sticky **Record Payment** when payable            | Amount/date/method/reference/notes                              | Receipt opens as immutable printable view  | Invoice + payment side panel          |
| Refund                       | Confirmation-heavy corrective form         | Sticky **Submit Refund**                          | Amount, reason, collection behavior, inventory reversal         | Shows recalculated invoice/payment         | Wider review summary                  |
| Reports / exports            | Filter drawer + summary cards              | Export action in top/right or sticky bottom       | Date/branch/report filters                                      | Async export status page                   | Tables/charts visible together        |

The QA plan emphasizes mobile usability at a 360px minimum width, touch-friendly workflows, blocked-action prompts, offline read-only behavior, and role-appropriate screens.

---

## Cross-Cutting UI Components

| Component                     | Used By                                                                   | Required Behavior                                                           |
| ----------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Status badge                  | All workflow resources                                                    | Uses documented enums from schema.                                          |
| Branch selector / branch chip | Branch-scoped records                                                     | Shows active branch context and prevents cross-branch confusion.            |
| Tenant status banner          | Global shell/dashboard/settings                                           | Explains grace, read-only, suspended, pending-deletion, deleted states.     |
| Plan limit prompt             | Branches, notifications, reports                                          | Shows current limit and required plan.                                      |
| Permission blocked state      | All protected screens/actions                                             | Shows safe missing-permission message without leaking data.                 |
| Workflow action modal         | Estimates, job orders, adjustments, transfers, invoices, refunds, returns | Shows summary, reason fields, confirmation, validation blockers.            |
| Status history timeline       | Estimates, job orders, transfers, adjustments, background jobs            | Shows actor, timestamp, from/to status, reason.                             |
| Audit panel                   | Critical records                                                          | Shows sanitized actor/action/previous/new values.                           |
| Read-only detail state        | Read-only tenant/offline                                                  | Disables write actions and explains why.                                    |
| Async job status card         | Exports, reports, background jobs                                         | Queued/running/succeeded/failed/dead-letter, safe error and correlation ID. |

The UX map defines these standard screen patterns and required blocking states, including forbidden, branch access denied, subscription blocked, plan limit exceeded, validation failed, workflow transition blocked, inventory insufficient stock, invoice overpayment/overbilling blocked, version conflict, idempotency conflict, and offline write attempt.

---

## Permission and Tenant Status Behavior

### Tenant Status UI Matrix

| Tenant status      | UI behavior                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pending_setup`    | Route all tenant users to setup gates. Shop Owner can access onboarding, profile setup, subscription info, password management, logout. Operational nav hidden/disabled. |
| `active`           | Normal permission/branch/plan-based UI.                                                                                                                                  |
| `grace_period`     | Full operational UI still enabled based on permissions, with renewal warning after login and dashboard warning.                                                          |
| `read_only`        | Read/search/report/export/renew/password/logout only. Disable operational writes and show renewal prompt.                                                                |
| `suspended`        | Shop Owner sees renewal/export-only suspended screen. Non-owner users blocked from app. Platform support access retained.                                                |
| `pending_deletion` | Tenant operational access blocked. Export disabled unless platform admin grants emergency extension.                                                                     |
| `deleted`          | No tenant operational access; show tenant unavailable/account inactive message.                                                                                          |

The PRD defines the lifecycle timeline from `active` through `deleted`, including exact day windows and tenant-timezone calculation. Read-only and suspended rules explicitly allow only limited actions and block operational writes.

### Access Guard Order

For every screen/action:

1. Authenticated session and verified email.
2. Tenant status gate.
3. Platform support access context where applicable.
4. Required permission.
5. Branch access.
6. Plan capability.
7. Resource workflow/status validation.
8. Idempotency/lock handling for critical writes.

The permission matrix documents global gates for authentication, tenant ownership, tenant status, branch access, permissions, plan capability, support access, and offline mode. The API contract requires branch-scoped access to pass tenant membership, required permission, and branch assignment or tenant-wide access.

---

## Risks / Open Questions

| Risk / Open Question                                                                     | Impact                                                        | Recommendation                                                                    |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Exact visual layouts are not finalized.                                                  | Designers may interpret navigation and density differently.   | Produce low-fidelity wireframes for high-frequency workflows first.               |
| Branch management route may be `/branches` or `/settings/branches`.                      | Route consistency affects navigation and breadcrumbs.         | Decide in frontend routing ADR.                                                   |
| Non-owner role-template default grants are not final.                                    | Seeded navigation may expose too much or too little.          | Create/approve role-template configuration matrix before seed migrations.         |
| Platform admin account management APIs are not fully detailed in the current screen map. | Platform admin UI implementation may need route confirmation. | Confirm when OpenAPI is generated.                                                |
| Report detail DTOs/formulas need final report specification.                             | UI tables/charts may vary by final report payload.            | Produce report specification and wireframes.                                      |
| Offline cache security requires careful cache clearing.                                  | Risk of stale user-specific data on shared devices.           | Clear user-scoped cache on logout/session invalidation and expire cached records. |
| Support access UX must be unmistakable.                                                  | Risk of silent impersonation or poor audit clarity.           | Persistent support-access banner with platform admin actor, tenant, mode, expiry. |

These risks align with the UX map’s documented follow-up items.

---

## Recommended Next Steps

1. Create **low-fidelity mobile wireframes** for: login/onboarding, dashboard, customer lookup, motorcycle lookup, job order creation, mechanic session update, inventory lookup, payment recording, and receipt viewing.
2. Create a **frontend route map ADR** to finalize route conventions, especially branch/settings placement.
3. Create a **screen-state QA matrix** covering loading, empty, validation, forbidden, branch denied, subscription blocked, plan blocked, offline, conflict, idempotency conflict, and workflow transition blocked states.
4. Create a **role-template configuration matrix** before finalizing seeded role navigation.
5. Generate or maintain **OpenAPI** from `api-contracts.md` so frontend components can bind to stable DTOs and permissions.
