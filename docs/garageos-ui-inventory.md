# GarageOS UI Inventory

**Document:** `garageos-ui-inventory.md`  
**Status:** Source-aligned compact revision  
**Purpose:** Preserve UI/page planning guidance while reducing repeated table text and token cost.

---

## 1. Purpose

This document defines the GarageOS UI/page inventory for frontend route planning, wireframes, component planning, QA state coverage, and backlog creation.

It is limited to documented GarageOS scope only. It does **not** add native apps, offline writes, customer portal, standalone POS, payroll, full accounting, automatic subscription payment collection, 2FA, or undocumented workflows.

---

## 2. Source Alignment

GarageOS UI is a **mobile-first PWA shell** over the documented `/api/v1` REST API.

Core rules:

1. Backend/API/database are authoritative; UI guards improve UX only.
2. Session resolves tenant, branch access, permissions, plan, and subscription state.
3. Tenant lifecycle gates run before operational permissions.
4. Branch-scoped data requires assigned branch access or tenant-wide branch access.
5. Plan limits gate branches, notification channels, reminders, and reports.
6. Workflow transitions use explicit action screens/modals, not freeform status edits.
7. Offline mode is read-only only.
8. Issued invoices, payments, receipts, refunds, inventory ledgers, FIFO records, and audit logs are immutable or correction-only in UI.
9. Critical writes must handle idempotency, optimistic locking, validation errors, and conflict recovery.
10. Sensitive data such as passwords, tokens, card details, and provider secrets must not appear in UI, exports, logs, or audit payloads.

---

## 3. Global Shell

Use one authenticated PWA shell with role-aware, tenant-aware, branch-aware navigation.

| Shell area           | Required behavior                                                                       |
| -------------------- | --------------------------------------------------------------------------------------- |
| Auth gate            | Blocks unauthenticated users; routes unverified users to verification-only flow.        |
| Top bar              | Shows page/module title, branch context, tenant status, notifications, and user menu.   |
| Tenant banner        | Shows `grace_period`, `read_only`, `suspended`, `pending_deletion`, and renewal states. |
| Branch selector/chip | Visible on branch-scoped screens and for multi-branch/tenant-wide users.                |
| Navigation           | Permission-aware; unavailable actions hidden or disabled with safe explanation.         |
| Offline indicator    | Always visible when offline; all write actions disabled.                                |
| Support marker       | Persistent when platform admin uses support access; no silent impersonation.            |
| User menu            | Profile, change password, logout, logout all.                                           |

### Mobile Navigation

| Slot       | Destination                                | Notes                                                                                                   |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Dashboard  | `/dashboard`                               | Role-specific widgets and lifecycle warnings.                                                           |
| Job Orders | `/job-orders`                              | High-frequency service workflow.                                                                        |
| Customers  | `/customers`                               | Fast lookup and intake.                                                                                 |
| Inventory  | `/inventory/stock-balances` or `/products` | Stock lookup, product search, low stock.                                                                |
| More       | Secondary module menu                      | Invoices, Payments, Purchases, Suppliers, Reports, Reminders, Employees, Settings, Audit Logs, Exports. |

Use one contextual primary CTA per screen, such as **New Job Order**, **Add Customer**, **Record Payment**, **New Transfer**, or **Receive Purchase**.

---

### 3.1 Public Marketing Shell

The public homepage at `/` is separate from the authenticated tenant shell and platform shell.

| Area              | Required behavior                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| Route             | `/`                                                                                                                   |
| Purpose           | Public SaaS marketing homepage for GarageOS.                                                                          |
| Primary audience  | Motorcycle shop owners and service center operators evaluating GarageOS.                                              |
| Navigation        | Product, Workflow, Features, For Shops, Login, owner signup CTA.                                                      |
| Content inventory | Hero, product preview, feature grid, workflow timeline, role-fit cards, operational trust section, final CTA, footer. |
| Scope guardrails  | Copy and CTAs must not imply excluded modules or unsupported workflows.                                               |

## 4. Access Guard Order

Apply this order for every protected screen and action:

1. Authenticated session.
2. Verified email.
3. Tenant lifecycle status.
4. Platform support access context, if applicable.
5. Required permission.
6. Branch access.
7. Plan capability.
8. Resource workflow/status rule.
9. Idempotency or lock handling for critical writes.
10. API validation and conflict recovery.

---

## 5. Tenant Status UI Matrix

| Tenant status      | UI behavior                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `pending_setup`    | Shop Owner can access onboarding, profile setup, subscription info, password management, logout. Operational nav hidden/blocked. |
| `active`           | Normal permission, branch, and plan-based UI.                                                                                    |
| `grace_period`     | Full operational UI remains enabled; renewal warning after login and on dashboard.                                               |
| `read_only`        | Allow read/search/report/export/renew/password/logout. Disable operational writes and show renewal prompt.                       |
| `suspended`        | Shop Owner sees renewal/export-only screen. Non-owner users blocked. Platform support access retained.                           |
| `pending_deletion` | Tenant operational access blocked. Export disabled unless platform emergency extension exists.                                   |
| `deleted`          | No tenant operational access; show tenant unavailable/account inactive state.                                                    |

---

## 6. Role-Based Landing Map

| Role            | Landing                                    | Primary actions                                                                                          | Key restrictions                                                                                     |
| --------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Platform Admin  | `/platform/tenants`                        | Create tenants, manage plans/subscriptions, support access, exports, deletion jobs, platform audit logs. | Tenant data access must be audited; no silent impersonation.                                         |
| Shop Owner      | `/dashboard`                               | Renew/request renewal, export data, manage branches, employees, roles, settings, reports, audit logs.    | Plan limits and lifecycle gates still apply.                                                         |
| Manager         | `/dashboard` or `/job-orders`              | Assign staff, approve adjustments/refunds/corrections, monitor branch operations.                        | Depends on permissions and branch access.                                                            |
| Service Advisor | `/job-orders`                              | Customer/motorcycle lookup, estimates, job intake, notes, parts/labor, attachments.                      | No financial access unless granted.                                                                  |
| Mechanic        | `/mechanic-sessions/my-jobs`               | Start/pause/resume/finish sessions, notes/photos, task completion.                                       | No invoices, payments, supplier balances, financial reports, or subscriptions unless custom-granted. |
| Cashier         | `/invoices` or `/payments`                 | Issue invoices, record partial/split payments, view/print receipts, refunds if permitted.                | Receipts are immutable; corrections use refund/new payment workflows.                                |
| Inventory Clerk | `/inventory/stock-balances` or `/products` | Product lookup, receiving, transfers, adjustment requests/posts, supplier records.                       | Financial reports only if granted.                                                                   |

