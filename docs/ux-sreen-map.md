# GarageOS UX Screen Map

**Document:** `ux-sreen-map.md`  
**Version:** 1.0
**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Generated:** 2026-06-24  
**Status:** Source-aligned UX documentation draft  
**Source Documents:**

1. `requirements-v2.4.md`
2. `database-design.md`
3. `database-schema.md`
4. `architecture.md`
5. `api-contracts.md`

---

## 1. Purpose

This document defines the UX screen map for GarageOS. It translates the approved product scope, architecture, database model, and API contracts into a navigable screen inventory for the mobile-first PWA.

This screen map does **not** introduce new product scope. It only maps documented modules, workflows, statuses, permissions, tenant lifecycle states, and API boundaries into proposed screens and navigation groups.

---

## 2. Source-of-Truth Rules

The following rules govern this document:

1. Product requirements are the highest authority.
2. Architecture and API contracts define implementation alignment.
3. Database schema confirms entity boundaries and workflow states.
4. Screens must not imply excluded features.
5. Screens must respect tenant status, role permissions, branch access, plan limits, and offline restrictions.

---

## 3. Explicit UX Non-Scope

The following screens or UX flows must **not** be designed for this build because they are explicitly excluded from the source documentation:

| Excluded UX Area          | UX Rule                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Native iOS / Android app  | Do not design native-app-only screens. GarageOS is a mobile-first PWA only.                                         |
| Offline create/edit/sync  | Do not design offline write queues, conflict resolution, or sync retry screens for operational transactions.        |
| Customer portal           | Do not design customer login, customer self-service, or customer account screens.                                   |
| Standalone retail POS     | Do not design a retail cart checkout separate from job orders or service invoices.                                  |
| Payroll                   | Do not design salary, commission, payslip, or payroll contribution screens.                                         |
| Full accounting           | Do not design chart of accounts, journal entries, formal closing, or bank reconciliation screens.                   |
| Direct BIR filing         | Do not design tax filing submission screens.                                                                        |
| E-commerce marketplace    | Do not design online store, product marketplace, delivery, or public checkout screens.                              |
| Loyalty program           | Do not design points, rewards, tiers, or reward redemption screens.                                                 |
| Service packages          | Do not design bundled package redemption or package-level pricing screens.                                          |
| Payment gateway charging  | Do not design automatic subscription charging or customer payment-gateway charge flows. Payment records are manual. |
| Two-factor authentication | Do not design 2FA setup or challenge screens.                                                                       |

---

## 4. UX Principles

| Principle                         | UX Interpretation                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Mobile-first operations           | Primary operational flows must work on small touch screens.                                              |
| Permission-aware interface        | Hide or disable actions the user cannot perform, but backend remains authoritative.                      |
| Tenant lifecycle-aware interface  | Access is constrained by tenant status before module permissions.                                        |
| Branch-aware interface            | Branch-scoped screens must filter by assigned branches unless user has tenant-wide access.               |
| Workflow-first actions            | Status changes must be explicit actions, not arbitrary status field edits.                               |
| Ledger and financial immutability | Issued financial records, receipts, refunds, inventory ledgers, and audit logs are view/correction-only. |
| Safe offline mode                 | Offline UX must clearly indicate read-only state and block all operational writes.                       |
| Clear error recovery              | Validation failures must show stable, actionable messages using API error codes.                         |
| Audit visibility                  | Critical workflows need status history, audit history, actor, timestamp, and reason visibility.          |

---

## 5. Agent Brainstorm Summary

### 5.1 Business Owner

- Prioritized tenant onboarding, subscription status visibility, renewal prompts, and plan-based upgrade messaging.
- Required platform-admin screens for tenant management, subscription overrides, exports, deletion lifecycle, and audited support access.
- Confirmed that UI must support recurring SaaS operations without implementing automatic subscription payment collection.

### 5.2 Product Manager / Business Analyst

- Required screen groups to follow documented modules and workflow states.
- Recommended action-oriented screens for estimates, job orders, transfers, adjustments, invoices, refunds, and tenant lifecycle changes.
- Confirmed that screen labels should mirror documented business concepts to preserve traceability.

### 5.3 SMEs

- Confirmed service intake must be fast: customer lookup, motorcycle lookup, job order creation, part reservation, and mechanic assignment should be close together.
- Confirmed inventory users need stock by branch, FIFO/ledger visibility, transfer workflow, adjustment workflow, and low-stock alerts.
- Confirmed cashier users need invoice creation from job orders, payments, receipts, refunds, AR visibility, and immutable receipt viewing.

### 5.4 End Users

- Requested role-focused dashboards and quick actions:
  - Service advisor: customer lookup, job order intake, estimates.
  - Mechanic: assigned jobs and work sessions.
  - Cashier: invoices, payments, receipts.
  - Inventory clerk: stock lookup, transfers, receiving, adjustments.
  - Owner/manager: dashboard, reports, approvals, staff, settings.

### 5.5 Architect

- Required screen access to follow tenant context, tenant status, branch access, permissions, and plan limits.
- Recommended a single PWA information architecture aligned to backend modules and API resource groups.
- Required workflow transitions to use explicit confirmation screens, reason fields, and audit/status history displays.

### 5.6 Senior Engineers

- Recommended consistent screen patterns: list, detail, create/edit, workflow action modal, status history, audit history, export/job status.
- Recommended route naming aligned to `/api/v1` resources and frontend module structure.
- Flagged complex workflows that require strong UI validation before submit: inventory reservation, job order completion, invoice issue, payment, refund, transfer receive, adjustment post, supplier return post.

### 5.7 UX Designer

- Recommended a bottom navigation for high-frequency tenant operations on mobile and a secondary menu for administrative/configuration modules.
- Recommended role-based landing shortcuts instead of separate applications.
- Recommended persistent tenant/branch/status indicators to reduce accidental cross-branch work.

### 5.8 QA

- Required every screen to have permission, branch, tenant-status, offline, empty, loading, validation-error, and conflict states where applicable.
- Required traceability from screens to source modules and API endpoints.
- Recommended test coverage for blocked write actions under `read_only`, `suspended`, `pending_setup`, and offline states.

### 5.9 Security

- Required no sensitive token/password data in screens, logs, exports, audit payloads, or error details.
- Required platform support access to be visibly marked and audited.
- Required tenant and branch isolation to be reflected in UI filters and detail visibility.

### 5.10 DevOps

- Required background-job status screens for exports and long-running report jobs.
- Required failure states that expose safe error summaries and correlation IDs.
- Recommended operations visibility for export jobs, notification delivery attempts, and background failures.

### 5.11 Project Manager

- Recommended delivering UX documentation incrementally by module but keeping this map as the master screen inventory.
- Recommended using this file as the baseline for wireframes, route planning, frontend backlog, QA test design, and release readiness review.

---

## 6. Global Application Shell

### 6.1 Shell Components

| Component                          | Purpose                                                                          | Visibility                                              |
| ---------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Auth gate                          | Blocks unauthenticated access and routes users to auth screens.                  | All users                                               |
| Tenant status banner               | Shows grace-period, read-only, suspended, renewal, or pending-deletion warnings. | Tenant users, based on tenant status                    |
| Branch selector / branch indicator | Shows active branch context and branch filter.                                   | Users with multi-branch access or branch-scoped screens |
| Permission-aware navigation        | Shows only accessible navigation groups.                                         | Tenant users and platform admins                        |
| Offline indicator                  | Shows network/offline state and blocks write actions offline.                    | Tenant users                                            |
| Notification indicator             | Shows internal notifications.                                                    | Authorized tenant users                                 |
| User menu                          | Profile, change password, logout, logout all.                                    | Authenticated users                                     |
| Support-access marker              | Visibly marks platform support sessions.                                         | Platform admins in support mode                         |

### 6.2 Suggested Mobile Navigation Model

| Navigation Area            | Recommended Items                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Bottom navigation          | Dashboard, Job Orders, Customers, Inventory, More                                                      |
| Floating or primary action | Contextual create action, such as New Job Order, Add Customer, Record Payment, or New Transfer         |
| More menu                  | Invoices, Payments, Purchases, Suppliers, Reports, Reminders, Employees, Settings, Audit Logs, Exports |
| Platform admin shell       | Tenants, Plans, Support Access, Exports, Deletion Jobs, Platform Audit Logs                            |

The actual visual treatment may be finalized during wireframing. The screen inventory must remain source-aligned.

---

## 7. Tenant Lifecycle Screen Access Map

