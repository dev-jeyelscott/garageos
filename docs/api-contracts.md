# GarageOS API Contracts

**Document:** `api-contracts.md`  
**Project:** GarageOS — Motorcycle Shop Management System SaaS  
**Generated:** 2026-06-24  
**Status:** Build-ready API contract specification  
**API Style:** REST over HTTPS, JSON, resource-oriented with explicit workflow action endpoints  
**Source Documents:** `requirements.md`, `database-design.md`, `database-schema.md`

---

## 1. Purpose

This document defines the initial production API contract for GarageOS. It translates the product requirements, database design, and PostgreSQL schema into REST endpoints, request/response conventions, validation rules, workflow actions, idempotency requirements, authorization boundaries, and error semantics.

This document is intended for frontend engineers, backend engineers, QA engineers, API testers, DevOps engineers, and future documentation/OpenAPI generation work.

This is not an OpenAPI YAML file yet. It is the canonical human-readable contract blueprint from which OpenAPI specs, DTOs, route handlers, service tests, integration tests, and SDK types should be produced.

---

## 2. Panel Review Summary

### 2.1 Product Owner / Business Stakeholder

The API must support the full single-scope GarageOS product, including multi-tenant SaaS lifecycle, subscription enforcement, service operations, inventory, invoicing, payments, reminders, reports, exports, and auditability. It must not expose excluded future capabilities such as native apps, customer portals, standalone POS checkout, payroll, general ledger accounting, direct tax filing, automatic subscription payment collection, or 2FA.

### 2.2 Product Manager / Business Analyst

The API must expose workflow-safe endpoints that mirror product states and transition rules. State-changing operations must be explicit and must return clear validation errors when blocked by subscription status, permissions, branch access, inventory constraints, billing allocation constraints, or immutable financial rules.

### 2.3 Senior Database Architect

The API must preserve database invariants: strict `tenant_id` isolation, branch scoping, append-only ledger and audit records, document number uniqueness, FIFO costing, immutable receipts, and correction-only financial workflows. API contracts must align with canonical table boundaries and enum values.

### 2.4 Senior Backend Engineer / Tech Lead

The API should be boring, predictable, and maintainable: `/api/v1`, consistent envelopes, consistent pagination, explicit action endpoints for workflows, shared validation, shared authorization middleware, idempotency for client-retryable critical writes, optimistic locking for mutable records, and centralized error handling.

### 2.5 Performance & Scalability Engineer

List endpoints must be paginated, filterable by tenant-derived context and branch where applicable, and designed for indexed query paths. Large exports and reports must be asynchronous. Search endpoints must use normalized exact indexes plus full-text/trigram search where available.

### 2.6 Security & Compliance Reviewer

The API must never trust client-supplied tenant ownership. Tenant context comes from the authenticated session except for audited platform-admin/support workflows. Sensitive tokens, passwords, card details, and provider secrets must never be returned, logged, exported, or stored in audit payloads.

### 2.7 DevOps / Operations Engineer

All API responses must include correlation identifiers. Background-job-backed APIs must return job resources that expose status, attempts, timestamps, and error summaries without leaking sensitive payloads. Integration failures must be observable and retry-safe.

### 2.8 QA / Data Integrity Engineer

The API must be testable through deterministic status codes, machine-readable error codes, stable enum values, and clear acceptance criteria per workflow. Each endpoint must be traceable to permission checks, branch checks, subscription checks, idempotency rules, and audit requirements.

---

## 3. API Design Decisions

| Area                   | Decision                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| API base path          | `/api/v1`                                                                                                         |
| Transport              | HTTPS only in production                                                                                          |
| Format                 | JSON request/response bodies, except binary file download/upload flows                                            |
| JSON field style       | `snake_case` to align with schema columns, enum values, exports, and validation rules                             |
| Enum values            | Lowercase API-safe values exactly matching the schema catalog                                                     |
| Authentication         | Bearer access token with refresh-token rotation                                                                   |
| Tenant context         | Derived from authenticated user/session; tenant clients must not pass arbitrary `tenant_id` for tenant operations |
| Platform admin context | Platform endpoints use `/platform/*`; tenant support access requires explicit support session context             |
| Idempotency            | Required for client-retryable critical write operations                                                           |
| Pagination             | Cursor pagination by default for high-volume lists; offset pagination only for low-volume configuration lists     |
| Workflow transitions   | Explicit action endpoints rather than arbitrary status patching                                                   |
| Monetary values        | Decimal strings or JSON numbers with exactly 2 decimal places; server stores fixed precision                      |
| Quantities             | Decimal strings or JSON numbers with up to 3 decimal places                                                       |
| Date/time              | `timestamptz` serialized as RFC 3339 UTC strings; business dates as `YYYY-MM-DD` interpreted by tenant timezone   |
| Optimistic locking     | Mutable updates accept `lock_version`; stale updates return `409 conflict`                                        |
| Auditability           | Critical and corrective actions require reason fields where required by PRD                                       |

### 3.1 Explicit Non-Goals

The API must not expose endpoints for:

- Native mobile-only APIs separate from the PWA API.
- Offline transaction sync or offline conflict resolution.
- Customer portal login or customer self-service APIs.
- Standalone retail POS/cart checkout unrelated to job orders.
- Payroll, commissions, payslips, or government payroll contributions.
- General ledger, journal entries, bank reconciliation, or formal accounting close.
- Direct BIR filing.
- Payment-gateway charging or automatic subscription payment collection.
- Two-factor authentication.

---

## 4. Global API Conventions

## 4.1 Base URL

```text
https://{app-domain}/api/v1
```

Example tenant-user route:

```text
GET /api/v1/customers
```

Example platform-admin route:

```text
GET /api/v1/platform/tenants
```

## 4.2 Required Headers

| Header                                 |                      Required | Applies To                           | Description                                                |
| -------------------------------------- | ----------------------------: | ------------------------------------ | ---------------------------------------------------------- |
| `Authorization: Bearer <access_token>` | Yes, except public auth flows | Authenticated APIs                   | Access token. Expires within 15 minutes.                   |
| `Content-Type: application/json`       |                           Yes | JSON requests                        | Request payload format.                                    |
| `Accept: application/json`             |                   Recommended | JSON responses                       | Response payload format.                                   |
| `Idempotency-Key`                      |  Required for critical writes | Client-retryable critical write APIs | Unique client-generated key.                               |
| `X-Correlation-ID`                     |                      Optional | All APIs                             | Client-provided trace ID. Server generates one if missing. |
| `If-Match`                             |                      Optional | Mutable update APIs                  | May contain `lock_version` or an ETag-style value.         |

## 4.3 Response Envelope

Successful JSON responses must use this shape:

```json
{
  "data": {},
  "meta": {
    "request_id": "req_01J...",
    "correlation_id": "corr_01J..."
  }
}
```

List responses must include pagination metadata:

```json
{
  "data": [],
  "meta": {
    "request_id": "req_01J...",
    "correlation_id": "corr_01J...",
    "pagination": {
      "limit": 50,
      "next_cursor": "eyJjcmVhdGVkX2F0Ijoi...",
      "has_more": true
    }
  }
}
```

## 4.4 Error Envelope