---

## 7. Route Groups

### Tenant Routes

| Group                                    | Route prefix                                                |
| ---------------------------------------- | ----------------------------------------------------------- |
| Public Marketing                         | `/`                                                         |
| Auth                                     | `/auth/*`                                                   |
| Onboarding                               | `/onboarding/*`                                             |
| Dashboard                                | `/dashboard`                                                |
| Customers                                | `/customers/*`                                              |
| Motorcycles                              | `/motorcycles/*`                                            |
| Service Catalog                          | `/services/*`                                               |
| Estimates                                | `/estimates/*`                                              |
| Job Orders                               | `/job-orders/*`                                             |
| Mechanic Sessions                        | `/mechanic-sessions/*`                                      |
| Products / Inventory                     | `/products/*`, `/product-categories/*`, `/inventory/*`      |
| Adjustments                              | `/inventory-adjustments/*`                                  |
| Transfers                                | `/inventory-transfers/*`                                    |
| Suppliers / Purchases / Returns          | `/suppliers/*`, `/purchase-orders/*`, `/supplier-returns/*` |
| Invoices / Payments / Receipts / Refunds | `/invoices/*`, `/payments/*`, `/receipts/*`, `/refunds/*`   |
| AR / AP                                  | `/accounts-receivable/*`, `/accounts-payable/*`             |
| Expenses                                 | `/expenses/*`                                               |
| Reminders / Notifications                | `/reminders/*`, `/notifications/*`                          |
| Files                                    | `/files/*`                                                  |
| Reports                                  | `/reports/*`                                                |
| Exports                                  | `/exports/*`                                                |
| Audit Logs                               | `/audit-logs/*`                                             |
| Settings                                 | `/settings/*`                                               |
| Employees / Roles                        | `/employees/*`, `/roles/*`                                  |
| Background Jobs                          | `/background-jobs/*`                                        |
| Offline Cache                            | `/offline-cache/*`                                          |

### Platform Routes

| Group                   | Route prefix                                                                   |
| ----------------------- | ------------------------------------------------------------------------------ |
| Tenants                 | `/platform/tenants/*`                                                          |
| Plans                   | `/platform/plans`                                                              |
| Support Access          | `/platform/tenants/{tenant_id}/support-access`                                 |
| Exports                 | `/platform/tenants/{tenant_id}/exports`                                        |
| Deletion Jobs           | `/platform/tenants/{tenant_id}/deletion-jobs`                                  |
| Platform Audit Logs     | `/platform/audit-logs`                                                         |
| Platform Admin Accounts | `/platform/admin-users` if supported by platform-admin account management APIs |

---

## 8. Standard Page Patterns

| Pattern               | Use for                                                                             | Rules                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Auth layout           | Login, signup, verification, password flows.                                        | Single-column form; show rate limit, lockout, invalid token, unverified, and validation states.                      |
| Tenant shell layout   | Authenticated tenant screens.                                                       | Resolve session first; show lifecycle/offline/support banners before page content.                                   |
| Platform shell layout | Platform admin screens.                                                             | Show platform context; support access must be visibly marked with actor, tenant, mode, reason, and expiry.           |
| List page             | Customers, job orders, invoices, products, suppliers, reports, audit logs, jobs.    | Search/filter only where API supports it; mobile cards, desktop tables, cursor pagination for high-volume lists.     |
| Detail page           | Entity detail screens.                                                              | Status badge, summary, tabs/history/related records, workflow actions, audit panel where documented.                 |
| Create/edit form      | Documented mutable resources.                                                       | Use documented fields only; preserve form state after errors; handle `lock_version`; block offline/read-only writes. |
| Workflow action       | Status transitions, receiving, payment, refund, invoice issue/void, export trigger. | Explicit action UI; show impact summary, required reason, blockers, confirmation, idempotency/conflict recovery.     |
| Async job status      | Exports, report exports, background jobs.                                           | Show queued/running/succeeded/failed/dead-letter, attempts, timestamps, safe error, correlation ID.                  |

---

## 9. Compact Screen Inventory

### 9.1 Authentication

| Screen                      | Route                              | Main actions / states                                                                                           | API                                                               |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Owner Signup                | `/auth/signup-owner`               | Submit signup; blocked if default plan/duration missing; duplicate tenant warning; email verification required. | `POST /auth/signup-owner`                                         |
| Login                       | `/auth/login`                      | Login, remember me, forgot password; invalid credentials, lockout, unverified email, blocked tenant.            | `POST /auth/login`                                                |
| Email Verification Required | `/auth/email-verification`         | Resend verification, logout; rate-limited/expired states.                                                       | `POST /auth/email-verification/resend`                            |
| Email Verification Result   | `/auth/email-verification/confirm` | Confirm single-use token; invalid/used/expired states.                                                          | `POST /auth/email-verification/confirm`                           |
| Forgot Password             | `/auth/password/forgot`            | Submit reset request; avoid account disclosure; rate-limited.                                                   | `POST /auth/password/forgot`                                      |
| Reset Password              | `/auth/password/reset`             | Submit new password; policy and expired token states.                                                           | `POST /auth/password/reset`                                       |
| Change Password             | `/auth/password/change`            | Save current/new password; allowed in read-only.                                                                | `POST /auth/password/change`                                      |
| Session / Logout            | Internal, `/auth/logout`           | Load session context; logout current/all sessions.                                                              | `GET /auth/session`, `POST /auth/logout`, `POST /auth/logout-all` |

### 9.2 Onboarding

