# GarageOS Database Design

**Document:** `database-design.md`  
**Source PRD:** `requirements.md` / Motorcycle Shop Management System SaaS PRD
**Database target:** PostgreSQL 16+  
**Purpose:** Compact, implementation-oriented database design reference for AI-assisted planning and code review.

> This reduced document preserves the database decisions, invariants, table catalog, transaction rules, and validation requirements. Use `database-schema.md` as the physical schema/DDL authority and `requirements.md` as the product-behavior authority.

---

## 1. Core Database Principles

GarageOS is a mobile-first, multi-tenant SaaS for motorcycle service businesses. The database must support tenant lifecycle, branch operations, service work, inventory/FIFO, purchasing/AP, invoicing/payments/AR, reports, exports, audit, and background jobs.

| Area            | Decision                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------- |
| Engine          | PostgreSQL 16+                                                                              |
| Tenancy         | Shared database/schema; strict `tenant_id` isolation                                        |
| Branch scope    | Branch operational records store both `tenant_id` and `branch_id`                           |
| IDs             | UUIDv7 preferred; ULID acceptable if standardized                                           |
| Money           | `numeric(14,2)`; no floating point                                                          |
| Quantity        | `numeric(14,3)`                                                                             |
| Timestamps      | `timestamptz` for events; `date` for business dates interpreted in tenant timezone          |
| Workflow state  | Status column + status history + service-layer transition validation + audit where critical |
| Inventory truth | Immutable inventory ledger + stock balances + FIFO layers/allocation                        |
| Financial truth | Issued invoices, payments, receipts, refunds, and ledgers are immutable or correction-only  |
| Critical writes | Transactional, idempotent where retryable, and protected with row locks or optimistic locks |
| Search          | Normalized columns, trigram indexes, and PostgreSQL FTS/read models                         |
| Reports         | Derived from transactional tables; use snapshots/materialized read models for heavy queries |
| Soft deletion   | Prefer deactivation/status/`deleted_at`; hard delete only via tenant deletion lifecycle     |
| Audit           | Append-only audit logs; platform support access and critical actions always audited         |
| RLS             | Recommended as defense-in-depth if request-local tenant claims can be safely set            |

---

## 2. Modeling Conventions

### 2.1 Table and Column Rules

- Use plural `snake_case` table names.
- Tenant-owned records include `tenant_id`.
- Branch-specific records include both `tenant_id` and `branch_id`.
- Use composite foreign keys where practical, for example `(tenant_id, branch_id) -> branches(tenant_id, id)`.
- Mutable tenant tables generally include:

```sql
id uuid primary key,
tenant_id uuid not null,
created_at timestamptz not null default now(),
created_by_user_id uuid null,
updated_at timestamptz not null default now(),
updated_by_user_id uuid null,
lock_version integer not null default 0
```

- Append-only tables generally include `id`, optional `tenant_id`, `created_at`, and actor/source metadata. Avoid `updated_at` unless operationally necessary.

### 2.2 Normalized Columns

Use normalized fields for duplicate detection and lookup:

```text
normalized_email, normalized_mobile, normalized_name,
normalized_plate_number, normalized_engine_number, normalized_chassis_number,
normalized_sku, normalized_barcode
```

### 2.3 JSONB Rule

Use `jsonb` only for audit metadata, provider payloads, export manifests, notification responses, and non-query-critical settings. Do not store core transactional facts only in JSONB.

---

## 3. Required Domains and Table Catalog

### 3.1 Platform, Plans, and Tenant Lifecycle

| Table                              | Purpose / Key Invariant                                                  |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `tenants`                          | SaaS tenant; active duplicate business/email detection; effective status |
| `shop_profiles`                    | Tenant profile, tax/localization, invoice settings; one per tenant       |
| `subscription_plans`               | Platform-controlled Basic/Mid/High plans; one active default plan        |
| `subscription_plan_limits`         | Plan capabilities and limits                                             |
| `tenant_subscriptions`             | One subscription per tenant; plan/start/expiration/status source         |
| `tenant_plan_overrides`            | Tenant-specific capability overrides; audited                            |
| `subscription_overrides`           | Explicit platform lifecycle overrides with reason/effective window       |
| `tenant_lifecycle_events`          | Append-only lifecycle history                                            |
| `platform_support_access_sessions` | Audited support access; default read-only                                |
| `tenant_deletion_jobs`             | Tenant deletion scheduling, attempts, failure state                      |