Errors must use this shape:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "One or more fields are invalid.",
    "details": [
      {
        "field": "mobile_number",
        "code": "invalid_format",
        "message": "Mobile number is invalid for the configured country."
      }
    ],
    "request_id": "req_01J...",
    "correlation_id": "corr_01J..."
  }
}
```

## 4.5 Standard HTTP Status Codes

|                      Status | Meaning                                                                                                                                 |
| --------------------------: | --------------------------------------------------------------------------------------------------------------------------------------- |
|                    `200 OK` | Read, update, or action completed synchronously.                                                                                        |
|               `201 Created` | Resource created synchronously.                                                                                                         |
|              `202 Accepted` | Long-running job queued.                                                                                                                |
|            `204 No Content` | Delete/deactivate/cancel with no body when explicitly appropriate.                                                                      |
|           `400 Bad Request` | Malformed request or invalid query combination.                                                                                         |
|          `401 Unauthorized` | Missing, expired, invalid, or revoked authentication.                                                                                   |
|             `403 Forbidden` | Authenticated but lacks permission, branch access, subscription access, or support-access scope.                                        |
|             `404 Not Found` | Resource does not exist or is not visible under tenant/branch scope.                                                                    |
|              `409 Conflict` | Version conflict, duplicate active record, workflow conflict, idempotency conflict, inventory conflict, or billing allocation conflict. |
|  `422 Unprocessable Entity` | Business rule validation failed.                                                                                                        |
|                `423 Locked` | Temporary lock, login lockout, or resource operation lock.                                                                              |
|     `429 Too Many Requests` | Rate limit exceeded.                                                                                                                    |
| `500 Internal Server Error` | Unexpected server error.                                                                                                                |
|   `503 Service Unavailable` | Temporary dependency or maintenance outage.                                                                                             |

## 4.6 Standard Error Codes

| Code                                     | Typical HTTP Status | Meaning                                                           |
| ---------------------------------------- | ------------------: | ----------------------------------------------------------------- |
| `unauthenticated`                        |                 401 | Missing or invalid authentication.                                |
| `email_not_verified`                     |                 403 | User must verify email before operational access.                 |
| `forbidden`                              |                 403 | Missing required permission.                                      |
| `branch_access_denied`                   |                 403 | User lacks access to requested branch-scoped resource.            |
| `tenant_access_denied`                   |                 403 | Tenant context mismatch or inaccessible tenant.                   |
| `subscription_access_blocked`            |                 403 | Tenant status blocks the requested operation.                     |
| `plan_limit_exceeded`                    |                 403 | Plan or tenant override blocks capability.                        |
| `validation_failed`                      |                 422 | Field-level or object-level validation failed.                    |
| `workflow_transition_blocked`            |                 422 | Requested status transition is not allowed.                       |
| `resource_not_found`                     |                 404 | Resource not found in accessible scope.                           |
| `duplicate_resource`                     |                 409 | Unique constraint would be violated.                              |
| `version_conflict`                       |                 409 | `lock_version` or ETag mismatch.                                  |
| `idempotency_conflict`                   |                 409 | Key reused for a different request intent.                        |
| `inventory_insufficient_available_stock` |                 422 | Available stock is insufficient.                                  |
| `inventory_reserved_below_on_hand`       |                 422 | Operation would make on-hand lower than reserved.                 |
| `fifo_allocation_conflict`               |                 409 | Concurrent FIFO allocation conflict.                              |
| `invoice_overpayment_blocked`            |                 422 | Payment exceeds remaining collectible balance.                    |
| `refund_amount_exceeds_refundable`       |                 422 | Refund exceeds refundable payment amount.                         |
| `invoice_overbilling_blocked`            |                 422 | Billing allocation exceeds remaining billable amount or quantity. |
| `rate_limited`                           |                 429 | Rate limit exceeded.                                              |
| `background_job_failed`                  |                 500 | Async job failed after allowed attempts.                          |

---

## 5. Authentication, Tenant Context, and Authorization

## 5.1 Authentication Model

Access tokens are short-lived bearer tokens. Refresh tokens are rotated and stored as secure, HTTP-only cookies or equivalent secure client storage depending on deployment architecture.

Tenant users belong to exactly one tenant. Platform admins do not belong to tenant employee records.

## 5.2 Tenant Context Resolution

Tenant-scoped APIs must resolve `tenant_id` from the authenticated tenant user. Tenant clients must not be allowed to pass arbitrary `tenant_id` in request bodies to change scope.

Platform-admin APIs must explicitly identify the tenant when operating on tenant resources:

```text
/api/v1/platform/tenants/{tenant_id}/...
```

Audited support access must require an active support access session and must never silently impersonate tenant users.

## 5.3 Branch Access Resolution

Branch-scoped resources must include a `branch_id` in the URL, body, or resource relationship. A user may access branch-specific data only when:

1. The user belongs to the resource tenant.
2. The user has the required permission.
3. The user has tenant-wide branch access or is assigned to the branch.

## 5.4 Subscription Access Guard

Every operational write endpoint must enforce tenant status before service-layer execution.

| Tenant Status      | API Write Rule                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `pending_setup`    | Only onboarding, profile setup, subscription info, password management, and logout allowed.                                |
| `active`           | Full access based on permissions and branch scope.                                                                         |
| `grace_period`     | Full access based on permissions and branch scope, with renewal warnings exposed through dashboard/session metadata.       |
| `read_only`        | Viewing, searching, reports, export generation, renewal request, password change, logout only. Operational writes blocked. |
| `suspended`        | Shop Owner can renew/export only. Non-owner tenant users blocked.                                                          |
| `pending_deletion` | Tenant queued for deletion; export access disabled unless platform admin grants emergency extension.                       |
| `deleted`          | No tenant operational access.                                                                                              |

## 5.5 Permission Check Contract

Each protected endpoint must define a required permission. Multi-role permission resolution is additive. There are no explicit deny permissions in this build.

Response for missing permission:

```json
{
  "error": {
    "code": "forbidden",
    "message": "You do not have permission to perform this action.",
    "details": [
      {
        "required_permission": "invoices.issue"
      }
    ],
    "request_id": "req_01J...",
    "correlation_id": "corr_01J..."
  }
}
```

---

## 6. Pagination, Filtering, Sorting, and Search

## 6.1 Cursor Pagination

High-volume list endpoints must support cursor pagination.

Query parameters:

| Parameter | Required | Description                           |
| --------- | -------: | ------------------------------------- |
| `limit`   |       No | Default `50`, maximum `100`.          |
| `cursor`  |       No | Opaque cursor from previous response. |

Example:

```text
GET /api/v1/customers?limit=50&cursor=eyJpZCI6...
```

## 6.2 Filtering

Filters must map to indexed query paths where possible.

Common filters:

| Filter      | Type   | Notes                                                     |
| ----------- | ------ | --------------------------------------------------------- |
| `branch_id` | UUID   | Required or optional depending on resource.               |
| `status`    | enum   | Must match documented enum values.                        |
| `from_date` | date   | Tenant timezone business date.                            |
| `to_date`   | date   | Inclusive business date unless endpoint states otherwise. |
| `q`         | string | Search query for supported search endpoints.              |
| `sort`      | string | Whitelisted sort fields only.                             |

## 6.3 Search Behavior

Search endpoints must:

- Scope by authenticated tenant.
- Enforce branch filtering for branch-specific history.
- Exclude soft-deleted records by default.
- Use normalized exact indexes for exact phone/email/SKU/barcode lookups.
- Use full-text/trigram read models where available for fuzzy search.

---

## 7. Idempotency Contract

## 7.1 Header

Critical client-retryable write endpoints must require:

```text
Idempotency-Key: <client-generated-unique-key>
```

Recommended key format:

```text
<resource_or_flow>-<uuid-or-ulid>
```

Example:

```text
Idempotency-Key: payment-01HZR3EGHDZCZ6S7M2F7VX48NK
```

## 7.2 Scope

Idempotency keys are scoped by:

- Tenant
- Authenticated user
- Endpoint
- Request intent hash
- Idempotency key hash

## 7.3 Repeat Behavior

| Case                                                     | API Behavior                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Same key, same request intent, original succeeded        | Return the original response with `Idempotency-Replayed: true`.                                 |
| Same key, same request intent, original still processing | Return `409 idempotency_conflict` or `202 processing` depending on endpoint.                    |
| Same key, different request intent                       | Return `409 idempotency_conflict`.                                                              |
| Expired key                                              | Treat as a new request only if the original retention window has expired and operation is safe. |

## 7.4 Required Idempotency Matrix

| Operation                                       | Endpoint Pattern                                                        | Idempotency Required |
| ----------------------------------------------- | ----------------------------------------------------------------------- | -------------------: |
| Invoice issuance                                | `POST /invoices/{id}/issue`                                             |                  Yes |
| Payment creation + receipt generation           | `POST /invoices/{id}/payments`                                          |                  Yes |
| Refund creation                                 | `POST /payments/{id}/refunds`                                           |                  Yes |
| Invoice cancellation                            | `POST /invoices/{id}/cancel`                                            |                  Yes |
| Invoice voiding                                 | `POST /invoices/{id}/void`                                              |                  Yes |
| Job order completion with inventory consumption | `POST /job-orders/{id}/complete`                                        |                  Yes |
| Inventory reservation/release                   | Job order line part endpoints and release actions                       |                  Yes |
| Inventory adjustment posting                    | `POST /inventory-adjustments/{id}/post`                                 |                  Yes |
| Purchase receiving                              | `POST /purchase-orders/{id}/receivings`                                 |                  Yes |
| Supplier return posting                         | `POST /supplier-returns/{id}/post`                                      |                  Yes |
| Supplier payment creation                       | `POST /suppliers/{id}/payments`                                         |                  Yes |
| Inventory transfer stock-affecting transitions  | `POST /inventory-transfers/{id}/submit`, `/send`, `/receive`, `/cancel` |                  Yes |
| Tenant deletion execution                       | Internal/background API only                                            |                  Yes |
| Export generation                               | `POST /exports`                                                         |          Recommended |

---

## 8. Common Resource Shapes

## 8.1 Audit Metadata

Mutable resources generally return:

```json
{
  "id": "uuid",
  "created_at": "2026-06-24T00:00:00Z",
  "updated_at": "2026-06-24T00:00:00Z",
  "lock_version": 0
}
```

Append-only resources generally omit `updated_at` and `lock_version` unless the underlying resource has workflow state.

## 8.2 Money and Quantity

Recommended response representation:

```json
{
  "amount": "1250.00",
  "quantity": "2.000"
}
```

The backend may accept JSON numbers for convenience but must validate precision and store fixed-precision decimals.

## 8.3 Actor Snapshot

Historical records should return actor snapshots where useful:

```json
{
  "created_by": {
    "id": "uuid",
    "full_name": "Juan Dela Cruz"
  }
}
```

The API must not break historical display if a user is later deactivated.

---

# 9. Endpoint Catalog

The following sections define the first build API surface. Request and response samples are representative contracts. Exact DTOs should be generated from this document and the final OpenAPI spec.

---

## 9.1 Public and Authentication APIs

Base path: `/api/v1/auth`

| Method | Path                          | Permission                    | Idempotency | Description                                                                    |
| ------ | ----------------------------- | ----------------------------- | ----------: | ------------------------------------------------------------------------------ |
| `POST` | `/signup-owner`               | Public                        | Recommended | Owner signup tenant flow. Blocked if default plan/duration missing.            |
| `POST` | `/login`                      | Public                        |          No | Login with rate limiting.                                                      |
| `POST` | `/refresh`                    | Authenticated refresh session |          No | Rotate refresh token and return new access token.                              |
| `POST` | `/logout`                     | Authenticated                 |          No | Logout current device.                                                         |
| `POST` | `/logout-all`                 | Authenticated                 |          No | Revoke all sessions for user.                                                  |
| `POST` | `/email-verification/resend`  | Authenticated/unverified      |          No | Resend verification email with rate limit.                                     |
| `POST` | `/email-verification/confirm` | Public token                  |          No | Confirm email verification token.                                              |
| `POST` | `/password/forgot`            | Public                        |          No | Request reset link with rate limit.                                            |
| `POST` | `/password/reset`             | Public token                  |          No | Reset password using single-use token.                                         |
| `POST` | `/password/change`            | Authenticated                 |          No | Change own password.                                                           |
| `GET`  | `/session`                    | Authenticated                 |          No | Return current user, tenant, permissions, branches, plan, subscription status. |

### 9.1.1 `POST /auth/login`

Request:

```json
{
  "email": "owner@example.com",
  "password": "Secret123",
  "remember_me": true
}
```

Response `200`:

```json
{
  "data": {
    "access_token": "eyJ...",
    "expires_in_seconds": 900,
    "user": {
      "id": "uuid",
      "user_type": "tenant_user",
      "full_name": "Juan Dela Cruz",
      "email": "owner@example.com",
      "email_verified": true,
      "status": "active"
    },
    "tenant": {
      "id": "uuid",
      "business_name": "Moto Garage",
      "status": "active",
      "timezone": "Asia/Manila",
      "country": "PH",
      "currency": "PHP"
    },
    "permissions": ["customers.read", "job_orders.create"],
    "branches": [
      {
        "id": "uuid",
        "name": "Main Branch"
      }
    ],
    "tenant_wide_branch_access": true
  },
  "meta": {
    "request_id": "req_01J...",
    "correlation_id": "corr_01J..."
  }
}
```

### 9.1.2 `GET /auth/session`

Must include subscription warnings when tenant is in `grace_period`, `read_only`, `suspended`, or nearing expiration.

Response `200`:

```json
{
  "data": {
    "user": {},
    "tenant": {},
    "effective_permissions": [],
    "effective_plan": {
      "code": "basic",
      "name": "Basic",
      "limits": {
        "max_active_branches": 1,
        "customer_email_reminders": false,
        "customer_sms_reminders": false
      }
    },
    "subscription": {
      "status": "active",
      "expiration_date": "2026-07-24",
      "days_until_expiration": 30,
      "renewal_required": false
    },
    "access": {
      "can_access_operational_modules": true,
      "read_only": false
    }
  },
  "meta": {}
}
```

---

## 9.2 Platform Administration APIs

Base path: `/api/v1/platform`

All endpoints require `user_type = platform_admin` and platform permissions.

| Method  | Path                                           | Permission                             | Idempotency | Description                                              |
| ------- | ---------------------------------------------- | -------------------------------------- | ----------: | -------------------------------------------------------- |
| `GET`   | `/tenants`                                     | `platform.tenants.read`                |          No | List tenants.                                            |
| `POST`  | `/tenants`                                     | `platform.tenants.create`              |         Yes | Create platform-created tenant.                          |
| `GET`   | `/tenants/{tenant_id}`                         | `platform.tenants.read`                |          No | Get tenant detail.                                       |
| `PATCH` | `/tenants/{tenant_id}`                         | `platform.tenants.update`              |          No | Update tenant platform metadata.                         |
| `POST`  | `/tenants/{tenant_id}/subscription`            | `platform.subscriptions.update`        |         Yes | Assign/update plan, expiration date, or status override. |
| `POST`  | `/tenants/{tenant_id}/read-only`               | `platform.subscriptions.update`        |         Yes | Apply read-only override.                                |
| `POST`  | `/tenants/{tenant_id}/suspend`                 | `platform.subscriptions.update`        |         Yes | Suspend tenant.                                          |
| `POST`  | `/tenants/{tenant_id}/support-access-sessions` | `platform.support_access`              |         Yes | Start audited support access session.                    |
| `POST`  | `/support-access-sessions/{session_id}/end`    | `platform.support_access`              |         Yes | End support access session.                              |
| `POST`  | `/tenants/{tenant_id}/exports`                 | `platform.tenants.update`              |         Yes | Trigger tenant export.                                   |
| `POST`  | `/tenants/{tenant_id}/deletion-jobs`           | `platform.tenants.update`              |         Yes | Queue tenant deletion when eligible.                     |
| `GET`   | `/audit-logs`                                  | `platform.audit_logs.read`             |          No | Search platform audit logs.                              |
| `GET`   | `/plans`                                       | `platform.plans.update` or read policy |          No | List subscription plans and limits.                      |
| `PATCH` | `/plans/{plan_id}`                             | `platform.plans.update`                |          No | Update configurable plan settings.                       |

### 9.2.1 `POST /platform/tenants`

Request:

```json
{
  "business_name": "Moto Garage",
  "shop_email": "owner@motogarage.test",
  "plan_id": "uuid",
  "subscription_start_date": "2026-06-24",
  "subscription_expiration_date": "2026-07-24",
  "owner": {
    "full_name": "Juan Dela Cruz",
    "email": "owner@motogarage.test",
    "send_invitation": true
  },
  "duplicate_approval_reason": null
}
```

Response `201`:

```json
{
  "data": {
    "tenant": {
      "id": "uuid",
      "business_name": "Moto Garage",
      "status": "pending_setup"
    },
    "owner_invitation_sent": true
  },
  "meta": {}
}
```

### 9.2.2 `POST /platform/tenants/{tenant_id}/support-access-sessions`

Request:

```json
{
  "access_mode": "read_only",
  "reason": "Investigate reported invoice export issue.",
  "expires_at": "2026-06-24T08:00:00Z"
}
```

Response `201`:

```json
{
  "data": {
    "id": "uuid",
    "tenant_id": "uuid",
    "access_mode": "read_only",
    "started_at": "2026-06-24T07:00:00Z",
    "expires_at": "2026-06-24T08:00:00Z"
  },
  "meta": {}
}
```

---

## 9.3 Shop Onboarding and Settings APIs

Base path: `/api/v1/shop`

| Method  | Path                   | Permission                       | Idempotency | Description                                                           |
| ------- | ---------------------- | -------------------------------- | ----------: | --------------------------------------------------------------------- |
| `GET`   | `/onboarding-state`    | Authenticated owner/setup access |          No | Get onboarding completion requirements.                               |
| `PUT`   | `/profile`             | `shop.update` or setup owner     |          No | Create/update shop profile during onboarding or settings.             |
| `POST`  | `/complete-onboarding` | Shop Owner                       |         Yes | Complete onboarding once required records exist.                      |
| `GET`   | `/profile`             | `shop.read`                      |          No | Get shop profile/settings.                                            |
| `PATCH` | `/settings`            | `settings.update`                |          No | Update mutable tenant settings.                                       |
| `PATCH` | `/billing-settings`    | `shop.billing.update`            |          No | Update billing-related settings allowed in read-only where specified. |
| `POST`  | `/renewal-request`     | Shop Owner                       |         Yes | Submit external-payment renewal request.                              |

### 9.3.1 `PUT /shop/profile`

Request:

```json
{
  "shop_name": "Moto Garage",
  "address": "123 Main Road, Manila",
  "contact_number": "+639171234567",
  "email": "owner@motogarage.test",
  "business_hours": {
    "monday": { "open": "08:00", "close": "17:00", "closed": false }
  },
  "tax_profile": "vat_registered",
  "tax_mode": "tax_exclusive",
  "vat_rate": "0.1200",
  "country": "PH",
  "timezone": "Asia/Manila",
  "currency": "PHP",
  "invoice_prefix": "MG-",
  "receipt_footer_text": "Thank you!"
}
```

Response `200` returns the saved profile.

Validation:

- `invoice_prefix` must match `^[A-Z0-9]{2,10}-$`.
- `tax_profile` and `tax_mode` must be compatible.
- `country` becomes immutable after onboarding unless platform-admin correction is allowed before operational records exist.
- `currency` becomes immutable after first financial record.

---

## 9.4 Branch APIs

Base path: `/api/v1/branches`

| Method  | Path                      | Permission            | Idempotency | Description                                  |
| ------- | ------------------------- | --------------------- | ----------: | -------------------------------------------- |
| `GET`   | `/`                       | `branches.read`       |          No | List branches.                               |
| `POST`  | `/`                       | `branches.create`     |         Yes | Create branch within plan limit.             |
| `GET`   | `/{branch_id}`            | `branches.read`       |          No | Get branch detail.                           |
| `PATCH` | `/{branch_id}`            | `branches.update`     |          No | Update branch.                               |
| `POST`  | `/{branch_id}/deactivate` | `branches.deactivate` |         Yes | Deactivate branch after blocking checks.     |
| `POST`  | `/{branch_id}/reactivate` | `branches.reactivate` |         Yes | Reactivate branch after plan limit re-check. |

### 9.4.1 `POST /branches`

Request:

```json
{
  "name": "Main Branch",
  "address": "123 Main Road, Manila",
  "contact_number": "+639171234567",
  "business_hours": {
    "monday": { "open": "08:00", "close": "17:00", "closed": false }
  }
}
```

Response `201`:

```json
{
  "data": {
    "id": "uuid",
    "name": "Main Branch",
    "status": "active",
    "lock_version": 0
  },
  "meta": {}
}
```

Plan-limit failure response `403`:

```json
{
  "error": {
    "code": "plan_limit_exceeded",
    "message": "Your current plan does not allow another active branch.",
    "details": [
      {
        "capability": "max_active_branches",
        "current_active_branches": 1,
        "limit": 1,
        "required_plan": "mid"
      }
    ],
    "request_id": "req_01J...",
    "correlation_id": "corr_01J..."
  }
}
```

---

## 9.5 Employee, User, Role, and Permission APIs

### 9.5.1 Employee APIs

Base path: `/api/v1/employees`

| Method  | Path                            | Permission             | Idempotency | Description                                              |
| ------- | ------------------------------- | ---------------------- | ----------: | -------------------------------------------------------- |
| `GET`   | `/`                             | `users.read`           |          No | List employees.                                          |
| `POST`  | `/invitations`                  | `users.create`         |         Yes | Create employee invitation.                              |
| `POST`  | `/`                             | `users.create`         |         Yes | Direct employee creation with password setup/reset link. |
| `GET`   | `/{employee_id}`                | `users.read`           |          No | Get employee profile.                                    |
| `PATCH` | `/{employee_id}`                | `users.update`         |          No | Update employee profile, branch access, roles.           |
| `POST`  | `/{employee_id}/deactivate`     | `users.deactivate`     |         Yes | Deactivate employee and revoke sessions.                 |
| `POST`  | `/{employee_id}/reactivate`     | `users.update`         |         Yes | Reactivate employee after role/branch/email checks.      |
| `POST`  | `/{employee_id}/password-reset` | `users.reset_password` |         Yes | Send password reset link.                                |
| `GET`   | `/{employee_id}/activity`       | `users.read`           |          No | View employee activity/audit events.                     |

### 9.5.2 Role APIs

Base path: `/api/v1/roles`

| Method  | Path                    | Permission         | Idempotency | Description                                      |
| ------- | ----------------------- | ------------------ | ----------: | ------------------------------------------------ |
| `GET`   | `/`                     | `roles.read`       |          No | List roles.                                      |
| `POST`  | `/`                     | `roles.create`     |         Yes | Create custom role.                              |
| `GET`   | `/{role_id}`            | `roles.read`       |          No | Get role.                                        |
| `PATCH` | `/{role_id}`            | `roles.update`     |          No | Update role name or permissions.                 |
| `POST`  | `/{role_id}/deactivate` | `roles.deactivate` |         Yes | Deactivate role if no user depends solely on it. |
| `GET`   | `/permissions`          | `permissions.read` |          No | List permission catalog.                         |

### 9.5.3 `PATCH /roles/{role_id}`

Request:

```json
{
  "name": "Senior Cashier",
  "permission_codes": ["invoices.read", "invoices.issue", "payments.create", "receipts.read"],
  "change_reason": "Update cashier responsibilities.",
  "lock_version": 3
}
```

Response `200` returns updated role and affected user count.

Validation:

- Shop Owner role must not be modified in a way that removes required owner capabilities.
- Existing assigned users receive updated effective permissions immediately.
- Permission changes must be audited.

---

## 9.6 Customer APIs

Base path: `/api/v1/customers`

| Method  | Path                         | Permission              | Idempotency | Description                                                   |
| ------- | ---------------------------- | ----------------------- | ----------: | ------------------------------------------------------------- |
| `GET`   | `/`                          | `customers.read`        |          No | Search/list active customers.                                 |
| `POST`  | `/`                          | `customers.create`      |         Yes | Create customer with duplicate warning behavior.              |
| `GET`   | `/{customer_id}`             | `customers.read`        |          No | Get customer detail.                                          |
| `PATCH` | `/{customer_id}`             | `customers.update`      |          No | Update customer.                                              |
| `POST`  | `/{customer_id}/soft-delete` | `customers.soft_delete` |         Yes | Soft delete customer after blocking checks.                   |
| `POST`  | `/{customer_id}/restore`     | `customers.restore`     |         Yes | Restore with duplicate re-check.                              |
| `POST`  | `/merge`                     | `customers.merge`       |         Yes | Merge duplicate customers into survivor.                      |
| `GET`   | `/{customer_id}/history`     | `customers.read`        |          No | Tenant-wide profile plus branch-filtered operational history. |
| `GET`   | `/{customer_id}/motorcycles` | `motorcycles.read`      |          No | List customer's motorcycles.                                  |

### 9.6.1 `POST /customers`

Request:

```json
{
  "name": "Pedro Santos",
  "mobile_number": "+639171234567",
  "email": "pedro@example.com",
  "address": "Quezon City",
  "birthday": "1990-04-15",
  "notes": "Prefers weekend service.",
  "tags": ["vip", "fleet"]
}
```

Response `201`:

```json
{
  "data": {
    "customer": {
      "id": "uuid",
      "name": "Pedro Santos",
      "mobile_number": "+639171234567",
      "email": "pedro@example.com",
      "status": "active",
      "created_at": "2026-06-24T00:00:00Z",
      "updated_at": "2026-06-24T00:00:00Z",
      "lock_version": 0
    },
    "duplicate_warnings": [
      {
        "type": "similar_name",
        "customer_id": "uuid",
        "name": "Pedro Santo"
      }
    ]
  },
  "meta": {}
}
```

Duplicate warnings must not automatically block creation unless an exact active duplicate violates tenant validation rules.

---

## 9.7 Motorcycle APIs

Base path: `/api/v1/motorcycles`

| Method  | Path                                   | Permission                | Idempotency | Description                                                   |
| ------- | -------------------------------------- | ------------------------- | ----------: | ------------------------------------------------------------- |
| `GET`   | `/`                                    | `motorcycles.read`        |          No | Search/list motorcycles.                                      |
| `POST`  | `/`                                    | `motorcycles.create`      |         Yes | Create motorcycle linked to active customer.                  |
| `GET`   | `/{motorcycle_id}`                     | `motorcycles.read`        |          No | Get motorcycle detail.                                        |
| `PATCH` | `/{motorcycle_id}`                     | `motorcycles.update`      |          No | Update motorcycle, including authorized customer link change. |
| `POST`  | `/{motorcycle_id}/soft-delete`         | `motorcycles.soft_delete` |         Yes | Soft delete after blocking checks.                            |
| `POST`  | `/{motorcycle_id}/restore`             | `motorcycles.restore`     |         Yes | Restore when linked customer is active.                       |
| `GET`   | `/{motorcycle_id}/service-history`     | `motorcycles.read`        |          No | Branch-access-filtered service history.                       |
| `POST`  | `/{motorcycle_id}/mileage-corrections` | `motorcycles.update`      |         Yes | Correct mileage lower than latest with reason.                |

### 9.7.1 `POST /motorcycles`

Request:

```json
{
  "customer_id": "uuid",
  "brand": "Honda",
  "model": "Click 125i",
  "year": 2024,
  "color": "Black",
  "plate_number": "ABC1234",
  "engine_number": "ENG123",
  "chassis_number": "CHS123",
  "latest_mileage": 1200
}
```

Response `201` includes duplicate identifier warnings when relevant.

---

## 9.8 Service Catalog APIs

Base path: `/api/v1/services`

| Method  | Path                       | Permission            | Idempotency | Description                                     |
| ------- | -------------------------- | --------------------- | ----------: | ----------------------------------------------- |
| `GET`   | `/`                        | `services.read`       |          No | List/search active services.                    |
| `POST`  | `/`                        | `services.create`     |         Yes | Create predefined service.                      |
| `GET`   | `/{service_id}`            | `services.read`       |          No | Get service.                                    |
| `PATCH` | `/{service_id}`            | `services.update`     |          No | Update service.                                 |
| `POST`  | `/{service_id}/deactivate` | `services.deactivate` |         Yes | Deactivate if not referenced by open workflows. |
| `POST`  | `/{service_id}/reactivate` | `services.update`     |         Yes | Reactivate if name remains unique.              |

Request for create/update:

```json
{
  "name": "Oil Change",
  "starting_price": "350.00",
  "variable_price": true,
  "price_disclaimer": "Final price may vary by oil type.",
  "description": "Standard engine oil replacement."
}
```

---

## 9.9 Estimate APIs

Base path: `/api/v1/estimates`

| Method  | Path                           | Permission          | Idempotency | Description                                   |
| ------- | ------------------------------ | ------------------- | ----------: | --------------------------------------------- |
| `GET`   | `/`                            | `estimates.read`    |          No | List estimates.                               |
| `POST`  | `/`                            | `estimates.create`  |         Yes | Create draft estimate and number.             |
| `GET`   | `/{estimate_id}`               | `estimates.read`    |          No | Get estimate.                                 |
| `PATCH` | `/{estimate_id}`               | `estimates.update`  |          No | Update draft estimate.                        |
| `POST`  | `/{estimate_id}/present`       | `estimates.present` |         Yes | Move draft to presented.                      |
| `POST`  | `/{estimate_id}/approve`       | `estimates.approve` |         Yes | Record customer approval.                     |
| `POST`  | `/{estimate_id}/convert`       | `estimates.convert` |         Yes | Convert approved estimate to job order lines. |
| `POST`  | `/{estimate_id}/cancel`        | `estimates.cancel`  |         Yes | Cancel with reason.                           |
| `GET`   | `/{estimate_id}/status-events` | `estimates.read`    |          No | View estimate transition history.             |

### 9.9.1 `POST /estimates`

Request:

```json
{
  "branch_id": "uuid",
  "customer_id": "uuid",
  "motorcycle_id": "uuid",
  "valid_until_date": "2026-07-01",
  "lines": [
    {
      "line_type": "service",
      "service_id": "uuid",
      "description": "Oil Change",
      "quantity": "1.000",
      "unit_price": "350.00"
    },
    {
      "line_type": "part",
      "product_id": "uuid",
      "description": "Engine Oil 10W-40",
      "quantity": "1.000",
      "unit_price": "280.00"
    }
  ]
}
```

Response `201` returns an `estimate_number` in format `EST-YYYYMMDD-000001`.

Important behavior:

- Estimates do not reserve inventory.
- Estimates do not affect revenue, AR, inventory on-hand, reserved stock, FIFO layers, or financial reports.

---

## 9.10 Job Order APIs

Base path: `/api/v1/job-orders`

| Method   | Path                                 | Permission                                        | Idempotency | Description                                                |
| -------- | ------------------------------------ | ------------------------------------------------- | ----------: | ---------------------------------------------------------- |
| `GET`    | `/`                                  | `job_orders.read`                                 |          No | List job orders.                                           |
| `POST`   | `/`                                  | `job_orders.create`                               |         Yes | Create job order and number.                               |
| `GET`    | `/{job_order_id}`                    | `job_orders.read`                                 |          No | Get job order.                                             |
| `PATCH`  | `/{job_order_id}`                    | `job_orders.update`                               |          No | Edit before release/cancel under line rules.               |
| `POST`   | `/{job_order_id}/service-lines`      | `job_orders.update`                               |         Yes | Add service/labor line.                                    |
| `PATCH`  | `/{job_order_id}/lines/{line_id}`    | `job_orders.update`                               |          No | Update editable line.                                      |
| `DELETE` | `/{job_order_id}/lines/{line_id}`    | `job_orders.update`                               |         Yes | Remove editable line and release reservation if part line. |
| `POST`   | `/{job_order_id}/part-lines`         | `inventory.reserve` or `job_orders.update`        |         Yes | Add part line and create reservation.                      |
| `POST`   | `/{job_order_id}/assign-mechanics`   | `job_orders.update`                               |          No | Assign primary/additional mechanics.                       |
| `POST`   | `/{job_order_id}/status-transitions` | `job_orders.change_status` or specific permission |         Yes | Generic status transition with validation.                 |
| `POST`   | `/{job_order_id}/complete`           | `job_orders.change_status`                        |         Yes | Complete and consume reserved inventory.                   |
| `POST`   | `/{job_order_id}/release`            | `job_orders.release`                              |         Yes | Release after release rule validation.                     |
| `POST`   | `/{job_order_id}/cancel`             | `job_orders.cancel`                               |         Yes | Cancel with reason and reservation release.                |
| `POST`   | `/{job_order_id}/files`              | `job_orders.attach_files`                         |         Yes | Attach uploaded files.                                     |
| `GET`    | `/{job_order_id}/status-events`      | `job_orders.read`                                 |          No | View status history.                                       |

### 9.10.1 `POST /job-orders`

Request:

```json
{
  "branch_id": "uuid",
  "customer_id": "uuid",
  "motorcycle_id": "uuid",
  "service_advisor_user_id": "uuid",
  "primary_mechanic_user_id": null,
  "mileage_at_intake": 12500,
  "customer_concern": "Engine noise and weak acceleration.",
  "internal_notes": "Check CVT and oil condition.",
  "service_lines": [
    {
      "line_type": "service",
      "service_id": "uuid",
      "description": "Diagnostic inspection",
      "quantity": "1.000",
      "unit_price": "250.00"
    }
  ]
}
```

Response `201` returns a `job_order_number` in format `JO-YYYYMMDD-000001` and initial status `pending`.

### 9.10.2 `POST /job-orders/{job_order_id}/part-lines`

Request:

```json
{
  "product_id": "uuid",
  "description": "CVT belt",
  "quantity": "1.000",
  "unit_price": "950.00"
}
```

Response `201`:

```json
{
  "data": {
    "line": {
      "id": "uuid",
      "line_type": "part",
      "product_id": "uuid",
      "quantity": "1.000",
      "unit_price": "950.00",
      "inventory_reservation_id": "uuid"
    },
    "reservation": {
      "id": "uuid",
      "reserved_quantity": "1.000",
      "status": "active",
      "fifo_allocations": [
        {
          "fifo_layer_id": "uuid",
          "reserved_quantity": "1.000",
          "unit_cost_snapshot": "700.00"
        }
      ]
    }
  },
  "meta": {}
}
```

Failure when insufficient available stock:

```json
{
  "error": {
    "code": "inventory_insufficient_available_stock",
    "message": "Available stock is insufficient for this reservation.",
    "details": [
      {
        "product_id": "uuid",
        "branch_id": "uuid",
        "requested_quantity": "2.000",
        "available_quantity": "1.000"
      }
    ],
    "request_id": "req_01J...",
    "correlation_id": "corr_01J..."
  }
}
```

### 9.10.3 `POST /job-orders/{job_order_id}/complete`

Request:

```json
{
  "completed_service_line_ids": ["uuid"],
  "completion_notes": "CVT belt replaced and road tested.",
  "mileage_at_completion": 12510
}
```

Response `200`:

```json
{
  "data": {
    "job_order": {
      "id": "uuid",
      "status": "completed",
      "completed_at": "2026-06-24T05:30:00Z"
    },
    "inventory_effects": [
      {
        "product_id": "uuid",
        "quantity_consumed": "1.000",
        "cogs_amount": "700.00",
        "ledger_entry_ids": ["uuid"],
        "fifo_consumption_ids": ["uuid"]
      }
    ]
  },
  "meta": {}
}
```

Transaction requirements:

- Lock job order, active reservations, stock balances, FIFO layers, FIFO allocations.
- Reduce on-hand and reserved quantities atomically.
- Convert FIFO reservation allocations to FIFO consumptions.
- Create inventory ledger entries using `job_order_consumption`.
- Update job order status and status event.
- Audit the action.

---

## 9.11 Mechanic Work Session APIs

Base path: `/api/v1/mechanic-sessions`

| Method | Path                   | Permission                 | Idempotency | Description                                          |
| ------ | ---------------------- | -------------------------- | ----------: | ---------------------------------------------------- |
| `GET`  | `/`                    | `mechanic_sessions.read`   |          No | List work sessions.                                  |
| `POST` | `/`                    | `mechanic_sessions.create` |         Yes | Start work session.                                  |
| `POST` | `/{session_id}/pause`  | `mechanic_sessions.pause`  |         Yes | Pause active session.                                |
| `POST` | `/{session_id}/resume` | `mechanic_sessions.resume` |         Yes | Resume paused session.                               |
| `POST` | `/{session_id}/finish` | `mechanic_sessions.finish` |         Yes | Finish active/paused session and calculate duration. |

### 9.11.1 `POST /mechanic-sessions`

Request:

```json
{
  "job_order_id": "uuid",
  "notes": "Starting diagnosis."
}
```

Validation:

- Mechanic must be assigned to the job order unless authorized manager override exists.
- Mechanic must not have another unfinished session in the tenant.

---

## 9.12 Product, Category, Inventory Balance, and Ledger APIs

### 9.12.1 Product Categories

Base path: `/api/v1/product-categories`

| Method  | Path                        | Permission                  | Idempotency | Description                                |
| ------- | --------------------------- | --------------------------- | ----------: | ------------------------------------------ |
| `GET`   | `/`                         | `products.read`             |          No | List categories.                           |
| `POST`  | `/`                         | `product_categories.manage` |         Yes | Create category.                           |
| `PATCH` | `/{category_id}`            | `product_categories.manage` |          No | Update category.                           |
| `POST`  | `/{category_id}/deactivate` | `product_categories.manage` |         Yes | Deactivate if no active products assigned. |
| `POST`  | `/{category_id}/reactivate` | `product_categories.manage` |         Yes | Reactivate if name unique.                 |

### 9.12.2 Products

Base path: `/api/v1/products`

| Method  | Path                        | Permission            | Idempotency | Description                                    |
| ------- | --------------------------- | --------------------- | ----------: | ---------------------------------------------- |
| `GET`   | `/`                         | `products.read`       |          No | Search/list products.                          |
| `POST`  | `/`                         | `products.create`     |         Yes | Create product.                                |
| `GET`   | `/{product_id}`             | `products.read`       |          No | Get product.                                   |
| `PATCH` | `/{product_id}`             | `products.update`     |          No | Update product.                                |
| `POST`  | `/{product_id}/deactivate`  | `products.deactivate` |         Yes | Deactivate if no stock/reservations/open refs. |
| `POST`  | `/{product_id}/reactivate`  | `products.update`     |         Yes | Reactivate if SKU/barcode unique.              |
| `GET`   | `/{product_id}/stock`       | `inventory.read`      |          No | Stock per accessible branch.                   |
| `GET`   | `/{product_id}/fifo-layers` | `inventory.read`      |          No | FIFO layers visible by branch access.          |

### 9.12.3 Inventory Core

Base path: `/api/v1/inventory`

| Method | Path                | Permission       | Idempotency | Description                                     |
| ------ | ------------------- | ---------------- | ----------: | ----------------------------------------------- |
| `GET`  | `/stock-balances`   | `inventory.read` |          No | List stock balances by branch/product.          |
| `GET`  | `/ledger`           | `inventory.read` |          No | Paginated immutable inventory movement history. |
| `GET`  | `/fifo-layers`      | `inventory.read` |          No | FIFO layer report source.                       |
| `GET`  | `/low-stock-alerts` | `inventory.read` |          No | Active low stock alerts.                        |

### 9.12.4 `POST /products`

Request:

```json
{
  "name": "Engine Oil 10W-40 1L",
  "sku": "OIL-10W40-1L",
  "barcode": "4800000000012",
  "supplier_code": "SUP-OIL-001",
  "brand": "Motul",
  "category_id": "uuid",
  "unit_of_measure": "piece",
  "default_cost": "220.00",
  "selling_price": "320.00",
  "reorder_level": "5.000",
  "description": "Synthetic oil."
}
```

---

## 9.13 Inventory Adjustment APIs

Base path: `/api/v1/inventory-adjustments`

| Method  | Path                       | Permission                                       | Idempotency | Description                                        |
| ------- | -------------------------- | ------------------------------------------------ | ----------: | -------------------------------------------------- |
| `GET`   | `/`                        | `inventory.read`                                 |          No | List inventory adjustments.                        |
| `POST`  | `/`                        | `inventory.adjust`                               |         Yes | Create draft adjustment.                           |
| `GET`   | `/{adjustment_id}`         | `inventory.read`                                 |          No | Get adjustment.                                    |
| `PATCH` | `/{adjustment_id}`         | `inventory.adjust`                               |          No | Update draft adjustment.                           |
| `POST`  | `/{adjustment_id}/submit`  | `inventory.adjust`                               |         Yes | Submit for approval or post if below threshold.    |
| `POST`  | `/{adjustment_id}/approve` | `inventory.adjust.approve`                       |         Yes | Approve pending adjustment.                        |
| `POST`  | `/{adjustment_id}/reject`  | `inventory.adjust.approve`                       |         Yes | Reject with reason.                                |
| `POST`  | `/{adjustment_id}/cancel`  | `inventory.adjust`                               |         Yes | Cancel draft/pending before posting.               |
| `POST`  | `/{adjustment_id}/post`    | `inventory.adjust` or `inventory.adjust.approve` |         Yes | Post approved adjustment and stock ledger entries. |
| `POST`  | `/force`                   | `inventory.force_adjust`                         |         Yes | Exceptional corrective force adjustment.           |

### 9.13.1 `POST /inventory-adjustments`

Request:

```json
{
  "branch_id": "uuid",
  "reason": "Physical count variance during monthly count.",
  "lines": [
    {
      "product_id": "uuid",
      "adjustment_type": "final_counted_quantity",
      "final_counted_quantity": "8.000",
      "unit_cost": "220.00"
    }
  ]
}
```

Response `201` returns status `draft`, value impact, and whether approval is required.

---

## 9.14 Inventory Transfer APIs

Base path: `/api/v1/inventory-transfers`

| Method  | Path                           | Permission                   | Idempotency | Description                                                      |
| ------- | ------------------------------ | ---------------------------- | ----------: | ---------------------------------------------------------------- |
| `GET`   | `/`                            | `inventory.read`             |          No | List transfers.                                                  |
| `POST`  | `/`                            | `inventory.transfer.create`  |         Yes | Create draft transfer and number.                                |
| `GET`   | `/{transfer_id}`               | `inventory.read`             |          No | Get transfer.                                                    |
| `PATCH` | `/{transfer_id}`               | `inventory.transfer.create`  |          No | Update draft transfer.                                           |
| `POST`  | `/{transfer_id}/submit`        | `inventory.transfer.create`  |         Yes | Move draft to pending and reserve source stock.                  |
| `POST`  | `/{transfer_id}/send`          | `inventory.transfer.send`    |         Yes | Move pending to in_transit with sent quantities.                 |
| `POST`  | `/{transfer_id}/receive`       | `inventory.transfer.receive` |         Yes | Receive transfer, move FIFO cost layers, record variance if any. |
| `POST`  | `/{transfer_id}/cancel`        | `inventory.transfer.cancel`  |         Yes | Cancel pending/in_transit with disposition rules.                |
| `GET`   | `/{transfer_id}/status-events` | `inventory.read`             |          No | View transition history.                                         |

### 9.14.1 `POST /inventory-transfers`

Request:

```json
{
  "source_branch_id": "uuid",
  "destination_branch_id": "uuid",
  "remarks": "Restock satellite branch.",
  "lines": [
    {
      "product_id": "uuid",
      "requested_quantity": "5.000"
    }
  ]
}
```

Response `201` returns `transfer_number` in format `TR-YYYYMMDD-000001` and status `draft`.

### 9.14.2 `POST /inventory-transfers/{transfer_id}/receive`

Request:

```json
{
  "lines": [
    {
      "line_id": "uuid",
      "received_quantity": "4.000",
      "variance_reason": "One item damaged in transit."
    }
  ]
}
```

Response `200`:

```json
{
  "data": {
    "transfer": {
      "id": "uuid",
      "status": "received",
      "received_at": "2026-06-24T06:00:00Z"
    },
    "inventory_effects": {
      "source_branch_id": "uuid",
      "destination_branch_id": "uuid",
      "ledger_entry_ids": ["uuid"],
      "variance_loss_amount": "220.00"
    }
  },
  "meta": {}
}
```

---

## 9.15 Supplier APIs

Base path: `/api/v1/suppliers`

| Method  | Path                        | Permission                                       | Idempotency | Description                                   |
| ------- | --------------------------- | ------------------------------------------------ | ----------: | --------------------------------------------- |
| `GET`   | `/`                         | `suppliers.read`                                 |          No | List/search suppliers.                        |
| `POST`  | `/`                         | `suppliers.create`                               |         Yes | Create supplier.                              |
| `GET`   | `/{supplier_id}`            | `suppliers.read`                                 |          No | Get supplier.                                 |
| `PATCH` | `/{supplier_id}`            | `suppliers.update`                               |          No | Update supplier.                              |
| `POST`  | `/{supplier_id}/deactivate` | `suppliers.deactivate`                           |         Yes | Deactivate when no open PO/unpaid AP.         |
| `POST`  | `/{supplier_id}/reactivate` | `suppliers.update`                               |         Yes | Reactivate with active-name uniqueness check. |
| `GET`   | `/{supplier_id}/balance`    | `supplier_payments.read` or AP report permission |          No | Supplier payable balance.                     |
| `GET`   | `/{supplier_id}/history`    | `suppliers.read`                                 |          No | Purchase/payment/return history.              |
| `POST`  | `/{supplier_id}/payments`   | `supplier_payments.create`                       |         Yes | Record manual supplier payment.               |
| `POST`  | `/{supplier_id}/credits`    | `supplier_credits.create`                        |         Yes | Create supplier credit adjustment.            |

---

## 9.16 Purchase Order and Receiving APIs

Base path: `/api/v1/purchase-orders`

| Method  | Path                              | Permission          | Idempotency | Description                             |
| ------- | --------------------------------- | ------------------- | ----------: | --------------------------------------- |
| `GET`   | `/`                               | `purchases.read`    |          No | List purchase orders.                   |
| `POST`  | `/`                               | `purchases.create`  |         Yes | Create draft purchase order and number. |
| `GET`   | `/{purchase_order_id}`            | `purchases.read`    |          No | Get purchase order.                     |
| `PATCH` | `/{purchase_order_id}`            | `purchases.update`  |          No | Update draft/eligible purchase order.   |
| `POST`  | `/{purchase_order_id}/order`      | `purchases.update`  |         Yes | Move draft to ordered.                  |
| `POST`  | `/{purchase_order_id}/receivings` | `purchases.receive` |         Yes | Receive stock and create FIFO layers.   |
| `POST`  | `/{purchase_order_id}/close`      | `purchases.update`  |         Yes | Close after receiving/AP confirmation.  |
| `POST`  | `/{purchase_order_id}/cancel`     | `purchases.cancel`  |         Yes | Cancel if no stock received.            |

### 9.16.1 `POST /purchase-orders`

Request:

```json
{
  "branch_id": "uuid",
  "supplier_id": "uuid",
  "payment_terms": "credit",
  "order_date": "2026-06-24",
  "expected_receive_date": "2026-06-28",
  "lines": [
    {
      "product_id": "uuid",
      "ordered_quantity": "10.000",
      "unit_cost": "220.00",
      "notes": "Box of oil."
    }
  ]
}
```

Response `201` returns `purchase_order_number` in format `PO-YYYYMMDD-000001`.

### 9.16.2 `POST /purchase-orders/{purchase_order_id}/receivings`

Request for credit purchase:

```json
{
  "received_at": "2026-06-24T04:00:00Z",
  "lines": [
    {
      "purchase_order_line_id": "uuid",
      "received_quantity": "5.000",
      "received_unit_cost": "220.00"
    }
  ]
}
```

Request for cash purchase:

```json
{
  "received_at": "2026-06-24T04:00:00Z",
  "payment_method": "cash",
  "payment_reference": "OR-123",
  "lines": [
    {
      "purchase_order_line_id": "uuid",
      "received_quantity": "5.000",
      "received_unit_cost": "220.00"
    }
  ]
}
```

Response `201` includes FIFO layer IDs, inventory ledger IDs, and AP effect when payment terms are `credit`.

---

## 9.17 Supplier Return APIs

Base path: `/api/v1/supplier-returns`

| Method  | Path                           | Permission                | Idempotency | Description                                                |
| ------- | ------------------------------ | ------------------------- | ----------: | ---------------------------------------------------------- |
| `GET`   | `/`                            | `supplier_returns.read`   |          No | List supplier returns.                                     |
| `POST`  | `/`                            | `supplier_returns.create` |         Yes | Create draft supplier return.                              |
| `GET`   | `/{supplier_return_id}`        | `supplier_returns.read`   |          No | Get supplier return.                                       |
| `PATCH` | `/{supplier_return_id}`        | `supplier_returns.create` |          No | Update draft supplier return.                              |
| `POST`  | `/{supplier_return_id}/post`   | `supplier_returns.create` |         Yes | Post return, consume FIFO, reduce stock, AP/credit effect. |
| `POST`  | `/{supplier_return_id}/cancel` | `supplier_returns.create` |         Yes | Cancel draft return.                                       |

### 9.17.1 `POST /supplier-returns`

Request:

```json
{
  "branch_id": "uuid",
  "supplier_id": "uuid",
  "original_receiving_id": "uuid",
  "reason": "Defective items returned to supplier.",
  "immediate_cash_refund": {
    "enabled": false
  },
  "lines": [
    {
      "product_id": "uuid",
      "returned_quantity": "2.000"
    }
  ]
}
```

Posting behavior:

- Returned quantity must be less than or equal to available unreserved stock.
- FIFO consumption prefers original purchase receiving layers when traceable.
- Credit purchases reduce AP first; excess creates supplier credit.
- Cash purchases or fully paid credit purchases create supplier credit unless immediate supplier cash refund is recorded.

---

## 9.18 Invoice APIs

Base path: `/api/v1/invoices`

| Method  | Path                          | Permission              | Idempotency | Description                                                  |
| ------- | ----------------------------- | ----------------------- | ----------: | ------------------------------------------------------------ |
| `GET`   | `/`                           | `invoices.read`         |          No | List invoices.                                               |
| `POST`  | `/`                           | `invoices.create`       |         Yes | Create draft invoice and number from one or more job orders. |
| `GET`   | `/{invoice_id}`               | `invoices.read`         |          No | Get invoice.                                                 |
| `PATCH` | `/{invoice_id}`               | `invoices.update_draft` |          No | Edit draft invoice only.                                     |
| `POST`  | `/{invoice_id}/issue`         | `invoices.issue`        |         Yes | Issue invoice, copy tax fields, finalize allocations.        |
| `POST`  | `/{invoice_id}/cancel`        | `invoices.cancel`       |         Yes | Cancel draft/pending zero-payment invoice.                   |
| `POST`  | `/{invoice_id}/void`          | `invoices.void`         |         Yes | Void issued invoice after required refunds.                  |
| `GET`   | `/{invoice_id}/status-events` | `invoices.read`         |          No | View invoice status history.                                 |
| `GET`   | `/{invoice_id}/print`         | `invoices.read`         |          No | Printable invoice document metadata or signed URL.           |

### 9.18.1 `POST /invoices`

Request:

```json
{
  "branch_id": "uuid",
  "customer_id": "uuid",
  "invoice_date": "2026-06-24",
  "due_date": "2026-07-01",
  "job_order_ids": ["uuid"],
  "invoice_level_discount": {
    "type": "fixed",
    "amount": "100.00",
    "reason": "Loyal customer discount."
  },
  "lines": [
    {
      "originating_job_order_line_id": "uuid",
      "line_type": "labor",
      "description": "Diagnostic labor",
      "quantity": "1.000",
      "unit_price": "250.00",
      "line_discount_amount": "0.00"
    }
  ]
}
```

Response `201`:

```json
{
  "data": {
    "invoice": {
      "id": "uuid",
      "invoice_number": "MG-000001",
      "status": "draft",
      "subtotal_amount": "250.00",
      "discount_amount": "100.00",
      "tax_amount": "18.00",
      "total_amount": "168.00",
      "remaining_collectible_balance": "168.00"
    },
    "billing_allocations": [
      {
        "job_order_line_id": "uuid",
        "status": "reserved",
        "allocated_quantity": "1.000",
        "allocated_amount": "250.00"
      }
    ]
  },
  "meta": {}
}
```

Validation:

- Invoice must link to at least one job order before issuance.
- Linked job orders must belong to same tenant, same customer, same branch, and not be cancelled/released at invoice creation.
- Billing allocations must prevent concurrent overbilling.
- Invoice-level discounts must be allocated across eligible lines before tax calculation.

### 9.18.2 `POST /invoices/{invoice_id}/issue`

Request:

```json
{
  "issue_date": "2026-06-24",
  "due_date": "2026-07-01"
}
```

Response `200` returns status `pending`, copied tax fields, finalized billing allocations, and printable document metadata.

---

## 9.19 Payment, Receipt, and Refund APIs

### 9.19.1 Payments

Base path: `/api/v1/invoices/{invoice_id}/payments`

| Method | Path | Permission        | Idempotency | Description                                    |
| ------ | ---- | ----------------- | ----------: | ---------------------------------------------- |
| `GET`  | `/`  | `payments.read`   |          No | List invoice payments.                         |
| `POST` | `/`  | `payments.create` |         Yes | Record payment and generate immutable receipt. |

Request:

```json
{
  "amount": "1500.00",
  "payment_date": "2026-06-24",
  "payment_method": "gcash",
  "reference_number": "GCASH-123456",
  "notes": "Paid at counter."
}
```

Response `201`:

```json
{
  "data": {
    "payment": {
      "id": "uuid",
      "amount": "1500.00",
      "refundable_amount": "1500.00",
      "payment_method": "gcash"
    },
    "receipt": {
      "id": "uuid",
      "receipt_number": "RCPT-000001",
      "amount": "1500.00",
      "issued_at": "2026-06-24T06:30:00Z"
    },
    "invoice": {
      "id": "uuid",
      "status": "paid",
      "remaining_collectible_balance": "0.00"
    }
  },
  "meta": {}
}
```

Validation:

- Payment amount must be greater than zero.
- Payment amount must not exceed invoice remaining collectible balance.
- Draft, cancelled, voided, and refunded invoices cannot receive payments.
- Each payment creates exactly one receipt.

### 9.19.2 Receipts

Base path: `/api/v1/receipts`

| Method | Path                  | Permission      | Idempotency | Description                               |
| ------ | --------------------- | --------------- | ----------: | ----------------------------------------- |
| `GET`  | `/`                   | `receipts.read` |          No | List receipts.                            |
| `GET`  | `/{receipt_id}`       | `receipts.read` |          No | Get immutable receipt.                    |
| `GET`  | `/{receipt_id}/print` | `receipts.read` |          No | Printable receipt metadata or signed URL. |

Receipts must not expose update or delete endpoints.

### 9.19.3 Refunds

Base path: `/api/v1/payments/{payment_id}/refunds`

| Method | Path | Permission                             | Idempotency | Description                 |
| ------ | ---- | -------------------------------------- | ----------: | --------------------------- |
| `GET`  | `/`  | `payments.read`                        |          No | List payment refunds.       |
| `POST` | `/`  | `payments.refund` or `invoices.refund` |         Yes | Record partial/full refund. |

Request:

```json
{
  "amount": "500.00",
  "reason": "Customer returned unused part.",
  "collection_should_continue": true,
  "close_invoice_after_refund": false,
  "inventory_reversal": {
    "selected": true,
    "lines": [
      {
        "invoice_line_id": "uuid",
        "product_id": "uuid",
        "return_quantity": "1.000"
      }
    ]
  }
}
```

Response `201` includes refund, invoice status recalculation, payment refundable amount, and optional inventory reversal ledger/FIFO layer IDs.

Validation:

- Refund amount must not exceed payment refundable amount.
- Money refund does not automatically restore inventory.
- Inventory reversal requires explicit selection and `inventory.adjust` or `inventory.force_adjust` permission.
- `refunded` invoice status is used only when fully refunded and explicitly closed with no further collection expected.

---

## 9.20 Accounts Receivable and Accounts Payable APIs

Base path: `/api/v1/accounts`

| Method | Path                  | Permission                                     | Description                                                                   |
| ------ | --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET`  | `/receivable`         | `invoices.read` or reports permission          | AR list for pending/partially paid/overdue invoices with collectible balance. |
| `GET`  | `/receivable/summary` | `reports.view_basic`                           | AR totals and aging buckets.                                                  |
| `GET`  | `/payable`            | `supplier_payments.read` or reports permission | AP list based on supplier payable balance.                                    |
| `GET`  | `/payable/summary`    | `reports.view_basic`                           | AP totals by supplier/branch.                                                 |