| Screen              | Route                          | Main actions / states                                                                    | API                                               |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Onboarding Gate     | `/onboarding`                  | Checklist, blockers, progress.                                                           | `GET /shop/onboarding-state`                      |
| Shop Profile        | `/onboarding/shop-profile`     | Save shop name, address, contact, hours, logo.                                           | `PUT /shop/profile`                               |
| Tax / Localization  | `/onboarding/tax-localization` | Save tax profile/mode, VAT, country, timezone, currency; invalid combo/immutable states. | `PUT /shop/profile`                               |
| Invoice Prefix      | `/onboarding/invoice-prefix`   | Save prefix; format validation.                                                          | `PUT /shop/profile`                               |
| First Branch        | `/onboarding/branch`           | Create required active branch; plan/duplicate validation.                                | `POST /branches`                                  |
| Owner / Role Check  | `/onboarding/owner-check`      | Resolve missing active Shop Owner.                                                       | Session / role APIs                               |
| Complete Onboarding | `/onboarding/complete`         | Complete only when profile, branch, owner, plan, and expiration exist.                   | `POST /shop/complete-onboarding`                  |
| Subscription Info   | `/onboarding/subscription`     | View plan/expiration; renewal request.                                                   | `GET /auth/session`, `POST /shop/renewal-request` |

### 9.3 Dashboard

| Screen                | Route                         | Main actions / states                                                     | API                               |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| Dashboard Summary     | `/dashboard`                  | Sales, jobs, AR/AP, low stock, transfers, receiving; branch/date filters. | `GET /dashboard/summary`          |
| Revenue Chart         | `/dashboard/revenue`          | Date/branch filters; plan-blocked advanced report states.                 | `GET /dashboard/charts/revenue`   |
| Inventory Alerts      | `/dashboard/inventory-alerts` | Low-stock cards/list; branch denied/empty.                                | `GET /dashboard/inventory-alerts` |
| Renewal Warning Panel | Component                     | Grace/read-only/suspended prompts; renewal CTA.                           | Session + renewal APIs            |

### 9.4 Customers

Routes: `/customers`, `/customers/new`, `/customers/{id}`, `/customers/{id}/edit`, `/customers/{id}/history`, `/customers/{id}/motorcycles`, `/customers/merge`.

Key UI:

- Tenant-wide customer list/search with branch-filtered histories.
- Create/edit with duplicate warnings and optimistic conflict handling.
- Detail shows profile, motorcycles, notes, history, files, and audit where allowed.
- Merge requires survivor selection, duplicate records, reason, and audit.
- Soft delete blocks when open jobs, unpaid invoices, active reminders, or other documented blockers exist.
- Restore rechecks active duplicate conflicts.

APIs: `GET/POST/PATCH /customers`, `GET /customers/{id}/history`, `GET /customers/{id}/motorcycles`, `POST /customers/merge`, `POST /customers/{id}/soft-delete`, `POST /customers/{id}/restore`.

### 9.5 Motorcycles

Routes: `/motorcycles`, `/motorcycles/new`, `/motorcycles/{id}`, `/motorcycles/{id}/edit`, `/motorcycles/{id}/service-history`.

Key UI:

- Search by plate/model/customer.
- Add requires active customer.
- Detail shows owner/customer, profile, service history, files.
- Service history is branch-filtered.
- Mileage correction requires reason where documented.
- Soft delete blocks on open jobs/reminders/unpaid invoices.
- Restore requires active linked customer and duplicate re-check.

APIs: `GET/POST/PATCH /motorcycles`, `GET /motorcycles/{id}/service-history`, `POST /motorcycles/{id}/mileage-corrections`, soft-delete/restore actions.

### 9.6 Service Catalog

Routes: `/services`, `/services/new`, `/services/{id}`, `/services/{id}/edit`.

Key UI:

- List/search active/inactive services.
- Create/edit service details; variable price disclaimer where applicable.
- Detail preserves historical copied service details.
- Deactivate blocks on open workflows.
- Reactivate rechecks active name uniqueness.

APIs: `GET/POST/PATCH /services`, `POST /services/{id}/deactivate`, `POST /services/{id}/reactivate`.

### 9.7 Estimates

Routes: `/estimates`, `/estimates/new`, `/estimates/{id}`, `/estimates/{id}/edit`, `/estimates/{id}/status-events`.

Key UI:

- Draft estimate creation from branch/customer/motorcycle/lines.
- Detail actions: present, approve, convert, cancel.
- Edit draft only.
- Approve presented only; approval method and customer name/attachment where documented.
- Convert approved estimate to job order.
- Estimates do not affect revenue, AR, tax, inventory, FIFO, or reservations.

APIs: `GET/POST/PATCH /estimates`, `POST /estimates/{id}/present|approve|convert|cancel`, status events API.

### 9.8 Job Orders

Routes: `/job-orders`, `/job-orders/new`, `/job-orders/{id}`, `/job-orders/{id}/edit`, status/events/files child routes.

Key UI:

- Board/list supports branch/status filters; mechanics see assigned jobs where permitted.
- Create captures branch, customer, motorcycle, mileage, concern, advisor, mechanics, lines.
- Detail shows customer/motorcycle, lines, parts, mechanics, sessions, files, invoice status, audit/status history.
- Lines: add service/labor/part; zero/free labor needs reason where documented.
- Part lines reserve stock; insufficient stock blocks.
- Assign mechanics with primary mechanic requirement for `in_progress` where applicable.
- Status transitions are explicit; no direct status dropdown editing.
- Complete job order consumes inventory through FIFO/ledger and requires idempotency.
- Release/cancel follow balance, reservation, final-status, and reason rules.
- Uploads blocked offline/read-only.

APIs: `GET/POST/PATCH /job-orders`, line endpoints, `assign-mechanics`, `status-transitions`, `complete`, `release`, `cancel`, file endpoints, status events.

### 9.9 Mechanic Sessions

Routes: `/mechanic-sessions`, `/mechanic-sessions/my-jobs`, `/mechanic-sessions/{id}`.

Key UI:

- Assigned job cards for mechanic.
- Start, pause, resume, finish session actions.
- Active session shows timer/status, notes, job summary.
- Block more than one unfinished session.
- Manager override paths are permission-gated.

APIs: `GET /mechanic-sessions`, `POST /mechanic-sessions`, `POST /mechanic-sessions/{id}/pause|resume|finish`.

### 9.10 Products and Inventory

Routes: `/products`, `/products/new`, `/products/{id}`, `/products/{id}/edit`, `/products/{id}/stock`, `/products/{id}/fifo-layers`, `/product-categories`, `/inventory/stock-balances`, `/inventory/ledger`, `/inventory/low-stock-alerts`.