Tenant statuses:

```text
pending_setup, active, grace_period, read_only, suspended, pending_deletion, deleted
```

Lifecycle rules:

- `tenants.status` is the effective access status.
- Subscription facts live in `tenant_subscriptions`.
- Manual/admin override facts live in `subscription_overrides`.
- A lifecycle job recalculates status from expiration dates and overrides.
- Operational writes check tenant status before mutation.
- Tenant deletion coordinates database records, object storage manifests, retained audit carveouts, and retryable jobs.

### 3.2 Authentication, Employees, Roles, Permissions

| Table                       | Purpose / Key Invariant                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `users`                     | Login identity; tenant user or platform admin; active normalized email unique |
| `employee_profiles`         | Tenant employee profile tied to one user                                      |
| `roles`                     | Tenant roles and seeded templates                                             |
| `permissions`               | Permission catalog                                                            |
| `role_permissions`          | Role-to-permission mapping                                                    |
| `user_roles`                | User role assignments                                                         |
| `user_branch_assignments`   | Branch access assignments                                                     |
| `employee_invitations`      | Invite workflow; hashed token                                                 |
| `password_reset_tokens`     | Hashed, single-use reset tokens                                               |
| `email_verification_tokens` | Hashed, single-use verification tokens                                        |
| `refresh_sessions`          | Hashed rotating refresh token/session state                                   |
| `login_attempts`            | Login security/rate-limit evidence                                            |

Rules:

- Tenant users must have `tenant_id`; platform admins must have `tenant_id = null`.
- Platform permissions are never tenant role permissions.
- Branch access is separate from permissions.
- Passwords and tokens are stored only as hashes.

### 3.3 Shop Settings and Branches

| Table                      | Purpose / Key Invariant                                |
| -------------------------- | ------------------------------------------------------ |
| `branches`                 | Physical shop locations; active name unique per tenant |
| `branch_status_events`     | Branch activation/deactivation history                 |
| `tenant_settings`          | Tenant-level configuration not covered by shop profile |
| `timezone_change_requests` | Timezone-change safeguards and approval trail          |

Branch rules:

- Tenant must keep at least one active branch after onboarding.
- Branch creation/reactivation must enforce plan active-branch limits.
- Branch deactivation must block if there are open jobs, unresolved transfers, pending purchases, active stock/reservations, or if it is the last active branch.

### 3.4 Customers and Motorcycles

| Table                       | Purpose / Key Invariant                                         |
| --------------------------- | --------------------------------------------------------------- |
| `customers`                 | Tenant-wide customer records; soft-delete/merge supported       |
| `customer_tags`             | Tenant-scoped tags                                              |
| `customer_tag_assignments`  | Customer/tag join                                               |
| `customer_merge_events`     | Merge history and audit trail                                   |
| `motorcycles`               | Tenant-wide motorcycle service record linked to active customer |
| `motorcycle_mileage_events` | Mileage timeline with source/reason                             |
| `customer_search_documents` | Denormalized search support                                     |

Rules:

- Customers and motorcycles are tenant-wide.
- Operational histories linked to them remain branch-filtered where required.
- Duplicate detection uses normalized contact, plate, engine, chassis, and customer fields.

### 3.5 Service Catalog, Estimates, Job Orders

| Table                          | Purpose / Key Invariant                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `services`                     | Tenant service catalog; active normalized name unique              |
| `service_status_events`        | Service activation/deactivation history                            |
| `estimates`                    | Non-revenue quotations; tenant-scoped estimate number              |
| `estimate_lines`               | Estimate service/labor/part/custom lines                           |
| `estimate_status_events`       | Estimate workflow history                                          |
| `job_orders`                   | Primary service engagement at one branch; tenant-scoped job number |
| `job_order_status_events`      | Job status history                                                 |
| `job_order_mechanics`          | Mechanic assignments                                               |
| `job_order_lines`              | Service/labor/part lines                                           |
| `job_order_line_snapshots`     | Pricing/service/product snapshots                                  |
| `mechanic_work_sessions`       | Mechanic time tracking; one unfinished session per mechanic        |
| `mechanic_work_session_pauses` | Pause/resume records                                               |

