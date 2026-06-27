# GarageOS PRD

**Source:** `requirements.md` / Motorcycle Shop Management System SaaS PRD  
**Status:** Source-aligned reduced reference  
**Target:** Mobile-first PWA  
**Business model:** Multi-tenant SaaS subscription  
**Implementation mode:** Single build scope; no product phases  
**Primary users:** Shop Owner, Manager, Service Advisor, Mechanic, Cashier, Inventory Clerk, Platform Admin

> This reduced document preserves implementation-critical requirements, enums, workflows, guardrails, and acceptance rules. Use the full PRD only when exact wording or legal/product signoff text is needed.

---

## 1. Scope Rules

### 1.1 Required Product Scope

GarageOS MUST implement a complete motorcycle-shop SaaS covering:

- Multi-tenant SaaS, subscription plans, lifecycle enforcement, activation, renewal, manual admin-managed billing status.
- Authentication, email verification, password reset, sessions, user profile, employees, roles, permissions, branch access.
- Shop onboarding/settings, branches, customers, motorcycles, services, estimates, job orders, mechanic sessions.
- Inventory catalog, branch stock, ledger-first inventory, FIFO costing, reservations, adjustments, transfers, low-stock alerts.
- Suppliers, purchases, receiving, supplier returns, supplier payments, accounts payable.
- Job-order invoices, billing allocations, discounts, taxes, partial/split payments, immutable receipts, refunds, voids, accounts receivable.
- Expenses, reminders, internal notifications, dashboard, reports, exports, files, audit logs, retention, tenant deletion.
- Offline PWA shell with read-only recent-record cache.
- Security, observability, background jobs, backups, disaster recovery, and operational readiness.

### 1.2 Explicit Exclusions

GarageOS MUST NOT implement:

| Exclusion                       | Rule                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------- |
| Native mobile apps              | PWA only; no iOS/Android native apps.                                            |
| Offline writes                  | Offline mode is shell + read-only cache only.                                    |
| Full accounting                 | No GL, chart of accounts, journal entries, bank reconciliation, or formal close. |
| Payroll                         | No salary, commission, payslip, or government payroll workflows.                 |
| Direct BIR filing               | No tax authority submission.                                                     |
| E-commerce marketplace          | No public store, online checkout, delivery, or marketplace.                      |
| Customer portal                 | Customers have no login/self-service account.                                    |
| Loyalty                         | No points, rewards, tiers, or redemption.                                        |
| Service packages                | No bundled package pricing/redemption.                                           |
| Advanced analytics              | No AI, predictive analytics, forecasting, or custom BI beyond defined reports.   |
| Automated subscription charging | Subscription payment collection is external/manual.                              |
| Standalone POS                  | No walk-in retail cart unrelated to service/job-order invoices.                  |
| 2FA                             | Not included in build scope.                                                     |
| Payment gateway charging        | Customer/supplier payments are manually recorded only.                           |

---

## 2. Core Product Definitions and Invariants

| Entity           | Requirement                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tenant           | One shop business account. Tenant-owned records MUST include `tenant_id`.                                                                              |
| Branch           | Physical location. Branch-specific operational records MUST include `tenant_id` and `branch_id`. At least one active branch required after onboarding. |
| User             | Login identity belonging to one tenant or platform. Tenant users MUST NOT belong to multiple tenants. Platform admins are not tenant employees.        |
| Employee         | Tenant user with one user account, active/inactive status, roles, and branch assignments unless tenant-wide branch access.                             |
| Customer         | Tenant-wide service customer; visible across branches to authorized users.                                                                             |
| Motorcycle       | Service record linked to exactly one active customer at a time. Ownership history is not tracked.                                                      |
| Job Order        | One service engagement for one motorcycle at one branch.                                                                                               |
| Estimate         | Non-revenue quote. MUST NOT affect revenue, AR, stock, reservations, FIFO, tax, or financial reports.                                                  |
| Invoice          | Service/job-order billing document; unique tenant-level invoice number. Standalone retail POS invoices are excluded.                                   |
| Payment          | Payment against one invoice. Each payment MUST generate exactly one receipt.                                                                           |
| Receipt          | Immutable proof of payment; MUST NOT be edited.                                                                                                        |
| Inventory Ledger | Immutable stock-changing source of truth. Direct stock updates without ledger are prohibited.                                                          |
| FIFO Layer       | Stock quantity received at unit cost; consumed oldest-first.                                                                                           |

Global requirements:

- Tenant isolation and branch access are mandatory at UI, API, service, repository, and database levels.
- Backend/database authorization is authoritative; UI guardrails are usability only.
- Workflow transitions must be explicit actions with status history and audit where required.
- Financial records, receipts, refunds, inventory ledgers, FIFO records, and audit logs are immutable or correction-only.
- Critical writes must be transactional and idempotency-safe.
- Monetary values use fixed-precision decimal; no binary floating point for money.
- Document numbers are tenant-scoped, immutable, and never reused.

---

## 3. SaaS Platform, Tenant Lifecycle, and Plans

### 3.1 Platform Admin Capabilities

Platform Admins MUST be able to:

- Create tenants; view tenant list/detail/subscription status.
- Assign/update subscription plans, expiration dates, overrides, read-only mode, suspension.
- Configure plan limits.
- Trigger export generation and queue tenant deletion after retention rules.
- View platform audit logs.
- Create/manage platform admin accounts except first bootstrap.
- Access tenant data only through audited support access.

Platform Admins MUST NOT bypass audit logging.

### 3.2 Tenant Creation

Supported flows:

| Flow                    | Requirement                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform-created tenant | Platform Admin creates tenant, assigns plan, sets subscription start/expiration, and creates or invites Shop Owner. Plan + expiration required before `active`.        |
| Owner signup tenant     | Owner signs up, verifies email, creates tenant, completes onboarding, and receives configured default plan/duration. Block signup if default plan or duration missing. |

Duplicate active tenants with same normalized business name + shop email MUST be blocked unless Platform Admin explicitly approves.

### 3.3 Tenant Statuses and Lifecycle

Tenant statuses:

```text
pending_setup, active, grace_period, read_only, suspended, pending_deletion, deleted
```

Expiration lifecycle, calculated in tenant timezone:

| Timeline                  | Status             | Access                                                                            |
| ------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| Before expiration date    | `active`           | Full permission-based access.                                                     |
| Day 1–14 after expiration | `grace_period`     | Full access + renewal warnings.                                                   |
| Day 15–30                 | `read_only`        | View/search/report/export/renew/password/logout only; operational writes blocked. |
| Day 31–60                 | `suspended`        | Shop Owner renewal/export only; non-owner users blocked.                          |
| Day 61–67                 | `pending_deletion` | Tenant queued for deletion; export disabled unless emergency extension granted.   |
| Day 68+                   | `deleted`          | Active production data removed after deletion job completes.                      |

Rules:

- Expiration day is final active day. Day 1 starts at 00:00:00 the next calendar day in tenant timezone.
- Renewal before deletion completes restores tenant to `active` after Platform Admin confirmation.
- Lifecycle changes by admin are audit logged; scheduled lifecycle evaluation is system-logged.
- Platform override may temporarily control status; when no override exists, status is system-computed.
- Overrides require actor, type, previous/new value, timestamp, reason, and optional expiry.

### 3.4 Pending Setup

During `pending_setup`:

- Verified Shop Owner may access onboarding, profile setup, subscription info, password management, logout.
- Operational modules are blocked.
- Non-owner tenant users cannot access operational screens.
- Onboarding completion must be audit logged.
- Tenant becomes `active` only when onboarding is complete and effective plan + expiration date exist.

### 3.5 Read-Only and Suspension

`read_only` allows login, view/search records, reports, Shop Owner export, Shop Owner renewal, password change, logout. It blocks operational writes including job orders, estimates, invoices, payments, refunds, voids, customers, motorcycles, inventory, transfers, purchases, expenses, suppliers, reminders, files, most settings, employees, roles, permissions.

`suspended` allows only Shop Owner renewal/export until window closes; all operational writes blocked; non-owner tenant users blocked; audited platform support access retained.

### 3.6 Tenant Deletion

- `pending_deletion` starts Day 61. Deletion scheduled Day 68 unless emergency extension.
- Warnings: Day 61, Day 65, Day 67 when email is available.
- Deletion removes tenant active production DB records and files except legally/operationally retained items and platform-retained audit metadata.
- Mark tenant `deleted` after completion.
- Resubscription after deletion creates a new tenant; old deleted data is not restored.
- Encrypted backups may retain deleted data until backup retention expires; restore only for platform-wide DR.

### 3.7 Plans and Limits

Standard plans only:

```text
Basic, Mid, High
```

Default plan limits:

| Capability                   | Basic | Mid | High |
| ---------------------------- | ----: | --: | ---: |
| Active branches              |     1 |   3 |   10 |
| In-app notifications         |   Yes | Yes |  Yes |
| Push notifications           |   Yes | Yes |  Yes |
| Email notifications          |    No | Yes |  Yes |
| SMS notifications            |    No |  No |  Yes |
| Customer email reminders     |    No | Yes |  Yes |
| Customer SMS reminders       |    No |  No |  Yes |
| Branch comparison reports    |    No | Yes |  Yes |
| Advanced operational reports |    No |  No |  Yes |

Rules:

- Platform Admin may configure tenant overrides; all overrides audit logged.
- Branch create/reactivate checks active branch count against effective limit.
- Inactive branches do not count.
- Tenant cannot deactivate last active branch.
- Disabled notification channels MUST be blocked and show required plan. System MUST NOT silently downgrade channel.

---

## 4. Authentication, Users, Roles, and Permissions

### 4.1 Auth Features and Security

Required features:

- Login/logout/logout all, email verification, forgot/reset/change password, session management, remember-me, forced logout on deactivation, profile management.
- First Platform Admin created by secure deployment-time bootstrap only; bootstrap disabled after first admin, requires infra access, strong temporary credential/invite token, password change, email verification, platform audit log.

Password/session/rate rules:

| Rule                      | Requirement                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Password policy           | Min 8 chars, 1 uppercase, 1 lowercase, 1 number.                                                                  |
| Password storage          | Argon2id or bcrypt cost >= 12. Never store/log/email/export plaintext.                                            |
| Access token              | Expires within 15 minutes.                                                                                        |
| Refresh tokens            | Rotated; remember-me sessions up to 30 days.                                                                      |
| Failed login rate limit   | 5 failed attempts / 15 minutes per account and IP; block 15 minutes; audit.                                       |
| Password reset limit      | 3 requests/account/hour; token single-use; expires 30 minutes.                                                    |
| Email verification resend | 5 requests/account/hour.                                                                                          |
| Deactivated users         | Cannot login; sessions revoked; historical references preserved.                                                  |
| Email change              | Requires self-confirmation or admin action, active global uniqueness, re-verification, session revocation, audit. |

Before email verification, users may only access verification screen, resend verification, and logout.

### 4.2 Account Creation

| Account        | Creation                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Platform Admin | Existing Platform Admin or bootstrap for first admin.                                                             |
| Shop Owner     | Tenant creation or owner signup.                                                                                  |
| Employee       | Created or invited by Shop Owner/authorized manager. Public self-registration into existing tenant is prohibited. |

Employee invitations:

- Single-use, expire after 7 days, tenant-scoped.
- Normalize/check active global email uniqueness.
- Include role/branch config or require completion before operational access.
- Acceptance creates/activates user only for invited tenant.
- Expired/revoked/used links blocked.
- Creation, acceptance, revocation, expiration audited.
- Direct creation allowed only with password setup/reset link; no temporary plaintext passwords.

### 4.3 Roles and Access

Tenant role templates:

```text
Shop Owner, Manager, Service Advisor, Mechanic, Cashier, Inventory Clerk
```

Custom roles are supported.

Rules:

- Shop Owner has all tenant permissions and tenant-wide branch access.
- Tenant must always have at least one active Shop Owner.
- Last active Shop Owner cannot be deactivated or demoted.
- Non-owner seeded templates may be edited by authorized users; Shop Owner capabilities protected.
- Custom roles belong to one tenant, have unique tenant role name, one or more permissions, assignable to users, editable by `roles.update`, deactivatable only when no active user depends solely on it.
- Multi-role permission resolution is additive; no explicit deny permissions.
- Branch access is separate from action permission.
- Mechanics MUST NOT access invoices, payments, supplier balances, financial reports, or subscription settings unless explicitly custom-granted.

Branch access rule for branch-specific records:

1. Same tenant.
2. Required permission.
3. Assigned branch or tenant-wide branch access.

Tenant-wide entities: customers, motorcycles, products, suppliers, roles, permissions, shop settings, subscription, audit logs. Linked branch histories still obey branch access.

### 4.4 Required Permission Codes