Key UI:

- Product catalog search by SKU/barcode/name/category.
- Create/edit product with duplicate SKU/barcode validation.
- Product detail shows branch stock, FIFO layers, ledger, references.
- Product/category deactivate/reactivate observe stock, reservation, open-reference, and uniqueness blockers.
- Stock balances and ledger are branch-scoped and immutable/read-only.
- Low stock alerts link to product/receiving/transfer where allowed.
- UI must never directly edit stock quantity; stock changes only through documented workflows.

APIs: product/category APIs, stock/fifo/ledger/low-stock APIs.

### 9.11 Inventory Adjustments

Routes: `/inventory-adjustments`, `/inventory-adjustments/new`, `/inventory-adjustments/{id}`, `/inventory-adjustments/{id}/edit`, `/inventory-adjustments/force`.

Key UI:

- Draft adjustment with branch, reason, lines.
- Submit routes to approval where required.
- Manager approve/reject with reason where required.
- Post approved/direct adjustment; stock changes only on post.
- Block posting if on-hand would fall below reserved.
- Posted adjustments are final.
- Force adjustment is high-risk and audited.

APIs: `GET/POST/PATCH /inventory-adjustments`, `submit`, `approve`, `reject`, `cancel`, `post`, `force`.

### 9.12 Inventory Transfers

Routes: `/inventory-transfers`, `/inventory-transfers/new`, `/inventory-transfers/{id}`, `/inventory-transfers/{id}/edit`, `/inventory-transfers/{id}/status-events`.

Key UI:

- Draft transfer uses source/destination active branches; same branch blocked.
- Submit reserves source stock.
- Send confirms sent quantities.
- Receive captures received quantities and variance reason.
- Cancel follows pending/in-transit disposition rules.
- Stock-affecting transitions require idempotency.

APIs: `GET/POST/PATCH /inventory-transfers`, `submit`, `send`, `receive`, `cancel`, status events.

### 9.13 Suppliers, Purchases, Supplier Returns, AP

Supplier routes: `/suppliers`, `/suppliers/new`, `/suppliers/{id}`, `/suppliers/{id}/edit`, `/suppliers/{id}/payments`, `/suppliers/{id}/credits`.

Supplier UI:

- Tenant-wide supplier list/search.
- Create/edit with duplicate active name validation.
- Detail shows profile, purchases, balance, payments, credits, audit; financial sections hidden without permission.
- Deactivate blocks open purchase/AP blockers.
- Reactivate rechecks active name uniqueness.

Purchase routes: `/purchase-orders`, `/purchase-orders/new`, `/purchase-orders/{id}`, `/purchase-orders/{id}/edit`, `/purchase-orders/{id}/receivings/new`.

Purchase UI:

- Branch-scoped PO list and detail.
- Create/edit supplier, branch, terms, product lines.
- Receive purchase captures quantities, costs, cash payment info where documented.
- Receiving affects FIFO, inventory ledger, and AP; receiving is immutable after post and idempotent.

Supplier return routes: `/supplier-returns`, `/supplier-returns/new`, `/supplier-returns/{id}`, `/supplier-returns/{id}/edit`.

Supplier return UI:

- Draft/post/cancel supplier returns.
- Posting affects stock and AP/credit.
- Posting requires idempotency and insufficient-stock handling.
- Posted returns are final.

### 9.14 Invoices, Payments, Receipts, Refunds, AR

Invoice routes: `/invoices`, `/invoices/new`, `/invoices/{id}`, `/invoices/{id}/edit`, `/invoices/{id}/print`.

Invoice UI:

- Branch-scoped invoice list.
- Draft invoice from job order billable lines.
- Billing allocation prevents overbilling.
- Detail shows lines, tax, discounts, billing allocations, payments, receipts, refunds/voids, audit.
- Draft edit only; issued/paid invoices are not directly edited.
- Issue/cancel/void are explicit actions; issue/void require idempotency.
- Printable view is read-only.

Payment/receipt/refund routes: `/invoices/{id}/payments/new`, `/payments`, `/payments/{id}`, `/receipts`, `/receipts/{id}`, `/payments/{id}/refunds/new`, `/refunds/{id}`.

Payment UI:

- Record payment only when invoice is payable.
- Amount must be > 0 and cannot exceed remaining collectible balance.
- Each payment generates exactly one immutable receipt.
- Payment correction uses refund plus new payment, not direct edit.
- Refund requires amount, reason, collection flags, optional inventory reversal lines where documented.
- Refund amount cannot exceed refundable amount; refund is idempotent.

AR/AP routes: `/accounts-receivable`, `/accounts-receivable/customers/{id}`, `/accounts-payable`, `/accounts-payable/suppliers/{id}`.

AR/AP UI:

- Branch-scoped summaries and tenant-wide customer/supplier detail histories with branch filtering.
- Financial sections hidden if permission is missing.

### 9.15 Expenses

Routes: `/expenses`, `/expenses/new`, `/expenses/{id}`, `/expenses/{id}/edit`, `/settings/expense-categories`.

Key UI:

- Branch-scoped list and detail.
- Create captures branch, category, date, payment method, amount.
- Edit only allowed documented fields; reason/audit where required.
- Void expense is corrective, reasoned, and blocked if already voided.
- Read-only tenant blocks create/update/void.

APIs: expense and expense category APIs.

### 9.16 Reminders and Notifications

Reminder routes: `/reminders`, `/reminders/new`, `/reminders/{id}`, `/reminders/{id}/edit`.

Reminder UI:

- List by status/channel/date/customer.
- Create reminder for customer/motorcycle/date/mileage/type/channel.
- Plan-disabled channels must show required plan and must not silently downgrade.
- Send/cancel/edit follow status rules and block read-only/offline.

Notification routes: `/notifications`, `/notifications/{id}`, `/settings/notifications`.

Notification UI:

- Notification center with unread/read tabs.
- Mark read/dismiss.
- Linked record access still enforces permissions and branch access.
- Preferences enforce plan channel limits.

### 9.17 Files

Routes: contextual upload modal, `/files/{id}`, embedded linked files panels.

Key UI:

- Request upload intent before upload.
- Linked files panel shows active, soft-deleted, retained, quarantined states.
- Quarantined files have no download action.
- Downloads use signed URLs.
- Upload/delete/restore blocked offline/read-only and permission-checked.

APIs: file upload intent, signed URL, metadata, soft-delete/restore APIs.

### 9.18 Reports

Routes: `/reports`, `/reports/sales`, `/reports/services`, `/reports/inventory`, `/reports/customers`, `/reports/financial`, `/reports/branch-comparison`, `/reports/advanced/{code}`, `/reports/exports/{job_id}`.

Key UI:

- Reports hub grouped by documented report areas.
- Date/branch/report filters only where supported.
- Branch comparison requires Mid/High unless overridden.
- Advanced reports require High unless overridden.
- Mechanics are restricted from financial reports unless custom-granted.
- Large exports use async job UI.
- Exports may be PDF, Excel, or CSV where documented.

APIs: report APIs, `POST /reports/exports`, `GET /background-jobs/{id}`.

### 9.19 Tenant Exports

Routes: `/exports`, `/exports/new`, `/exports/{id}`, `/exports/{id}/download`.

Key UI:

- Shop Owner export job list and create export.
- Export allowed by tenant status rules; pending deletion blocks unless emergency extension exists.
- Export options include attachments/soft-deleted/metadata-only where documented.
- Status page shows queued/running/succeeded/failed.
- Download uses signed URL only when complete.
- Export package includes ZIP, CSV, JSON, attachment manifest, audit log export, README, and attachments directory when binaries are included.
- Download links expire after 7 days.

APIs: `GET/POST /exports`, `GET /exports/{id}`, `GET /exports/{id}/download-url`.

### 9.20 Audit Logs

Routes: `/audit-logs`, `/audit-logs/{id}`, embedded entity audit panels.

Key UI:

- Filter by action/entity/actor/branch/date.
- Detail shows actor, action, entity, timestamps, previous/new values where safe.
- Sensitive values are redacted.
- Entity audit panel appears only when user has audit visibility and entity access.

APIs: `GET /audit-logs`, `GET /audit-logs/{id}`, filtered audit APIs.

### 9.21 Settings

Routes: `/settings`, `/settings/shop-profile`, `/settings/tax`, `/settings/billing`, `/settings/notifications`, `/settings/files`, `/settings/subscription`, `/settings/data-export`.

Key UI:

- Settings hub is permission-gated.
- Shop profile/tax/file settings mostly blocked in read-only.
- Billing settings and subscription renewal are allowed where lifecycle rules permit.
- Invoice prefix, country/currency, and tax changes follow documented immutability/future-only rules.
- Notification preferences enforce plan channel limits.
- Data export links to tenant export flow.

APIs: shop/profile/settings/billing/subscription/export APIs.

### 9.22 Employees, Roles, Permissions

Employee routes: `/employees`, `/employees/invitations/new`, `/employees/new`, `/employees/{id}`, `/employees/{id}/edit`, `/employees/{id}/activity`.

Employee UI:

- List/search employees by status/branch/role.
- Invite/create employees with role and branch assignment.
- Edit profile, roles, branches; last owner protection applies.
- Deactivate revokes sessions and blocks last active owner deactivation.
- Reactivate requires valid role/branch/email/verification checks.
- Reset password sends reset link only; no plaintext password.

Role routes: `/roles`, `/roles/new`, `/roles/{id}`, `/roles/{id}/edit`, `/roles/permissions`.

Role UI:

- Seeded/custom role list.
- Create custom tenant role.
- Edit role permission matrix with impact warning.
- Shop Owner capabilities protected.
- Deactivate role blocked if active users depend solely on it.
- Permission catalog is read-only.

Access notes:

- Shop Owner has all tenant permissions and tenant-wide branch access.
- Platform permissions are not assignable to tenant roles.
- Non-owner seeded role grants require approved configuration.
- Permissions are additive; branch access is separate.

### 9.23 Background Jobs

Routes: `/background-jobs/{id}`, `/background-jobs/{id}/attempts`.

Key UI:

- Job status detail shows type, status, timestamps, attempt count, safe error, correlation ID.
- Tenant users see only authorized tenant-visible jobs.
- Attempt details are platform/support only and sanitized.
- Cancel only if job is cancellable and user has context-specific permission.

APIs: `GET /background-jobs/{id}`, `GET /background-jobs/{id}/attempts`, `POST /background-jobs/{id}/cancel`.

### 9.24 Offline Cache

Routes/states: app shell offline state, `/offline-cache/recent-records`, internal manifest, clear cache setting.

Key UI:

- Offline shell allows navigation to cached views only.
- Recent records include cached customers, motorcycles, job orders, and invoices only.
- All create/edit/delete/approve/payment/upload/sync actions are blocked.
- Show stale/expired cache states.
- Clear user-scoped cache on logout/session invalidation.

APIs/service worker: offline manifest, recent records, clear current-user cache.

### 9.25 Platform Administration

Routes: `/platform/tenants`, `/platform/tenants/new`, `/platform/tenants/{id}`, `/platform/tenants/{id}/subscription`, `/platform/tenants/{id}/support-access`, `/platform/tenants/{id}/exports`, `/platform/tenants/{id}/deletion-jobs`, `/platform/audit-logs`, `/platform/plans`, `/platform/admin-users` if implemented.

Key UI:

- Tenant list supports search/filter/status.
- Create tenant captures business info, plan, expiration, owner invite/create.
- Duplicate tenant approval state required.
- Tenant detail shows metadata, subscription, lifecycle, exports, deletion, support panels.
- Subscription updates, read-only overrides, suspension, deletion, and support access require reason and audit.
- Support access mode defaults read-only; write mode must be explicit.
- Plan management supports Basic/Mid/High plans, limits, and default plan.
- Platform audit logs filter by actor/action/tenant/date.
- Platform admin account screens depend on documented platform admin account APIs.

---

## 10. Cross-Cutting Components