Key statuses:

```text
estimate: draft, presented, approved, converted, cancelled, expired
job_order: pending, in_progress, waiting_for_parts, completed, released, cancelled
job_order_line_type: service, labor, part
```

Rules:

- Estimates do not affect revenue, stock on-hand, or FIFO layers.
- Job order transitions are explicit actions, not arbitrary status edits.
- Job completion with parts must consume reserved FIFO allocations transactionally.

### 3.6 Inventory, FIFO, Reservations, Transfers, Adjustments

| Table                                | Purpose / Key Invariant                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `product_categories`                 | Tenant categories; active normalized name unique                                           |
| `products`                           | Tenant products; SKU unique; active barcode unique                                         |
| `stock_balances`                     | `(tenant_id, branch_id, product_id)` stock summary; non-negative and `on_hand >= reserved` |
| `inventory_ledger_entries`           | Immutable source of truth for all stock-changing events                                    |
| `fifo_layers`                        | Received stock layers with unit cost and remaining quantity                                |
| `fifo_consumptions`                  | Immutable FIFO consumption evidence                                                        |
| `inventory_reservations`             | Active/released/consumed/cancelled stock reservations                                      |
| `fifo_reservation_allocations`       | Reservation-to-FIFO-layer allocations                                                      |
| `inventory_adjustments`              | Draft/approval/posting workflow                                                            |
| `inventory_adjustment_lines`         | Adjustment product/quantity/cost details                                                   |
| `inventory_adjustment_status_events` | Adjustment history                                                                         |
| `inventory_transfers`                | Branch-to-branch transfer workflow                                                         |
| `inventory_transfer_lines`           | Transfer product/quantity/variance details                                                 |
| `inventory_transfer_status_events`   | Transfer history                                                                           |

Inventory transaction types include purchase receiving, job order reservation/release/consumption, inventory adjustment increase/decrease, transfer reservation/release/out/in/variance loss, supplier return, refund reversal, and void reversal.

FIFO rules:

- Reservation allocates oldest available FIFO layer quantities first.
- Consumption uses the reservation allocation order and creates immutable consumption rows.
- Stock-changing operations must create ledger entries and update stock summaries in the same transaction.

### 3.7 Suppliers, Purchases, Returns, Accounts Payable

| Table                          | Purpose / Key Invariant                         |
| ------------------------------ | ----------------------------------------------- |
| `suppliers`                    | Tenant suppliers; active normalized name unique |
| `supplier_status_events`       | Supplier activation/deactivation history        |
| `purchase_orders`              | Branch purchase orders; tenant-scoped PO number |
| `purchase_order_lines`         | Ordered/received quantities and costs           |
| `purchase_receivings`          | Receiving events                                |
| `purchase_receiving_lines`     | Received line details                           |
| `purchase_order_status_events` | PO workflow history                             |
| `supplier_payables`            | AP ledger/balance basis                         |
| `supplier_payments`            | Supplier payment records                        |
| `supplier_credits`             | Supplier credit records                         |
| `supplier_returns`             | Return workflow                                 |
| `supplier_return_lines`        | Returned product/quantity/value details         |

Rules:

- Cash purchases do not create AP.
- Credit purchases create supplier payable records.
- Supplier returns must reduce stock through ledger/FIFO rules and update AP/credits according to payment state.

### 3.8 Invoices, Payments, Receipts, Refunds, AR

| Table                         | Purpose / Key Invariant                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| `invoices`                    | Customer billing document; tenant-scoped invoice number                 |
| `invoice_lines`               | Service/labor/part/custom invoice lines with pricing/tax snapshots      |
| `invoice_job_orders`          | Invoice-to-job-order links                                              |
| `invoice_billing_allocations` | Prevents overbilling job order lines                                    |
| `invoice_status_events`       | Invoice workflow history                                                |
| `payments`                    | Customer payments; positive amount; idempotent critical write           |
| `receipts`                    | Exactly one immutable receipt per payment; tenant-scoped receipt number |
| `refunds`                     | Refund records; correction workflow                                     |
| `refund_inventory_reversals`  | Optional inventory reversal evidence                                    |
| `void_inventory_reversals`    | Void-related inventory reversal evidence                                |
| `accounts_receivable_ledger`  | AR events/balance evidence                                              |