AR response item:

```json
{
  "invoice_id": "uuid",
  "invoice_number": "MG-000001",
  "customer_id": "uuid",
  "customer_name": "Pedro Santos",
  "branch_id": "uuid",
  "invoice_total": "5000.00",
  "amount_paid": "2000.00",
  "remaining_collectible_balance": "3000.00",
  "due_date": "2026-07-01",
  "status": "partially_paid",
  "aging_bucket": "current"
}
```

---

## 9.21 Expense APIs

Base path: `/api/v1/expenses`

| Method  | Path                 | Permission        | Idempotency | Description                                                   |
| ------- | -------------------- | ----------------- | ----------: | ------------------------------------------------------------- |
| `GET`   | `/`                  | `expenses.read`   |          No | List expenses.                                                |
| `POST`  | `/`                  | `expenses.create` |         Yes | Record expense.                                               |
| `GET`   | `/{expense_id}`      | `expenses.read`   |          No | Get expense.                                                  |
| `PATCH` | `/{expense_id}`      | `expenses.update` |          No | Edit active expense with reason for report-affecting changes. |
| `POST`  | `/{expense_id}/void` | `expenses.void`   |         Yes | Void expense with reason.                                     |

Base path: `/api/v1/expense-categories`

| Method  | Path                        | Permission                  | Idempotency | Description              |
| ------- | --------------------------- | --------------------------- | ----------: | ------------------------ |
| `GET`   | `/`                         | `expenses.read`             |          No | List expense categories. |
| `POST`  | `/`                         | `expense_categories.manage` |         Yes | Create category.         |
| `PATCH` | `/{category_id}`            | `expense_categories.manage` |          No | Update category.         |
| `POST`  | `/{category_id}/deactivate` | `expense_categories.manage` |         Yes | Deactivate category.     |
| `POST`  | `/{category_id}/reactivate` | `expense_categories.manage` |         Yes | Reactivate category.     |

