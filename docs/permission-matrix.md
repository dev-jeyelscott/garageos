# GarageOS Permission Matrix

**Status:** Draft for review  
**Generated:** 2026-06-24  
**Source of Truth:** `requirements.md`, `database-design.md`, `database-schema.md`, `architecture.md`, `api-contracts.md`  
**Purpose:** Compact RBAC, access-gate, endpoint-permission, and QA reference for implementation. This document compresses the original permission matrix without adding product scope.

---

## 1. Source Rules

1. Follow source docs first; do not invent roles, permissions, routes, workflows, or guards.
2. Tenant users belong to one tenant. Tenant scope is resolved from session, not request body.
3. Branch-specific records require both permission and branch access.
4. Backend/API/database authorization is authoritative. UI checks are UX only.
5. Platform permissions are platform-only and must not be assigned to tenant roles.
6. Explicit exclusions remain excluded: native apps, offline writes, customer portal, standalone POS, payroll, full accounting/GL, tax filing, payment-gateway subscription charging, loyalty, marketplace, service packages, AI forecasting, and 2FA.

---

## 2. Key Access Decisions

| Area                     | Rule                                                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shop Owner               | Has all tenant permissions and tenant-wide branch access. Do not allow deactivation/demotion of the last active Shop Owner.                                                      |
| Platform Admin           | Uses platform permissions only; never treated as tenant employee scope. Support access is explicit, reasoned, expiring, visibly marked, and audited.                             |
| Non-owner role templates | Manager, Service Advisor, Mechanic, Cashier, and Inventory Clerk mappings are eligibility only, not approved seed defaults. Product approval is required before seed migrations. |
| Custom roles             | Tenant-scoped permissions are assignable unless source docs protect/restrict them. No explicit deny permissions exist.                                                           |
| Permission resolution    | Effective permissions = union of active role permissions for active user roles. Role changes must invalidate/recompute permissions immediately.                                  |
| Gate precedence          | Authentication → email verification → tenant status/subscription → platform/support access → permission → branch access → validation → idempotency → service transaction/audit.  |

---

## 3. Symbols and Tags

| Token                              | Meaning                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `PA`                               | Platform Admin only. Not tenant-assignable.                                                     |
| `SO`                               | Shop Owner has this by rule; not repeated in catalog.                                           |
| `Mgr`, `SA`, `Mech`, `Cash`, `Inv` | Non-owner role-template eligibility only; not seed defaults.                                    |
| `HR`                               | High-risk permission; require confirmation UX, audit visibility, and focused QA/security tests. |
| `B`                                | Branch access required for branch-specific record access.                                       |
| `TW`                               | Tenant-wide entity; linked operational history remains branch-filtered.                         |
| `T`                                | Tenant-scoped; branch access applies where branch-specific records are involved.                |
| `Plan`                             | Effective plan/override may block capability even when permission exists.                       |
| `Fin`                              | Financial/AP/AR/report access. Mechanics are prohibited unless explicitly custom-granted.       |

---

## 4. Global Access Gates

| Gate            | Required behavior                                                                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication  | Active session and verified email required before operational access.                                                                                                                        |
| Tenant status   | `active` and `grace_period` allow permission-based operational writes. `read_only`, `suspended`, `pending_deletion`, and `deleted` block writes except documented owner/platform exceptions. |
| Branch access   | Branch-scoped records require assigned branch or tenant-wide branch access.                                                                                                                  |
| Permission      | Endpoint/action must require a documented permission code.                                                                                                                                   |
| Plan capability | Branch limits, notification channels, branch comparison reports, and advanced reports must pass effective plan rules. Return `plan_limit_exceeded` where applicable.                         |
| Support access  | Requires platform admin, tenant, reason, mode, expiry/end, and audit log. Default mode is `read_only`; `write_allowed` must be explicit.                                                     |
| Offline mode    | Offline shell/cache is read-only. Block all writes regardless of permission.                                                                                                                 |