Rules:

- Invoice issue locks invoice, lines, billing allocations, and document sequence.
- Billing allocations must prevent overbilling across one or multiple invoices.
- Payment + receipt is one transaction and must never overpay invoice balance.
- Refunds must never exceed refundable payment amount.
- Receipts are immutable.

### 3.9 Expenses

| Table                   | Purpose / Key Invariant                         |
| ----------------------- | ----------------------------------------------- |
| `expense_categories`    | Tenant expense categories                       |
| `expenses`              | Branch/tenant operating expenses; active/voided |
| `expense_status_events` | Expense history                                 |

Rules:

- Expenses must be reportable by tenant, branch, category, date, and status.
- Voiding/corrections must preserve audit/status history.

### 3.10 Reminders and Notifications

| Table                    | Purpose / Key Invariant                                |
| ------------------------ | ------------------------------------------------------ |
| `reminder_rules`         | Time/mileage/birthday/follow-up reminder configuration |
| `customer_reminders`     | Scheduled/due/sent/failed/cancelled customer reminders |
| `notification_templates` | Provider/message template metadata                     |
| `notification_outbox`    | Delivery jobs/outbox                                   |
| `notification_attempts`  | Immutable provider attempt history                     |
| `in_app_notifications`   | Internal user notifications                            |

Rules:

- Notification channels are plan-gated.
- Disabled channels must be blocked, not silently downgraded.
- Attempts store provider response metadata without secrets.

### 3.11 Files, Exports, Offline Cache

| Table                                | Purpose / Key Invariant                                       |
| ------------------------------------ | ------------------------------------------------------------- |
| `files`                              | Tenant-scoped file metadata; object content stored outside DB |
| `file_links`                         | Links files to supported entities                             |
| `file_access_events`                 | Access/download audit evidence                                |
| `tenant_export_jobs`                 | Export generation job state                                   |
| `tenant_export_files`                | Export package manifests                                      |
| `tenant_export_included_attachments` | Attachment inclusion tracking                                 |
| `offline_cache_manifests`            | Read-only offline cache metadata                              |
| `sync_versions`                      | Version markers for cache refresh/invalidation                |

Rules:

- Store object metadata in DB; binary content in private object storage.
- File access uses signed URLs and tenant-scoped authorization.
- Offline cache is read-only only; no offline writes or sync conflict model.
- Tenant exports must include manifests and optional attachment binaries.

### 3.12 Audit, Idempotency, Jobs, Observability

| Table                      | Purpose / Key Invariant                                 |
| -------------------------- | ------------------------------------------------------- |
| `audit_logs`               | Tenant audit log; append-only                           |
| `platform_audit_logs`      | Platform audit log; append-only                         |
| `audit_retention_policies` | Retention policy metadata                               |
| `idempotency_keys`         | Retry-safe critical write state and response cache      |
| `document_sequences`       | Tenant-scoped document number generation with row locks |
| `background_jobs`          | Database-backed job queue/state                         |
| `background_job_attempts`  | Retry/failure attempt history                           |
| `outbox_events`            | Transactional outbox events                             |
| `rate_limit_events`        | Rate-limit evidence                                     |
| `integration_events`       | Provider callback/delivery events                       |
| `system_health_events`     | Operational health observations                         |
| `error_events`             | Safe error summaries and correlation metadata           |

Rules:

- Audit, ledger, receipt, refund, payment, notification-attempt, and status-event records are append-only or correction-only.
- Background jobs must be observable and retry-safe.
- Idempotency keys are required for client-retryable critical writes.

---

## 4. Reports, Search, and Indexing

### 4.1 Reporting Source Tables

| Report Area         | Source of Truth                                                         |
| ------------------- | ----------------------------------------------------------------------- |
| Sales/revenue       | Issued invoices, invoice lines, payments/refunds depending report basis |
| COGS                | FIFO consumption records tied to job order consumption                  |
| Inventory valuation | Remaining FIFO layer quantities and unit costs                          |
| AR                  | Invoices and AR ledger with collectible balance                         |
| AP                  | Supplier payable ledger                                                 |
| Expenses            | Non-voided expenses                                                     |
| Productivity        | Mechanic work sessions and completed job orders                         |