Request:

```json
{
  "branch_id": "uuid",
  "category_id": "uuid",
  "expense_date": "2026-06-24",
  "amount": "850.00",
  "payment_method": "cash",
  "reference_number": "OR-456",
  "description": "Shop cleaning supplies."
}
```

---

## 9.22 Reminder APIs

Base path: `/api/v1/reminders`

| Method  | Path                        | Permission         | Idempotency | Description                              |
| ------- | --------------------------- | ------------------ | ----------: | ---------------------------------------- |
| `GET`   | `/`                         | `reminders.read`   |          No | List reminders.                          |
| `POST`  | `/`                         | `reminders.create` |         Yes | Create reminder.                         |
| `GET`   | `/{reminder_id}`            | `reminders.read`   |          No | Get reminder.                            |
| `PATCH` | `/{reminder_id}`            | `reminders.update` |          No | Update scheduled reminder.               |
| `POST`  | `/{reminder_id}/cancel`     | `reminders.cancel` |         Yes | Cancel reminder.                         |
| `POST`  | `/{reminder_id}/send`       | `reminders.send`   |         Yes | Manually trigger send when due/eligible. |
| `GET`   | `/{reminder_id}/deliveries` | `reminders.read`   |          No | View per-channel delivery statuses.      |

Request:

```json
{
  "customer_id": "uuid",
  "motorcycle_id": "uuid",
  "reminder_type": "oil_change",
  "due_date": "2026-09-24",
  "due_mileage": 15000,
  "channels": ["customer_email", "internal_in_app"],
  "message_template": "Hi {{customer_name}}, your motorcycle is due for oil change."
}
```