| Tenant Status      | Allowed UX Areas                                                                                            | Blocked UX Areas                                                             | Required UX State                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------- |
| `pending_setup`    | Login, email verification, onboarding, profile setup, subscription information, password management, logout | Operational modules                                                          | Onboarding progress and setup blockers            |
| `active`           | Full access based on permissions and branch access                                                          | Unauthorized actions only                                                    | Normal operational state                          |
| `grace_period`     | Full access based on permissions and branch access                                                          | Unauthorized actions only                                                    | Renewal warning after login and dashboard warning |
| `read_only`        | View/search, reports, export, renewal request, password change, logout                                      | Operational writes, file uploads, employee/role/settings operational changes | Read-only banner and renewal prompt               |
| `suspended`        | Shop Owner renewal/export, password/logout; platform audited support access                                 | Non-owner application access; all operational writes                         | Suspended access screen                           |
| `pending_deletion` | Platform-controlled deletion flow; emergency extension if granted                                           | Tenant operational access; export disabled unless emergency extension        | Pending deletion message                          |
| `deleted`          | None for tenant users                                                                                       | All tenant access                                                            | Tenant unavailable / account inactive message     |

---

## 8. Role-Based Landing Recommendations

| Role            | Default Landing         | Primary Quick Actions                                                                      | Restricted UX Notes                                                            |
| --------------- | ----------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Shop Owner      | Dashboard               | Renew subscription, export data, create branch, manage employees, view reports, audit logs | Full tenant permissions and tenant-wide branch access                          |
| Manager         | Dashboard or Job Orders | Assign employees, approve adjustments, approve refunds, monitor branch reports             | Access depends on assigned permissions and branch access                       |
| Service Advisor | Job Orders              | Create customer, add motorcycle, create estimate, create job order, add notes/parts/labor  | No financial access unless granted                                             |
| Mechanic        | Assigned Jobs           | Start/pause/resume/finish work session, add notes/photos, complete labor tasks             | No invoices/payments/supplier balances/financial reports unless custom-granted |
| Cashier         | Invoices / Payments     | Generate invoice, record partial/split payment, issue receipt, process refund if permitted | Receipt records are immutable                                                  |
| Inventory Clerk | Inventory               | Product lookup, receive stock, request adjustment, transfer stock, low-stock alerts        | Financial report access only if granted                                        |
| Platform Admin  | Platform Tenants        | Create tenant, manage plans/subscriptions, support access, exports, deletion jobs          | Must not silently impersonate tenant users                                     |

---

## 9. Screen Inventory Overview

| Screen Group                  | Route Prefix                                           | Primary Users                                                       | Source Module                                |
| ----------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------- |
| Public/Auth                   | `/auth/*`                                              | All users                                                           | Authentication and account management        |
| Onboarding                    | `/onboarding/*`                                        | Shop Owner                                                          | Shop onboarding and settings                 |
| Dashboard                     | `/dashboard`                                           | Tenant users with report permissions                                | Dashboard and reports                        |
| Customers                     | `/customers/*`                                         | Owner, Manager, Service Advisor                                     | Customer management                          |
| Motorcycles                   | `/motorcycles/*`                                       | Owner, Manager, Service Advisor, Mechanic read-only where permitted | Motorcycle management                        |
| Service Catalog               | `/services/*`                                          | Owner, Manager, Service Advisor                                     | Service catalog                              |
| Estimates                     | `/estimates/*`                                         | Owner, Manager, Service Advisor                                     | Service estimates                            |
| Job Orders                    | `/job-orders/*`                                        | Owner, Manager, Service Advisor, Mechanic                           | Job order management                         |
| Mechanic Sessions             | `/mechanic-sessions/*`                                 | Mechanic, Manager                                                   | Mechanic time tracking                       |
| Products & Inventory          | `/inventory/*`, `/products/*`, `/product-categories/*` | Inventory Clerk, Manager, Owner                                     | Inventory management                         |
| Inventory Adjustments         | `/inventory-adjustments/*`                             | Inventory Clerk, Manager                                            | Inventory adjustment approval workflow       |
| Inventory Transfers           | `/inventory-transfers/*`                               | Inventory Clerk, Manager                                            | Inventory transfer                           |
| Suppliers                     | `/suppliers/*`                                         | Inventory Clerk, Manager, Owner                                     | Supplier management                          |
| Purchases                     | `/purchase-orders/*`                                   | Inventory Clerk, Manager, Owner                                     | Purchase management                          |
| Supplier Returns              | `/supplier-returns/*`                                  | Inventory Clerk, Manager, Owner                                     | Supplier returns                             |
| Invoices                      | `/invoices/*`                                          | Cashier, Manager, Owner                                             | Sales and invoicing                          |
| Payments / Receipts / Refunds | `/payments/*`, `/receipts/*`, `/refunds/*`             | Cashier, Manager, Owner                                             | Payments, receipts, refunds                  |
| AR / AP                       | `/accounts-receivable/*`, `/accounts-payable/*`        | Cashier, Manager, Owner                                             | AR/AP reports and balances                   |
| Expenses                      | `/expenses/*`                                          | Owner, Manager, authorized users                                    | Expenses                                     |
| Reminders                     | `/reminders/*`                                         | Owner, Manager, Service Advisor                                     | Customer reminders                           |
| Notifications                 | `/notifications/*`                                     | Tenant users                                                        | Internal notifications                       |
| Files                         | `/files/*`                                             | Authorized tenant users                                             | File attachments                             |
| Reports                       | `/reports/*`                                           | Owner, Manager, authorized users                                    | Reports                                      |
| Exports                       | `/exports/*`                                           | Shop Owner                                                          | Data export                                  |
| Audit Logs                    | `/audit-logs/*`                                        | Owner, authorized users, platform admins                            | Audit logs                                   |
| Settings                      | `/settings/*`                                          | Owner, authorized users                                             | Shop settings, billing settings, preferences |
| Employees & Roles             | `/employees/*`, `/roles/*`                             | Owner, authorized managers                                          | Employee, roles, permissions                 |
| Background Jobs               | `/background-jobs/*`                                   | Authorized users / platform admins                                  | Background job status                        |
| Offline Cache                 | `/offline-cache/*`                                     | Authenticated users                                                 | Offline shell/read-only cache                |
| Platform Admin                | `/platform/*`                                          | Platform admins                                                     | SaaS platform administration                 |

---

## 10. Public and Authentication Screens

| Screen                      | Route                              | Purpose                                                                     | Primary Actions                       | API Alignment                                |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------- |
| Owner Signup                | `/auth/signup-owner`               | Create owner signup tenant flow.                                            | Submit signup, verify errors.         | `POST /auth/signup-owner`                    |
| Login                       | `/auth/login`                      | Authenticate user.                                                          | Login, remember me, forgot password.  | `POST /auth/login`                           |
| Email Verification Required | `/auth/email-verification`         | Restrict unverified users before operational access.                        | Resend verification, logout.          | `POST /auth/email-verification/resend`       |
| Email Verification Result   | `/auth/email-verification/confirm` | Confirm email token result.                                                 | Continue to session/onboarding/login. | `POST /auth/email-verification/confirm`      |
| Forgot Password             | `/auth/password/forgot`            | Request reset link.                                                         | Submit email.                         | `POST /auth/password/forgot`                 |
| Reset Password              | `/auth/password/reset`             | Set new password using token.                                               | Submit new password.                  | `POST /auth/password/reset`                  |
| Change Password             | `/auth/password/change`            | Authenticated password change.                                              | Submit current/new password.          | `POST /auth/password/change`                 |
| Current Session             | Internal route/state               | Load user, tenant, permissions, branches, plan, subscription, access flags. | Refresh session context.              | `GET /auth/session`                          |
| Logout Confirmation         | Modal / `/auth/logout`             | End current session or all sessions.                                        | Logout, logout all.                   | `POST /auth/logout`, `POST /auth/logout-all` |

### Required States

- Invalid credentials.
- Account locked/rate-limited.
- Email not verified.
- Deactivated user.
- Tenant blocked by status.
- Password policy validation.
- Token expired / token already used.

---

## 11. Onboarding and Shop Setup Screens

| Screen                     | Route                          | Purpose                                                                 | Primary Actions                                  | Access Rule                       |
| -------------------------- | ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------- |
| Onboarding Gate            | `/onboarding`                  | Show setup progress and missing requirements.                           | Continue setup.                                  | Shop Owner during `pending_setup` |
| Shop Profile Setup         | `/onboarding/shop-profile`     | Enter shop name, address, contact, logo, business hours.                | Save profile.                                    | Shop Owner                        |
| Tax and Localization Setup | `/onboarding/tax-localization` | Configure tax profile, tax mode, VAT rate, country, timezone, currency. | Save settings.                                   | Shop Owner                        |
| Invoice Prefix Setup       | `/onboarding/invoice-prefix`   | Configure immutable invoice prefix before first invoice.                | Save prefix.                                     | Shop Owner                        |
| First Branch Setup         | `/onboarding/branch`           | Create at least one active branch.                                      | Create branch.                                   | Shop Owner                        |
| Owner / Role Verification  | `/onboarding/owner-check`      | Confirm active Shop Owner exists.                                       | Resolve blockers.                                | Shop Owner                        |
| Complete Onboarding        | `/onboarding/complete`         | Complete setup when requirements pass.                                  | Complete onboarding.                             | Shop Owner                        |
| Subscription Info          | `/onboarding/subscription`     | Show plan and expiration info.                                          | View renewal instructions/request if applicable. | Shop Owner                        |