Recommended read models: `report_daily_sales`, `report_daily_payments`, `report_daily_inventory_movements`, `report_stock_valuation_snapshots`, `report_mechanic_productivity`, `report_customer_activity`, and `dashboard_snapshots`.

### 4.2 Search Requirements

Search surfaces: customers, motorcycles, products, suppliers, job orders, invoices, purchases, and files.

Rules:

- Always filter by `tenant_id`.
- Branch-scoped screens filter by `(tenant_id, branch_id)`.
- Use keyset pagination for high-volume lists and ledgers.
- Prefer normalized exact lookup + trigram/FTS read models.
- Avoid joining audit logs into operational list queries.

### 4.3 Indexing Rules

- Tenant-owned operational indexes start with `tenant_id`.
- Branch list indexes usually start with `(tenant_id, branch_id, ...)`.
- Status boards/lists use `(tenant_id, branch_id, status, created_at desc)`.
- Prioritize indexes for tenant/branch lists, status dashboards, search, reporting dates, ledger/FIFO paths, and export/deletion foreign-key paths.
- Avoid indexing every foreign key blindly when write volume is high.

---

## 5. Critical Transactions

The following must run in a single database transaction with proper row locks/idempotency where applicable.

| Operation                     | Required Safeguards                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| Invoice issuance              | Lock invoice, lines, billing allocations, sequence row                             |
| Payment + receipt             | Lock invoice/payment path, receipt sequence, create payment and receipt atomically |
| Refund                        | Lock payment and invoice; prevent over-refund; optional inventory reversal         |
| Invoice cancel/void           | Lock invoice, allocations, refund checks                                           |
| Job order completion          | Lock job, reservations, stock balances, FIFO layers, ledger writes                 |
| Inventory reservation/release | Lock stock balance, FIFO layers, reservation/allocation rows                       |
| Inventory adjustment posting  | Lock adjustment, stock balance, FIFO layers, ledger                                |
| Purchase receiving            | Lock PO lines, stock balance, FIFO layers, AP ledger                               |
| Supplier return               | Lock return, stock balance, FIFO layers, AP/credit records                         |
| Supplier payment              | Validate payable balance, write payment/AP ledger atomically                       |
| Inventory transfer            | Lock transfer, lines, source/destination stock, FIFO layers                        |
| Tenant deletion               | Lock deletion job and process tenant data/object manifests retry-safely            |

Document numbers use `document_sequences` with row-level locking. Daily reset sequences: `JO-YYYYMMDD-000001`, `EST-YYYYMMDD-000001`, `PO-YYYYMMDD-000001`, `TR-YYYYMMDD-000001`. Continuous tenant sequences: `{INVOICE_PREFIX}{6_DIGIT_SEQUENCE}` and `RCPT-{6_DIGIT_SEQUENCE}`.

Idempotency flow:

1. Insert key as `processing` scoped by tenant/user/endpoint/intent.
2. On duplicate key, return existing result or safe in-progress/conflict response.
3. Execute business transaction.
4. Persist response.
5. Mark key `succeeded`.

---

## 6. Security, Compliance, and Retention

- Hash passwords, reset tokens, verification tokens, invitation tokens, and refresh tokens.
- Never store card number, CVV, magnetic stripe data, or equivalent cardholder data.
- Store files in encrypted/private object storage; keep metadata only in DB.
- Encrypt backups.
- Preserve append-only audit logs according to retention policy.
- Application authorization checks: user status, email verification, tenant status, tenant membership, permission, branch access, and record scope.
- RLS may enforce tenant boundary as defense-in-depth but must not replace application authorization.
- Tenant deletion removes eligible active production tenant data through audited jobs and manifests while preserving platform-retained audit carveouts.

---

## 7. Migration and Seed Plan

### 7.1 Required Seed Data

- Permission catalog from PRD.
- Standard subscription plans: `basic`, `mid`, `high`.
- Default plan limits.
- Default role templates per tenant.
- Default product categories during onboarding: Engine Oil, Tires, Accessories, Brake Parts, CVT Parts, Lubricants.
- Default expense categories and notification templates only if finalized by product.

### 7.2 Migration Standards

- Prefer small, forward-safe migrations.
- Make migrations reversible where practical.
- Destructive migrations require explicit approval and backup.
- For new non-null columns on populated tables: add nullable, backfill, add constraint, enforce not null.
- Create large production indexes concurrently.
- Keep schema, API DTOs, enum values, and tests synchronized.