Plan enforcement:

- Basic blocks customer email and customer SMS.
- Mid allows customer email and blocks customer SMS.
- High allows customer email and customer SMS.
- The system must not silently switch to another channel when selected channel is blocked.

---

## 9.23 Internal Notification APIs

Base path: `/api/v1/notifications`

| Method | Path                         | Permission                         | Description                                        |
| ------ | ---------------------------- | ---------------------------------- | -------------------------------------------------- |
| `GET`  | `/`                          | `notifications.read`               | List current user's in-app notifications.          |
| `POST` | `/{notification_id}/read`    | `notifications.read`               | Mark notification as read.                         |
| `POST` | `/{notification_id}/dismiss` | `notifications.read`               | Dismiss notification.                              |
| `GET`  | `/preferences`               | `notifications.read`               | Get current user notification preferences.         |
| `PUT`  | `/preferences`               | `notifications.update_preferences` | Update preferences, enforcing plan channel limits. |

---

## 9.24 File APIs

Base path: `/api/v1/files`

| Method | Path                      | Permission          | Idempotency | Description                                                         |
| ------ | ------------------------- | ------------------- | ----------: | ------------------------------------------------------------------- |
| `POST` | `/upload-intents`         | `files.upload`      |         Yes | Create upload intent with tenant-scoped object key and constraints. |
| `POST` | `/complete-upload`        | `files.upload`      |         Yes | Register uploaded file after storage upload/scanning state.         |
| `GET`  | `/{file_id}`              | `files.read`        |          No | Get file metadata if linked entity accessible.                      |
| `GET`  | `/{file_id}/download-url` | `files.read`        |          No | Generate time-limited signed download URL.                          |
| `POST` | `/{file_id}/soft-delete`  | `files.soft_delete` |         Yes | Soft delete file.                                                   |
| `POST` | `/{file_id}/restore`      | `files.restore`     |         Yes | Restore file within retention period.                               |
| `POST` | `/{file_id}/links`        | `files.upload`      |         Yes | Link file to supported entity.                                      |