### Required States

- Missing required fields.
- Invalid invoice prefix.
- Invalid tax profile/mode combination.
- No active branch.
- No active Shop Owner.
- Missing subscription plan or expiration date.
- Pending setup blocks operational module links.

---

## 12. Dashboard Screens

| Screen                | Route                         | Purpose                                                   | Primary Widgets / Actions                                                                        | API Alignment                                     |
| --------------------- | ----------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Dashboard Summary     | `/dashboard`                  | Business and operations overview.                         | Daily sales, monthly revenue, pending jobs, AR/AP, low stock, open transfers, pending receiving. | `GET /dashboard/summary`                          |
| Revenue Chart         | `/dashboard/revenue`          | Revenue trend by date/branch.                             | Filter date range, filter branch.                                                                | `GET /dashboard/charts/revenue`                   |
| Inventory Alerts      | `/dashboard/inventory-alerts` | Low stock and inventory alerts.                           | View product/branch details.                                                                     | `GET /dashboard/inventory-alerts`                 |
| Renewal Warning Panel | Dashboard component           | Show grace/read-only/suspended warnings where applicable. | Renew/request renewal.                                                                           | `GET /auth/session`, `POST /shop/renewal-request` |

### Required States

- Branch-scoped dashboard.
- Multi-branch filter.
- Plan-restricted advanced report links.
- Grace-period renewal warning.
- Read-only banner.
- Empty-state dashboard for new tenant.

---

## 13. Customer Screens

| Screen               | Route                                  | Purpose                                          | Primary Actions                                             | API Alignment                      |
| -------------------- | -------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------- |
| Customer List/Search | `/customers`                           | Search active customers.                         | Search by name, mobile, email, tag, motorcycle plate/model. | `GET /customers`                   |
| Create Customer      | `/customers/new`                       | Create customer.                                 | Save, review duplicate warnings.                            | `POST /customers`                  |
| Customer Detail      | `/customers/{customer_id}`             | View profile and tenant-wide customer data.      | Edit, add note/tag, view history.                           | `GET /customers/{id}`              |
| Edit Customer        | `/customers/{customer_id}/edit`        | Update customer.                                 | Save with duplicate warning.                                | `PATCH /customers/{id}`            |
| Customer History     | `/customers/{customer_id}/history`     | Show branch-access-filtered operational history. | Filter branch/date/type.                                    | `GET /customers/{id}/history`      |
| Customer Motorcycles | `/customers/{customer_id}/motorcycles` | View linked motorcycles.                         | Add motorcycle.                                             | `GET /customers/{id}/motorcycles`  |
| Merge Customers      | `/customers/merge`                     | Merge duplicates into surviving customer.        | Select survivor, confirm reason.                            | `POST /customers/merge`            |
| Soft Delete Customer | Modal                                  | Soft delete if no blockers.                      | Confirm reason.                                             | `POST /customers/{id}/soft-delete` |
| Restore Customer     | Modal                                  | Restore soft-deleted customer.                   | Confirm duplicate re-check.                                 | `POST /customers/{id}/restore`     |

### Required States

- Duplicate warnings do not auto-merge.
- Soft-deleted customers excluded from default search.
- Soft-delete blocked by open job orders, unpaid invoices, active reminders, or active motorcycles.
- Restoration blocked by exact active duplicate conflict.
- Branch-specific history hidden when user lacks branch access.

---

## 14. Motorcycle Screens

| Screen                 | Route                                           | Purpose                                             | Primary Actions                                 | API Alignment                                |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------- | ----------------------------------------------- | -------------------------------------------- |
| Motorcycle List/Search | `/motorcycles`                                  | Search motorcycles.                                 | Search plate, model, customer.                  | `GET /motorcycles`                           |
| Add Motorcycle         | `/motorcycles/new`                              | Link motorcycle to active customer.                 | Save, review duplicate identifier warnings.     | `POST /motorcycles`                          |
| Motorcycle Detail      | `/motorcycles/{motorcycle_id}`                  | View motorcycle profile.                            | Edit, view service history, attach docs/photos. | `GET /motorcycles/{id}`                      |
| Edit Motorcycle        | `/motorcycles/{motorcycle_id}/edit`             | Update motorcycle data or authorized customer link. | Save with audit reason if needed.               | `PATCH /motorcycles/{id}`                    |
| Service History        | `/motorcycles/{motorcycle_id}/service-history`  | Branch-access-filtered service timeline.            | Filter branch/date/status.                      | `GET /motorcycles/{id}/service-history`      |
| Mileage Correction     | Modal / `/motorcycles/{id}/mileage-corrections` | Correct mileage lower than latest.                  | Submit correction reason.                       | `POST /motorcycles/{id}/mileage-corrections` |
| Soft Delete Motorcycle | Modal                                           | Soft delete if no blockers.                         | Confirm.                                        | `POST /motorcycles/{id}/soft-delete`         |
| Restore Motorcycle     | Modal                                           | Restore when linked customer is active.             | Confirm duplicate re-check.                     | `POST /motorcycles/{id}/restore`             |

### Required States

- Linked customer must be active.
- Duplicate plate/engine/chassis warnings.
- Soft delete blocked by open jobs, active reminders, or unpaid linked invoices.
- Restore blocked when linked customer is merged or soft-deleted.

---

## 15. Service Catalog Screens

| Screen             | Route                         | Purpose                                         | Primary Actions                                 | API Alignment                    |
| ------------------ | ----------------------------- | ----------------------------------------------- | ----------------------------------------------- | -------------------------------- |
| Service List       | `/services`                   | View/search active services.                    | Search, create service.                         | `GET /services`                  |
| Create Service     | `/services/new`               | Create predefined service.                      | Save service, add disclaimer if variable price. | `POST /services`                 |
| Service Detail     | `/services/{service_id}`      | View service details and status.                | Edit, deactivate/reactivate.                    | `GET /services/{id}`             |
| Edit Service       | `/services/{service_id}/edit` | Update service.                                 | Save.                                           | `PATCH /services/{id}`           |
| Deactivate Service | Modal                         | Deactivate if not referenced by open workflows. | Confirm.                                        | `POST /services/{id}/deactivate` |
| Reactivate Service | Modal                         | Reactivate if name remains unique.              | Confirm.                                        | `POST /services/{id}/reactivate` |

### Required States

- Variable-price service requires price disclaimer.
- Deactivation blocked by open job orders or active estimates.
- Historical records must still show copied service details.

---

## 16. Estimate Screens

| Screen                 | Route                           | Purpose                                       | Primary Actions                                      | API Alignment                       |
| ---------------------- | ------------------------------- | --------------------------------------------- | ---------------------------------------------------- | ----------------------------------- |
| Estimate List          | `/estimates`                    | List/filter estimates.                        | Filter status, branch, date.                         | `GET /estimates`                    |
| Create Draft Estimate  | `/estimates/new`                | Create draft estimate.                        | Select branch, customer, motorcycle, lines.          | `POST /estimates`                   |
| Estimate Detail        | `/estimates/{estimate_id}`      | View estimate, lines, status.                 | Present, approve, convert, cancel.                   | `GET /estimates/{id}`               |
| Edit Draft Estimate    | `/estimates/{estimate_id}/edit` | Update draft estimate.                        | Edit lines, valid-until date.                        | `PATCH /estimates/{id}`             |
| Present Estimate       | Modal                           | Move draft to presented.                      | Confirm line items and valid-until date.             | `POST /estimates/{id}/present`      |
| Approve Estimate       | Modal                           | Record customer approval.                     | Approval method, customer name, optional attachment. | `POST /estimates/{id}/approve`      |
| Convert Estimate       | Wizard / modal                  | Convert approved estimate to job order lines. | Select/confirm job order target.                     | `POST /estimates/{id}/convert`      |
| Cancel Estimate        | Modal                           | Cancel with reason.                           | Submit reason.                                       | `POST /estimates/{id}/cancel`       |
| Estimate Status Events | `/estimates/{id}/status-events` | View transition history.                      | View actor, date, reason.                            | `GET /estimates/{id}/status-events` |

### Required States

- Draft estimates do not expire automatically.
- Presented estimates expire after valid-until date when not approved/converted/cancelled.
- Estimates do not reserve inventory and do not affect revenue, AR, tax, FIFO, or inventory.

---

## 17. Job Order Screens

