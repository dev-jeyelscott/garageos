# GarageOS API Contracts

**Document:** `api-contracts.md`  
**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Status:** Token-optimized implementation reference  
**API Style:** REST over HTTPS, JSON, resource-oriented, explicit workflow action endpoints

---

## 1. Purpose

This document preserves the implementation-critical API contract rules from `api-contracts.md` while reducing token cost. It removes panel discussion, most JSON examples, repeated explanations, and long narrative sections.

Use this document for AI-assisted planning, implementation checks, route planning, permission review, and contract-test planning. Use the full API contract or generated OpenAPI for exact DTO examples when needed.

---

## 2. Source Alignment and Non-Scope

GarageOS API behavior must align with the PRD, database design, database schema, architecture, permission matrix, QA plan, and approved ADRs. This reference does not introduce new product scope.

### Core API Decisions

| Area                 | Rule                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Base path            | `/api/v1`                                                                                   |
| Transport            | HTTPS in production                                                                         |
| Format               | JSON except binary upload/download flows                                                    |
| Field style          | `snake_case`                                                                                |
| Enums                | Lowercase API-safe values matching schema                                                   |
| Auth                 | Bearer access token plus rotating refresh token                                             |
| Tenant context       | Derived from authenticated session for tenant APIs                                          |
| Platform context     | Platform APIs under `/platform/*`                                                           |
| Workflow transitions | Explicit action endpoints; no arbitrary status patching                                     |
| Pagination           | Cursor by default for high-volume lists                                                     |
| Money                | Fixed precision, 2 decimal places                                                           |
| Quantity             | Fixed precision, up to 3 decimal places                                                     |
| Date/time            | RFC 3339 UTC for timestamps; `YYYY-MM-DD` for tenant business dates                         |
| Locking              | Mutable updates use `lock_version` / `If-Match`; stale writes return `409 version_conflict` |
| Audit                | Critical and corrective actions are audited; reason required where documented               |

### Explicit API Non-Goals

Do not expose APIs for native-app-only clients, offline write sync, customer portal login, standalone POS checkout, payroll, general ledger accounting, direct BIR filing, payment-gateway charging or automatic subscription collection, or 2FA.

---

## 3. Global Contract

### Required Headers

| Header                                 |                     Required | Applies To                               |
| -------------------------------------- | ---------------------------: | ---------------------------------------- |
| `Authorization: Bearer <access_token>` | Yes except public auth flows | Authenticated APIs                       |
| `Content-Type: application/json`       |                          Yes | JSON requests                            |
| `Accept: application/json`             |                  Recommended | JSON responses                           |
| `Idempotency-Key`                      |                          Yes | Critical retryable writes                |
| `X-Correlation-ID`                     |                     Optional | All APIs; server generates if missing    |
| `If-Match`                             |                     Optional | Mutable updates using optimistic locking |

### Response Envelopes

Successful responses:

```json
{ "data": {}, "meta": { "request_id": "req_...", "correlation_id": "corr_..." } }
```

List responses add:

```json
{ "meta": { "pagination": { "limit": 50, "next_cursor": "opaque", "has_more": true } } }
```