```text
platform.tenants.read, platform.tenants.create, platform.tenants.update,
platform.subscriptions.update, platform.plans.update, platform.support_access,
platform.audit_logs.read,

shop.read, shop.update, shop.billing.update, shop.export_data,

branches.create, branches.read, branches.update, branches.deactivate, branches.reactivate,

users.create, users.read, users.update, users.deactivate, users.reset_password,
users.assign_roles, users.assign_branches,

roles.create, roles.read, roles.update, roles.deactivate, permissions.read,

customers.create, customers.read, customers.update, customers.merge,
customers.soft_delete, customers.restore,

motorcycles.create, motorcycles.read, motorcycles.update,
motorcycles.soft_delete, motorcycles.restore,

job_orders.create, job_orders.read, job_orders.update, job_orders.cancel,
job_orders.change_status, job_orders.correct_status, job_orders.release,
job_orders.release_with_balance, job_orders.attach_files,

estimates.create, estimates.read, estimates.update, estimates.present,
estimates.approve, estimates.convert, estimates.cancel,

services.create, services.read, services.update, services.deactivate,

mechanic_sessions.create, mechanic_sessions.read, mechanic_sessions.pause,
mechanic_sessions.resume, mechanic_sessions.finish,

products.create, products.read, products.update, products.deactivate,
product_categories.manage,

inventory.read, inventory.adjust, inventory.adjust.approve, inventory.reserve,
inventory.release_reservation, inventory.transfer.create, inventory.transfer.send,
inventory.transfer.receive, inventory.transfer.cancel, inventory.force_adjust,

suppliers.create, suppliers.read, suppliers.update, suppliers.deactivate,

purchases.create, purchases.read, purchases.update, purchases.cancel, purchases.receive,
supplier_returns.create, supplier_returns.read, supplier_credits.create,
supplier_credits.read, supplier_payments.create, supplier_payments.read,

invoices.create, invoices.read, invoices.update_draft, invoices.issue,
invoices.cancel, invoices.void, invoices.refund,

payments.create, payments.read, payments.refund, receipts.read,

expenses.create, expenses.read, expenses.update, expenses.void,
expense_categories.manage,

reminders.create, reminders.read, reminders.update, reminders.cancel,
reminders.send,

notifications.read, notifications.update_preferences, notifications.send,

reports.view_basic, reports.view_branch, reports.view_advanced, reports.export,

files.upload, files.read, files.soft_delete, files.restore,

audit_logs.read, settings.update
```

---

## 5. Shop, Branches, Employees, Customers, Motorcycles, Services

### 5.1 Onboarding and Settings

Onboarding complete only when these exist:

- Shop profile, at least one active branch, invoice prefix, tax profile, country, timezone, default currency, at least one active Shop Owner.

Required setup fields:

| Field          | Rule                                        |
| -------------- | ------------------------------------------- |
| Shop name      | 2–150 chars.                                |
| Address        | 5–500 chars.                                |
| Contact number | Required; valid for country.                |
| Email          | Valid email.                                |
| Business hours | Required for each day.                      |
| Tax profile    | `vat_registered`, `non_vat`, `no_tax`.      |
| Tax mode       | `tax_inclusive`, `tax_exclusive`, `no_tax`. |
| Country        | Default `PH`.                               |
| Timezone       | Default `Asia/Manila`.                      |
| Currency       | Default `PHP`.                              |
| Invoice prefix | Required before first invoice.              |

Settings after onboarding: shop name/logo/address/contact/hours, tax profile/mode/VAT, receipt footer, reminder sender, notification preferences, file upload settings.

Immutable settings:

| Setting        | Trigger                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| Invoice prefix | After onboarding.                                                               |
| Country        | After onboarding unless Platform Admin changes before first operational record. |
| Currency       | After first invoice/payment/purchase/supplier payment/refund/expense.           |
| Tenant ID      | Always.                                                                         |
| Invoice number | After invoice creation.                                                         |
| Receipt number | After receipt creation.                                                         |

Invoice prefix pattern:

```text
^[A-Z0-9]{2,10}-$
```

Receipt prefix fixed:

```text
RCPT-
```

Timezone changes require `settings.update`, audit, affect future calculations only, preserve historical timestamps, cannot bypass lifecycle rules, and are blocked for tenant users in `read_only`, `suspended`, `pending_deletion`, `deleted`.

### 5.2 Branches

Features: create/edit/deactivate/reactivate, assign employees, branch reports/inventory/job orders/invoices/expenses.

Required fields: active-unique branch name within tenant, address, contact number, business hours, status `active|inactive`.

Deactivation is blocked when:

- Last active branch.
- Open job orders: `Pending`, `In Progress`, `Waiting For Parts`, `Completed`.
- Open purchase orders: `Draft`, `Ordered`, `Partially Received`.
- Draft/pending/in-transit transfers involving branch.
- Active inventory reservations.
- Non-zero on-hand inventory.
- Unposted/unreconciled stock-affecting records.

Inactive branches remain visible historically, not selectable for new operational records, do not count against branch limit. Employees assigned only to deactivated branch are flagged for reassignment.

Reactivation requires permission, same tenant, plan limit re-check, valid fields, original ID preserved, audit log.

### 5.3 Employees

Required employee fields: full name, active globally unique email, optional mobile, at least one active role, at least one active branch unless tenant-wide access, status `active|inactive`.

Deactivation blocks login, revokes sessions, preserves history, flags open assigned jobs, audits.

Reactivation requires `users.update`, same tenant, at least one active role, active branch assignment unless tenant-wide, active email uniqueness, current rules, stale session revocation, normal login, audit.

Admin password reset sends secure reset link, expires 30 minutes, single-use, revokes sessions after reset, audit.

### 5.4 Customers

Features: create/edit/search, notes/tags/history, merge, soft delete, restore.

Required: name 2–150 chars, at least one contact method (mobile or email), optional address/birthday/notes/tags, status `active|merged|soft_deleted`.

Search by name, mobile, email, tags, motorcycle plate/model; tenant-scoped; soft-deleted excluded by default.

Duplicate detection warns using normalized mobile, lowercased email, similar name; no auto-merge.

Merge requires `customers.merge`, same tenant, selected survivor, preserve/reassign service history, motorcycles, invoices, payments, reminders, files; duplicate marked `merged`; audit.

Soft delete blocked by open jobs, unpaid invoices, active reminders, active motorcycles not reassigned/deleted. Soft-deleted customers not selectable for new operational records but remain historical.

Restore requires `customers.restore`, same tenant, duplicate re-check, exact duplicate email/mobile conflict blocked, audit. Linked records are not automatically restored.

### 5.5 Motorcycles

Features: add/edit/history/odometer/files/photos/soft delete/restore.

Required: active customer, brand, model, optional year/color/plate/engine/chassis, required non-negative mileage, status `active|soft_deleted`.

Optional identifiers, if provided, are normalized and duplicate checked within tenant. Warn on possible duplicates; block exact duplicate active identifier.

One motorcycle links to one active customer. Job order creation blocked if linked customer is merged/soft-deleted. Ownership history not tracked. Customer link changes require authorized edit and audit.

Completed job stores mileage and updates motorcycle latest mileage if >= current. Lower mileage requires `motorcycles.update` and correction reason; audit.

Soft delete blocked by open jobs, active reminders, unpaid invoices linked through active jobs. Restore requires active linked customer, duplicate identifier re-check, audit.

### 5.6 Service Catalog

Features: predefined services, edit/deactivate, starting price, disclaimer, custom job-order service lines.

Required service fields: active-unique service name, starting price >= 0, `variable_price` boolean, description optional, disclaimer required when variable, status `active|inactive`.

Service price copied into job/estimate line to preserve history. Actual labor may differ. Custom service lines belong only to the job order and do not create catalog items.

Service deactivation blocked by open job orders or draft/presented unconverted estimates. Historical visibility retained; inactive services not selectable. Reactivation requires active-name uniqueness.