| Screen                        | Route                             | Purpose                                                              | Primary Actions                                                                | API Alignment                              |
| ----------------------------- | --------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------ |
| Job Order Board/List          | `/job-orders`                     | Track job orders by status and branch.                               | Filter status, branch, mechanic, date.                                         | `GET /job-orders`                          |
| Create Job Order              | `/job-orders/new`                 | Intake service work.                                                 | Select branch/customer/motorcycle, mileage, concern, advisor, mechanic, lines. | `POST /job-orders`                         |
| Job Order Detail              | `/job-orders/{job_order_id}`      | View service work, lines, parts, mechanics, status.                  | Edit, assign, complete, release, cancel, invoice.                              | `GET /job-orders/{id}`                     |
| Edit Job Order                | `/job-orders/{job_order_id}/edit` | Edit before release/cancel under line rules.                         | Save.                                                                          | `PATCH /job-orders/{id}`                   |
| Add Service/Labor Line        | Modal                             | Add billable or free service/labor lines.                            | Add line, free-labor reason if zero amount.                                    | `POST /job-orders/{id}/service-lines`      |
| Add Part Line / Reserve Stock | Modal                             | Add part and create inventory reservation.                           | Select product, quantity, price, reserve.                                      | `POST /job-orders/{id}/part-lines`         |
| Edit Job Order Line           | Modal                             | Edit allowed lines.                                                  | Save line changes.                                                             | `PATCH /job-orders/{id}/lines/{line_id}`   |
| Remove Job Order Line         | Modal                             | Remove editable line and release reservation if needed.              | Confirm.                                                                       | `DELETE /job-orders/{id}/lines/{line_id}`  |
| Assign Mechanics              | Modal                             | Assign primary and additional mechanics.                             | Save assignments.                                                              | `POST /job-orders/{id}/assign-mechanics`   |
| Change Status                 | Modal                             | Allowed transition with validation.                                  | Select transition, enter reason if required.                                   | `POST /job-orders/{id}/status-transitions` |
| Complete Job Order            | Modal / wizard                    | Complete service and consume reserved inventory.                     | Confirm completed lines, mileage, notes.                                       | `POST /job-orders/{id}/complete`           |
| Release Job Order             | Modal                             | Release when fully paid, no-charge, or release-with-balance allowed. | Confirm release condition/reason.                                              | `POST /job-orders/{id}/release`            |
| Cancel Job Order              | Modal                             | Cancel with reason and release reservations if allowed.              | Submit reason.                                                                 | `POST /job-orders/{id}/cancel`             |
| Attach Job Files              | `/job-orders/{id}/files`          | Attach photos/documents.                                             | Upload files.                                                                  | `POST /job-orders/{id}/files`              |
| Job Status Events             | `/job-orders/{id}/status-events`  | View status history.                                                 | View actor, reason, timestamp.                                                 | `GET /job-orders/{id}/status-events`       |

### Required States

- Primary mechanic required before moving to `in_progress`.
- Waiting for parts requires explicit authorized status change and reason.
- Add part blocked when available stock is insufficient.
- Completion consumes reserved inventory and creates FIFO/ledger effects.
- Released and cancelled job orders are final.
- Job order line edits after completion are restricted.

---

## 18. Mechanic Work Session Screens

| Screen               | Route                                                  | Purpose                             | Primary Actions                   | API Alignment                               |
| -------------------- | ------------------------------------------------------ | ----------------------------------- | --------------------------------- | ------------------------------------------- |
| My Assigned Jobs     | `/mechanic-sessions/my-jobs` or filtered `/job-orders` | Show mechanic’s assigned jobs.      | Open job, start work.             | `GET /job-orders`, `GET /mechanic-sessions` |
| Start Work Session   | Modal                                                  | Begin work session.                 | Start with notes.                 | `POST /mechanic-sessions`                   |
| Active Session       | `/mechanic-sessions/{session_id}`                      | Show active or paused session.      | Pause, resume, finish, add notes. | `GET /mechanic-sessions`                    |
| Pause Session        | Modal/action                                           | Pause active work.                  | Confirm pause.                    | `POST /mechanic-sessions/{id}/pause`        |
| Resume Session       | Modal/action                                           | Resume paused work.                 | Confirm resume.                   | `POST /mechanic-sessions/{id}/resume`       |
| Finish Session       | Modal/action                                           | Finish active/paused session.       | Confirm finish, notes.            | `POST /mechanic-sessions/{id}/finish`       |
| Work Session History | `/mechanic-sessions`                                   | View sessions by mechanic/job/date. | Filter.                           | `GET /mechanic-sessions`                    |

### Required States

- Mechanic cannot have more than one unfinished session.
- Pause/resume must respect session state.
- Manager override behavior must be permission-gated.

---

## 19. Product and Inventory Screens

| Screen                   | Route                                | Purpose                                              | Primary Actions                               | API Alignment                     |
| ------------------------ | ------------------------------------ | ---------------------------------------------------- | --------------------------------------------- | --------------------------------- |
| Product List/Search      | `/products`                          | Search tenant product catalog.                       | Search SKU, barcode, product name, category.  | `GET /products`                   |
| Create Product           | `/products/new`                      | Create product.                                      | Save product.                                 | `POST /products`                  |
| Product Detail           | `/products/{product_id}`             | View product, branch stock, movement.                | Edit, deactivate/reactivate, view stock/FIFO. | `GET /products/{id}`              |
| Edit Product             | `/products/{product_id}/edit`        | Update product.                                      | Save with `lock_version`.                     | `PATCH /products/{id}`            |
| Product Stock            | `/products/{product_id}/stock`       | Stock per accessible branch.                         | Filter branch.                                | `GET /products/{id}/stock`        |
| FIFO Layers              | `/products/{product_id}/fifo-layers` | View FIFO layer details.                             | Filter branch.                                | `GET /products/{id}/fifo-layers`  |
| Deactivate Product       | Modal                                | Deactivate if no stock/reservations/open references. | Confirm.                                      | `POST /products/{id}/deactivate`  |
| Reactivate Product       | Modal                                | Reactivate if SKU/barcode remain unique.             | Confirm.                                      | `POST /products/{id}/reactivate`  |
| Category List            | `/product-categories`                | View categories.                                     | Create/edit/deactivate/reactivate.            | `GET /product-categories`         |
| Inventory Stock Balances | `/inventory/stock-balances`          | Branch/product stock overview.                       | Filter branch/product/category.               | `GET /inventory/stock-balances`   |
| Inventory Ledger         | `/inventory/ledger`                  | Immutable stock movement history.                    | Filter branch/product/date/type.              | `GET /inventory/ledger`           |
| Low Stock Alerts         | `/inventory/low-stock-alerts`        | Active low-stock alerts.                             | Resolve by stock movement.                    | `GET /inventory/low-stock-alerts` |

### Required States

- Available stock equals on-hand minus reserved.
- Direct stock edits are not allowed; use receiving, reservation, adjustment, transfer, return, refund/void reversal workflows.
- Product deactivation blocked by stock, reservations, open job orders, open purchase orders, or draft/pending/in-transit transfers.

---

## 20. Inventory Adjustment Screens

| Screen                  | Route                                    | Purpose                                      | Primary Actions                        | API Alignment                              |
| ----------------------- | ---------------------------------------- | -------------------------------------------- | -------------------------------------- | ------------------------------------------ |
| Adjustment List         | `/inventory-adjustments`                 | View adjustment records.                     | Filter status, branch, date.           | `GET /inventory-adjustments`               |
| Create Draft Adjustment | `/inventory-adjustments/new`             | Create inventory adjustment request.         | Add branch, reason, lines.             | `POST /inventory-adjustments`              |
| Adjustment Detail       | `/inventory-adjustments/{adjustment_id}` | View adjustment and workflow status.         | Submit, approve, reject, cancel, post. | `GET /inventory-adjustments/{id}`          |
| Edit Draft Adjustment   | `/inventory-adjustments/{id}/edit`       | Update draft lines.                          | Save.                                  | `PATCH /inventory-adjustments/{id}`        |
| Submit Adjustment       | Modal                                    | Submit for approval or post below threshold. | Confirm.                               | `POST /inventory-adjustments/{id}/submit`  |
| Approve Adjustment      | Modal                                    | Approve pending adjustment.                  | Confirm approval.                      | `POST /inventory-adjustments/{id}/approve` |
| Reject Adjustment       | Modal                                    | Reject with reason.                          | Submit reason.                         | `POST /inventory-adjustments/{id}/reject`  |
| Cancel Adjustment       | Modal                                    | Cancel draft/pending before posting.         | Confirm.                               | `POST /inventory-adjustments/{id}/cancel`  |
| Post Adjustment         | Modal                                    | Post stock-affecting ledger entries.         | Confirm.                               | `POST /inventory-adjustments/{id}/post`    |
| Force Adjustment        | `/inventory-adjustments/force`           | Exceptional corrective adjustment.           | Submit reason and lines.               | `POST /inventory-adjustments/force`        |