Errors:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "...",
    "details": [],
    "request_id": "req_...",
    "correlation_id": "corr_..."
  }
}
```

### Standard HTTP Statuses

| Status | Meaning                                                                   |
| -----: | ------------------------------------------------------------------------- |
|  `200` | Read/update/action completed                                              |
|  `201` | Resource created                                                          |
|  `202` | Long-running job queued                                                   |
|  `204` | No-content action completed                                               |
|  `400` | Malformed request or invalid query combination                            |
|  `401` | Missing, invalid, expired, or revoked auth                                |
|  `403` | Permission, branch, subscription, plan, or support-access denial          |
|  `404` | Resource missing or invisible under scope                                 |
|  `409` | Version, duplicate, workflow, idempotency, inventory, or billing conflict |
|  `422` | Business validation failure                                               |
|  `423` | Lockout or temporary operation lock                                       |
|  `429` | Rate limit exceeded                                                       |
|  `500` | Unexpected server error                                                   |
|  `503` | Temporary dependency/maintenance outage                                   |

### Standard Error Codes

`unauthenticated`, `email_not_verified`, `forbidden`, `branch_access_denied`, `tenant_access_denied`, `subscription_access_blocked`, `plan_limit_exceeded`, `validation_failed`, `workflow_transition_blocked`, `resource_not_found`, `duplicate_resource`, `version_conflict`, `idempotency_conflict`, `inventory_insufficient_available_stock`, `inventory_reserved_below_on_hand`, `fifo_allocation_conflict`, `invoice_overpayment_blocked`, `refund_amount_exceeds_refundable`, `invoice_overbilling_blocked`, `rate_limited`, `background_job_failed`.

---

## 4. Auth, Tenant Context, and Authorization

### Rules

1. Tenant users belong to exactly one tenant.
2. Platform admins are not tenant employees.
3. Tenant APIs derive `tenant_id` from the authenticated session.
4. Tenant clients must not pass arbitrary `tenant_id` to change scope.
5. Platform tenant actions use `/api/v1/platform/tenants/{tenant_id}/...`.
6. Support access requires explicit audited support session context and must never silently impersonate tenant users.
7. Branch-scoped operations require tenant match, permission, and assigned branch or tenant-wide branch access.
8. Permission resolution is additive across active roles; no explicit deny permissions exist.

### Tenant Status Write Access

| Status             | API Access Rule                                                         |
| ------------------ | ----------------------------------------------------------------------- |
| `pending_setup`    | Setup/profile/subscription/password/logout only                         |
| `active`           | Full access by permission and branch scope                              |
| `grace_period`     | Full access with renewal warnings                                       |
| `read_only`        | Read/search/report/export/renewal/password/logout only; writes blocked  |
| `suspended`        | Owner renewal/export only; non-owner access blocked                     |
| `pending_deletion` | Operational access blocked; export only by emergency platform extension |
| `deleted`          | No tenant operational access                                            |

---

## 5. Pagination, Filtering, Search

High-volume lists support `limit` and `cursor`. Default `limit` is `50`; maximum `100`. Common filters: `branch_id`, `status`, `from_date`, `to_date`, `q`, and whitelisted `sort`.

Search must scope by tenant, enforce branch access for branch histories, exclude soft-deleted records by default, use normalized exact indexes for phone/email/SKU/barcode, and use full-text/trigram models where available.

---

## 6. Idempotency

Critical retryable writes require `Idempotency-Key`. Keys are scoped by tenant, user, endpoint, request-intent hash, and key hash.

| Repeat Case                         | Behavior                                                          |
| ----------------------------------- | ----------------------------------------------------------------- |
| Same key + same intent + succeeded  | Return original response with `Idempotency-Replayed: true`        |
| Same key + same intent + processing | Return `409 idempotency_conflict` or `202 processing` by endpoint |
| Same key + different intent         | Return `409 idempotency_conflict`                                 |
| Expired key                         | Treat as new only if retention expired and operation is safe      |

### Required Idempotency

| Operation                     | Endpoint Pattern                                                        |
| ----------------------------- | ----------------------------------------------------------------------- |
| Invoice issuance              | `POST /invoices/{id}/issue`                                             |
| Payment + receipt             | `POST /invoices/{id}/payments`                                          |
| Refund                        | `POST /payments/{id}/refunds`                                           |
| Invoice cancel/void           | `POST /invoices/{id}/cancel`, `/void`                                   |
| Job completion with inventory | `POST /job-orders/{id}/complete`                                        |
| Inventory reservation/release | Job-order part endpoints and release actions                            |
| Adjustment posting            | `POST /inventory-adjustments/{id}/post`                                 |
| Purchase receiving            | `POST /purchase-orders/{id}/receivings`                                 |
| Supplier return posting       | `POST /supplier-returns/{id}/post`                                      |
| Supplier payment              | `POST /suppliers/{id}/payments`                                         |
| Transfer stock transitions    | `POST /inventory-transfers/{id}/submit`, `/send`, `/receive`, `/cancel` |
| Tenant deletion               | Internal/background API                                                 |
| Export generation             | `POST /exports` recommended                                             |

---

## 7. Common Shapes

Mutable resources generally include `id`, `created_at`, `updated_at`, and `lock_version`. Append-only resources generally omit `updated_at` and `lock_version` unless workflow state requires them.

Money and quantity should be returned as strings such as `"1250.00"` and `"2.000"`. The backend may accept JSON numbers, but must validate precision and store fixed-precision decimals.

Historical records should use actor snapshots where useful and must not break display when a user is later deactivated.

---

## 8. Endpoint Catalog

### 8.1 Auth — `/api/v1/auth`

| Method | Path                          | Permission                    | Idempotency | Description                                                                   |
| ------ | ----------------------------- | ----------------------------- | ----------: | ----------------------------------------------------------------------------- |
| `POST` | `/signup-owner`               | Public                        | Recommended | Owner signup tenant flow; blocked if default plan/duration missing            |
| `POST` | `/login`                      | Public                        |          No | Login with rate limiting                                                      |
| `POST` | `/refresh`                    | Authenticated refresh session |          No | Rotate refresh token and return new access token                              |
| `POST` | `/logout`                     | Authenticated                 |          No | Logout current device                                                         |
| `POST` | `/logout-all`                 | Authenticated                 |          No | Revoke all sessions                                                           |
| `POST` | `/email-verification/resend`  | Authenticated/unverified      |          No | Resend verification email                                                     |
| `POST` | `/email-verification/confirm` | Public token                  |          No | Confirm email verification                                                    |
| `POST` | `/password/forgot`            | Public                        |          No | Request reset link                                                            |
| `POST` | `/password/reset`             | Public token                  |          No | Reset password                                                                |
| `POST` | `/password/change`            | Authenticated                 |          No | Change own password                                                           |
| `GET`  | `/session`                    | Authenticated                 |          No | Current user, tenant, permissions, branches, plan, subscription, access flags |

Session responses must include subscription warnings for `grace_period`, `read_only`, `suspended`, or near-expiration tenants.

### 8.2 Platform Admin — `/api/v1/platform`

All endpoints require `user_type = platform_admin` and platform permissions.

| Method  | Path                                           | Permission                             | Idempotency | Description                                     |
| ------- | ---------------------------------------------- | -------------------------------------- | ----------: | ----------------------------------------------- |
| `GET`   | `/tenants`                                     | `platform.tenants.read`                |          No | List tenants                                    |
| `POST`  | `/tenants`                                     | `platform.tenants.create`              |         Yes | Create platform-managed tenant                  |
| `GET`   | `/tenants/{tenant_id}`                         | `platform.tenants.read`                |          No | Tenant detail                                   |
| `PATCH` | `/tenants/{tenant_id}`                         | `platform.tenants.update`              |          No | Update tenant platform metadata                 |
| `POST`  | `/tenants/{tenant_id}/subscription`            | `platform.subscriptions.update`        |         Yes | Assign/update plan, expiration, status override |
| `POST`  | `/tenants/{tenant_id}/read-only`               | `platform.subscriptions.update`        |         Yes | Apply read-only override                        |
| `POST`  | `/tenants/{tenant_id}/suspend`                 | `platform.subscriptions.update`        |         Yes | Suspend tenant                                  |
| `POST`  | `/tenants/{tenant_id}/support-access-sessions` | `platform.support_access`              |         Yes | Start audited support access                    |
| `POST`  | `/support-access-sessions/{session_id}/end`    | `platform.support_access`              |         Yes | End support access                              |
| `POST`  | `/tenants/{tenant_id}/exports`                 | `platform.tenants.update`              |         Yes | Trigger tenant export                           |
| `POST`  | `/tenants/{tenant_id}/deletion-jobs`           | `platform.tenants.update`              |         Yes | Queue tenant deletion when eligible             |
| `GET`   | `/audit-logs`                                  | `platform.audit_logs.read`             |          No | Search platform audit logs                      |
| `GET`   | `/plans`                                       | `platform.plans.update` or read policy |          No | List plans and limits                           |
| `PATCH` | `/plans/{plan_id}`                             | `platform.plans.update`                |          No | Update configurable plan settings               |

Tenant creation requires business/shop email, plan, subscription dates, owner create/invite data, duplicate approval reason when needed, and audit entry. Support access requires mode, reason, expiry, audit, and visible support context.

### 8.3 Shop — `/api/v1/shop`

| Method  | Path                   | Permission                       | Idempotency | Description                             |
| ------- | ---------------------- | -------------------------------- | ----------: | --------------------------------------- |
| `GET`   | `/onboarding-state`    | Authenticated owner/setup access |          No | Onboarding requirements                 |
| `PUT`   | `/profile`             | `shop.update` or setup owner     |          No | Create/update shop profile              |
| `POST`  | `/complete-onboarding` | Shop Owner                       |         Yes | Complete onboarding                     |
| `GET`   | `/profile`             | `shop.read`                      |          No | Shop profile/settings                   |
| `PATCH` | `/settings`            | `settings.update`                |          No | Mutable tenant settings                 |
| `PATCH` | `/billing-settings`    | `shop.billing.update`            |          No | Billing settings where allowed          |
| `POST`  | `/renewal-request`     | Shop Owner                       |         Yes | Submit external-payment renewal request |

Profile validation: invoice prefix `^[A-Z0-9]{2,10}-$`; compatible tax profile/mode; country immutable after onboarding unless platform correction before records; currency immutable after first financial record.

### 8.4 Branches — `/api/v1/branches`

| Method  | Path                      | Permission            | Idempotency | Description                          |
| ------- | ------------------------- | --------------------- | ----------: | ------------------------------------ |
| `GET`   | `/`                       | `branches.read`       |          No | List branches                        |
| `POST`  | `/`                       | `branches.create`     |         Yes | Create branch within plan limit      |
| `GET`   | `/{branch_id}`            | `branches.read`       |          No | Branch detail                        |
| `PATCH` | `/{branch_id}`            | `branches.update`     |          No | Update branch                        |
| `POST`  | `/{branch_id}/deactivate` | `branches.deactivate` |         Yes | Deactivate after blocking checks     |
| `POST`  | `/{branch_id}/reactivate` | `branches.reactivate` |         Yes | Reactivate after plan-limit re-check |

### 8.5 Employees — `/api/v1/employees`

| Method  | Path                            | Permission             | Idempotency | Description                     |
| ------- | ------------------------------- | ---------------------- | ----------: | ------------------------------- |
| `GET`   | `/`                             | `users.read`           |          No | List employees                  |
| `POST`  | `/invitations`                  | `users.create`         |         Yes | Create employee invitation      |
| `POST`  | `/`                             | `users.create`         |         Yes | Direct employee creation        |
| `GET`   | `/{employee_id}`                | `users.read`           |          No | Employee profile                |
| `PATCH` | `/{employee_id}`                | `users.update`         |          No | Update profile, branches, roles |
| `POST`  | `/{employee_id}/deactivate`     | `users.deactivate`     |         Yes | Deactivate and revoke sessions  |
| `POST`  | `/{employee_id}/reactivate`     | `users.update`         |         Yes | Reactivate after checks         |
| `POST`  | `/{employee_id}/password-reset` | `users.reset_password` |         Yes | Send reset link                 |
| `GET`   | `/{employee_id}/activity`       | `users.read`           |          No | Employee activity/audit events  |

### 8.6 Roles — `/api/v1/roles`

| Method  | Path                    | Permission         | Idempotency | Description                  |
| ------- | ----------------------- | ------------------ | ----------: | ---------------------------- |
| `GET`   | `/`                     | `roles.read`       |          No | List roles                   |
| `POST`  | `/`                     | `roles.create`     |         Yes | Create custom role           |
| `GET`   | `/{role_id}`            | `roles.read`       |          No | Role detail                  |
| `PATCH` | `/{role_id}`            | `roles.update`     |          No | Update role name/permissions |
| `POST`  | `/{role_id}/deactivate` | `roles.deactivate` |         Yes | Deactivate if safe           |
| `GET`   | `/permissions`          | `permissions.read` |          No | Permission catalog           |

Role updates must not remove protected Shop Owner capabilities, must immediately affect assigned users, and must be audited.

### 8.7 Customers — `/api/v1/customers`

| Method  | Path                         | Permission              | Idempotency | Description                                     |
| ------- | ---------------------------- | ----------------------- | ----------: | ----------------------------------------------- |
| `GET`   | `/`                          | `customers.read`        |          No | Search/list active customers                    |
| `POST`  | `/`                          | `customers.create`      |         Yes | Create customer with duplicate warning behavior |
| `GET`   | `/{customer_id}`             | `customers.read`        |          No | Customer detail                                 |
| `PATCH` | `/{customer_id}`             | `customers.update`      |          No | Update customer                                 |
| `POST`  | `/{customer_id}/soft-delete` | `customers.soft_delete` |         Yes | Soft delete after checks                        |
| `POST`  | `/{customer_id}/restore`     | `customers.restore`     |         Yes | Restore with duplicate re-check                 |
| `POST`  | `/merge`                     | `customers.merge`       |         Yes | Merge duplicates                                |
| `GET`   | `/{customer_id}/history`     | `customers.read`        |          No | Profile plus branch-filtered history            |
| `GET`   | `/{customer_id}/motorcycles` | `motorcycles.read`      |          No | Customer motorcycles                            |

Duplicate warnings do not block creation unless an exact active duplicate violates tenant validation rules.

### 8.8 Motorcycles — `/api/v1/motorcycles`

| Method  | Path                                   | Permission                | Idempotency | Description                      |
| ------- | -------------------------------------- | ------------------------- | ----------: | -------------------------------- |
| `GET`   | `/`                                    | `motorcycles.read`        |          No | Search/list motorcycles          |
| `POST`  | `/`                                    | `motorcycles.create`      |         Yes | Create linked to active customer |
| `GET`   | `/{motorcycle_id}`                     | `motorcycles.read`        |          No | Motorcycle detail                |
| `PATCH` | `/{motorcycle_id}`                     | `motorcycles.update`      |          No | Update motorcycle/customer link  |
| `POST`  | `/{motorcycle_id}/soft-delete`         | `motorcycles.soft_delete` |         Yes | Soft delete after checks         |
| `POST`  | `/{motorcycle_id}/restore`             | `motorcycles.restore`     |         Yes | Restore when customer active     |
| `GET`   | `/{motorcycle_id}/service-history`     | `motorcycles.read`        |          No | Branch-filtered service history  |
| `POST`  | `/{motorcycle_id}/mileage-corrections` | `motorcycles.update`      |         Yes | Correct mileage with reason      |

### 8.9 Services — `/api/v1/services`

| Method  | Path                       | Permission            | Idempotency | Description                 |
| ------- | -------------------------- | --------------------- | ----------: | --------------------------- |
| `GET`   | `/`                        | `services.read`       |          No | List/search active services |
| `POST`  | `/`                        | `services.create`     |         Yes | Create service              |
| `GET`   | `/{service_id}`            | `services.read`       |          No | Service detail              |
| `PATCH` | `/{service_id}`            | `services.update`     |          No | Update service              |
| `POST`  | `/{service_id}/deactivate` | `services.deactivate` |         Yes | Deactivate if no open refs  |
| `POST`  | `/{service_id}/reactivate` | `services.update`     |         Yes | Reactivate if name unique   |

### 8.10 Estimates — `/api/v1/estimates`

| Method  | Path                           | Permission          | Idempotency | Description                                  |
| ------- | ------------------------------ | ------------------- | ----------: | -------------------------------------------- |
| `GET`   | `/`                            | `estimates.read`    |          No | List estimates                               |
| `POST`  | `/`                            | `estimates.create`  |         Yes | Create draft estimate and number             |
| `GET`   | `/{estimate_id}`               | `estimates.read`    |          No | Estimate detail                              |
| `PATCH` | `/{estimate_id}`               | `estimates.update`  |          No | Update draft estimate                        |
| `POST`  | `/{estimate_id}/present`       | `estimates.present` |         Yes | Draft to presented                           |
| `POST`  | `/{estimate_id}/approve`       | `estimates.approve` |         Yes | Record customer approval                     |
| `POST`  | `/{estimate_id}/convert`       | `estimates.convert` |         Yes | Convert approved estimate to job order lines |
| `POST`  | `/{estimate_id}/cancel`        | `estimates.cancel`  |         Yes | Cancel with reason                           |
| `GET`   | `/{estimate_id}/status-events` | `estimates.read`    |          No | Transition history                           |

Estimate numbers use `EST-YYYYMMDD-000001`. Estimates do not affect revenue, AR, inventory, reserved stock, FIFO, or financial reports.

### 8.11 Job Orders — `/api/v1/job-orders`

| Method   | Path                                 | Permission                                        | Idempotency | Description                                       |
| -------- | ------------------------------------ | ------------------------------------------------- | ----------: | ------------------------------------------------- |
| `GET`    | `/`                                  | `job_orders.read`                                 |          No | List job orders                                   |
| `POST`   | `/`                                  | `job_orders.create`                               |         Yes | Create job order and number                       |
| `GET`    | `/{job_order_id}`                    | `job_orders.read`                                 |          No | Job order detail                                  |
| `PATCH`  | `/{job_order_id}`                    | `job_orders.update`                               |          No | Edit before release/cancel under line rules       |
| `POST`   | `/{job_order_id}/service-lines`      | `job_orders.update`                               |         Yes | Add service/labor line                            |
| `PATCH`  | `/{job_order_id}/lines/{line_id}`    | `job_orders.update`                               |          No | Update editable line                              |
| `DELETE` | `/{job_order_id}/lines/{line_id}`    | `job_orders.update`                               |         Yes | Remove editable line; release reservation if part |
| `POST`   | `/{job_order_id}/part-lines`         | `inventory.reserve` or `job_orders.update`        |         Yes | Add part line and reserve inventory               |
| `POST`   | `/{job_order_id}/assign-mechanics`   | `job_orders.update`                               |          No | Assign mechanics                                  |
| `POST`   | `/{job_order_id}/status-transitions` | `job_orders.change_status` or specific permission |         Yes | Generic transition                                |
| `POST`   | `/{job_order_id}/complete`           | `job_orders.change_status`                        |         Yes | Complete and consume reserved inventory           |
| `POST`   | `/{job_order_id}/release`            | `job_orders.release`                              |         Yes | Release after checks                              |
| `POST`   | `/{job_order_id}/cancel`             | `job_orders.cancel`                               |         Yes | Cancel with reason and reservation release        |
| `POST`   | `/{job_order_id}/files`              | `job_orders.attach_files`                         |         Yes | Attach uploaded files                             |
| `GET`    | `/{job_order_id}/status-events`      | `job_orders.read`                                 |          No | Status history                                    |

Job order numbers use `JO-YYYYMMDD-000001`. Part lines create active reservations and FIFO allocations. Completion must atomically lock job order, reservations, stock balances, FIFO layers/allocations; consume reserved parts; create ledger entries; update status/history; audit action.

### 8.12 Mechanic Sessions — `/api/v1/mechanic-sessions`

| Method | Path                   | Permission                 | Idempotency | Description                   |
| ------ | ---------------------- | -------------------------- | ----------: | ----------------------------- |
| `GET`  | `/`                    | `mechanic_sessions.read`   |          No | List work sessions            |
| `POST` | `/`                    | `mechanic_sessions.create` |         Yes | Start session                 |
| `POST` | `/{session_id}/pause`  | `mechanic_sessions.pause`  |         Yes | Pause active session          |
| `POST` | `/{session_id}/resume` | `mechanic_sessions.resume` |         Yes | Resume paused session         |
| `POST` | `/{session_id}/finish` | `mechanic_sessions.finish` |         Yes | Finish and calculate duration |

Mechanic must be assigned unless authorized manager override exists. A mechanic must not have another unfinished session in the tenant.

### 8.13 Product Categories — `/api/v1/product-categories`

| Method  | Path                        | Permission                  | Idempotency | Description                      |
| ------- | --------------------------- | --------------------------- | ----------: | -------------------------------- |
| `GET`   | `/`                         | `products.read`             |          No | List categories                  |
| `POST`  | `/`                         | `product_categories.manage` |         Yes | Create category                  |
| `PATCH` | `/{category_id}`            | `product_categories.manage` |          No | Update category                  |
| `POST`  | `/{category_id}/deactivate` | `product_categories.manage` |         Yes | Deactivate if no active products |
| `POST`  | `/{category_id}/reactivate` | `product_categories.manage` |         Yes | Reactivate if name unique        |

### 8.14 Products — `/api/v1/products`

| Method  | Path                        | Permission            | Idempotency | Description                                   |
| ------- | --------------------------- | --------------------- | ----------: | --------------------------------------------- |
| `GET`   | `/`                         | `products.read`       |          No | Search/list products                          |
| `POST`  | `/`                         | `products.create`     |         Yes | Create product                                |
| `GET`   | `/{product_id}`             | `products.read`       |          No | Product detail                                |
| `PATCH` | `/{product_id}`             | `products.update`     |          No | Update product                                |
| `POST`  | `/{product_id}/deactivate`  | `products.deactivate` |         Yes | Deactivate if no stock/reservations/open refs |
| `POST`  | `/{product_id}/reactivate`  | `products.update`     |         Yes | Reactivate if SKU/barcode unique              |
| `GET`   | `/{product_id}/stock`       | `inventory.read`      |          No | Stock by accessible branch                    |
| `GET`   | `/{product_id}/fifo-layers` | `inventory.read`      |          No | FIFO layers by branch access                  |

### 8.15 Inventory Core — `/api/v1/inventory`

| Method | Path                | Permission       | Idempotency | Description                      |
| ------ | ------------------- | ---------------- | ----------: | -------------------------------- |
| `GET`  | `/stock-balances`   | `inventory.read` |          No | Stock balances by branch/product |
| `GET`  | `/ledger`           | `inventory.read` |          No | Immutable movement history       |
| `GET`  | `/fifo-layers`      | `inventory.read` |          No | FIFO layer report source         |
| `GET`  | `/low-stock-alerts` | `inventory.read` |          No | Low stock alerts                 |

### 8.16 Inventory Adjustments — `/api/v1/inventory-adjustments`

| Method  | Path                       | Permission                                       | Idempotency | Description                                 |
| ------- | -------------------------- | ------------------------------------------------ | ----------: | ------------------------------------------- |
| `GET`   | `/`                        | `inventory.read`                                 |          No | List adjustments                            |
| `POST`  | `/`                        | `inventory.adjust`                               |         Yes | Create draft adjustment                     |
| `GET`   | `/{adjustment_id}`         | `inventory.read`                                 |          No | Adjustment detail                           |
| `PATCH` | `/{adjustment_id}`         | `inventory.adjust`                               |          No | Update draft adjustment                     |
| `POST`  | `/{adjustment_id}/submit`  | `inventory.adjust`                               |         Yes | Submit or auto-post below threshold         |
| `POST`  | `/{adjustment_id}/approve` | `inventory.adjust.approve`                       |         Yes | Approve pending adjustment                  |
| `POST`  | `/{adjustment_id}/reject`  | `inventory.adjust.approve`                       |         Yes | Reject with reason                          |
| `POST`  | `/{adjustment_id}/cancel`  | `inventory.adjust`                               |         Yes | Cancel draft/pending                        |
| `POST`  | `/{adjustment_id}/post`    | `inventory.adjust` or `inventory.adjust.approve` |         Yes | Post approved adjustment and ledger entries |
| `POST`  | `/force`                   | `inventory.force_adjust`                         |         Yes | Exceptional corrective adjustment           |

### 8.17 Inventory Transfers — `/api/v1/inventory-transfers`

| Method  | Path                           | Permission                   | Idempotency | Description                              |
| ------- | ------------------------------ | ---------------------------- | ----------: | ---------------------------------------- |
| `GET`   | `/`                            | `inventory.read`             |          No | List transfers                           |
| `POST`  | `/`                            | `inventory.transfer.create`  |         Yes | Create draft transfer and number         |
| `GET`   | `/{transfer_id}`               | `inventory.read`             |          No | Transfer detail                          |
| `PATCH` | `/{transfer_id}`               | `inventory.transfer.create`  |          No | Update draft transfer                    |
| `POST`  | `/{transfer_id}/submit`        | `inventory.transfer.create`  |         Yes | Reserve source stock                     |
| `POST`  | `/{transfer_id}/send`          | `inventory.transfer.send`    |         Yes | Move to in transit                       |
| `POST`  | `/{transfer_id}/receive`       | `inventory.transfer.receive` |         Yes | Receive, move FIFO cost, record variance |
| `POST`  | `/{transfer_id}/cancel`        | `inventory.transfer.cancel`  |         Yes | Cancel with disposition rules            |
| `GET`   | `/{transfer_id}/status-events` | `inventory.read`             |          No | Transition history                       |

Transfer numbers use `TR-YYYYMMDD-000001`.

### 8.18 Suppliers — `/api/v1/suppliers`

| Method  | Path                        | Permission                            | Idempotency | Description                        |
| ------- | --------------------------- | ------------------------------------- | ----------: | ---------------------------------- |
| `GET`   | `/`                         | `suppliers.read`                      |          No | List/search suppliers              |
| `POST`  | `/`                         | `suppliers.create`                    |         Yes | Create supplier                    |
| `GET`   | `/{supplier_id}`            | `suppliers.read`                      |          No | Supplier detail                    |
| `PATCH` | `/{supplier_id}`            | `suppliers.update`                    |          No | Update supplier                    |
| `POST`  | `/{supplier_id}/deactivate` | `suppliers.deactivate`                |         Yes | Deactivate if no open PO/unpaid AP |
| `POST`  | `/{supplier_id}/reactivate` | `suppliers.update`                    |         Yes | Reactivate with unique active name |
| `GET`   | `/{supplier_id}/balance`    | `supplier_payments.read` or AP report |          No | Supplier payable balance           |
| `GET`   | `/{supplier_id}/history`    | `suppliers.read`                      |          No | Purchase/payment/return history    |
| `POST`  | `/{supplier_id}/payments`   | `supplier_payments.create`            |         Yes | Record manual supplier payment     |
| `POST`  | `/{supplier_id}/credits`    | `supplier_credits.create`             |         Yes | Create supplier credit adjustment  |

### 8.19 Purchase Orders — `/api/v1/purchase-orders`

| Method  | Path                              | Permission          | Idempotency | Description                           |
| ------- | --------------------------------- | ------------------- | ----------: | ------------------------------------- |
| `GET`   | `/`                               | `purchases.read`    |          No | List purchase orders                  |
| `POST`  | `/`                               | `purchases.create`  |         Yes | Create draft PO and number            |
| `GET`   | `/{purchase_order_id}`            | `purchases.read`    |          No | PO detail                             |
| `PATCH` | `/{purchase_order_id}`            | `purchases.update`  |          No | Update draft/eligible PO              |
| `POST`  | `/{purchase_order_id}/order`      | `purchases.update`  |         Yes | Move draft to ordered                 |
| `POST`  | `/{purchase_order_id}/receivings` | `purchases.receive` |         Yes | Receive stock and FIFO layers         |
| `POST`  | `/{purchase_order_id}/close`      | `purchases.update`  |         Yes | Close after receiving/AP confirmation |
| `POST`  | `/{purchase_order_id}/cancel`     | `purchases.cancel`  |         Yes | Cancel if no stock received           |

PO numbers use `PO-YYYYMMDD-000001`. Receiving creates FIFO layers, inventory ledger entries, and AP effects for credit purchases; cash purchases include payment method/reference.

### 8.20 Supplier Returns — `/api/v1/supplier-returns`

| Method  | Path                           | Permission                | Idempotency | Description                                        |
| ------- | ------------------------------ | ------------------------- | ----------: | -------------------------------------------------- |
| `GET`   | `/`                            | `supplier_returns.read`   |          No | List returns                                       |
| `POST`  | `/`                            | `supplier_returns.create` |         Yes | Create draft return                                |
| `GET`   | `/{supplier_return_id}`        | `supplier_returns.read`   |          No | Return detail                                      |
| `PATCH` | `/{supplier_return_id}`        | `supplier_returns.create` |          No | Update draft return                                |
| `POST`  | `/{supplier_return_id}/post`   | `supplier_returns.create` |         Yes | Post, consume FIFO, reduce stock, AP/credit effect |
| `POST`  | `/{supplier_return_id}/cancel` | `supplier_returns.create` |         Yes | Cancel draft return                                |

Returned quantity must not exceed available unreserved stock. FIFO prefers original receiving layers when traceable. Credit purchases reduce AP first; excess creates supplier credit. Cash/fully paid credit purchases create supplier credit unless immediate supplier cash refund is recorded.

### 8.21 Invoices — `/api/v1/invoices`

| Method  | Path                          | Permission              | Idempotency | Description                                      |
| ------- | ----------------------------- | ----------------------- | ----------: | ------------------------------------------------ |
| `GET`   | `/`                           | `invoices.read`         |          No | List invoices                                    |
| `POST`  | `/`                           | `invoices.create`       |         Yes | Create draft invoice from one or more job orders |
| `GET`   | `/{invoice_id}`               | `invoices.read`         |          No | Invoice detail                                   |
| `PATCH` | `/{invoice_id}`               | `invoices.update_draft` |          No | Edit draft only                                  |
| `POST`  | `/{invoice_id}/issue`         | `invoices.issue`        |         Yes | Issue invoice and finalize allocations           |
| `POST`  | `/{invoice_id}/cancel`        | `invoices.cancel`       |         Yes | Cancel draft/pending zero-payment invoice        |
| `POST`  | `/{invoice_id}/void`          | `invoices.void`         |         Yes | Void issued invoice after required refunds       |
| `GET`   | `/{invoice_id}/status-events` | `invoices.read`         |          No | Status history                                   |
| `GET`   | `/{invoice_id}/print`         | `invoices.read`         |          No | Printable document metadata/signed URL           |

Invoices must link to at least one job order before issuance. Job orders must match tenant, customer, branch, and allowed status. Billing allocations must prevent concurrent overbilling. Invoice-level discounts are allocated before tax calculation.

### 8.22 Payments — `/api/v1/invoices/{invoice_id}/payments`

| Method | Path | Permission        | Idempotency | Description                          |
| ------ | ---- | ----------------- | ----------: | ------------------------------------ |
| `GET`  | `/`  | `payments.read`   |          No | List invoice payments                |
| `POST` | `/`  | `payments.create` |         Yes | Record payment and immutable receipt |

Payment amount must be positive and must not exceed remaining collectible balance. Draft, cancelled, voided, and refunded invoices cannot receive payments. Each payment creates exactly one receipt.

### 8.23 Receipts — `/api/v1/receipts`

| Method | Path                  | Permission      | Idempotency | Description                   |
| ------ | --------------------- | --------------- | ----------: | ----------------------------- |
| `GET`  | `/`                   | `receipts.read` |          No | List receipts                 |
| `GET`  | `/{receipt_id}`       | `receipts.read` |          No | Immutable receipt             |
| `GET`  | `/{receipt_id}/print` | `receipts.read` |          No | Printable metadata/signed URL |

Receipts must not expose update or delete endpoints.

### 8.24 Refunds — `/api/v1/payments/{payment_id}/refunds`

| Method | Path | Permission                             | Idempotency | Description                |
| ------ | ---- | -------------------------------------- | ----------: | -------------------------- |
| `GET`  | `/`  | `payments.read`                        |          No | List payment refunds       |
| `POST` | `/`  | `payments.refund` or `invoices.refund` |         Yes | Record partial/full refund |

Refund cannot exceed refundable amount. Money refund does not automatically restore inventory. Inventory reversal requires explicit selection and `inventory.adjust` or `inventory.force_adjust`. `refunded` invoice status applies only when fully refunded and explicitly closed with no further collection expected.

### 8.25 Accounts — `/api/v1/accounts`

| Method | Path                  | Permission                                    | Description         |
| ------ | --------------------- | --------------------------------------------- | ------------------- |
| `GET`  | `/receivable`         | `invoices.read` or report permission          | AR list             |
| `GET`  | `/receivable/summary` | `reports.view_basic`                          | AR totals and aging |
| `GET`  | `/payable`            | `supplier_payments.read` or report permission | AP list             |
| `GET`  | `/payable/summary`    | `reports.view_basic`                          | AP totals           |

### 8.26 Expenses — `/api/v1/expenses`

| Method  | Path                 | Permission        | Idempotency | Description                                                  |
| ------- | -------------------- | ----------------- | ----------: | ------------------------------------------------------------ |
| `GET`   | `/`                  | `expenses.read`   |          No | List expenses                                                |
| `POST`  | `/`                  | `expenses.create` |         Yes | Record expense                                               |
| `GET`   | `/{expense_id}`      | `expenses.read`   |          No | Expense detail                                               |
| `PATCH` | `/{expense_id}`      | `expenses.update` |          No | Edit active expense with reason for report-affecting changes |
| `POST`  | `/{expense_id}/void` | `expenses.void`   |         Yes | Void with reason                                             |

### 8.27 Expense Categories — `/api/v1/expense-categories`

| Method  | Path                        | Permission                  | Idempotency | Description         |
| ------- | --------------------------- | --------------------------- | ----------: | ------------------- |
| `GET`   | `/`                         | `expenses.read`             |          No | List categories     |
| `POST`  | `/`                         | `expense_categories.manage` |         Yes | Create category     |
| `PATCH` | `/{category_id}`            | `expense_categories.manage` |          No | Update category     |
| `POST`  | `/{category_id}/deactivate` | `expense_categories.manage` |         Yes | Deactivate category |
| `POST`  | `/{category_id}/reactivate` | `expense_categories.manage` |         Yes | Reactivate category |

### 8.28 Reminders — `/api/v1/reminders`

| Method  | Path                        | Permission         | Idempotency | Description                    |
| ------- | --------------------------- | ------------------ | ----------: | ------------------------------ |
| `GET`   | `/`                         | `reminders.read`   |          No | List reminders                 |
| `POST`  | `/`                         | `reminders.create` |         Yes | Create reminder                |
| `GET`   | `/{reminder_id}`            | `reminders.read`   |          No | Reminder detail                |
| `PATCH` | `/{reminder_id}`            | `reminders.update` |          No | Update scheduled reminder      |
| `POST`  | `/{reminder_id}/cancel`     | `reminders.cancel` |         Yes | Cancel reminder                |
| `POST`  | `/{reminder_id}/send`       | `reminders.send`   |         Yes | Manually trigger eligible send |
| `GET`   | `/{reminder_id}/deliveries` | `reminders.read`   |          No | Delivery statuses              |

Plan enforcement: Basic blocks customer email/SMS; Mid allows email and blocks SMS; High allows email/SMS. The system must not silently switch blocked channels.

### 8.29 Notifications — `/api/v1/notifications`

| Method | Path                         | Permission                         | Description                         |
| ------ | ---------------------------- | ---------------------------------- | ----------------------------------- |
| `GET`  | `/`                          | `notifications.read`               | Current user's notifications        |
| `POST` | `/{notification_id}/read`    | `notifications.read`               | Mark read                           |
| `POST` | `/{notification_id}/dismiss` | `notifications.read`               | Dismiss                             |
| `GET`  | `/preferences`               | `notifications.read`               | Get preferences                     |
| `PUT`  | `/preferences`               | `notifications.update_preferences` | Update preferences with plan checks |

### 8.30 Files — `/api/v1/files`

| Method | Path                      | Permission          | Idempotency | Description                          |
| ------ | ------------------------- | ------------------- | ----------: | ------------------------------------ |
| `POST` | `/upload-intents`         | `files.upload`      |         Yes | Create tenant-scoped upload intent   |
| `POST` | `/complete-upload`        | `files.upload`      |         Yes | Register uploaded file               |
| `GET`  | `/{file_id}`              | `files.read`        |          No | Metadata if linked entity accessible |
| `GET`  | `/{file_id}/download-url` | `files.read`        |          No | Time-limited signed URL              |
| `POST` | `/{file_id}/soft-delete`  | `files.soft_delete` |         Yes | Soft delete                          |
| `POST` | `/{file_id}/restore`      | `files.restore`     |         Yes | Restore within retention             |
| `POST` | `/{file_id}/links`        | `files.upload`      |         Yes | Link file to supported entity        |

Images: JPG/JPEG/PNG/WEBP up to 5 MB. Documents: PDF/DOCX/XLSX up to 20 MB. Permanent public URLs are forbidden. File access follows linked entity access.

### 8.31 Dashboard — `/api/v1/dashboard`

| Method | Path                | Permission           | Description                                       |
| ------ | ------------------- | -------------------- | ------------------------------------------------- |
| `GET`  | `/summary`          | `reports.view_basic` | Sales, revenue, jobs, AR/AP, low stock, transfers |
| `GET`  | `/charts/revenue`   | `reports.view_basic` | Revenue chart by date range/branch                |
| `GET`  | `/inventory-alerts` | `inventory.read`     | Low stock data                                    |

### 8.32 Reports — `/api/v1/reports`

| Method | Path                      | Permission              | Description                                   |
| ------ | ------------------------- | ----------------------- | --------------------------------------------- |
| `GET`  | `/sales`                  | `reports.view_basic`    | Sales/payment method reports                  |
| `GET`  | `/services`               | `reports.view_basic`    | Service reports                               |
| `GET`  | `/inventory`              | `reports.view_basic`    | Inventory reports                             |
| `GET`  | `/customers`              | `reports.view_basic`    | Customer reports                              |
| `GET`  | `/financial`              | `reports.view_basic`    | Revenue, expenses, gross profit, COGS, AR, AP |
| `GET`  | `/branch-comparison`      | `reports.view_branch`   | Branch comparison                             |
| `GET`  | `/advanced/{report_code}` | `reports.view_advanced` | Advanced operational reports                  |
| `POST` | `/exports`                | `reports.export`        | Queue PDF/Excel/CSV export                    |

Common query params: `branch_id`, `from_date`, `to_date`, `group_by`, `format=json`. Large exports return `202` with job ID.

### 8.33 Tenant Exports — `/api/v1/exports`

| Method | Path                            | Permission         | Idempotency | Description              |
| ------ | ------------------------------- | ------------------ | ----------: | ------------------------ |
| `GET`  | `/`                             | `shop.export_data` |          No | List export jobs         |
| `POST` | `/`                             | `shop.export_data` |         Yes | Queue full tenant export |
| `GET`  | `/{export_job_id}`              | `shop.export_data` |          No | Export job status        |
| `GET`  | `/{export_job_id}/download-url` | `shop.export_data` |          No | Signed URL when complete |

Export output: ZIP, CSV tabular data, relationship-preserving JSON, attachment manifest, audit log export, README, optional `/attachments`, and 7-day expiring download links.

### 8.34 Audit Logs — `/api/v1/audit-logs`

| Method | Path              | Permission        | Description                      |
| ------ | ----------------- | ----------------- | -------------------------------- |
| `GET`  | `/`               | `audit_logs.read` | Search tenant-visible audit logs |
| `GET`  | `/{audit_log_id}` | `audit_logs.read` | Audit detail                     |

Audit logs must not expose passwords, tokens, full card data, or unnecessary sensitive free text.

### 8.35 Background Jobs — `/api/v1/background-jobs`

| Method | Path                 | Permission            | Description                          |
| ------ | -------------------- | --------------------- | ------------------------------------ |
| `GET`  | `/{job_id}`          | Context-specific      | Job status                           |
| `GET`  | `/{job_id}/attempts` | Platform/support only | Retry attempts with sanitized errors |
| `POST` | `/{job_id}/cancel`   | Context-specific      | Cancel if cancellable                |

Tenant users can view only tenant-visible authorized jobs. Platform admins can view platform jobs.

### 8.36 Offline Cache — `/api/v1/offline-cache`

| Method   | Path              | Permission    | Description                                       |
| -------- | ----------------- | ------------- | ------------------------------------------------- |
| `GET`    | `/manifest`       | Authenticated | Current user's cache manifest                     |
| `GET`    | `/recent-records` | Authenticated | Minimal read-only cache payload                   |
| `DELETE` | `/current-user`   | Authenticated | Clear current user's server-side manifest if used |

Offline cache may include recent customers, motorcycles, job orders, and invoices. The API must not support offline create/edit/delete/approve/submit/payment/upload/sync.

---

## 9. Workflow Transitions

Generic transition request includes `to_status`, `reason`, and optional `metadata`. Generic transition response returns the updated resource and a status event.

| Resource             | Controlled Statuses                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| Tenant               | `pending_setup`, `active`, `grace_period`, `read_only`, `suspended`, `pending_deletion`, `deleted` |
| Branch               | `active`, `inactive`                                                                               |
| Employee             | `active`, `inactive`                                                                               |
| Customer             | `active`, `merged`, `soft_deleted`                                                                 |
| Motorcycle           | `active`, `soft_deleted`                                                                           |
| Service              | `active`, `inactive`                                                                               |
| Estimate             | `draft`, `presented`, `approved`, `converted`, `cancelled`, `expired`                              |
| Job Order            | `pending`, `in_progress`, `waiting_for_parts`, `completed`, `released`, `cancelled`                |
| Inventory Adjustment | `draft`, `pending_approval`, `approved`, `posted`, `rejected`, `cancelled`                         |
| Inventory Transfer   | `draft`, `pending`, `in_transit`, `received`, `cancelled`                                          |
| Purchase Order       | `draft`, `ordered`, `partially_received`, `received`, `closed`, `cancelled`                        |
| Supplier Return      | `draft`, `posted`, `cancelled`                                                                     |
| Invoice              | `draft`, `pending`, `partially_paid`, `paid`, `overdue`, `cancelled`, `voided`, `refunded`         |
| Expense              | `active`, `voided`                                                                                 |
| Reminder             | `scheduled`, `due`, `sent`, `failed`, `cancelled`                                                  |
| File                 | `active`, `soft_deleted`, `retained`, `quarantined`, `deleted`                                     |

---

## 10. Integration Boundary

GarageOS does not require public inbound customer-payment webhooks because automatic payment-gateway charging is excluded. Provider callbacks may exist only for infrastructure integrations such as email/SMS/storage delivery events and must be provider-authenticated internal endpoints.

Suggested namespace:

```text
POST /api/v1/integrations/email-provider/events
POST /api/v1/integrations/sms-provider/events
POST /api/v1/integrations/storage-provider/events
```

Rules: verify provider signatures, store sanitized events, map delivery status to reminder/notification status, never expose provider secrets, and do not retry permanent failures automatically.

---

## 11. Security, Rate Limits, Observability

### Middleware Order

1. Request/correlation ID
2. HTTPS enforcement at edge/proxy
3. Rate limiting
4. Authentication
5. Email verification
6. Tenant status/subscription guard
7. Platform/support guard
8. Permission guard
9. Branch guard
10. Request validation
11. Idempotency guard
12. Service transaction
13. Audit/outbox/logging
14. Response envelope

### Sensitive Data Never Returned or Logged

Plaintext passwords, reset tokens, verification tokens, access/refresh tokens in logs, full card data/CVV/magnetic-stripe equivalents, and quarantined file binaries.

### Rate Limits

| Category                    | Limit                                              |
| --------------------------- | -------------------------------------------------- |
| Login                       | 5 failed attempts / 15 min / account+IP            |
| Password reset              | 3 requests / account / hour                        |
| Email verification resend   | 5 requests / account / hour                        |
| File uploads                | 30 uploads / user / minute                         |
| Public unauthenticated APIs | 60 requests / IP / minute                          |
| Reminder sending            | 500 customer messages / tenant / day unless raised |
| Export generation           | 5 export requests / tenant / day                   |

Rate-limit responses use `429 rate_limited` with safe retry metadata when appropriate.

### Observability

Every request log must include request ID, correlation ID, method, path template, status, duration, tenant/branch context where safe, actor, required permission, and error code. Sensitive bodies must not be logged.

Metrics must cover latency percentiles, error rate, authorization failures, auth failures, rate limits, background job failures, inventory failures, export status, and reminder delivery status.

---

## 12. OpenAPI and Contract Drift

When converting to OpenAPI:

1. Use reusable components for envelopes, errors, pagination, audit metadata, actors, money, quantity, and workflow events.
2. Generate DTOs from schema-aligned contracts.
3. Use schema enum values exactly.
4. Require idempotency headers on critical writes.
5. Mark auth requirements per endpoint.
6. Document `403` variants for permission, branch, plan, and subscription failures.
7. Include examples for representative success and blocked transitions.
8. Include `409` examples for optimistic lock and idempotency conflicts.
9. Avoid database-only fields not needed by clients.
10. Keep platform endpoints separate from tenant endpoints.

---

## 13. Acceptance Criteria

Automated tests must prove:

| Area                          | Required Proof                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant/branch isolation       | No cross-tenant access; branch users blocked outside assigned branches; files follow linked entity access                                       |
| Subscription/plan enforcement | `pending_setup`, `read_only`, `suspended`, plan channels, branch limits, and renewal rules block correctly                                      |
| Workflow safety               | Explicit endpoints, blocked transitions, immutable/final resource rules, required reasons                                                       |
| Financial integrity           | Unique invoice/receipt numbers, no overbilling, no overpayment, immutable receipts, refund/void rules                                           |
| Inventory integrity           | Reservation/FIFO allocation, atomic completion consumption, adjustment posting, transfer FIFO, supplier return rules, no invalid negative stock |
| Idempotency/concurrency       | Retries avoid duplicate side effects; reused mismatched keys conflict; concurrent numbering/FIFO/payment/refund safe; stale versions conflict   |
| Observability/audit           | Critical actions audited, audit immutable/sanitized, responses include metadata, jobs expose safe status, provider failures recorded            |

---

## 14. Remaining Engineering Decisions

These are implementation decisions, not product ambiguity:

1. Manual OpenAPI maintenance vs generated OpenAPI from routes/DTOs.
2. Direct signed upload vs backend proxy upload; direct signed upload is recommended.
3. Keep `snake_case` directly or map to frontend `camelCase`; API contract recommends `snake_case`.
4. Exact access/refresh-token transport mechanics.
5. Exact opaque cursor encoding.
6. `If-Match` raw `lock_version` vs ETag wrapper.
7. Report export job access through `/background-jobs/{id}` or report-specific job endpoints.
8. Provider event endpoints inside app vs separate worker/ingestion service.

---

## 15. Recommended Implementation Order

1. API foundation: envelopes, errors, request IDs, auth, tenant, permission, branch guards.
2. Auth/session and onboarding APIs.
3. Platform admin tenant/plan/subscription APIs.
4. Branch, employee, role, permission APIs.
5. Customer and motorcycle APIs.
6. Services, estimates, job orders, mechanic sessions.
7. Product, inventory, reservation, adjustment, transfer APIs.
8. Supplier, purchase, receiving, supplier return, AP APIs.
9. Invoice, billing allocation, payment, receipt, refund, AR APIs.
10. Expenses.
11. Reminders, notifications, delivery integrations.
12. Files.
13. Dashboard, reports, report exports.
14. Tenant exports.
15. Audit logs, background jobs, offline cache.
16. Full OpenAPI generation and contract tests.

---

## 16. Contract Test Strategy

Each endpoint must test auth, permission, tenant isolation, branch access where applicable, subscription blocking, validation, response envelope, error envelope, audit creation where required, idempotency where required, optimistic locking where required, and rollback on simulated partial failure.

Critical workflow endpoints must also have concurrency tests.

---

## 17. Final Recommendation

Implement GarageOS as a strict REST API with explicit workflow actions, shared middleware guards, schema-aligned enums, required idempotency for critical writes, cursor pagination, and contract tests. This preserves tenant isolation, branch authorization, subscription enforcement, FIFO inventory integrity, immutable financial records, and auditable operations while keeping the documentation compact for AI-assisted work.