---

## 5. Tenant Status Access Matrix

| Status             | Reads                              | Writes                     | Owner renewal/export                                                   | Non-owner access                        | Platform support                              |
| ------------------ | ---------------------------------- | -------------------------- | ---------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------- |
| `pending_setup`    | Setup/profile/subscription only    | Onboarding/setup only      | Renewal where applicable; no operational export                        | No operational screens                  | May view setup status                         |
| `active`           | Permission + branch scoped         | Permission + branch scoped | Yes / `shop.export_data`                                               | Yes                                     | Audited only                                  |
| `grace_period`     | Permission + branch scoped         | Permission + branch scoped | Yes / `shop.export_data`                                               | Yes                                     | Audited only                                  |
| `read_only`        | View/search/report/password/logout | No operational writes      | Renewal yes; export Shop Owner only                                    | Read/search/report/password/logout only | Audited only                                  |
| `suspended`        | Owner renewal/export screens only  | No                         | Shop Owner only until export window closes                             | Blocked                                 | Retained                                      |
| `pending_deletion` | Operational access blocked         | No                         | Emergency/platform-dependent; export disabled unless extension granted | Blocked                                 | Audited platform access only                  |
| `deleted`          | No tenant operational access       | No                         | No                                                                     | Blocked                                 | Platform-retained audit/deletion context only |

---

## 6. Permission Catalog

**Catalog rule:** Shop Owner has all tenant permissions. All tenant-scoped permissions are custom-role assignable unless source docs later restrict them. Non-owner role abbreviations show eligibility only.