### Required States

- Stock does not change until status reaches `posted`.
- Approval threshold requires approval workflow.
- Adjustment cannot make on-hand lower than reserved.
- Posted adjustments are final.

---

## 21. Inventory Transfer Screens

| Screen                 | Route                                     | Purpose                                           | Primary Actions                                   | API Alignment                                 |
| ---------------------- | ----------------------------------------- | ------------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| Transfer List          | `/inventory-transfers`                    | View transfers by source/destination/status.      | Filter branch/status/date.                        | `GET /inventory-transfers`                    |
| Create Draft Transfer  | `/inventory-transfers/new`                | Create draft branch transfer.                     | Select source/destination, product lines.         | `POST /inventory-transfers`                   |
| Transfer Detail        | `/inventory-transfers/{transfer_id}`      | View transfer workflow and lines.                 | Submit, send, receive, cancel.                    | `GET /inventory-transfers/{id}`               |
| Edit Draft Transfer    | `/inventory-transfers/{id}/edit`          | Update draft transfer.                            | Save.                                             | `PATCH /inventory-transfers/{id}`             |
| Submit Transfer        | Modal                                     | Move draft to pending and reserve source stock.   | Confirm.                                          | `POST /inventory-transfers/{id}/submit`       |
| Send Transfer          | Modal                                     | Move pending to in-transit with sent quantities.  | Confirm sent quantities.                          | `POST /inventory-transfers/{id}/send`         |
| Receive Transfer       | Wizard / modal                            | Receive transfer, record variance if any.         | Confirm received quantities and variance reasons. | `POST /inventory-transfers/{id}/receive`      |
| Cancel Transfer        | Modal                                     | Cancel pending/in-transit using disposition rule. | Select disposition, reason.                       | `POST /inventory-transfers/{id}/cancel`       |
| Transfer Status Events | `/inventory-transfers/{id}/status-events` | View transfer history.                            | View actor, timestamp, reason.                    | `GET /inventory-transfers/{id}/status-events` |

### Required States

- Source/destination branches must be active and different.
- Submission blocks if source available stock is insufficient.
- Receive can record variance loss without creating AP/AR/revenue/expense.
- Received and cancelled transfers are final.

---

## 22. Supplier Screens

| Screen              | Route                           | Purpose                                           | Primary Actions                                | API Alignment                       |
| ------------------- | ------------------------------- | ------------------------------------------------- | ---------------------------------------------- | ----------------------------------- |
| Supplier List       | `/suppliers`                    | Search/list suppliers.                            | Create supplier, filter status.                | `GET /suppliers`                    |
| Create Supplier     | `/suppliers/new`                | Create supplier.                                  | Save supplier.                                 | `POST /suppliers`                   |
| Supplier Detail     | `/suppliers/{supplier_id}`      | View supplier profile, purchase history, balance. | Edit, deactivate/reactivate, payments/credits. | `GET /suppliers/{id}`               |
| Edit Supplier       | `/suppliers/{supplier_id}/edit` | Update supplier.                                  | Save.                                          | `PATCH /suppliers/{id}`             |
| Deactivate Supplier | Modal                           | Deactivate supplier where allowed.                | Confirm.                                       | `POST /suppliers/{id}/deactivate`   |
| Reactivate Supplier | Modal                           | Reactivate after active-name uniqueness check.    | Confirm.                                       | `POST /suppliers/{id}/reactivate`   |
| Supplier Payments   | `/suppliers/{id}/payments`      | Record and view supplier payments.                | Create payment.                                | `GET/POST /suppliers/{id}/payments` |
| Supplier Credits    | `/suppliers/{id}/credits`       | View supplier credits.                            | Create credit if permitted.                    | `GET/POST /suppliers/{id}/credits`  |

---

## 23. Purchase Screens

| Screen                | Route                                             | Purpose                               | Primary Actions                                         | API Alignment                           |
| --------------------- | ------------------------------------------------- | ------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| Purchase Order List   | `/purchase-orders`                                | View purchase orders.                 | Filter branch/supplier/status/date.                     | `GET /purchase-orders`                  |
| Create Purchase Order | `/purchase-orders/new`                            | Create PO.                            | Select supplier, branch, terms, lines.                  | `POST /purchase-orders`                 |
| Purchase Order Detail | `/purchase-orders/{purchase_order_id}`            | View PO and receiving status.         | Edit, order, receive, cancel/close where allowed.       | `GET /purchase-orders/{id}`             |
| Edit Purchase Order   | `/purchase-orders/{id}/edit`                      | Update draft/order where allowed.     | Save.                                                   | `PATCH /purchase-orders/{id}`           |
| Receive Purchase      | `/purchase-orders/{id}/receivings/new`            | Receive stock and create FIFO layers. | Enter received quantities, costs, payment info if cash. | `POST /purchase-orders/{id}/receivings` |
| Receiving Detail      | `/purchase-orders/{id}/receivings/{receiving_id}` | View posted receiving.                | View ledger/FIFO/AP effects.                            | `GET /purchase-orders/{id}`             |

### Required States

- Receiving increases branch on-hand stock.
- Credit purchases increase AP.
- Cash purchases do not create AP.
- Purchase orders with received stock cannot be cancelled.

---

## 24. Supplier Return Screens

| Screen                 | Route                                | Purpose                                 | Primary Actions                         | API Alignment                        |
| ---------------------- | ------------------------------------ | --------------------------------------- | --------------------------------------- | ------------------------------------ |
| Supplier Return List   | `/supplier-returns`                  | View supplier returns.                  | Filter branch/supplier/status.          | `GET /supplier-returns`              |
| Create Supplier Return | `/supplier-returns/new`              | Draft supplier return.                  | Select supplier, branch, reason, lines. | `POST /supplier-returns`             |
| Supplier Return Detail | `/supplier-returns/{return_id}`      | View return status and financial value. | Post/cancel.                            | `GET /supplier-returns/{id}`         |
| Edit Draft Return      | `/supplier-returns/{return_id}/edit` | Update draft return.                    | Save.                                   | `PATCH /supplier-returns/{id}`       |
| Post Supplier Return   | Modal                                | Post stock/AP/credit effects.           | Confirm.                                | `POST /supplier-returns/{id}/post`   |
| Cancel Supplier Return | Modal                                | Cancel draft return.                    | Confirm.                                | `POST /supplier-returns/{id}/cancel` |

### Required States

- Supplier return decreases stock.
- Supplier return reduces AP or creates supplier credit depending on payment state.
- Posted supplier return is final.

---

## 25. Invoice Screens

| Screen                 | Route                         | Purpose                                              | Primary Actions                                             | API Alignment                |
| ---------------------- | ----------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- | ---------------------------- |
| Invoice List           | `/invoices`                   | View invoices by status/date/customer/branch.        | Filter, create invoice.                                     | `GET /invoices`              |
| Create Draft Invoice   | `/invoices/new`               | Create invoice from job order lines.                 | Select job orders, billable lines, discount, tax, due date. | `POST /invoices`             |
| Invoice Detail         | `/invoices/{invoice_id}`      | View invoice, billing allocations, status, payments. | Issue, cancel draft, void, refund, record payment.          | `GET /invoices/{id}`         |
| Edit Draft Invoice     | `/invoices/{invoice_id}/edit` | Update draft invoice before issue.                   | Save.                                                       | `PATCH /invoices/{id}`       |
| Issue Invoice          | Modal                         | Issue invoice and finalize billing allocations.      | Confirm issue.                                              | `POST /invoices/{id}/issue`  |
| Cancel Invoice         | Modal                         | Cancel allowed invoice.                              | Submit reason.                                              | `POST /invoices/{id}/cancel` |
| Void Invoice           | Modal                         | Void invoice under defined rules.                    | Submit reason.                                              | `POST /invoices/{id}/void`   |
| Invoice Printable View | `/invoices/{id}/print`        | Printable invoice view.                              | Print/download where supported.                             | `GET /invoices/{id}`         |

### Required States

- Draft invoice can reserve billing allocation.
- Issued invoices copy tax profile, tax mode, VAT rate.
- Overbilling is blocked by billing allocations.
- Paid invoices cannot be directly edited.

---

## 26. Payment, Receipt, and Refund Screens