### 9.24.1 `POST /files/upload-intents`

Request:

```json
{
  "original_filename": "service-photo.jpg",
  "content_type": "image/jpeg",
  "size_bytes": 1048576,
  "purpose": "service_photo",
  "entity_type": "job_order",
  "entity_id": "uuid"
}
```

Response `201`:

```json
{
  "data": {
    "upload_intent_id": "uuid",
    "file_id": "uuid",
    "upload_url": "https://signed-upload-url.example",
    "object_key": "tenants/{tenant_id}/files/{file_id}/service-photo.jpg",
    "expires_at": "2026-06-24T07:00:00Z",
    "required_headers": {
      "Content-Type": "image/jpeg"
    }
  },
  "meta": {}
}
```

Validation:

- Supported image types: JPG, JPEG, PNG, WEBP up to 5 MB.
- Supported document types: PDF, DOCX, XLSX up to 20 MB.
- Permanent public URLs are forbidden.
- Access is based on linked entity access rules.

---

## 9.25 Dashboard and Report APIs

Base path: `/api/v1/dashboard`

| Method | Path                | Permission           | Description                                                                   |
| ------ | ------------------- | -------------------- | ----------------------------------------------------------------------------- |
| `GET`  | `/summary`          | `reports.view_basic` | Daily sales, monthly revenue, pending jobs, AR/AP, low stock, open transfers. |
| `GET`  | `/charts/revenue`   | `reports.view_basic` | Revenue chart by date range and branch scope.                                 |
| `GET`  | `/inventory-alerts` | `inventory.read`     | Low stock dashboard data.                                                     |