---

## 6. Job Orders, Estimates, and Mechanic Sessions

### 6.1 Job Orders

Required fields: tenant, active branch, active customer, motorcycle belonging to customer, generated immutable number, status, service advisor, primary mechanic before `In Progress`, non-negative mileage, customer concern, created by/timestamp.

Job order number:

```text
JO-YYYYMMDD-000001
```

Tenant-wide, daily reset, unique, immutable.

Statuses:

```text
Pending, In Progress, Waiting For Parts, Completed, Released, Cancelled
```

Transition matrix summary:

| From               | Allowed To                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| None               | Pending                                                                                                                           |
| Pending            | In Progress if primary mechanic; Waiting For Parts with reason; Cancelled if no paid invoice                                      |
| In Progress        | Waiting For Parts with reason; Completed if required service lines complete; Cancelled with invoice/inventory rules               |
| Waiting For Parts  | In Progress if parts available or manual reason; Cancelled if no paid invoice                                                     |
| Completed          | Released if release rule satisfied; In Progress with correction permission+reason; Cancelled if no payment and inventory reversed |
| Released/Cancelled | Final                                                                                                                             |

Waiting for parts is manual only; low stock never automatically changes status.

Cancellation requires permission, reason, release active reservations, blocks released status and unresolved paid/linked invoices. Consumed inventory requires authorized inventory reversal before cancellation.

Release allowed only when:

- Fully paid: at least one issued invoice, all billable lines fully billed, all linked issued invoices have zero balance.
- No-charge: total zero and marked no-charge with reason.
- Release with balance: `job_orders.release_with_balance` + reason; balance remains AR.

Released job orders are immutable except viewing/files/audit.

Parts added to job order must be same tenant/product, job branch stock, quantity > 0, available stock sufficient, reservation created, available decreases, on-hand unchanged.

At completion, reserved parts are consumed, branch on-hand and reserved decrease, ledger `Job Order Consumption` entries created, FIFO consumed oldest-first, COGS calculated. If cancelled before completion, reservations release and on-hand unchanged.

Labor is separate from parts, invoiceable, no inventory impact, service revenue, custom descriptions, zero amount only if marked free with reason.

Line editing:

- Before completion: service/labor/parts editable when lifecycle and reservation rules allow.
- Removing/reducing part releases reservation.
- After completion: consumed parts not directly editable; billed labor/service not directly editable.
- Inventory corrections use reversal/adjustment/refund/void workflows; billing corrections use cancellation/void/refund/new invoice.

Multiple mechanics supported; productivity uses actual work sessions.

### 6.2 Estimates

Required before presentation: tenant, branch, active customer, motorcycle when service-specific, generated immutable estimate number, status, line items, valid-until date default creation + 7 days, creator/timestamp.

Estimate number:

```text
EST-YYYYMMDD-000001
```

Tenant-wide, daily reset, unique, immutable, never reused.

Statuses:

```text
Draft, Presented, Approved, Converted, Cancelled, Expired
```

Transitions:

| From                        | Allowed To                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------- |
| None                        | Draft                                                                                 |
| Draft                       | Presented with line items; Cancelled with reason                                      |
| Presented                   | Approved with approval method; Cancelled with reason; Expired when valid-until passed |
| Approved                    | Converted; Cancelled if no conversion and reason                                      |
| Converted/Cancelled/Expired | Final                                                                                 |

Presented estimates evaluated daily in tenant timezone. Drafts and approved estimates do not auto-expire. Approval records customer name, method (`verbal|sms|email|signed_document|other`), timestamp, recorder, optional attachment.

Estimates never reserve stock and never affect revenue, AR, tax, financial reports, inventory, or FIFO.

### 6.3 Mechanic Sessions

Features: start/pause/resume/finish, notes, history, active-duration calculation.

Required fields: tenant, branch matching job order, job order, assigned mechanic, start/pause/finish times as applicable, system-calculated active duration, optional notes.

Rules:

- Mechanic cannot have more than one unfinished session across tenant.
- Pause only active session.
- Resume by same mechanic or authorized manager.
- Pause time excluded from active duration.
- Finish active/paused session; finishing tasks does not complete job order.
- Productivity reports use assigned jobs, completed jobs with sessions, total/average active duration, completion count, rework/corrections.

---

## 7. Inventory, FIFO, Adjustments, and Transfers

### 7.1 Products and Stock

Products are tenant-wide. Stock balances, reservations, FIFO layers, and ledgers are branch-specific.

Product required fields: name, tenant-unique SKU across active/inactive products, optional active-unique barcode, supplier code/brand optional, category, UOM, default cost >=0, selling price >=0, reorder level >=0, description optional, status `active|inactive`.

Default categories per tenant: Engine Oil, Tires, Accessories, Brake Parts, CVT Parts, Lubricants. Custom categories allowed; active category names unique.

Product deactivation blocked by non-zero on-hand, active reservations, open job orders, open purchases, draft/pending/in-transit transfers. Inactive products remain historical and not selectable for new stock-affecting operations. Reactivation requires SKU/barcode uniqueness.

Category deactivation blocked by active products; remains historical; inactive category not selectable; reactivation requires unique name.

Stock quantities:

```text
Available = On Hand - Reserved
```

Normal transactions MUST NOT make available negative.

Ledger transaction types:

```text
Purchase Receive
Job Order Reservation
Reservation Release
Job Order Consumption
Inventory Adjustment Increase
Inventory Adjustment Decrease
Inventory Transfer Reservation
Inventory Transfer Reservation Release
Inventory Transfer Out
Inventory Transfer In
Inventory Transfer Variance Loss
Supplier Return
Refund Inventory Reversal
Void Inventory Reversal
```

Low-stock alert when `Available <= Reorder Level`; branch-specific; one active alert per product/branch; resolves when available > reorder level.

### 7.2 Reservations and FIFO

Reservations occur for job order parts and submitted transfers:

- Increase reserved, decrease available, on-hand unchanged.
- Create ledger entry.
- Reference source record.
- Allocate against FIFO layers oldest-first without reducing FIFO remaining quantity until final consumption.

FIFO reservation allocation records reservation ID, FIFO layer ID, reserved qty, unit cost snapshot, timestamp.

```text
Allocatable Layer Qty = FIFO Remaining Qty - Active Reserved Allocation Qty
```

Release releases linked FIFO allocations. Consumption converts linked allocation into FIFO consumption in same transaction that updates on-hand/reserved.

FIFO layers created by purchase receiving, positive adjustment, transfer receiving, void inventory reversal, refund inventory reversal. Consumed by job order consumption, transfer out, transfer variance loss, negative adjustment, supplier return.

COGS recorded from FIFO consumption at job completion. Stock valuation uses remaining FIFO qty × unit cost, filterable by tenant/branch/category/product/as-of date.

### 7.3 Inventory Adjustments

Adjustments require permission, reason, branch, product, quantity difference or final counted qty, ledger entries, audit.

Rules:

- Positive adjustments create FIFO layers.
- Negative adjustments consume FIFO.
- Block if on-hand would fall below reserved.
- Approval required if absolute stock value impact >= ₱5,000 by default.
- Approval threshold evaluated before posting.
- Stock/FIFO/ledger change only at `Posted`.

Adjustment statuses:

```text
Draft, Pending Approval, Approved, Posted, Rejected, Cancelled
```

Workflow:

| From                      | To                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| None                      | Draft                                                                                                     |
| Draft                     | Posted if below threshold and permitted; Pending Approval if threshold reached and creator lacks approval |
| Pending Approval          | Approved by approver; Rejected with reason; Cancelled before posting                                      |
| Approved                  | Posted transactionally                                                                                    |
| Posted/Rejected/Cancelled | Final                                                                                                     |

Force adjustment requires `inventory.force_adjust`, reason, audit, ledger, tenant/branch/FIFO rules, visible in reports, not usable to bypass normal workflows, cannot make on-hand negative or below reserved unless reservation resolved first.

### 7.4 Inventory Transfers

Transfers move stock between active branches in same tenant.

Transfer number:

```text
TR-YYYYMMDD-000001
```

Tenant-wide, daily reset, unique, immutable, never reused.

Statuses:

```text
Draft, Pending, In Transit, Received, Cancelled
```

Required: tenant, transfer number, active source/destination branches that differ, product lines before submit, requested qty >0, sent qty when in transit, received qty when received, creators/actors/timestamps, remarks for cancellation/variance.

Workflow and inventory effects:

| From               | To         | Effect                                                                                                                             |
| ------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| None               | Draft      | No stock effect.                                                                                                                   |
| Draft              | Pending    | Reserve requested stock from source; insufficient available blocked.                                                               |
| Draft              | Cancelled  | No stock effect.                                                                                                                   |
| Pending            | In Transit | Confirm sent qty >0 and <= reserved; release unused reservation.                                                                   |
| Pending            | Cancelled  | Release source reservation.                                                                                                        |
| In Transit         | Received   | Deduct source on-hand/reserved by sent; increase destination on-hand by received; move FIFO layers; create transfer out/in ledger. |
| In Transit         | Cancelled  | Manager only with disposition.                                                                                                     |
| Received/Cancelled | Final.     |

Receiving rules:

- Received qty >=0 and <= sent.
- Destination FIFO layers preserve unit cost and original source FIFO reference.
- If received < sent, variance loss created for missing qty, reason required, audit, FIFO value consumed as inventory loss. It does not create AP, AR, revenue, or expense.

In-transit cancellation disposition:

| Disposition        | Effect                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Returned to source | Release reserved stock; source on-hand unchanged.                                                                                            |
| Lost/damaged       | Release reservation; decrease source on-hand; consume FIFO using reservation allocations; reason; ledger `Inventory Transfer Variance Loss`. |

---

## 8. Suppliers, Purchases, Supplier Returns, and AP

### 8.1 Suppliers

Required: active-unique supplier name within tenant, optional contact/mobile/email/address/notes, status `active|inactive`.

Suppliers are tenant-wide; purchases are branch-specific.

Deactivation allowed only when no open purchase orders and no unpaid AP. Historical records preserved.

Reactivation requires `suppliers.update`, same tenant, active-name uniqueness, status active, audit.

### 8.2 Purchase Orders and Receiving

Purchase statuses:

```text
Draft, Ordered, Partially Received, Received, Closed, Cancelled
```

Required PO fields: tenant, receiving branch, active supplier, generated number, line items before `Ordered`, payment terms `cash|credit`, order date, optional expected receive date, creator.

Purchase order number:

```text
PO-YYYYMMDD-000001
```

Tenant-wide, daily reset, unique, immutable, never reused.

Line fields: active product, ordered qty >0, unit cost >=0, system-calculated line total, notes optional.

Receiving line fields: PO line, received qty >0, received unit cost default from PO but correctable before posting, branch matching PO, timestamp, receiver. Posted receiving is immutable; corrections use supplier return or inventory adjustment.

Workflow:

| From               | To                                                                |
| ------------------ | ----------------------------------------------------------------- |
| None               | Draft                                                             |
| Draft              | Ordered if supplier+lines complete; Cancelled with reason         |
| Ordered            | Partially Received; Received; Cancelled only if no stock received |
| Partially Received | Received; Closed if no remaining qty will be received             |
| Received           | Closed after AP confirmed                                         |
| Closed/Cancelled   | Final                                                             |

Receiving rules:

- Receiving branch active.
- Qty >0 and not above remaining ordered qty unless over-receiving enabled; disabled by default.
- Create `Purchase Receive` ledger and FIFO layers.
- Increase branch on-hand.
- If credit, increase supplier payable.
- If cash, treat amount paid at receiving; require payment method/ref; no AP increase.
- Audit receiving.

AP formula:

```text
Supplier Balance = Total Credit Purchases Received - Supplier Payments - Supplier Credits
```

Supplier payments are manual; include supplier, amount, payment date, method, ref, notes, creator; reduce AP. Block payment > payable unless excess recorded as supplier credit by `supplier_credits.create`.

### 8.3 Supplier Returns

Supplier return requires supplier, original receiving when available, active branch, product lines, returned qty >0 and <= available unreserved stock, reason, `supplier_returns.create`, ledger `Supplier Return`, FIFO consumption oldest-first preferring original receiving FIFO when traceable, branch on-hand decrease, supplier credit or AP reduction, audit.

Disallowed for qty already consumed, transferred, reserved, or returned.

Valuation:

- Inventory value from consumed FIFO layers.
- Financial value uses original received unit cost when traceable.
- If not traceable, use FIFO-consumed cost and require reason.
- Credit purchase returns first reduce unpaid AP; excess becomes supplier credit.
- Cash or fully paid credit purchase returns create supplier credit unless immediate cash refund recorded.
- Immediate supplier cash refund requires method, amount, date, reference when available, audit.
- Supplier return never creates revenue, customer receivable, or tenant expense.

Closing a PO confirms no more receiving; does not erase AP.

---

## 9. Invoicing, Payments, Receipts, Refunds, AR, Tax

### 9.1 Invoice Scope and Relationships

Invoices are service/job-order invoices only. Each issued invoice must link to at least one job order.

Relationships supported:

- One invoice → one job order.
- One invoice → multiple job orders.
- Multiple invoices → one job order.

Multi-job invoices require same tenant, customer, and branch; linked jobs not `Cancelled` or `Released` when invoice created.

Invoices may be created before job completion; job parts remain reserved until completion.

### 9.2 Billing Allocation

For multiple invoices against job-order lines, invoice lines store originating job order line ID, allocated qty/amount, invoice ID, invoice status snapshot/current ref, allocation status.

Allocation statuses:

```text
Reserved, Final, Released, Closed
```

Allocation rules:

| Invoice state                       | Allocation                                       |
| ----------------------------------- | ------------------------------------------------ |
| Draft                               | `Reserved`; reduces remaining billable.          |
| Pending/Partially Paid/Paid/Overdue | `Final`; reduces remaining billable.             |
| Cancelled/Voided                    | `Released`; line becomes billable again.         |
| Refunded                            | `Closed`; line not automatically billable again. |

```text
Remaining Billable = Authorized Line Qty/Amount - Reserved - Final - Closed
```

Block create/update if remaining billable negative. Allocation changes occur in same DB transaction as invoice status change.

### 9.3 Invoice Numbers, Statuses, and Transitions

Invoice number format:

```text
{INVOICE_PREFIX}{6_DIGIT_SEQUENCE}
```

Assigned at draft creation, tenant-wide, unique, immutable, never reused.

Invoice statuses:

```text
Draft, Pending, Partially Paid, Paid, Overdue, Cancelled, Voided, Refunded
```

Status meaning:

- Draft editable; no payments.
- Pending issued, zero net payments.
- Partially Paid net payments >0 and balance >0.
- Paid balance 0 and not fully closed refunded.
- Overdue when current date > due date and balance >0.
- Cancelled draft/pending with zero payments.
- Voided formal void after payments, if any, fully refunded.
- Refunded fully refunded and explicitly closed with no further collection.

Precedence:

```text
Voided > Refunded > Cancelled > Paid > Overdue > Partially Paid > Pending > Draft
```

Transition highlights:

- Draft → Pending if line items/tax fields complete and issued.
- Draft/Pending → Cancelled only with zero payments, no refunds, reason.
- Pending/Partially Paid/Overdue payment updates status to Partially Paid/Paid.
- Paid can move back to Pending/Partially Paid/Overdue after refund if collection continues.
- Paid → Refunded only full refund + explicit close/no collection.
- Voiding requires reason and all payments already refunded.
- Cancelled/Voided/Refunded are final.

Issued invoice fields/customer/branch/tax/lines cannot be directly edited. Corrections use cancellation, void, refund, or new invoice. Paid invoices cannot be directly edited.

Void does not automatically change job order status. Inventory reversal optional and requires `inventory.adjust` or `inventory.force_adjust`; creates `Void Inventory Reversal` ledger; returned qty cannot exceed consumed minus prior reversals; FIFO cost from original consumed cost when available.

### 9.4 Discounts and Tax

Discounts supported:

- Line fixed amount.
- Line percentage.
- Invoice fixed amount.
- Invoice percentage.

Discounts before tax; total discount cannot exceed subtotal; reason required if discount >0; visible on invoice/reports.

Invoice-level discount allocation:

- Fixed invoice-level discounts proportionally by line pre-tax net before invoice-level discount.
- Percentage applies same percent to eligible lines.
- Half-up rounding to 2 decimals.
- Remainder applied to last eligible line by order.
- No line net may become negative.

Tax profiles:

```text
vat_registered, non_vat, no_tax
```

Tax modes:

```text
tax_inclusive, tax_exclusive, no_tax
```

Tax combinations:

| Profile          | Allowed Mode                     |
| ---------------- | -------------------------------- |
| `vat_registered` | `tax_inclusive`, `tax_exclusive` |
| `non_vat`        | `no_tax`                         |
| `no_tax`         | `no_tax`                         |

VAT default 12%. Tax changes affect future invoices only. Issued invoices retain copied tax profile/mode/VAT.

Tax formulas:

```text
tax_exclusive: Line Tax = Taxable Line Net × VAT Rate; Line Total = Net + Tax
tax_inclusive: Taxable Base = Line Gross / (1 + VAT Rate); Line Tax = Gross - Base
no_tax: Line Tax = 0
```

Tax rounded per line to 2 decimals, then summed. All money fixed precision, PHP unless platform-admin currency correction rules allow change before financial records.

### 9.5 Payments, Receipts, Refunds, AR

Payment methods shared by customer, supplier, cash purchase, supplier refund, expense unless workflow restricts:

```text
cash, gcash, maya, bank_transfer, credit_card, check, other
```

Payment records are manual. For card method, store only manual reference info; never card number/CVV/magnetic stripe.

Payment requirements:

- Reference one invoice.
- Amount >0, date, method, creator.
- Generate exactly one receipt.
- Reduce invoice balance and update invoice status.
- Overpayment blocked because customer credit is not supported.

Payments/receipts immutable. Incorrect payment correction uses refund against original payment and optional new correct payment. Original payment/receipt never deleted.

Partial and split payments supported. Each payment generates own receipt.

Receipt number:

```text
RCPT-{6_DIGIT_SEQUENCE}
```

Tenant-wide, unique, immutable, never reused.

Refunds:

- Partial/full supported.
- Reference original payment.
- Require refund permission, amount >0 and <= refundable, reason, audit.
- Update payment refundable balance, invoice balance/status.
- Do not delete original payment/receipt.
- Partial/full refund with collection continuing recalculates invoice to Pending/Partially Paid/Overdue.
- Full refund with no further collection sets `Refunded` and requires explicit close reason.
- `Refunded` invoice excluded from AR.

Refund inventory reversal is explicit, not automatic. Requires inventory permission, returned qty <= original consumed minus prior reversals, creates `Refund Inventory Reversal` ledger, recreates FIFO layers using original consumed cost where available, audit.

AR includes invoices where:

```text
Remaining Collectible Balance > 0 AND status in Pending, Partially Paid, Overdue
```

AR tracks invoice, customer, branch, total, paid, balance, due date, status, aging bucket:

```text
Current, 1-30, 31-60, 61-90, Over 90 days overdue
```

---

## 10. Expenses, Reminders, Notifications, Files, Reports

### 10.1 Expenses

Features: expense categories create/edit/deactivate, record/edit/void expense, receipt attachment, reports.

Required expense: tenant, branch, category, amount >0, date, description, optional attachment, creator, status `active|voided`.

Void requires `expenses.void`, reason, preserve original, exclude from profit reports, keep history/audit, audit log.

Active expenses may be edited by `expenses.update`; reason required when amount/date/branch/category/description changes; audit previous values when safe; reports recalc using current active values; preserve attachments; block if voided or tenant blocked. Category deactivation/reactivation is audit logged; inactive categories historical and not selectable.

### 10.2 Reminders

Reminder categories: oil change, PMS, registration renewal, birthday, follow-up, custom.

Statuses:

```text
Scheduled, Due, Sent, Failed, Cancelled
```

Channels: internal in-app, internal push, internal email, customer email, customer SMS. Customer push excluded.

Plan behavior:

| Plan  | Reminder channels                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------- |
| Basic | Create reminders; due reminders notify shop users by in-app + push only. Internal email, customer email/SMS blocked. |
| Mid   | Adds internal email and customer email. Customer SMS blocked.                                                        |
| High  | Adds customer SMS.                                                                                                   |

Due rules:

- Time-based: current date >= due date.
- Mileage-based: motorcycle latest mileage >= due mileage.
- Birthday: month/day matches current date.
- Daily evaluation uses tenant timezone; mileage also evaluated on mileage update.