| Screen          | Route                                 | Purpose                                  | Primary Actions                                    | API Alignment                  |
| --------------- | ------------------------------------- | ---------------------------------------- | -------------------------------------------------- | ------------------------------ |
| Record Payment  | `/invoices/{invoice_id}/payments/new` | Record customer payment against invoice. | Enter amount, date, method, reference.             | `POST /invoices/{id}/payments` |
| Payment Detail  | `/payments/{payment_id}`              | View payment record.                     | Refund if allowed.                                 | `GET /payments/{id}`           |
| Payment History | `/payments`                           | Search payment history.                  | Filter method/date/invoice/customer.               | `GET /payments`                |
| Receipt Detail  | `/receipts/{receipt_id}`              | Immutable receipt view.                  | View/print.                                        | `GET /receipts/{id}`           |
| Receipt List    | `/receipts`                           | Search receipts.                         | Filter date/customer/invoice.                      | `GET /receipts`                |
| Create Refund   | `/payments/{payment_id}/refunds/new`  | Refund against payment.                  | Enter amount, reason, optional inventory reversal. | `POST /payments/{id}/refunds`  |
| Refund Detail   | `/refunds/{refund_id}`                | View refund record.                      | View audit.                                        | `GET /refunds/{id}`            |

### Required States

- Payment amount cannot exceed remaining collectible balance.
- Partial and split payments are supported as multiple payment records.
- Each payment generates exactly one immutable receipt.
- Payment corrections use refund plus new payment, not direct edit.
- Refund does not restore inventory unless explicitly selected.

---

## 27. Accounts Receivable and Accounts Payable Screens

| Screen                      | Route                                          | Purpose                                  | Primary Actions                          | API Alignment     |
| --------------------------- | ---------------------------------------------- | ---------------------------------------- | ---------------------------------------- | ----------------- |
| Accounts Receivable Summary | `/accounts-receivable`                         | View customer outstanding balances.      | Filter branch/customer/date.             | AR APIs / reports |
| Customer AR Detail          | `/accounts-receivable/customers/{customer_id}` | Customer invoice balance history.        | Open invoice/payment.                    | AR APIs / reports |
| Accounts Payable Summary    | `/accounts-payable`                            | View supplier outstanding balances.      | Filter branch/supplier/date.             | AP APIs / reports |
| Supplier AP Detail          | `/accounts-payable/suppliers/{supplier_id}`    | Supplier payable/payment/credit history. | Record supplier payment where permitted. | AP APIs / reports |

### Required States

- AR reflects invoices, payments, refunds, voids.
- AP reflects credit purchases, supplier payments, supplier returns, supplier credits.
- Branch access applies to branch-specific histories.

---

## 28. Expense Screens

| Screen             | Route                          | Purpose                      | Primary Actions                                   | API Alignment              |
| ------------------ | ------------------------------ | ---------------------------- | ------------------------------------------------- | -------------------------- |
| Expense List       | `/expenses`                    | View expenses.               | Filter branch/category/date/status.               | `GET /expenses`            |
| Create Expense     | `/expenses/new`                | Record operating expense.    | Enter branch/category/date/payment method/amount. | `POST /expenses`           |
| Expense Detail     | `/expenses/{expense_id}`       | View expense.                | Edit where allowed, void.                         | `GET /expenses/{id}`       |
| Edit Expense       | `/expenses/{expense_id}/edit`  | Edit allowed expense fields. | Save with reason if required.                     | `PATCH /expenses/{id}`     |
| Void Expense       | Modal                          | Void expense.                | Submit reason.                                    | `POST /expenses/{id}/void` |
| Expense Categories | `/settings/expense-categories` | Manage expense categories.   | Create/edit/deactivate.                           | Expense category APIs      |

### Required States

- Voided expenses excluded from profit reports.
- Expense edits and voids must be audit logged.
- Read-only tenant status blocks expense creation/update/void.

---

## 29. Reminder Screens

| Screen          | Route                      | Purpose                                                | Primary Actions                          | API Alignment                 |
| --------------- | -------------------------- | ------------------------------------------------------ | ---------------------------------------- | ----------------------------- |
| Reminder List   | `/reminders`               | View customer reminders.                               | Filter status/channel/date/customer.     | `GET /reminders`              |
| Create Reminder | `/reminders/new`           | Create time, mileage, birthday, or follow-up reminder. | Select customer/motorcycle/channel/date. | `POST /reminders`             |
| Reminder Detail | `/reminders/{reminder_id}` | View reminder and delivery attempts.                   | Edit, cancel, send if allowed.           | `GET /reminders/{id}`         |
| Edit Reminder   | `/reminders/{id}/edit`     | Update reminder.                                       | Save.                                    | `PATCH /reminders/{id}`       |
| Send Reminder   | Modal                      | Send reminder through plan-enabled channel.            | Confirm channel.                         | `POST /reminders/{id}/send`   |
| Cancel Reminder | Modal                      | Cancel reminder.                                       | Submit reason.                           | `POST /reminders/{id}/cancel` |

### Required States

- Notification channel availability is plan-enforced.
- Disabled channels must show required plan level, not silently downgrade.
- Sending reminders blocked in read-only/offline states.

---

## 30. Internal Notification Screens

| Screen                   | Route                                | Purpose                      | Primary Actions                  | API Alignment                |
| ------------------------ | ------------------------------------ | ---------------------------- | -------------------------------- | ---------------------------- |
| Notification Center      | `/notifications`                     | View internal notifications. | Mark read/dismiss where allowed. | `GET /notifications`         |
| Notification Preferences | `/settings/notification-preferences` | Manage preferences.          | Enable/disable allowed channels. | Notification preference APIs |
| Notification Detail      | `/notifications/{notification_id}`   | View notification payload.   | Open linked record.              | `GET /notifications/{id}`    |

### Required States

- Preferences constrained by plan channel availability.
- Delivery failure states visible to authorized users where documented.

---

## 31. File Screens

| Screen                 | Route                     | Purpose                                                                       | Primary Actions                           | API Alignment                |
| ---------------------- | ------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------- |
| File Upload Intent     | Contextual modal          | Prepare file upload.                                                          | Select file, request upload URL.          | `POST /files/upload-intents` |
| Linked Files Panel     | Embedded in entity detail | Show files linked to customer, motorcycle, job order, estimate, invoice, etc. | View, soft delete, restore where allowed. | File APIs                    |
| File Detail            | `/files/{file_id}`        | View file metadata and security status.                                       | Get signed URL, restore, soft delete.     | File APIs                    |
| Quarantined File State | File detail state         | Show safe status for quarantined/malware-flagged files.                       | No download.                              | File APIs                    |

### Required States

- Files are private and accessed through signed URLs.
- Signed URLs must not be cached offline beyond expiration.
- Uploads are blocked offline and in read-only tenant status.

---

## 32. Report Screens

| Screen                 | Route                             | Purpose                                                        | Primary Actions                      | API Alignment                                        |
| ---------------------- | --------------------------------- | -------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| Reports Hub            | `/reports`                        | Entry point for report categories.                             | Select report type.                  | Report APIs                                          |
| Sales Reports          | `/reports/sales`                  | Sales and payment method reporting.                            | Filter date/branch/grouping, export. | `GET /reports/sales`                                 |
| Service Reports        | `/reports/services`               | Service and mechanic reports.                                  | Filter date/branch/mechanic.         | `GET /reports/services`                              |
| Inventory Reports      | `/reports/inventory`              | Stock, FIFO, movement, transfer, adjustment reports.           | Filter product/category/branch/date. | `GET /reports/inventory`                             |
| Customer Reports       | `/reports/customers`              | Customer activity and reminder reports.                        | Filter date/branch/customer.         | `GET /reports/customers`                             |
| Financial Reports      | `/reports/financial`              | Revenue, expenses, gross profit, COGS, AR, AP, refunds, voids. | Filter date/branch.                  | `GET /reports/financial`                             |
| Branch Comparison      | `/reports/branch-comparison`      | Branch comparison reports.                                     | Filter date/branches.                | `GET /reports/branch-comparison`                     |
| Advanced Report Detail | `/reports/advanced/{report_code}` | Advanced operational reports.                                  | Filter/export.                       | `GET /reports/advanced/{report_code}`                |
| Report Export Job      | `/reports/exports/{job_id}`       | Track export status.                                           | Download when complete.              | `POST /reports/exports`, `GET /background-jobs/{id}` |

### Required States

- Branch comparison requires plan/permission access.
- Advanced operational reports require High plan unless overridden.
- Exports available in PDF, Excel, CSV.
- Large reports run asynchronously.

---

## 33. Tenant Export Screens

| Screen                 | Route                      | Purpose                                      | Primary Actions                                           | API Alignment                    |
| ---------------------- | -------------------------- | -------------------------------------------- | --------------------------------------------------------- | -------------------------------- |
| Export List            | `/exports`                 | View tenant export jobs.                     | Start new export.                                         | `GET /exports`                   |
| Create Tenant Export   | `/exports/new`             | Queue full tenant export.                    | Include attachments, include soft-deleted, metadata-only. | `POST /exports`                  |
| Export Detail / Status | `/exports/{export_job_id}` | View queued/running/succeeded/failed export. | Refresh status.                                           | `GET /exports/{id}`              |
| Export Download        | `/exports/{id}/download`   | Get signed download URL when complete.       | Download ZIP.                                             | `GET /exports/{id}/download-url` |