### 7.3 Recommended Database Build Order

1. Platform, tenants, users, auth, roles, permissions.
2. Shop profile, settings, branches.
3. Customers, motorcycles, files.
4. Service catalog, estimates, job orders.
5. Products, stock balances, FIFO layers, inventory ledger, reservations.
6. Purchases, suppliers, AP, supplier returns.
7. Invoices, billing allocations, payments, receipts, refunds, AR.
8. Expenses.
9. Reminders, notifications, outbox.
10. Audit logs, idempotency keys, background jobs.
11. Export, offline cache manifests, reporting tables.
12. RLS policies, indexes, partitioning prep, and performance verification.

---

## 8. Required Validation

Database-level tests must prove:

- Tenant A cannot read/write Tenant B data.
- Branch-scoped users cannot access unassigned branch records.
- Duplicate document numbers cannot occur under concurrency.
- Payments cannot exceed invoice balance.
- Refunds cannot exceed refundable amount.
- Billing allocations cannot overbill job order lines.
- Stock cannot become negative and on-hand cannot fall below reserved.
- FIFO reservation/consumption cannot over-allocate and uses oldest layers first.
- Job completion consumes reservations atomically.
- Transfer variance records correct loss quantity and FIFO value.
- Supplier return cannot return unavailable, reserved, consumed, transferred, or already returned stock.
- Receipts, inventory ledgers, and audit logs cannot be edited.
- Read-only tenant blocks operational writes.
- Suspended tenant blocks non-owner operational access.
- Tenant deletion deletes eligible tenant data and preserves retained platform audit records.

Performance tests should cover large-tenant customer search, product search, job boards, daily dashboard, inventory valuation, concurrent FIFO consumption, tenant export with attachments, and audit/entity/date queries.

---

## 9. Risks and Mitigations

| Risk                       | Mitigation                                                          |
| -------------------------- | ------------------------------------------------------------------- |
| FIFO/reservation bugs      | Lock stock/FIFO rows, keep immutable ledger, add concurrency tests  |
| Overbilling or overpayment | Use allocation/payment locks, constraints, and idempotency          |
| Audit/log table growth     | Partition-ready append-only tables and retention-aware indexes      |
| Tenant deletion complexity | Use deletion jobs, manifests, retries, and audit carveouts          |
| Slow reports               | Use materialized/read-model reporting tables                        |
| RLS misconfiguration       | Keep app-layer authorization and test RLS separately                |
| Background job duplication | Use outbox, job locks, idempotency, unique source-event constraints |
| Sequence contention        | Use tenant-scoped sequence rows and short transactions              |
| DB bloat from files        | Store binaries in object storage; DB stores metadata only           |

---

## 10. Open Technical Decisions

These are implementation decisions, not product ambiguities:

1. ORM/query layer: Prisma, Drizzle, TypeORM, Kysely, or direct SQL tooling.
2. ID format finalization: UUIDv7 preferred; ULID acceptable if standardized.
3. RLS adoption timing and policy implementation.
4. Initial physical partitioning timing for append-only tables.
5. Reporting refresh approach: materialized views vs maintained aggregate tables.
6. Object storage provider.
7. Audit enforcement depth: application-only vs database triggers for critical tables.
8. Quantity precision confirmation: default `numeric(14,3)`.
9. Search implementation: PostgreSQL search/read models first; external search only if metrics justify it.

---

## 11. Database Acceptance Criteria

This database design is acceptable when:

- All tenant-owned tables include `tenant_id`.
- All branch-specific operational tables include `tenant_id` and `branch_id`.
- Document numbers are tenant-scoped and unique.
- Inventory cannot change without ledger entries.
- FIFO layers and reservation allocations support oldest-first allocation and consumption.
- Critical service, inventory, purchasing, invoicing, payment, refund, and void/cancel workflows are transaction-safe.
- Payments generate exactly one immutable receipt.
- Issued financial documents preserve tax/pricing snapshots.
- Historical operational records survive deactivation/soft deletion.
- Search supports required surfaces.
- Audit logs cover critical actions and platform support access.
- Idempotency prevents duplicate side effects.
- Reports derive from transactional source data.
- Tenant export/deletion can be executed, retried, and audited.