| Module                        | Permission codes, role eligibility, and guard tags                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform Administration       | `platform.tenants.read` (PA) [Platform]; `platform.tenants.create` (PA) [Platform]; `platform.tenants.update` (PA) [Platform]<br>`platform.subscriptions.update` (PA) [HR,Platform]; `platform.plans.update` (PA) [Platform]; `platform.support_access` (PA) [HR,Platform]<br>`platform.audit_logs.read` (PA) [Platform]                                                                           |
| Shop / Settings               | `shop.read` [T]; `shop.update` [T]; `shop.billing.update` [T]<br>`shop.export_data` [HR,T]; `settings.update` [T]                                                                                                                                                                                                                                                                                  |
| Branch Management             | `branches.create` [Plan,T]; `branches.read` [T]; `branches.update` [T]<br>`branches.deactivate` [HR,T]; `branches.reactivate` [HR,Plan,T]                                                                                                                                                                                                                                                          |
| Employee / User Management    | `users.create` [T]; `users.read` (Mgr) [T]; `users.update` [T]<br>`users.deactivate` [T]; `users.reset_password` [T]; `users.assign_roles` [HR,T]<br>`users.assign_branches` [HR,T]                                                                                                                                                                                                                |
| Roles & Permissions           | `roles.create` [T]; `roles.read` [T]; `roles.update` [HR,T]<br>`roles.deactivate` [T]; `permissions.read` [T]                                                                                                                                                                                                                                                                                      |
| Customers                     | `customers.create` (SA) [TW]; `customers.read` (SA) [TW]; `customers.update` (SA) [TW]<br>`customers.merge` [TW]; `customers.soft_delete` [TW]; `customers.restore` [TW]                                                                                                                                                                                                                           |
| Motorcycles                   | `motorcycles.create` (SA) [TW]; `motorcycles.read` (SA) [TW]; `motorcycles.update` (SA) [TW]<br>`motorcycles.soft_delete` [TW]; `motorcycles.restore` [TW]                                                                                                                                                                                                                                         |
| Job Orders                    | `job_orders.create` (Mgr,SA) [B]; `job_orders.read` (Mgr,SA,Mech,Cash) [B]; `job_orders.update` (Mgr,SA,Mech) [B]<br>`job_orders.cancel` (Mgr) [B]; `job_orders.change_status` (Mgr,SA) [B]; `job_orders.correct_status` (Mgr) [HR,B]<br>`job_orders.release` (Mgr) [B]; `job_orders.release_with_balance` (Mgr) [HR,B]; `job_orders.attach_files` (SA,Mech) [B]                                   |
| Estimates                     | `estimates.create` (SA) [B]; `estimates.read` (SA) [B]; `estimates.update` (SA) [B]<br>`estimates.present` (SA) [B]; `estimates.approve` [B]; `estimates.convert` [B]<br>`estimates.cancel` [B]                                                                                                                                                                                                    |
| Service Catalog               | `services.create` [T]; `services.read` (SA) [T]; `services.update` [T]<br>`services.deactivate` [T]                                                                                                                                                                                                                                                                                                |
| Mechanic Time Tracking        | `mechanic_sessions.create` (Mech) [B]; `mechanic_sessions.read` (Mgr,Mech) [B]; `mechanic_sessions.pause` (Mech) [B]<br>`mechanic_sessions.resume` (Mech) [B]; `mechanic_sessions.finish` (Mech) [B]                                                                                                                                                                                               |
| Products                      | `products.create` (Inv) [TW]; `products.read` (SA,Mech,Inv) [TW]; `products.update` (Inv) [TW]<br>`products.deactivate` (Inv) [TW]; `product_categories.manage` (Inv) [T]                                                                                                                                                                                                                          |
| Inventory                     | `inventory.read` (Mgr,Inv) [B]; `inventory.adjust` (Inv) [B]; `inventory.adjust.approve` (Mgr,Inv) [HR,B]<br>`inventory.reserve` (SA,Inv) [B]; `inventory.release_reservation` (SA,Inv) [B]; `inventory.transfer.create` (Inv) [B]<br>`inventory.transfer.send` (Inv) [B]; `inventory.transfer.receive` (Inv) [B]; `inventory.transfer.cancel` (Mgr,Inv) [HR,B]<br>`inventory.force_adjust` [HR,B] |
| Suppliers                     | `suppliers.create` (Inv) [TW]; `suppliers.read` (Inv) [TW]; `suppliers.update` (Inv) [TW]<br>`suppliers.deactivate` (Inv) [TW]                                                                                                                                                                                                                                                                     |
| Purchasing / AP               | `purchases.create` (Inv) [B]; `purchases.read` (Inv) [B]; `purchases.update` (Inv) [B]<br>`purchases.cancel` (Inv) [B]; `purchases.receive` (Inv) [B]; `supplier_returns.create` (Inv) [B]<br>`supplier_returns.read` (Inv) [B]; `supplier_credits.create` [HR,Fin,T]; `supplier_credits.read` (Inv) [Fin,T]<br>`supplier_payments.create` [HR,Fin,T]; `supplier_payments.read` (Inv) [Fin,T]      |
| Invoicing / AR                | `invoices.create` (Cash) [Fin,B]; `invoices.read` (Cash) [Fin,B]; `invoices.update_draft` (Cash) [Fin,B]<br>`invoices.issue` (Cash) [HR,Fin,B]; `invoices.cancel` [HR,Fin,B]; `invoices.void` [HR,Fin,B]<br>`invoices.refund` (Mgr,Cash) [HR,Fin,B]                                                                                                                                                |
| Payments / Receipts / Refunds | `payments.create` (Cash) [HR,Fin,B]; `payments.read` (Cash) [Fin,B]; `payments.refund` (Mgr,Cash) [HR,Fin,B]<br>`receipts.read` (Cash) [Fin,B]                                                                                                                                                                                                                                                     |
| Expenses                      | `expenses.create` [B]; `expenses.read` [B]; `expenses.update` [HR,B]<br>`expenses.void` [HR,B]; `expense_categories.manage` [T]                                                                                                                                                                                                                                                                    |
| Customer Reminders            | `reminders.create` [Plan,T]; `reminders.read` [Plan,T]; `reminders.update` [Plan,T]<br>`reminders.cancel` [Plan,T]; `reminders.send` [Plan,T]                                                                                                                                                                                                                                                      |
| Notifications                 | `notifications.read` [Plan,T]; `notifications.update_preferences` [Plan,T]; `notifications.send` [Plan,T]                                                                                                                                                                                                                                                                                          |
| Reports                       | `reports.view_basic` (Mgr,Cash) [Plan,Fin,T]; `reports.view_branch` (Mgr) [Plan,Fin,T]; `reports.view_advanced` [Plan,Fin,T]<br>`reports.export` [Plan,Fin,T]                                                                                                                                                                                                                                      |
| Files                         | `files.upload` (SA,Mech) [B]; `files.read` (SA,Mech) [B]; `files.soft_delete` [HR,B]<br>`files.restore` [HR,B]                                                                                                                                                                                                                                                                                     |
| Tenant Audit Logs             | `audit_logs.read` [HR,T]                                                                                                                                                                                                                                                                                                                                                                           |