### Required States

- ZIP includes CSV, JSON, attachment manifest, audit log export, README, and attachments directory when binaries included.
- Download links expire after 7 days.
- Large exports run asynchronously.
- Export access respects tenant and branch access rules.

---

## 34. Audit Log Screens

| Screen             | Route                        | Purpose                           | Primary Actions                                | API Alignment                   |
| ------------------ | ---------------------------- | --------------------------------- | ---------------------------------------------- | ------------------------------- |
| Audit Log List     | `/audit-logs`                | Search immutable audit logs.      | Filter action/entity/actor/branch/date.        | `GET /audit-logs`               |
| Audit Log Detail   | `/audit-logs/{audit_log_id}` | View audit detail.                | View sanitized previous/new values where safe. | `GET /audit-logs/{id}`          |
| Entity Audit Panel | Embedded in detail screens   | Show record-specific audit trail. | View events.                                   | `GET /audit-logs?entity_id=...` |

### Required States

- Audit logs cannot be edited or deleted by tenant users.
- Sensitive secrets must not be shown.
- Platform support actions must be visibly attributable to platform admin actor type.

---

## 35. Settings Screens

| Screen                   | Route                     | Purpose                                                        | Primary Actions                | Access Rule                        |
| ------------------------ | ------------------------- | -------------------------------------------------------------- | ------------------------------ | ---------------------------------- |
| Settings Hub             | `/settings`               | Entry point for configurable settings.                         | Navigate settings.             | Permission-gated                   |
| Shop Profile Settings    | `/settings/shop-profile`  | Manage shop name, logo, address, contact, hours.               | Save allowed changes.          | `shop.update` / `settings.update`  |
| Tax Settings             | `/settings/tax`           | Manage tax profile, tax mode, VAT rate for future invoices.    | Save.                          | `settings.update`                  |
| Billing Settings         | `/settings/billing`       | Billing-related settings allowed in read-only where specified. | Save billing settings.         | `shop.billing.update`              |
| Notification Preferences | `/settings/notifications` | Configure enabled channels/preferences.                        | Save plan-allowed preferences. | `notifications.update_preferences` |
| File Upload Settings     | `/settings/files`         | Manage upload settings within system limits.                   | Save.                          | `settings.update`                  |
| Subscription Info        | `/settings/subscription`  | View plan, expiration, renewal instructions.                   | Submit renewal request.        | Shop Owner                         |
| Data Export Settings     | `/settings/data-export`   | Export tenant data.                                            | Queue export.                  | `shop.export_data`                 |

### Required States

- Invoice prefix immutable after onboarding.
- Country/currency immutability rules apply.
- Tax changes affect future invoices only.
- Read-only tenant blocks most settings except billing-related settings.

---

## 36. Employee, Role, and Permission Screens

| Screen                  | Route                           | Purpose                                          | Primary Actions                                    | API Alignment                         |
| ----------------------- | ------------------------------- | ------------------------------------------------ | -------------------------------------------------- | ------------------------------------- |
| Employee List           | `/employees`                    | View employees.                                  | Invite/create employee, filter status/branch/role. | `GET /employees`                      |
| Invite Employee         | `/employees/invitations/new`    | Create single-use invitation.                    | Assign roles/branches or require completion.       | `POST /employees/invitations`         |
| Create Employee         | `/employees/new`                | Direct employee creation with setup/reset link.  | Save.                                              | `POST /employees`                     |
| Employee Detail         | `/employees/{employee_id}`      | View profile, roles, branch assignments, status. | Edit, deactivate/reactivate, reset password.       | `GET /employees/{id}`                 |
| Edit Employee           | `/employees/{employee_id}/edit` | Update profile, roles, branch access.            | Save.                                              | `PATCH /employees/{id}`               |
| Deactivate Employee     | Modal                           | Deactivate and revoke sessions.                  | Confirm.                                           | `POST /employees/{id}/deactivate`     |
| Reactivate Employee     | Modal                           | Reactivate after role/branch/email checks.       | Confirm.                                           | `POST /employees/{id}/reactivate`     |
| Reset Employee Password | Modal                           | Send reset link.                                 | Confirm.                                           | `POST /employees/{id}/password-reset` |
| Employee Activity       | `/employees/{id}/activity`      | View employee activity logs.                     | Filter date/action.                                | `GET /employees/{id}/activity`        |
| Role List               | `/roles`                        | View seeded and custom roles.                    | Create custom role.                                | `GET /roles`                          |
| Create Role             | `/roles/new`                    | Create custom role.                              | Select permissions.                                | `POST /roles`                         |
| Role Detail             | `/roles/{role_id}`              | View role and assigned users.                    | Edit/deactivate.                                   | `GET /roles/{id}`                     |
| Edit Role               | `/roles/{role_id}/edit`         | Update role name/permissions.                    | Save with impact warning.                          | `PATCH /roles/{id}`                   |
| Deactivate Role         | Modal                           | Deactivate if no user depends solely on role.    | Confirm.                                           | `POST /roles/{id}/deactivate`         |
| Permission Catalog      | `/roles/permissions`            | View action-level permission catalog.            | Read-only.                                         | `GET /roles/permissions`              |

### Required States

- Last active Shop Owner cannot be deactivated or demoted.
- Employee must have at least one active role and branch assignment unless tenant-wide branch access.
- Role permission changes show impact warnings and are audited.
- Shop Owner role protected from losing required owner capabilities.

---

## 37. Background Job Screens

| Screen            | Route                                | Purpose                          | Primary Actions             | API Alignment                        |
| ----------------- | ------------------------------------ | -------------------------------- | --------------------------- | ------------------------------------ |
| Job Status Detail | `/background-jobs/{job_id}`          | View safe background job status. | Refresh, cancel if allowed. | `GET /background-jobs/{id}`          |
| Job Attempts      | `/background-jobs/{job_id}/attempts` | View sanitized retry attempts.   | Platform/support only.      | `GET /background-jobs/{id}/attempts` |
| Cancel Job        | Modal                                | Cancel cancellable job.          | Confirm.                    | `POST /background-jobs/{id}/cancel`  |

### Required States

- Show queued/running/succeeded/failed/cancelled/dead-letter states where applicable.
- Expose safe failure metadata and correlation ID only.
- Tenant users can only view tenant-visible authorized jobs.

---

## 38. Offline Screens

| Screen                         | Route                           | Purpose                                   | Primary Actions                                    | API Alignment                        |
| ------------------------------ | ------------------------------- | ----------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| Offline App Shell              | App shell state                 | Load PWA shell without network.           | Navigate cached views.                             | Service worker / PWA shell           |
| Offline Recent Records         | `/offline-cache/recent-records` | Show minimal cached records.              | View cached customer/motorcycle/job order/invoice. | `GET /offline-cache/recent-records`  |
| Offline Manifest               | Internal state                  | Determine cache contents.                 | Refresh when online.                               | `GET /offline-cache/manifest`        |
| Clear Offline Cache            | Settings action                 | Clear user-scoped cache.                  | Clear cache.                                       | `DELETE /offline-cache/current-user` |
| Offline Blocked Action Message | Global component                | Explain write action unavailable offline. | Retry when online.                                 | UX state only                        |

### Required States

- Cached data includes recent customers, motorcycles, job orders, and invoices only.
- Cache is read-only, user-scoped, cleared on logout, expires after 7 days.
- Offline must block all create/edit/submit/delete/approve workflows.

---

## 39. Platform Admin Screens

| Screen                   | Route                                   | Purpose                                        | Primary Actions                                              | API Alignment                                             |
| ------------------------ | --------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| Platform Tenant List     | `/platform/tenants`                     | View tenants and statuses.                     | Search/filter tenants, create tenant.                        | `GET /platform/tenants`                                   |
| Create Tenant            | `/platform/tenants/new`                 | Create platform-created tenant.                | Assign plan, expiration, owner invite/create.                | `POST /platform/tenants`                                  |
| Tenant Admin Detail      | `/platform/tenants/{tenant_id}`         | View tenant metadata, subscription, lifecycle. | Update tenant, manage subscription, trigger export/deletion. | `GET /platform/tenants/{id}`                              |
| Subscription Management  | `/platform/tenants/{id}/subscription`   | Update plan, expiration, override.             | Save with reason.                                            | `POST /platform/tenants/{id}/subscription`                |
| Apply Read-Only Override | Modal                                   | Force read-only.                               | Reason, optional expiry.                                     | `POST /platform/tenants/{id}/read-only`                   |
| Suspend Tenant           | Modal                                   | Suspend tenant.                                | Reason, optional expiry.                                     | `POST /platform/tenants/{id}/suspend`                     |
| Support Access Session   | `/platform/tenants/{id}/support-access` | Start audited tenant support access.           | Select read-only/write-allowed, reason, expiry.              | `POST /platform/tenants/{id}/support-access-sessions`     |
| End Support Access       | Modal                                   | End active support session.                    | Confirm.                                                     | `POST /platform/support-access-sessions/{id}/end`         |
| Tenant Export Trigger    | `/platform/tenants/{id}/exports`        | Trigger tenant export.                         | Queue export.                                                | `POST /platform/tenants/{id}/exports`                     |
| Tenant Deletion Job      | `/platform/tenants/{id}/deletion-jobs`  | Queue eligible deletion job.                   | Confirm eligibility/reason.                                  | `POST /platform/tenants/{id}/deletion-jobs`               |
| Platform Audit Logs      | `/platform/audit-logs`                  | Search platform audit logs.                    | Filter actor/action/tenant/date.                             | `GET /platform/audit-logs`                                |
| Plan Management          | `/platform/plans`                       | Manage standard plans and limits.              | Update plan limits/default plan.                             | `GET/PATCH /platform/plans`                               |
| Platform Admin Accounts  | `/platform/admin-users`                 | Manage platform admin accounts.                | Create/update/deactivate where supported.                    | Platform admin account APIs if included in implementation |