Base path: `/api/v1/reports`

| Method | Path                      | Permission              | Description                                                           |
| ------ | ------------------------- | ----------------------- | --------------------------------------------------------------------- |
| `GET`  | `/sales`                  | `reports.view_basic`    | Daily/weekly/monthly/yearly sales and payment method summary.         |
| `GET`  | `/services`               | `reports.view_basic`    | Service reports.                                                      |
| `GET`  | `/inventory`              | `reports.view_basic`    | Inventory reports.                                                    |
| `GET`  | `/customers`              | `reports.view_basic`    | Customer reports.                                                     |
| `GET`  | `/financial`              | `reports.view_basic`    | Revenue, expenses, gross profit, COGS, AR, AP.                        |
| `GET`  | `/branch-comparison`      | `reports.view_branch`   | Branch comparison report.                                             |
| `GET`  | `/advanced/{report_code}` | `reports.view_advanced` | Advanced operational reports.                                         |
| `POST` | `/exports`                | `reports.export`        | Queue report export as PDF, Excel, or CSV when large/explicit export. |

Common report query parameters:

```text
branch_id=<uuid>
from_date=2026-06-01
to_date=2026-06-30
group_by=day|week|month|year|branch|payment_method|service_advisor
format=json
```

Large report export response `202`:

```json
{
  "data": {
    "job_id": "uuid",
    "status": "queued",
    "estimated_async": true
  },
  "meta": {}
}
```

---

## 9.26 Tenant Export APIs

Base path: `/api/v1/exports`

| Method | Path                            | Permission         | Idempotency | Description                            |
| ------ | ------------------------------- | ------------------ | ----------: | -------------------------------------- |
| `GET`  | `/`                             | `shop.export_data` |          No | List tenant export jobs.               |
| `POST` | `/`                             | `shop.export_data` |         Yes | Queue full tenant export.              |
| `GET`  | `/{export_job_id}`              | `shop.export_data` |          No | Get export job status.                 |
| `GET`  | `/{export_job_id}/download-url` | `shop.export_data` |          No | Get signed download URL when complete. |

Request:

```json
{
  "include_attachments": true,
  "include_soft_deleted": false,
  "metadata_only": false
}
```

Response `202`:

```json
{
  "data": {
    "id": "uuid",
    "status": "queued",
    "include_attachments": true,
    "include_soft_deleted": false,
    "requested_at": "2026-06-24T07:00:00Z"
  },
  "meta": {}
}
```

Export output requirements:

- ZIP file.
- CSV files for tabular data.
- JSON files for relationship-preserving data.
- Attachment manifest.
- Audit log export.
- README.
- `/attachments` directory when binaries are included.
- Download links expire after 7 days.

---

## 9.27 Audit Log APIs

Base path: `/api/v1/audit-logs`

| Method | Path              | Permission        | Description                       |
| ------ | ----------------- | ----------------- | --------------------------------- |
| `GET`  | `/`               | `audit_logs.read` | Search tenant-visible audit logs. |
| `GET`  | `/{audit_log_id}` | `audit_logs.read` | Get audit detail.                 |

Query parameters:

```text
action=invoice.issued
entity_type=invoice
entity_id=<uuid>
branch_id=<uuid>
actor_user_id=<uuid>
from_date=2026-06-01
to_date=2026-06-30
limit=50
cursor=<opaque>
```

Audit logs must not expose sensitive payloads such as passwords, tokens, full card details, or unnecessary sensitive free text.

---

## 9.28 Background Job APIs

Base path: `/api/v1/background-jobs`

Tenant users can only view tenant-visible jobs they are authorized to see, such as exports. Platform admins can view platform jobs.

| Method | Path                 | Permission            | Description                                |
| ------ | -------------------- | --------------------- | ------------------------------------------ |
| `GET`  | `/{job_id}`          | Context-specific      | Get job status.                            |
| `GET`  | `/{job_id}/attempts` | Platform/support only | View retry attempts with sanitized errors. |
| `POST` | `/{job_id}/cancel`   | Context-specific      | Cancel if job is cancellable.              |

Job response:

```json
{
  "data": {
    "id": "uuid",
    "job_type": "tenant_export",
    "status": "running",
    "attempt_count": 1,
    "created_at": "2026-06-24T07:00:00Z",
    "started_at": "2026-06-24T07:01:00Z",
    "completed_at": null,
    "last_error": null,
    "correlation_id": "corr_01J..."
  },
  "meta": {}
}
```