| Component              | Required behavior                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| StatusBadge            | Uses documented enum values only.                                                             |
| BranchContextChip      | Shows active branch and prevents cross-branch confusion.                                      |
| TenantStatusBanner     | Explains lifecycle state and permitted actions.                                               |
| PlanLimitPrompt        | Shows current limit and required plan; no silent downgrade.                                   |
| PermissionBlockedState | Safe forbidden message without leaking hidden data.                                           |
| WorkflowActionModal    | Summary, reason fields, blockers, confirmation, validation, idempotency/conflict recovery.    |
| StatusHistoryTimeline  | Actor, timestamp, from/to status, reason.                                                     |
| AuditPanel             | Sanitized actor/action/previous/new values.                                                   |
| ReadOnlyState          | Explains read-only/offline lifecycle and disables writes.                                     |
| AsyncJobStatusCard     | Queued/running/succeeded/failed/dead-letter, attempts, safe error, correlation ID.            |
| ValidationSummary      | Displays API error envelope details safely.                                                   |
| ConflictRecoveryPanel  | Handles `version_conflict`, `idempotency_conflict`, workflow and inventory/billing conflicts. |

---

## 11. Motion Components / Motion Patterns

This section documents proposed motion components and hooks for future implementation. It is planning guidance only. This documentation step does not install GSAP, does not implement animation code, and does not modify frontend components.

Motion patterns must support documented GarageOS screens, workflow states, permission-aware UI, tenant lifecycle UI, offline read-only behavior, immutable/correction-only records, and mobile-first PWA usability. Motion must not add product scope or imply excluded capabilities.

### 11.1 Motion Implementation Status

| Item                         | Status                 | Notes                                                                      |
| ---------------------------- | ---------------------- | -------------------------------------------------------------------------- |
| Motion governance            | Documentation baseline | Defined in `ui-registry.md`.                                               |
| Motion tokens                | Documentation baseline | Defined in `ui-tokens.md`.                                                 |
| Motion architecture planning | Documentation baseline | Future utility location, client-only boundaries, and contracts below.      |
| GSAP dependency              | Not installed          | Future implementation phase only; no dependency change in this step.       |
| Motion components/hooks      | Planning guidance only | Implement later after dependency and client-component strategy review.     |
| Public marketing animation   | First safe target      | Lower operational risk and higher brand/storytelling value.                |
| Dense operational animation  | Minimal-motion only    | Productivity, scanability, and blocked-state clarity stay higher priority. |

### 11.2 Proposed Reusable Motion Components and Hooks

| Component / Hook        | Type                | Intended use                                                                         | Guardrails                                                                                    |
| ----------------------- | ------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `MotionProvider`        | Foundation provider | Centralize reduced-motion detection and motion configuration for client components.  | Must not run server-only animation logic; must not override OS reduced-motion preference.     |
| `MotionSafe`            | Foundation wrapper  | Render animated or non-animated variants based on reduced-motion preference.         | Must preserve the same content and state in both modes.                                       |
| `useReducedMotion`      | Hook                | Read `prefers-reduced-motion` and expose a stable boolean for motion decisions.      | Must default safely during hydration and avoid layout-breaking mismatches.                    |
| `useRevealMotion`       | Hook                | Reusable one-time reveal for non-dense cards, panels, alerts, and empty states.      | Must use semantic motion tokens and support no-motion final state.                            |
| `useScrollRevealMotion` | Hook                | Marketing/page storytelling reveal where scroll sequencing is justified.             | Prefer public marketing pages; avoid operational tables, ledgers, and histories.              |
| `useCounterMotion`      | Hook                | Optional metric count-up after confirmed dashboard/report data loads.                | Must not imply unverified data; disable or snap to final value in reduced-motion mode.        |
| `AnimatedMetricCard`    | Pattern component   | Dashboard and marketing metric reveal after data is available.                       | Dashboard values must come from confirmed API data.                                           |
| `AnimatedStatusBadge`   | Pattern component   | Subtle state-change emphasis for documented status enum changes.                     | Must not invent statuses or obscure blocked/error states.                                     |
| `AnimatedProgressStep`  | Pattern component   | Onboarding or workflow progress steps.                                               | Must not imply completed setup/action before backend confirms the documented state.           |
| `AnimatedEmptyState`    | Pattern component   | Gentle reveal for empty states with allowed action.                                  | Action must still respect permission, tenant status, branch access, plan, and offline guards. |
| `WorkflowActionMotion`  | Pattern component   | Dialog/sheet entry, impact summary reveal, and server-confirmed completion feedback. | Critical workflow success animation only after server confirmation.                           |

### 11.3 Motion Pattern Inventory

| Surface                                      | Recommended motion level | Preferred technique                           | Notes                                                                                                            |
| -------------------------------------------- | ------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Public marketing homepage                    | Rich but purposeful      | Future GSAP allowed                           | Best first target for scroll reveal, staged sections, hero polish, and CTA emphasis.                             |
| Public marketing CTA/footer                  | Moderate                 | CSS or future GSAP                            | Motion may highlight conversion paths without loud distraction.                                                  |
| Auth pages                                   | Restrained               | CSS first; GSAP only if justified             | Forms must stay fast, readable, and accessible.                                                                  |
| Onboarding                                   | Restrained               | CSS or reusable reveal hooks                  | Progress motion must not imply setup completion before backend state confirms it.                                |
| Tenant app shell                             | Minimal                  | CSS-only preferred                            | Navigation, branch context, tenant banners, support marker, and offline indicator must remain immediately clear. |
| Dashboard                                    | Light                    | CSS/reveal hooks                              | Metric animation only after confirmed data load.                                                                 |
| Lists and tables                             | Minimal                  | CSS hover/focus only                          | Dense data surfaces remain productivity-first.                                                                   |
| Detail pages                                 | Minimal to restrained    | CSS/reveal hooks                              | Immutable/read-only notices must be visible without delay.                                                       |
| Workflow action dialogs                      | Restrained               | CSS or future GSAP via `WorkflowActionMotion` | Impact summary and blockers must remain clear; success after server confirmation only.                           |
| Audit logs, ledgers, FIFO, financial records | Minimal                  | CSS-only or none                              | Do not animate rows or critical historical data in a way that harms scanability.                                 |
| Offline/read-only/blocked states             | Immediate and clear      | CSS-only or none                              | Do not delay blockers. Do not imply offline writes or sync queues.                                               |

### 11.4 Reduced-Motion Requirements