### Required States

- Platform admins are not tenant employees.
- Support access must never silently impersonate tenant users.
- Write-allowed support access requires explicit selection and reason.
- All platform tenant data access and changes must be audited.

---

## 40. Cross-Cutting Screen Patterns

### 40.1 Standard Screen Types

| Pattern               | Used By                                 | Required UX Elements                                                               |
| --------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| List/Search           | Most modules                            | Search, filters, pagination, empty state, permission-aware create action           |
| Detail                | Most entities                           | Header summary, status badge, branch/tenant context, primary actions, related tabs |
| Create/Edit Form      | Mutable entities                        | Required fields, validation errors, `lock_version` handling for edits              |
| Workflow Action Modal | Status transitions                      | Action summary, required reason/metadata, confirmation, blocking validation        |
| Status History        | Workflow-controlled resources           | From/to status, actor, timestamp, reason                                           |
| Audit Panel           | Critical records                        | Actor, action, timestamp, sanitized previous/new values                            |
| Export Job Status     | Reports/tenant exports                  | Job state, attempts if allowed, safe error summary, download link when ready       |
| Blocked Access State  | Tenant/permission/plan/offline blockers | Clear reason and recovery path                                                     |
| Read-Only Detail      | Offline/read-only status                | View-only content, disabled action buttons, read-only explanation                  |

### 40.2 Required Error and Blocking States

| State                                    | UX Requirement                                                        |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `forbidden`                              | Show missing permission without leaking unauthorized data.            |
| `branch_access_denied`                   | Explain branch access limitation.                                     |
| `subscription_access_blocked`            | Show renewal/upgrade prompt where applicable.                         |
| `plan_limit_exceeded`                    | Show current limit and required plan.                                 |
| `validation_failed`                      | Show field-level errors.                                              |
| `workflow_transition_blocked`            | Show why transition is blocked and required condition.                |
| `inventory_insufficient_available_stock` | Show requested and available quantity.                                |
| `invoice_overpayment_blocked`            | Show remaining collectible balance.                                   |
| `invoice_overbilling_blocked`            | Show remaining billable quantity/amount.                              |
| `version_conflict`                       | Prompt reload and retry.                                              |
| `idempotency_conflict`                   | Explain duplicate/retry conflict safely.                              |
| Offline write attempt                    | Explain that offline mode is read-only and action requires reconnect. |

---

## 41. Module-to-Screen Traceability Matrix

| Product Module                            | Screen Groups                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Multi-tenant SaaS architecture            | Platform Admin, Tenant Lifecycle Banners, Support Access                                       |
| Subscription plan enforcement             | Dashboard warnings, Settings Subscription, Platform Subscription Management, Plan Limit States |
| Authentication and account management     | Auth Screens, User Menu, Change Password                                                       |
| Shop onboarding and settings              | Onboarding Screens, Settings Screens                                                           |
| Branch management                         | Branch screens under Settings / Admin module                                                   |
| Employee management                       | Employee Screens                                                                               |
| Role and permission management            | Role and Permission Screens                                                                    |
| Customer management                       | Customer Screens                                                                               |
| Motorcycle management                     | Motorcycle Screens                                                                             |
| Service management / Service catalog      | Service Catalog Screens                                                                        |
| Service estimates                         | Estimate Screens                                                                               |
| Job order management                      | Job Order Screens                                                                              |
| Mechanic time tracking                    | Mechanic Work Session Screens                                                                  |
| Inventory management / FIFO / reservation | Product and Inventory Screens, Job Part Reservation, Ledger, FIFO Layers                       |
| Inventory transfer                        | Inventory Transfer Screens                                                                     |
| Inventory adjustment approval workflow    | Inventory Adjustment Screens                                                                   |
| Supplier management                       | Supplier Screens                                                                               |
| Purchase management                       | Purchase Screens                                                                               |
| Supplier returns                          | Supplier Return Screens                                                                        |
| Accounts payable                          | AP Screens, Supplier Detail, Reports                                                           |
| Sales and invoicing                       | Invoice Screens                                                                                |
| Payments and receipts                     | Payment and Receipt Screens                                                                    |
| Refunds and voids                         | Refund Screens, Invoice Void Action                                                            |
| Accounts receivable                       | AR Screens, Reports                                                                            |
| Tax handling                              | Invoice Screens, Tax Settings, Reports                                                         |
| Expenses                                  | Expense Screens                                                                                |
| Customer reminders                        | Reminder Screens                                                                               |
| Internal notifications                    | Notification Screens                                                                           |
| Dashboard                                 | Dashboard Screens                                                                              |
| Reports                                   | Report Screens                                                                                 |
| File attachments                          | File Screens and linked file panels                                                            |
| Data export / tenant export               | Tenant Export Screens                                                                          |
| Data retention                            | Tenant lifecycle / Platform deletion screens                                                   |
| Offline shell/read-only cache             | Offline Screens                                                                                |
| Audit logs                                | Audit Log Screens                                                                              |
| Background job reliability                | Background Job Screens                                                                         |
| Observability controls                    | Error states, correlation IDs, background job statuses                                         |

---

## 42. Acceptance Criteria for the UX Screen Map

This UX screen map is acceptable when:

1. Every documented product module has at least one mapped screen group.
2. Every workflow-controlled resource has explicit action screens or modals for status changes.
3. Every branch-scoped screen indicates branch context or branch filtering.
4. Every tenant lifecycle status has a defined access state.
5. Every role has a clear primary landing recommendation.
6. Offline UX is strictly read-only and limited to recently viewed customers, motorcycles, job orders, and invoices.
7. Plan-limited screens show disabled or upgrade states without silently downgrading behavior.
8. Financial and inventory immutability rules are reflected in view-only or correction-only UX.
9. Export and large-report screens use background job status UX.
10. No excluded scope is represented as a screen or flow.

---

## 43. Risks and Required Follow-Up Documents

| Risk / Gap                                                                        | Impact                                                      | Recommended Follow-Up                                        |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| Exact visual layouts are not defined here.                                        | Designers may interpret navigation differently.             | Create low-fidelity wireframes and design system guidelines. |
| Permission matrix is referenced but not fully expanded here.                      | Developers need precise action visibility rules.            | Produce `permission-matrix.md`.                              |
| Role landing routes are recommendations.                                          | Product may need final role-based home behavior.            | Confirm in UX wireframe review.                              |
| Platform admin account management APIs are not fully detailed in the API excerpt. | Screen implementation may need route contract confirmation. | Confirm when OpenAPI is generated.                           |
| Report detail screens depend on final report DTOs.                                | Tables/charts may vary.                                     | Produce report specification and report wireframes.          |
| Branch management may live under `/branches` or `/settings/branches`.             | Route structure decision affects navigation consistency.    | Decide in frontend routing ADR.                              |
| Exact frontend framework and component system are implementation decisions.       | UI delivery planning needs final stack decision.            | Create frontend architecture ADR.                            |

---

## 44. Final Recommendation

Use this document as the master UX screen inventory for GarageOS. Proceed next with:

1. `permission-matrix.md` to define action visibility and screen access in detail.
2. `information-architecture.md` or wireframes to finalize navigation hierarchy.
3. Low-fidelity mobile-first wireframes for the highest-frequency flows:
   - Login and onboarding
   - Dashboard
   - Customer lookup
   - Motorcycle lookup
   - Job order creation
   - Mechanic work session update
   - Inventory lookup
   - Payment recording
   - Receipt viewing
4. QA screen-state matrix covering loading, empty, validation, forbidden, branch denied, subscription blocked, plan blocked, offline, and conflict states.