Delivery tracking stores type, customer, motorcycle, channel, message snapshot, delivery status, sent timestamp, failure reason, creator. Aggregate status is Scheduled/Due/Sent/Failed/Cancelled based on selected channels. No silent channel downgrade.

External transient failures retried max 3 attempts per channel within 24h. Permanent failures are not automatically retried. Attempts record number/provider/timestamp/result/failure.

### 10.3 Internal Notifications

Types: low stock, new jobs, assignment, service completion, payments, subscription renewal alerts, transfer updates, purchase receiving, reminder due, failed reminder delivery, employee deactivation, role/permission changes.

Recipients determined by tenant, branch access, permissions, notification type, user preferences, plan availability.

Delivery statuses:

```text
Pending, Sent, Failed, Read, Dismissed
```

Read/dismissed apply only to internal in-app. If push permission unavailable, mark failed/unavailable and do not substitute another channel.

### 10.4 Files

Attachment scope: motorcycle/service photos, job order attachments, receipt/warranty docs, expense receipts, estimate approval attachments, supplier/purchase docs.

Supported: JPG/JPEG/PNG/WEBP, PDF/DOCX/XLSX. Image max 5MB; document max 20MB.

Security:

- Tenant-scoped storage paths and ownership.
- Linked-entity access rules.
- Block cross-tenant access.
- Malware scan optional infra; when configured, pending scan/quarantine handling required.
- Private signed URLs only; no public permanent tenant file URLs.

Deletion: soft delete for 30 days before permanent deletion. Restore within 30 days. Audit/financial-linked files not permanently deleted before retention allows.

### 10.5 Dashboard and Reports

Dashboard: daily sales, monthly revenue, pending jobs, jobs by status, inventory alerts, revenue chart, customer growth, AR/AP summaries, low stock, open transfer, pending receiving.

Report groups:

- Sales: daily/weekly/monthly/yearly, branch, advisor, payment method, discounts, tax, refunds, voids.
- Service: common services, mechanic productivity, job status, service revenue, avg completion, released unpaid jobs, cancelled jobs.
- Inventory: valuation, fast/slow moving, low stock, movements, transfers, FIFO layers, adjustments, transfer variance.
- Customer: new/repeat/inactive, service history, motorcycle count, reminder engagement.
- Financial: revenue, expenses, gross profit, COGS, AR, AP, refunds, voids, collections, supplier balances.

Report exports: PDF, Excel, CSV; respect tenant/branch access. Large export if >10,000 rows or >10 seconds; must run as background job.

Plan report access:

| Report                                                      | Basic | Mid | High |
| ----------------------------------------------------------- | ----- | --- | ---- |
| Basic sales/service/inventory, AR, AP, CSV/Excel/PDF export | Yes   | Yes | Yes  |
| Branch comparison                                           | No    | Yes | Yes  |
| Advanced operational reports                                | No    | No  | Yes  |

Advanced reports include mechanic productivity, transfer variance, FIFO layer, inventory adjustment, released jobs with unpaid balance, branch comparison, cross-branch/cost-layer detail.

Financial reports are operational, not formal accounting:

- Revenue from issued invoices unless report is explicitly cash-basis.
- Exclude draft/cancelled/voided; refunded closed invoices reduce revenue by refunded amount.
- Discounts reduce revenue; tax reported separately.
- Collections = payments minus refunds by payment/refund date.
- COGS recognized when job-order parts are consumed.
- Gross profit = net service + parts revenue - consumed inventory cost.
- Supplier returns reduce inventory/AP/credit, not revenue.
- Transfer variance appears as inventory loss only.
- Expenses from active records; voided excluded.
- AR/AP use current outstanding balances.
- Date filters use tenant timezone.

---

## 11. Audit, Export, Offline, Security, NFRs, Integrations

### 11.1 Audit Logs

Audit logs are immutable; tenant users cannot edit/delete. Minimum retention 3 years; platform admins may extend, not shorten. Platform-retained audit metadata may remain after tenant deletion, without unnecessary sensitive payloads.

Audit fields: tenant for tenant actions, branch for branch actions, actor user, actor type (`tenant_user|platform_admin|system`), action, entity type/id, old/new safe values, reason for corrective/destructive actions, timestamp, IP/user agent when available.

Sensitive values such as passwords, reset tokens, access/refresh tokens MUST NOT be audited.

Critical audit coverage includes auth/login lockouts, users/employees/invitations/reactivation, role/permission changes, platform admins/support, branches, customer merge/delete/restore, motorcycle link/mileage/restore, job order lifecycle, inventory reservations/consumption/adjustments/transfers/variances, purchases/returns/supplier payments/credits/reactivation, invoices/billing allocations/payments/refunds/receipts, expenses/categories, reminders/notifications, subscriptions/plan overrides, settings, country/currency corrections, exports, tenant deletion.

### 11.2 Tenant Export and Retention

Shop Owners can export tenant data. Export includes customers, motorcycles, job orders, estimates, invoices, payments, receipts, refunds, products, balances, ledger, FIFO, transfers, suppliers, purchases, supplier payments, expenses, reports, tenant-visible audit logs, file metadata, attachment manifest.

ZIP must contain CSV, JSON, attachment manifest, audit export, README. Download links expire after 7 days. Large exports async.

Full export includes attachments unless metadata-only selected. Attachments directory `/attachments`; safe filenames; manifest maps export filename to original metadata/entity/tenant/checksum. Soft-deleted files included only if requested and within retention. Quarantined/malware files excluded from binaries but listed in manifest.

Active tenant data retained while active. Expired/cancelled follows lifecycle. Soft-deleted records retained for history until tenant deletion. Deleted tenant resubscription creates new tenant and does not restore old data.

### 11.3 Offline

PWA must be installable and load shell offline. Offline status clearly shown.

Read-only cache includes recent customers, motorcycles, job orders, invoices. Cache is user-scoped, minimum necessary, clears on logout, expires after 7 days, avoids signed URL caching beyond URL expiry. Offline client cannot guarantee deactivation revocation until reconnect.

Offline creation/editing/submission/deletion/approval is blocked for customers, motorcycles, job orders, estimates, invoices, payments, receipts, refunds, inventory adjustments/approvals/posting, transfers, purchases, supplier payments, expenses, files, roles, permissions, settings.

### 11.4 Security

- Enforce tenant isolation at app and DB query levels.
- Branch records scoped by `tenant_id` and `branch_id`; branch assignment required.
- HTTPS required in production; HTTP redirected or blocked.
- Password hashing, encryption at rest where supported, encrypted object storage/backups, secure token generation, secrets outside code.
- Do not log passwords, access/refresh tokens, reset/verification tokens, card details.
- Credit-card payment method stores only reference info; no card number/CVV/magnetic stripe.

Rate limits:

| Category                  | Limit                                                    |
| ------------------------- | -------------------------------------------------------- |
| Login                     | 5 failed / 15 min / account+IP                           |
| Password reset            | 3 / account / hour                                       |
| Email verification resend | 5 / account / hour                                       |
| File uploads              | 30 / user / minute                                       |
| Public unauth APIs        | 60 / IP / minute                                         |
| Reminder sending          | 500 customer messages / tenant / day unless admin raises |
| Export generation         | 5 / tenant / day                                         |

Daily encrypted backups retained at least 30 days; restore tested quarterly. DR targets: RPO 24h, RTO 4h.

Critical transactional/idempotent operations: invoice issue/cancel/void, payment+receipt, refund, job completion+inventory consumption, reservation/release, adjustment post, purchase receiving, supplier return/payment, stock-affecting transfer transitions, tenant deletion.

Concurrency safeguards must prevent duplicate numbers, double submit, double refund, double consumption, over-reservation, overbilling, over-receiving, duplicate deletion. Idempotency keys scoped by tenant, user, endpoint, request intent; replay returns original/safe response without repeating side effects.

### 11.5 Non-Functional Requirements

Performance targets:

| Metric                                | Target                               |
| ------------------------------------- | ------------------------------------ |
| Initial page load                     | <3s on modern mobile browser over 4G |
| API P50                               | <200ms                               |
| API P95                               | <500ms                               |
| API P99                               | <1000ms                              |
| Default interactive reports <=90 days | <5s                                  |
| Reports >10s                          | Background export                    |

Availability target: 99.9% monthly uptime excluding scheduled maintenance announced 24h ahead.

Scale target:

```text
500 shops, 10,000 users, 2,000 branches,
1,000,000 customers, 1,500,000 motorcycles,
2,000,000 job orders, 5,000,000 ledger entries
```

Architecture must support horizontal app scaling and indexed tenant/branch/date/status queries.

Mobile: mobile-first, responsive, PWA, modern browsers, touch-optimized, min 360px width. Core mobile workflows: customer lookup, motorcycle lookup, job order creation, mechanic session update, inventory lookup, payment recording, receipt viewing.

Observability: API error/latency, background failures, SMS/email failures, storage, DB growth, auth failures, authz denials, export status, reminder delivery, inventory failures; structured logs with correlation IDs; critical background failures alert platform admins.

Background jobs required for large exports/report exports, reminder due/delivery, subscription lifecycle, deletion warnings, tenant deletion, file permanent deletion, low-stock checks when async, provider delivery processing. Jobs track type, tenant, status (`Queued|Running|Succeeded|Failed|Cancelled`), attempts, last error, timestamps, correlation ID. Retry only when safe; irreversible jobs idempotent.

### 11.6 Integrations

Required categories: email provider, SMS gateway, cloud object storage, analytics, error monitoring.

Email supports verification, password reset, subscription warnings, eligible customer reminders, export-ready notices, eligible operational emails.

SMS supports High Plan customer SMS reminders, delivery status when available, failure logging; blocked for Basic/Mid unless override.

Storage supports tenant-scoped private storage, signed URLs, soft/permanent deletion.

Analytics avoids unnecessary sensitive customer data; tenant IDs only when needed.

Error monitoring covers frontend/backend/jobs, correlation ID, env/release tags, alerts, and excludes passwords/tokens/card details/sensitive notes.

No payment gateway charging.

---

## 12. Acceptance Criteria Summary

GarageOS is acceptable only when:

- Tenant isolation enforced for records, files, reports, exports.
- Branch users see only assigned branch operational data; tenant-wide users see all.
- Subscription plans, overrides, lifecycle windows, pending setup, read-only, suspended, renewal, and default-plan signup rules are enforced.
- Job orders follow status matrix; parts reserve automatically and consume only at completion; release/correction/cancellation rules audit.
- Inventory ledger exists for every stock change; available = on-hand - reserved; FIFO oldest-first; reservations prevent double allocation; adjustments approve/post correctly; low stock alerts branch-specific.
- Invoices are job-order linked, support multi-job and multi-invoice without overbilling, issue immutable numbers, block direct paid edits, calculate overdue, void/refund/audit correctly, allocate invoice discounts before tax.
- Payments support partial/split; each payment generates immutable receipt; overpayment blocked; refunds recalc invoice/AR; inventory reversal explicit.
- Tax profile/mode combos enforced; VAT default 12%; per-line rounded tax; issued invoices retain tax snapshot.
- Purchases receiving increases stock/FIFO; credit purchases create AP; cash purchases do not; supplier returns update stock/AP/credit; supplier payments reduce AP.
- Reminders due by date/mileage/birthday; plan-gated channels blocked; delivery attempts tracked and capped.
- Offline shell works; recent records read-only; writes blocked; cache clears on logout.
- Audit logs exist, immutable, actor/entity/timestamp/reason captured, retained 3 years.
- Tenant export ZIP includes CSV/JSON/manifest/audit/README and attachments unless metadata-only; deletion/resubscription rules enforced.
- HTTPS, strong hashes, secret/token/card-data restrictions, rate limits, private files, audited support access, encrypted backups, idempotent critical writes are implemented.
- Financial reports calculate revenue, collections, COGS, gross profit, AR, AP, expenses, variance using documented operational rules and tenant timezone.

---

## 13. Build Readiness Outputs

Implementation must be able to derive these downstream artifacts:

- Requirements matrix, user stories, permission matrix, role-template config.
- ERD, database schema, API contracts.
- Status transition diagrams.
- Background job, lifecycle job, transaction/idempotency, notification delivery, data export, attachment packaging designs.
- Financial report calculation spec.
- Security test plan, QA acceptance tests, deployment/operations plan.

---

## 14. Panel Resolution Highlights

Final decisions preserved:

- Single full build scope; milestones are sequencing only.
- Mobile-first PWA, PostgreSQL-compatible SaaS model assumed by downstream docs.
- Tenant lifecycle: Day 1–14 grace, Day 15–30 read-only, Day 31–60 suspended, Day 61–67 pending deletion, Day 68+ deletion.
- Subscription status system-computed unless audited override.
- Owner signup requires default Basic/Mid/High plan and duration.
- Subscription payments external/manual.
- Pending setup access limited to onboarding/profile/subscription/password/logout.
- Platform support access explicit, reasoned, marked, audited; no silent impersonation.
- Role templates tenant-owned; Shop Owner capabilities protected.
- Employee/supplier/customer/motorcycle reactivation/restoration re-check current constraints and audit.
- Invoice billing allocations prevent concurrent overbilling.
- Invoice-level discounts allocated before tax.
- Paid invoice refunds with continued collection recalc to Pending/Partially Paid/Overdue; `Refunded` means fully closed.
- Supplier returns required; standalone customer returns excluded.
- Transfer variance is inventory loss only.
- FIFO reservations allocate layer capacity but consume only at final stock event.
- Expense editing allowed only with permission, reason, recalculation, audit.
- Timezone changes affect future calculations only and cannot bypass lifecycle.