- Respect `prefers-reduced-motion`.
- Provide equivalent content and state without animation.
- Skip GSAP timelines or set final state immediately when reduced motion is active.
- Avoid parallax, scroll hijacking, large transforms, long stagger chains, and decorative loops for reduced-motion users.
- Keep validation errors, permission blockers, plan blockers, tenant blockers, offline banners, and workflow conflict messages immediately visible.

### 11.5 Server-Confirmed Workflow Motion Rule

Motion must not fake successful completion of critical workflows.

The following action categories may show final success animation only after a successful server response:

- Inventory reservation, release, transfer, adjustment, FIFO consumption, and stock-changing operations.
- Job order workflow transitions and completion.
- Invoice issue, void, billing allocation, payment, receipt, refund, and AR/AP changes.
- Purchase receiving, supplier return posting, and supplier payment operations.
- Tenant lifecycle changes, support access, exports, deletion jobs, and platform-admin actions.
- Any action requiring idempotency, optimistic locking, audit logging, or workflow status history.

Before server confirmation, the UI may show loading, submitting, validating, queued, or pending states only when those states are documented and backed by API behavior.

### 11.6 Excluded Motion Implications

Motion patterns must not imply:

- Native iOS or Android apps.
- Offline transaction creation, editing, submission, mutation queues, sync retry, or conflict resolution.
- Customer portal or customer login.
- Standalone retail POS/cart checkout.
- Payroll.
- Full accounting/general ledger.
- Direct tax filing.
- E-commerce marketplace or checkout.
- Loyalty/rewards.
- Service packages.
- Automatic subscription payment collection.
- Two-factor authentication.
- AI forecasting or custom BI beyond documented reports.

### 11.7 First Implementation Target Recommendation

The best first implementation target for a later motion phase is the public marketing homepage because it has the highest brand/storytelling value and the lowest risk of interfering with operational workflows.

Recommended first motion implementation order:

1. Public marketing homepage hero and section reveals.
2. Marketing workflow/storytelling highlights.
3. CTA/footer emphasis.
4. Auth/onboarding restrained reveals.
5. Dashboard metric reveal after confirmed API data.
6. Workflow dialog motion after action patterns are stable.
7. Dense operational screens only after reduced-motion and productivity rules are proven.

---

### 11.8 Motion Architecture Plan

Phase 2 motion architecture remains documentation-only. It defines future frontend motion structure before any GSAP installation or animation implementation.

| Area                        | Decision                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                       | Planning only; no dependency installation, runtime animation, operational screen animation, API change, database change, or permission change. |
| Utility ownership           | Motion utilities belong in the web app because they are frontend-only and browser-dependent.                                                   |
| First implementation target | Public marketing homepage only.                                                                                                                |
| Backend authority           | Backend/API/database state remains authoritative for permissions, workflow status, inventory, finance, audit, and tenant lifecycle behavior.   |
| Reduced motion              | Reduced-motion users must receive final readable UI states without transform-based movement.                                                   |
| Critical workflows          | Success feedback for critical writes remains server-confirmed only.                                                                            |

Recommended future location:

```text
apps/web/src/shared/motion/
  index.ts
  motion-provider.tsx
  motion-safe.tsx
  workflow-action-motion.tsx
  hooks/
    use-reduced-motion.ts
    use-reveal-motion.ts
    use-scroll-reveal-motion.ts
    use-counter-motion.ts
```

Rules:

- Do not place GSAP, browser animation utilities, `window`, `document`, `matchMedia`, `IntersectionObserver`, or `requestAnimationFrame` usage in shared backend/domain packages.
- Do not place motion business logic inside module-specific domain folders.
- Keep motion implementation replaceable behind GarageOS motion contracts.
- Motion may enhance presentation only after source-aligned content and state are available.
- Components must remain readable and usable without JavaScript animation.

### 11.9 Client-Only Boundary Plan

| Boundary          | Required rule                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| GSAP imports      | Allowed only inside client-side modules after implementation approval.                                      |
| Server components | Must not import GSAP or browser-only motion utilities.                                                      |
| Browser APIs      | Read after mount only.                                                                                      |
| Hydration         | Server-rendered markup must remain visible and meaningful before animation runs.                            |
| Cleanup           | Timelines, observers, event listeners, and animation frames must be cleaned up on unmount.                  |
| Dynamic imports   | Preferred for non-critical marketing animation.                                                             |
| Reduced motion    | Must bypass transform-based animation and render final readable state.                                      |
| Blocked states    | Permission, plan, tenant, branch, validation, offline, and read-only blockers must not depend on animation. |

### 11.10 Motion Contract Plan

| Contract                | Responsibility                                                         | First use                                  | Notes                                                     |
| ----------------------- | ---------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| `MotionProvider`        | Provides mounted state and reduced-motion preference.                  | Public homepage shell or marketing layout. | Must not store sensitive state or product access state.   |
| `MotionSafe`            | Wraps content that may animate but must remain visible without motion. | Marketing sections.                        | Must render final readable state when motion is disabled. |
| `useReducedMotion`      | Safely resolves `prefers-reduced-motion`.                              | Motion provider and tests.                 | Must be SSR-safe.                                         |
| `useRevealMotion`       | Provides one-time reveal behavior.                                     | Homepage hero and feature cards.           | CSS-first until GSAP implementation is approved.          |
| `useScrollRevealMotion` | Provides viewport-based reveal behavior.                               | Homepage sections.                         | Must avoid hiding content before hydration.               |
| `useCounterMotion`      | Provides presentational count-up behavior.                             | Marketing-only metrics if used.            | Must not compute authoritative business values.           |
| `WorkflowActionMotion`  | Provides server-confirmed-only workflow feedback.                      | Later operational review only.             | Must never show fake success while a request is pending.  |

Planning-only TypeScript contract sketch:

```ts
type MotionCapability = {
  canAnimate: boolean;
  reducedMotion: boolean;
  mounted: boolean;
};

type MotionProviderProps = {
  children: React.ReactNode;
};

type MotionSafeProps = {
  children: React.ReactNode;
  className?: string;
  motionName?: string;
  disabled?: boolean;
};

type RevealMotionOptions = {
  enabled?: boolean;
  once?: boolean;
  delayMs?: number;
  durationMs?: number;
  distance?: 'none' | 'xs' | 'sm' | 'md';
};

type CounterMotionOptions = {
  value: number;
  durationMs?: number;
  enabled?: boolean;
  format?: (value: number) => string;
};

type WorkflowActionMotionProps = {
  state: 'idle' | 'pending' | 'succeeded' | 'failed';
  children: React.ReactNode;
  successLabel?: string;
};
```