---

## 7. Endpoint Permission Rules

Use `api-contracts.md` as the exact endpoint source. This document keeps only the compact route-family rule to avoid duplicating the full API matrix.

| Route family                                                                                       | Required access pattern                                                                                                                                           |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/auth/*`                                                                                   | Public token flows or authenticated session flows as documented. Operational access still requires verified email and tenant status gate.                         |
| `/api/v1/platform/*`                                                                               | Platform permissions only: `platform.tenants.*`, `platform.subscriptions.update`, `platform.plans.update`, `platform.support_access`, `platform.audit_logs.read`. |
| `/api/v1/shop/*`                                                                                   | `shop.read`, `shop.update`, `shop.billing.update`, `settings.update`, Shop Owner setup access, or `shop.export_data` depending on route.                          |
| `/api/v1/branches/*`                                                                               | `branches.*` plus tenant status, branch-limit plan checks, and audit for deactivate/reactivate.                                                                   |
| `/api/v1/employees/*`                                                                              | `users.*`; role/branch assignment changes are high-risk and audited.                                                                                              |
| `/api/v1/roles/*`                                                                                  | `roles.*` and `permissions.read`; role updates audited and permission cache invalidated.                                                                          |
| `/api/v1/customers/*`, `/api/v1/motorcycles/*`                                                     | `customers.*` / `motorcycles.*`; tenant-wide entity visibility with branch-filtered operational histories.                                                        |
| `/api/v1/services/*`, `/api/v1/estimates/*`, `/api/v1/job-orders/*`, `/api/v1/mechanic-sessions/*` | Matching service, estimate, job order, mechanic session permissions; workflow transitions use explicit action endpoints.                                          |
| `/api/v1/products/*`, `/api/v1/product-categories/*`, `/api/v1/inventory*`                         | `products.*`, `product_categories.manage`, `inventory.*`; branch/FIFO/ledger constraints remain service/database-enforced.                                        |
| `/api/v1/suppliers/*`, `/api/v1/purchase-orders/*`, `/api/v1/supplier-returns/*`                   | `suppliers.*`, `purchases.*`, `supplier_returns.*`, `supplier_payments.*`, `supplier_credits.*`; AP/financial views restricted.                                   |
| `/api/v1/invoices/*`, `/api/v1/payments/*`, `/api/v1/receipts/*`, `/api/v1/accounts/*`             | `invoices.*`, `payments.*`, `receipts.read`, reports/AP/AR permissions where documented; financial immutability applies.                                          |
| `/api/v1/expenses/*`                                                                               | `expenses.*` and `expense_categories.manage`; edits/voids require reason and audit where report-affecting.                                                        |
| `/api/v1/reminders/*`, `/api/v1/notifications/*`                                                   | `reminders.*`, `notifications.*` plus plan channel gates.                                                                                                         |
| `/api/v1/files/*`                                                                                  | `files.*` plus linked-entity permission and branch access. Downloads use private/signed access.                                                                   |
| `/api/v1/dashboard/*`, `/api/v1/reports/*`                                                         | `reports.view_basic`, `reports.view_branch`, `reports.view_advanced`, `reports.export`; plan and branch filters apply.                                            |
| `/api/v1/exports/*`                                                                                | `shop.export_data`; owner/export lifecycle restrictions apply.                                                                                                    |
| `/api/v1/audit-logs/*`                                                                             | `audit_logs.read`; high-risk visibility.                                                                                                                          |
| `/api/v1/background-jobs/*`                                                                        | Context-specific: tenant exports use `shop.export_data`, report exports use `reports.export`, platform jobs use platform permissions.                             |
| `/api/v1/offline-cache/*`                                                                          | Authenticated read-only cache access only.                                                                                                                        |

### Idempotency Rule

Critical retryable writes require `Idempotency-Key` where the API contract specifies it. This includes create/submit/post/issue/payment/refund/void/cancel/receive/export/deletion-style commands and other side-effecting workflow actions. Reuse the API contract as the exact source.

---

## 8. High-Risk Permission Checklist

High-risk permissions require stronger UX confirmation, audit visibility, and focused QA/security tests:

`platform.support_access`, `platform.subscriptions.update`, `shop.export_data`, `users.assign_roles`, `users.assign_branches`, `roles.update`, `branches.deactivate`, `branches.reactivate`, `job_orders.correct_status`, `job_orders.release_with_balance`, `inventory.adjust.approve`, `inventory.force_adjust`, `inventory.transfer.cancel`, `supplier_credits.create`, `supplier_payments.create`, `invoices.issue`, `invoices.cancel`, `invoices.void`, `invoices.refund`, `payments.create`, `payments.refund`, `expenses.update`, `expenses.void`, `files.soft_delete`, `files.restore`, `audit_logs.read`.

---

## 9. QA Acceptance Criteria

1. Protected endpoints reject users without the required documented permission.
2. Tenant users cannot access another tenant’s records.
3. Branch-scoped users cannot access unassigned branch records unless tenant-wide branch access exists.
4. Shop Owner always has all tenant permissions and tenant-wide branch access.
5. Last active Shop Owner cannot be deactivated or demoted.
6. Role edits immediately affect active users and write audit logs.
7. Role deactivation is blocked when active users depend solely on that role.
8. Mechanics cannot access invoices, payments, supplier balances, financial reports, or subscription settings unless custom-granted.
9. Operational writes are blocked in `read_only`, `suspended`, `pending_deletion`, and `deleted`, except documented exceptions.
10. Plan-disabled branch/report/notification capabilities return plan-limit errors even when permission exists.
11. Critical writes enforce idempotency where the API contract requires it.
12. Auth failures/denials are logged with request/correlation ID, actor, tenant when applicable, required permission, and sanitized error code.

---

## 10. Open Product Decisions

| ID     | Decision needed                                                                                 | Recommendation                                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| PM-001 | Exact default seed grants for Manager, Service Advisor, Mechanic, Cashier, and Inventory Clerk. | Approve `role-template-configuration-matrix.md` before seed migrations.                                                            |
| PM-002 | Whether refund approval and refund execution need separate permissions.                         | Do not add permission codes unless PRD/API docs are revised; use existing documented refund permissions or update source docs.     |
| PM-003 | Supplier balance access path.                                                                   | Keep endpoint-specific rules from API contract and test both accepted access paths.                                                |
| PM-004 | Generic background job status permission.                                                       | Resolve by job type: tenant exports = `shop.export_data`; report exports = `reports.export`; platform jobs = platform permissions. |

---

## 11. Implementation Formula

```text
effective_permissions = union(active role_permissions for active user_roles)

request_allowed =
  authenticated_user_active
  AND email_verified
  AND tenant_status_allows_action
  AND required_permission IN effective_permissions
  AND branch_scope_allows_record_access
  AND plan_capability_allows_action
  AND resource_workflow_state_allows_action
```