---

## 9.29 Offline Cache APIs

Base path: `/api/v1/offline-cache`

| Method   | Path              | Permission    | Description                                                            |
| -------- | ----------------- | ------------- | ---------------------------------------------------------------------- |
| `GET`    | `/manifest`       | Authenticated | Get current user's offline cache manifest for recently viewed records. |
| `GET`    | `/recent-records` | Authenticated | Get minimal read-only cache payload.                                   |
| `DELETE` | `/current-user`   | Authenticated | Clear current user's server-side offline cache manifest if used.       |

Offline cache payload must include only minimal data needed for recently viewed read-only screens:

- Recent customers.
- Recent motorcycles.
- Recent job orders.
- Recent invoices.

The API must not support offline transaction creation, editing, submission, deletion, approval, or sync conflict resolution.

---

# 10. Status Transition Contracts

Workflow status updates must use explicit action endpoints or `status-transitions` endpoints that validate the PRD transition matrix. Arbitrary `PATCH { status: ... }` must not be accepted for workflow-controlled resources.

## 10.1 Generic Transition Request Shape

```json
{
  "to_status": "in_progress",
  "reason": "Primary mechanic assigned and work started.",
  "metadata": {}
}
```

## 10.2 Generic Transition Response Shape

```json
{
  "data": {
    "resource": {
      "id": "uuid",
      "status": "in_progress",
      "lock_version": 4
    },
    "status_event": {
      "id": "uuid",
      "from_status": "pending",
      "to_status": "in_progress",
      "reason": "Primary mechanic assigned and work started.",
      "created_at": "2026-06-24T07:00:00Z"
    }
  },
  "meta": {}
}
```

## 10.3 Workflow-Controlled Resources

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

# 11. Webhook and Integration Boundary

GarageOS does not require public inbound webhooks for customer payment processing in this build because external payment gateway charging is excluded.

Provider callbacks may be needed for infrastructure integrations such as SMS/email delivery events. These must be implemented as internal/provider-authenticated endpoints, not tenant-user APIs.

Suggested internal endpoint namespace:

```text
POST /api/v1/integrations/email-provider/events
POST /api/v1/integrations/sms-provider/events
POST /api/v1/integrations/storage-provider/events
```

Rules:

- Authenticate provider events using provider signature verification or equivalent.
- Store sanitized integration events.
- Map provider delivery status to reminder/notification delivery status.
- Never expose provider secrets to tenant APIs.
- Do not retry permanent failures automatically.

---

# 12. Security Requirements for API Implementation

## 12.1 Required Middleware Order

Recommended route middleware order:

1. Request ID/correlation ID assignment.
2. HTTPS enforcement at edge/proxy.
3. Rate limiting for public and sensitive endpoints.
4. Authentication.
5. Email verification guard.
6. Tenant status/subscription guard.
7. Platform/support access guard when applicable.
8. Permission guard.
9. Branch access guard.
10. Request validation.
11. Idempotency guard for critical writes.
12. Service-layer transaction execution.
13. Audit/outbox/logging.
14. Response envelope serialization.

## 12.2 Sensitive Data Prohibitions

The API must never return or log:

- Plaintext passwords.
- Password reset tokens.
- Email verification tokens.
- Access tokens in logs.
- Refresh tokens in logs.
- Full card number, CVV, magnetic stripe, or equivalent sensitive cardholder data.
- Malware-quarantined file binary data.

## 12.3 Rate-Limited API Categories

| Category                    | Limit                                                                        |
| --------------------------- | ---------------------------------------------------------------------------- |
| Login                       | 5 failed attempts per 15 minutes per account and IP.                         |
| Password reset request      | 3 requests per account per hour.                                             |
| Email verification resend   | 5 requests per account per hour.                                             |
| File uploads                | 30 uploads per user per minute.                                              |
| Public unauthenticated APIs | 60 requests per IP per minute.                                               |
| Reminder sending            | 500 customer messages per tenant per day unless platform admin raises limit. |
| Export generation           | 5 export requests per tenant per day.                                        |

Rate limit responses must use `429 rate_limited` and include safe retry metadata when appropriate.

---

# 13. Observability Contract

Every API request must produce structured logs with:

- `request_id`
- `correlation_id`
- `method`
- `path_template`
- `status_code`
- `duration_ms`
- `tenant_id` when available
- `branch_id` when relevant
- `actor_user_id` when authenticated
- `actor_type`
- `required_permission` when applicable
- `error_code` when failed

Sensitive request/response bodies must not be logged.

Metrics must support:

- API latency percentiles.
- API error rate.
- Failed authorization checks.
- Authentication failures.
- Rate limit violations.
- Background job failures.
- Inventory transaction failures.
- Export job status.
- Reminder delivery status.

---

# 14. OpenAPI Generation Notes

When converting this document to OpenAPI:

1. Use reusable components for envelopes, errors, pagination, audit metadata, actor snapshots, money, quantity, and workflow status events.
2. Generate DTOs from schema-aligned resource contracts.
3. Use enum values exactly as listed in the database schema.
4. Mark idempotency headers as required on critical write endpoints.
5. Mark auth requirements per endpoint.
6. Document `403` variants separately for permission, branch access, plan limit, and subscription guard failures.
7. Include examples for successful and blocked workflow transitions.
8. Include `409` examples for optimistic lock and idempotency conflicts.
9. Avoid exposing database-only fields that are not needed by the client.
10. Keep platform-admin endpoints separate from tenant-user endpoints.

---

# 15. API Acceptance Criteria

The API layer is acceptable only if automated tests prove:

## 15.1 Tenant and Branch Isolation

- A tenant user cannot access another tenant's records.
- A branch-scoped user cannot access branch-specific records outside assigned branches.
- Tenant-wide entities are visible only with the required permission.
- Linked branch histories remain branch-restricted even when parent entities are tenant-wide.
- Files enforce access based on linked entity access rules.

## 15.2 Subscription and Plan Enforcement

- `pending_setup` tenants can only access setup-allowed endpoints.
- `read_only` tenants cannot create or modify operational records.
- `suspended` tenants block non-owner access.
- Disabled channels are blocked with `plan_limit_exceeded`.
- Branch creation/reactivation enforces effective active branch limits.
- Renewal request does not restore active access until platform admin confirmation.

## 15.3 Workflow Safety

- All workflow status changes use explicit endpoints.
- Blocked transitions return `workflow_transition_blocked` with clear details.
- Released/cancelled/final resources cannot be edited except through allowed correction workflows.
- Corrective/destructive actions require reasons where required.

## 15.4 Financial Integrity

- Invoice numbers and receipt numbers are unique and never reused.
- Draft invoice billing allocations prevent concurrent overbilling.
- Issued invoices cannot be directly edited.
- Payments cannot exceed remaining collectible balance.
- Each payment creates exactly one immutable receipt.
- Refunds cannot exceed refundable amount.
- Refunds recalculate invoice status correctly.
- Voids require refunded payments before voiding paid invoices.

## 15.5 Inventory Integrity

- Job order part lines create reservations and FIFO reservation allocations.
- Reserved stock reduces available stock but not on-hand stock.
- Job order completion consumes reserved parts, FIFO layers, and ledger entries atomically.
- Inventory adjustments do not affect stock before posting.
- Transfer submit/send/receive preserves FIFO cost references.
- Supplier returns reduce stock and AP/credits according to payment state.
- Normal operations cannot create negative available stock or on-hand below reserved.

## 15.6 Idempotency and Concurrency

- Critical write endpoint retries do not duplicate side effects.
- Reusing an idempotency key with a different request intent returns `409 idempotency_conflict`.
- Concurrent document number generation cannot produce duplicates.
- Concurrent inventory reservation cannot over-allocate FIFO layers.
- Concurrent payment/refund requests cannot overpay or over-refund.
- Stale `lock_version` updates return `409 version_conflict`.

## 15.7 Observability and Auditability

- Every critical action writes audit logs.
- Audit logs are immutable and do not contain sensitive secrets.
- Every API response contains request/correlation metadata.
- Background jobs expose safe job status and failure metadata.
- Provider delivery failures are recorded and visible to authorized users.

---

# 16. Remaining Engineering Decisions

These are implementation decisions, not product ambiguities:

1. Whether the final OpenAPI file is maintained manually or generated from route/DTO decorators.
2. Whether upload flow uses direct-to-object-storage signed uploads or backend proxy uploads. Direct signed upload is recommended.
3. Whether JSON fields remain `snake_case` or a frontend mapping layer converts to `camelCase`. This contract recommends `snake_case` for source-document alignment.
4. Exact access-token and refresh-token transport mechanics for the PWA deployment model.
5. Exact cursor encoding format. It must remain opaque to clients.
6. Whether `If-Match` uses raw `lock_version` or an ETag wrapper. The service must still enforce optimistic locking.
7. Whether report exports share `/background-jobs/{id}` or expose only report-specific export job endpoints.
8. Whether provider event endpoints live inside this application or a separate worker/ingestion service.

---

# 17. Recommended Implementation Order

1. API foundation: envelopes, error handling, request IDs, auth, tenant context, permission guard, branch guard.
2. Auth/session and onboarding APIs.
3. Platform admin tenant/plan/subscription APIs.
4. Branch, employee, role, and permission APIs.
5. Customer and motorcycle APIs with search.
6. Service catalog, estimates, job orders, mechanic sessions.
7. Product, inventory balance, reservation, adjustment, and transfer APIs.
8. Supplier, purchase, receiving, supplier return, AP APIs.
9. Invoice, billing allocation, payment, receipt, refund, AR APIs.
10. Expense APIs.
11. Reminder, notification, integration delivery APIs.
12. File upload/download/link APIs.
13. Dashboard, reports, report export APIs.
14. Tenant export APIs.
15. Audit log, background job, offline cache APIs.
16. Full OpenAPI generation and contract tests.

---

# 18. Contract Test Strategy

For each endpoint, automated contract tests must verify:

- Authentication requirements.
- Required permission enforcement.
- Tenant isolation.
- Branch access enforcement where applicable.
- Subscription status blocking where applicable.
- Request validation.
- Response envelope shape.
- Error envelope shape.
- Audit log creation where required.
- Idempotency behavior where required.
- Optimistic locking behavior on mutable updates.
- Database transaction rollback on simulated partial failure.

Critical workflow endpoints must also have concurrency tests.

---

# 19. Final Recommendation

Implement the GarageOS API as a strict REST API with explicit workflow action endpoints, shared middleware guards, schema-aligned enum values, required idempotency for critical writes, and cursor-paginated list endpoints. This approach keeps the API easy for a mobile-first PWA to consume while preserving the project's most important invariants: tenant isolation, branch authorization, subscription enforcement, FIFO inventory integrity, immutable financial records, and auditable operations.