### 11.11 First Safe Implementation Slice

| Homepage area         | Motion type                  | Priority | Reduced-motion behavior         |
| --------------------- | ---------------------------- | -------: | ------------------------------- |
| Hero headline/subcopy | Subtle reveal                |        1 | Render final visible state.     |
| Hero CTA group        | Subtle reveal/focus polish   |        1 | Static final state.             |
| Dashboard mockup      | Entrance and small highlight |        2 | Static screenshot/mockup state. |
| Feature cards         | Scroll reveal                |        2 | Static card grid.               |
| Workflow preview      | Step reveal                  |        3 | Static timeline/cards.          |
| Role value cards      | Staggered card reveal        |        3 | Static cards.                   |
| Final CTA             | Subtle emphasis              |        4 | Static CTA panel.               |

Do not include in the first slice:

- Auth screens.
- Tenant app shell.
- Dashboard operational metrics.
- Job order workflow actions.
- Inventory reservation, release, or consumption.
- FIFO, ledger, invoice, payment, receipt, refund, or audit screens.
- Platform admin support access screens.
- Offline cache screens.

### 11.12 Reduced-Motion Test Strategy

| Test type     | Coverage                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Unit          | `useReducedMotion` with mocked `matchMedia`.                                                     |
| Component     | `MotionSafe` renders children in final visible state when reduced motion is enabled.             |
| Component     | Reveal hooks do not apply transform animation when reduced motion is enabled.                    |
| Component     | Counter motion renders final value immediately when reduced motion is enabled.                   |
| E2E           | Public homepage works with browser reduced-motion emulation.                                     |
| E2E           | Public homepage at 360px width does not hide content behind animation.                           |
| Static/review | GSAP is not imported by server components.                                                       |
| Accessibility | Screen readers receive final readable content and do not depend on animated intermediate states. |

### 11.13 Motion Planning Validation and Acceptance

Documentation-only validation:

```bash
grep -n "### 11.8 Motion Architecture Plan" garageos-ui-inventory.md
grep -n "### 11.9 Client-Only Boundary Plan" garageos-ui-inventory.md
grep -n "### 11.10 Motion Contract Plan" garageos-ui-inventory.md
grep -n "apps/web/src/shared/motion" garageos-ui-inventory.md
grep -n "WorkflowActionMotion" garageos-ui-inventory.md
```

Acceptance criteria:

- Motion architecture is documented in the numbered Motion Components / Motion Patterns section.
- Future utility location is documented.
- Client-only boundaries are documented.
- Reusable hook/component contracts are documented.
- Reduced-motion strategy and test coverage are explicit.
- Public marketing homepage is identified as the first safe implementation slice.
- No dependency installation, runtime animation code, or operational screen animation is introduced.
- Backend/API/database authority is preserved.
- Critical workflow success motion remains server-confirmed only.

---

## 12. Mobile-First Layout Rules

| Workflow                     | Mobile pattern                                                     |
| ---------------------------- | ------------------------------------------------------------------ |
| Auth                         | Centered single-column form; full-width CTA.                       |
| Onboarding                   | Stepper/checklist; one task per screen; sticky Continue/Save.      |
| Customer / motorcycle lookup | Search-first page with recent records; quick add CTA.              |
| Job order creation           | Wizard or segmented long form; sticky Save.                        |
| Mechanic session             | Task-focused cards; large Start/Pause/Resume/Finish actions.       |
| Inventory lookup             | Search + branch filter; product detail tabs for stock/FIFO/ledger. |
| Purchase receiving           | Step-by-step receiving form; sticky Receive Stock.                 |
| Invoice/payment              | Balance summary; sticky Record Payment when payable.               |
| Refund                       | Confirmation-heavy corrective form; reason required.               |
| Reports/exports              | Filter drawer, summary cards, async export status.                 |

Minimum UX validation should cover 360px width, touch-friendly actions, blocked-action prompts, read-only/offline indicators, and role-appropriate screens.

---

## 13. Required Error / State Coverage

Every applicable screen should define:

- Loading.
- Empty.
- Validation failed.
- Forbidden / missing permission.
- Branch access denied.
- Tenant lifecycle blocked.
- Plan limit exceeded.
- Offline write blocked.
- Version conflict.
- Idempotency conflict.
- Workflow transition blocked.
- Inventory insufficient stock.
- Invoice overpayment blocked.
- Invoice overbilling blocked.
- Background job failed.
- Safe correlation ID display.

---

## 14. Risks and Open Questions

| Risk / question                                                     | Impact                                        | Recommendation                                                        |
| ------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| Exact visual layouts are not finalized.                             | Designers may vary density/navigation.        | Produce low-fidelity wireframes for high-frequency flows.             |
| Branch management route may be `/branches` or `/settings/branches`. | Breadcrumb/navigation inconsistency.          | Decide in frontend route ADR.                                         |
| Non-owner role-template default grants are not final.               | Seeded navigation may expose too much/little. | Approve role-template configuration before seed migrations.           |
| Platform admin account APIs need confirmation.                      | Platform admin UI route may need adjustment.  | Confirm with generated OpenAPI/API contract.                          |
| Report DTOs/formulas need final report spec.                        | Report tables/charts may shift.               | Produce report spec and wireframes.                                   |
| Offline cache security needs strict clearing.                       | Stale user data risk on shared devices.       | Clear cache on logout/session invalidation and expire cached records. |
| Support access UX must be unmistakable.                             | Silent impersonation/audit risk.              | Persistent support banner with actor, tenant, mode, reason, expiry.   |

---

## 15. Recommended Next Steps

1. Create low-fidelity mobile wireframes for login/onboarding, dashboard, customer lookup, motorcycle lookup, job order creation, mechanic session, inventory lookup, payment recording, and receipt viewing.
2. Create frontend route map ADR.
3. Create screen-state QA matrix.
4. Approve role-template configuration matrix.
5. Generate/maintain OpenAPI from API contracts for stable frontend DTO binding.
