# GarageOS Database Design

**Document:** `database-design.md`  
**Source PRD:** `requirements.md` / Motorcycle Shop Management System SaaS PRD v2.4  
**Date:** 2026-06-24  
**Status:** Initial build-ready database design proposal  
**Recommended Database:** PostgreSQL 16+  
**Primary Objective:** Design a secure, tenant-isolated, auditable, transaction-safe relational schema for the complete PRD scope.

---

## 1. Understanding

The PRD defines a mobile-first multi-tenant SaaS for motorcycle repair, accessories, tuning, tire, and service-center operations. The database must support:

- Multi-tenant SaaS lifecycle and subscription enforcement.
- Tenant-wide entities: customers, motorcycles, products, suppliers, roles, permissions, files, audit logs.
- Branch-specific operational records: job orders, invoices, inventory balances, transfers, purchases, expenses, and reports.
- Ledger-based inventory as the source of truth.
- FIFO costing, FIFO reservation allocation, and FIFO consumption.
- Immutable receipts, immutable audit logs, immutable inventory ledger entries, immutable issued financial records.
- Partial/split payments, refunds, voids, accounts receivable, accounts payable.
- Strict role, permission, branch, and tenant isolation.
- Read-only offline cache, but no offline writes.
- Background jobs, idempotency, notifications, exports, backups, and disaster-recovery support.

---

## 2. Panel Review Summary

### 2.1 Product Owner / Business Stakeholder

Primary business concern: the schema must support subscription monetization, branch limits, report tiering, tenant export, deletion, and operational continuity without requiring future rewrites.

Database decision:

- Use a shared relational model with strict `tenant_id` isolation.
- Keep plan configuration, plan overrides, and subscription overrides first-class tables.
- Preserve historical operational records even when branches, users, services, products, suppliers, customers, or motorcycles are deactivated.

### 2.2 Product Manager / Business Analyst

Primary product concern: workflows are complex and state-driven.

Database decision:

- Every workflow with formal statuses must have:
  - A status column.
  - A status history table.
  - Constraints for valid enum values.
  - Service-layer transition validation.
  - Audit log entries for critical state changes.

### 2.3 Senior Database Architect

Primary data concern: inventory, FIFO, invoicing, payments, and accounting-adjacent records must remain consistent under concurrency.

Database decision:

- Use PostgreSQL transactions for all critical writes.
- Use row-level locks on stock balances, FIFO layers, document sequence rows, invoice allocations, and idempotency keys.
- Use immutable ledger tables for inventory, payments, refunds, audit logs, and notification attempts.
- Use fixed-precision decimals for money and quantities.

### 2.4 Senior Backend Engineer / Tech Lead

Primary implementation concern: the database model must be practical to implement through an ORM while still enforcing critical invariants.

Database decision:

- Use UUIDv7 or ULID primary keys for distributed-safe creation and index locality.
- Use composite unique constraints scoped by `tenant_id`.
- Use explicit join tables for roles, branches, tags, mechanics, invoice-job-order links, and files.
- Keep workflow logic in services, but protect critical invariants with database constraints.

### 2.5 Performance & Scalability Engineer

Primary performance concern: tenant-scoped searches, report queries, dashboard queries, and inventory ledger growth.

Database decision:

- Every tenant-owned operational table must have leading `tenant_id` indexes.
- Branch-specific tables must have `(tenant_id, branch_id, ...)` indexes.
- Large append-only tables should be time-partitioned or prepared for partitioning.
- Use materialized reporting tables for high-frequency dashboard/report workloads.
- Use PostgreSQL full-text search and trigram indexes for customer, motorcycle, product, supplier, job order, and invoice search.

### 2.6 Security & Compliance Reviewer

Primary security concern: tenant isolation, password/token safety, card-data exclusion, auditability, and deletion/retention rules.

Database decision:

- Store password hashes only.
- Store reset/invitation/session tokens as hashes.
- Never store card number, CVV, magnetic stripe data, or equivalent cardholder data.
- Enable Row-Level Security for tenant-owned tables if the application stack supports safe claim propagation.
- Maintain append-only audit records with retained platform audit metadata even after tenant deletion.

### 2.7 DevOps / Operations Engineer

Primary operations concern: backup, restore, export, deletion, background jobs, and idempotency.

Database decision:

- Use an outbox/jobs model for notifications, reminders, exports, tenant deletion, lifecycle evaluation, low-stock alerts, and report refreshes.
- Use idempotency keys for client-retryable critical write APIs.
- Include deletion job state tracking and export package manifests.
- Keep database backup policy aligned to RPO 24h and RTO 4h.

### 2.8 QA / Data Integrity Engineer

Primary QA concern: correctness under edge cases.

Database decision:

- Create acceptance-focused constraints and test fixtures for:
  - Tenant isolation.
  - Branch access.
  - No negative stock.
  - No over-reservation.
  - No duplicate document numbers.
  - No overbilling.
  - No overpayment.
  - FIFO correctness.
  - Immutable receipts.
  - Immutable audit logs.
  - Read-only tenant write blocking.

---

## 3. Core Database Decisions

| Decision Area      | Final Recommendation                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Database engine    | PostgreSQL 16+                                                                                |
| Tenancy model      | Shared database, shared schema, tenant isolation by `tenant_id`                               |
| Primary keys       | UUIDv7 or ULID stored as UUID/text depending stack support                                    |
| Tenant IDs         | Required on all tenant-owned business records                                                 |
| Branch IDs         | Required on branch-specific operational records                                               |
| Money type         | `numeric(14,2)` for PHP monetary values                                                       |
| Quantity type      | `numeric(14,3)` for stock quantities; allows fractional consumables                           |
| Timestamps         | `timestamptz` for event timestamps; `date` for business dates                                 |
| Timezone handling  | Store tenant timezone; calculate lifecycle and due-date business rules in tenant timezone     |
| Soft delete        | Use status columns and nullable `deleted_at`; hard delete only through tenant deletion policy |
| Audit              | Append-only audit log; never silently bypassed                                                |
| Inventory truth    | Inventory ledger + FIFO layers + stock balance summary                                        |
| Search             | PostgreSQL FTS + trigram indexes + generated normalized columns                               |
| Reporting          | Transactional source tables + reporting snapshots/materialized views                          |
| Idempotency        | Required for critical client-retryable writes                                                 |
| Background jobs    | Database-backed job/outbox tables with retry metadata                                         |
| Row-level security | Recommended defense-in-depth for tenant-owned tables                                          |

---

## 4. Naming and Modeling Conventions

### 4.1 Table Naming

Use plural snake_case table names:

```text
tenants
branches
customers
motorcycles
job_orders
inventory_ledger_entries
fifo_layers
```

### 4.2 Common Columns

Most mutable tenant-owned tables should include:

```sql
id uuid primary key,
tenant_id uuid not null references tenants(id),
created_at timestamptz not null default now(),
created_by_user_id uuid null references users(id),
updated_at timestamptz not null default now(),
updated_by_user_id uuid null references users(id),
lock_version integer not null default 0
```

Append-only tables should omit `updated_at` unless operationally necessary.

### 4.3 Status Columns

Use lowercase API-safe enum values in the database, even when the UI displays title case.

Example:

```text
job_order.status = pending | in_progress | waiting_for_parts | completed | released | cancelled
```

### 4.4 Normalized Columns

For duplicate detection and unique indexes, store normalized forms:

```text
normalized_email
normalized_mobile
normalized_name
normalized_plate_number
normalized_engine_number
normalized_chassis_number
normalized_sku
normalized_barcode
```

### 4.5 JSONB Usage Rule

Use `jsonb` only for:

- Audit metadata.
- Provider payloads.
- Export manifests.
- Notification provider responses.
- Non-query-critical settings.

Do not store core transactional facts only in JSONB.

---

## 5. Multi-Tenant Isolation Design

### 5.1 Isolation Rule

Every tenant-owned business table must include `tenant_id`.

Every branch-specific table must include both:

```text
tenant_id
branch_id
```

This is required even when `branch_id` references a branch that already has `tenant_id`, because it enables:

- Efficient tenant-scoped indexes.
- Safer composite foreign keys.
- Easier tenant deletion.
- Branch access enforcement.
- Query plans that do not need extra joins just to filter tenant.

### 5.2 Composite Foreign Keys

For branch-specific records, use composite keys where practical:

```sql
foreign key (tenant_id, branch_id)
references branches(tenant_id, id)
```

For records linking tenant-owned entities:

```sql
foreign key (tenant_id, customer_id)
references customers(tenant_id, id)
```

### 5.3 Row-Level Security Recommendation

If using PostgreSQL directly or through a stack that can safely set request-local claims, enable RLS:

```sql
alter table customers enable row level security;

create policy tenant_isolation_customers
on customers
using (tenant_id = current_setting('app.tenant_id')::uuid);
```

For platform support sessions, use a controlled `app.support_tenant_id` claim and audit the support access session separately.

RLS should be defense-in-depth, not the only authorization layer.

---

## 6. Schema Domains

The database should be organized into these logical domains:

1. Platform and subscription lifecycle.
2. Authentication, employees, roles, permissions.
3. Shop settings and branches.
4. Customers and motorcycles.
5. Service catalog, estimates, and job orders.
6. Inventory, FIFO, transfers, and adjustments.
7. Suppliers, purchases, supplier payments, and accounts payable.
8. Invoices, payments, receipts, refunds, and accounts receivable.
9. Expenses.
10. Reminders and notifications.
11. Files and export.
12. Reports and dashboard snapshots.
13. Audit, security, idempotency, jobs, and observability.

A single PostgreSQL schema such as `public` or `app` is acceptable initially. Separate schemas such as `audit`, `reporting`, and `ops` may be introduced if the team wants stronger operational boundaries.

---

## 7. Core Table Catalog

This section lists the build-scope table design. Columns are representative but intentionally concrete enough to drive migrations.

---

## 8. Platform, Plans, and Tenant Lifecycle

### 8.1 Tables

| Table                              | Purpose                                     | Key Columns                                                                                                                                                                                                       | Important Constraints / Indexes                                                                   |
| ---------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `tenants`                          | SaaS tenant account                         | `id`, `business_name`, `normalized_business_name`, `shop_email`, `normalized_shop_email`, `status`, `timezone`, `country`, `currency`, `onboarding_completed_at`, `deleted_at`                                    | Partial unique index on active duplicate tenant detection fields; status enum                     |
| `shop_profiles`                    | Tenant shop profile                         | `tenant_id`, `shop_name`, `address`, `contact_number`, `email`, `logo_file_id`, `business_hours_json`, `tax_profile`, `tax_mode`, `vat_rate`, `invoice_prefix`, `receipt_footer_text`, `default_invoice_due_days` | `tenant_id` unique; invoice prefix pattern check; immutable fields protected by service and audit |
| `subscription_plans`               | Platform-controlled plans                   | `id`, `code`, `name`, `status`, `is_default`, `default_duration_days`                                                                                                                                             | Unique `code`; only one default active plan                                                       |
| `subscription_plan_limits`         | Plan capabilities                           | `plan_id`, `capability_code`, `value_type`, `numeric_value`, `boolean_value`                                                                                                                                      | Unique `(plan_id, capability_code)`                                                               |
| `tenant_subscriptions`             | Tenant subscription state                   | `tenant_id`, `plan_id`, `start_date`, `expiration_date`, `status_source`, `last_renewal_at`, `updated_by_platform_admin_user_id`                                                                                  | `tenant_id` unique; date checks                                                                   |
| `tenant_plan_overrides`            | Tenant-specific plan limits                 | `tenant_id`, `capability_code`, `override_value`, `reason`, `created_by_platform_admin_user_id`, `effective_at`, `expires_at`                                                                                     | Index `(tenant_id, capability_code, expires_at)`                                                  |
| `subscription_overrides`           | Explicit admin lifecycle overrides          | `tenant_id`, `override_type`, `previous_value`, `new_value`, `reason`, `effective_at`, `expires_at`, `created_by_platform_admin_user_id`                                                                          | Index active overrides by tenant                                                                  |
| `tenant_lifecycle_events`          | System/admin subscription lifecycle history | `tenant_id`, `from_status`, `to_status`, `source`, `reason`, `effective_at`                                                                                                                                       | Append-only; index `(tenant_id, effective_at desc)`                                               |
| `platform_support_access_sessions` | Audited platform support access             | `tenant_id`, `platform_admin_user_id`, `access_mode`, `reason`, `started_at`, `expires_at`, `ended_at`                                                                                                            | Index active support sessions                                                                     |
| `tenant_deletion_jobs`             | Tenant deletion execution tracking          | `tenant_id`, `scheduled_for`, `status`, `started_at`, `completed_at`, `failure_reason`, `attempt_count`                                                                                                           | Unique active job per tenant                                                                      |

### 8.2 Tenant Status Enum

```text
pending_setup
active
grace_period
read_only
suspended
pending_deletion
deleted
```

### 8.3 Key Design Rules

- `tenants.status` is the currently effective access status.
- `tenant_subscriptions` stores the subscription facts.
- `subscription_overrides` stores admin override facts.
- A scheduled lifecycle job recalculates `tenants.status` from subscription dates and active overrides.
- Operational writes must check effective tenant status before mutation.
- Tenant deletion must run inside a transaction for database records that can be deleted transactionally. Object storage deletion must be coordinated through export/deletion manifests and retryable jobs.

---

## 9. Authentication, Employees, Roles, and Permissions

### 9.1 Tables

| Table                       | Purpose                           | Key Columns                                                                                                                                                      | Important Constraints / Indexes                                                                                       |
| --------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `users`                     | Login identity                    | `id`, `tenant_id`, `user_type`, `email`, `normalized_email`, `password_hash`, `email_verified_at`, `status`, `full_name`, `mobile_number`, `password_changed_at` | Partial unique active normalized email globally; tenant users have `tenant_id`; platform admins have `tenant_id null` |
| `employee_profiles`         | Tenant employee details           | `id`, `tenant_id`, `user_id`, `full_name`, `mobile_number`, `status`, `tenant_wide_branch_access`                                                                | Unique `(tenant_id, user_id)`                                                                                         |
| `roles`                     | Tenant roles and seeded templates | `id`, `tenant_id`, `name`, `normalized_name`, `role_type`, `is_seeded_template`, `status`                                                                        | Unique active `(tenant_id, normalized_name)`                                                                          |
| `permissions`               | Global action permissions         | `id`, `code`, `description`, `category`                                                                                                                          | Unique `code`                                                                                                         |
| `role_permissions`          | Role permission assignments       | `tenant_id`, `role_id`, `permission_id`                                                                                                                          | Unique `(role_id, permission_id)`                                                                                     |
| `user_roles`                | User/employee role assignments    | `tenant_id`, `user_id`, `role_id`, `assigned_at`, `assigned_by_user_id`                                                                                          | Unique active `(tenant_id, user_id, role_id)`                                                                         |
| `user_branch_assignments`   | Employee branch access            | `tenant_id`, `user_id`, `branch_id`, `assigned_at`, `removed_at`                                                                                                 | Unique active `(tenant_id, user_id, branch_id)`                                                                       |
| `employee_invitations`      | Employee invitation flow          | `tenant_id`, `email`, `normalized_email`, `token_hash`, `status`, `expires_at`, `accepted_at`, `assigned_role_config_json`, `assigned_branch_config_json`        | Unique unused token hash; index `(tenant_id, normalized_email, status)`                                               |
| `password_reset_tokens`     | Reset tokens                      | `user_id`, `token_hash`, `expires_at`, `used_at`                                                                                                                 | Unique token hash; index active by user                                                                               |
| `email_verification_tokens` | Email verification                | `user_id`, `token_hash`, `email`, `expires_at`, `used_at`                                                                                                        | Unique token hash                                                                                                     |
| `refresh_sessions`          | Refresh-token rotation            | `user_id`, `tenant_id`, `token_family_id`, `refresh_token_hash`, `remember_me`, `expires_at`, `revoked_at`, `replaced_by_session_id`                             | Index active sessions by user                                                                                         |
| `login_attempts`            | Login protection evidence         | `normalized_email`, `ip_address`, `attempted_at`, `success`, `blocked_until`                                                                                     | Index `(normalized_email, attempted_at desc)`, `(ip_address, attempted_at desc)`                                      |

### 9.2 User Type Enum

```text
tenant_user
platform_admin
```

### 9.3 Employee Status Enum

```text
active
inactive
```

### 9.4 Database Rules

- Passwords are stored only as Argon2id or bcrypt hashes.
- Invitation, reset, verification, and refresh tokens are stored only as hashes.
- The last active Shop Owner rule is enforced by service logic and protected with a transaction locking active owner assignments.
- Role template changes are audited and immediately affect effective permissions.

---

## 10. Shop Settings and Branches

### 10.1 Tables

| Table                      | Purpose                  | Key Columns                                                                                                                                    | Important Constraints / Indexes                                           |
| -------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `branches`                 | Tenant shop branches     | `id`, `tenant_id`, `name`, `normalized_name`, `address`, `contact_number`, `business_hours_json`, `status`, `deactivated_at`, `reactivated_at` | Unique active `(tenant_id, normalized_name)`; index `(tenant_id, status)` |
| `branch_status_events`     | Branch lifecycle history | `tenant_id`, `branch_id`, `from_status`, `to_status`, `reason`, `created_by_user_id`, `created_at`                                             | Append-only                                                               |
| `tenant_settings`          | Misc tenant settings     | `tenant_id`, `setting_key`, `setting_value_json`, `updated_by_user_id`                                                                         | Unique `(tenant_id, setting_key)`                                         |
| `timezone_change_requests` | Timezone change control  | `tenant_id`, `old_timezone`, `new_timezone`, `status`, `reason`, `requested_by_user_id`, `approved_by_platform_admin_user_id`                  | Index `(tenant_id, status)`                                               |

### 10.2 Branch Status Enum

```text
active
inactive
```

### 10.3 Important Branch Deactivation Checks

Before setting a branch inactive, the service must verify:

- It is not the last active branch.
- No open job orders.
- No open purchase orders.
- No draft/pending/in-transit transfers.
- No active inventory reservations.
- No non-zero on-hand inventory.
- No unposted stock-affecting records.

These checks should run in one transaction with appropriate row locks.

---

## 11. Customers and Motorcycles

### 11.1 Tables

| Table                       | Purpose                      | Key Columns                                                                                                                                                                                                                            | Important Constraints / Indexes                                             |
| --------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `customers`                 | Tenant-wide customer records | `id`, `tenant_id`, `name`, `normalized_name`, `mobile_number`, `normalized_mobile`, `email`, `normalized_email`, `address`, `birthday`, `notes`, `status`, `merged_into_customer_id`, `deleted_at`                                     | Partial unique active exact email/mobile if configured; FTS/trigram indexes |
| `customer_tags`             | Tenant tag catalog           | `id`, `tenant_id`, `name`, `normalized_name`, `status`                                                                                                                                                                                 | Unique active `(tenant_id, normalized_name)`                                |
| `customer_tag_assignments`  | Tags assigned to customers   | `tenant_id`, `customer_id`, `tag_id`                                                                                                                                                                                                   | Unique `(tenant_id, customer_id, tag_id)`                                   |
| `customer_merge_events`     | Merge history                | `tenant_id`, `source_customer_id`, `surviving_customer_id`, `reason`, `created_by_user_id`, `created_at`                                                                                                                               | Append-only                                                                 |
| `motorcycles`               | Tenant-wide motorcycles      | `id`, `tenant_id`, `customer_id`, `brand`, `model`, `year`, `color`, `plate_number`, `normalized_plate_number`, `engine_number`, `normalized_engine_number`, `chassis_number`, `normalized_chassis_number`, `latest_mileage`, `status` | Partial unique active exact plate/engine/chassis when present; FTS/trigram  |
| `motorcycle_mileage_events` | Mileage correction/history   | `tenant_id`, `motorcycle_id`, `source_type`, `source_id`, `previous_mileage`, `new_mileage`, `reason`, `created_by_user_id`, `created_at`                                                                                              | Index `(tenant_id, motorcycle_id, created_at desc)`                         |

### 11.2 Customer Status Enum

```text
active
merged
soft_deleted
```

### 11.3 Motorcycle Status Enum

```text
active
soft_deleted
```

### 11.4 Search Strategy

Use both:

- Normalized exact-match columns for duplicate detection.
- FTS/trigram indexes for user search.

Recommended generated search document table:

| Table                       | Purpose                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `customer_search_documents` | Denormalized tenant-scoped search rows combining customer name/contact/tags and motorcycle identifiers. |

Columns:

```text
tenant_id
customer_id
search_vector
search_text
updated_at
```

Indexes:

```sql
create index idx_customer_search_vector
on customer_search_documents using gin(search_vector);

create index idx_customer_search_trgm
on customer_search_documents using gin(search_text gin_trgm_ops);
```

---

## 12. Service Catalog, Estimates, and Job Orders

### 12.1 Service Catalog Tables

| Table                   | Purpose                    | Key Columns                                                                                                                   | Important Constraints / Indexes              |
| ----------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `services`              | Predefined service catalog | `id`, `tenant_id`, `name`, `normalized_name`, `starting_price`, `variable_price`, `price_disclaimer`, `description`, `status` | Unique active `(tenant_id, normalized_name)` |
| `service_status_events` | Service lifecycle history  | `tenant_id`, `service_id`, `from_status`, `to_status`, `reason`, `created_by_user_id`                                         | Append-only                                  |

### 12.2 Estimate Tables

| Table                    | Purpose                 | Key Columns                                                                                                                                                                                              | Important Constraints / Indexes                                               |
| ------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `estimates`              | Service quotations      | `id`, `tenant_id`, `branch_id`, `customer_id`, `motorcycle_id`, `estimate_number`, `status`, `valid_until_date`, `approval_method`, `approved_by_customer_name`, `approved_at`, `converted_job_order_id` | Unique `(tenant_id, estimate_number)`; index `(tenant_id, branch_id, status)` |
| `estimate_lines`         | Estimate line items     | `id`, `tenant_id`, `estimate_id`, `line_type`, `service_id`, `product_id`, `description`, `quantity`, `unit_price`, `line_total`, `line_order`                                                           | Check quantity/amount non-negative                                            |
| `estimate_status_events` | Estimate status history | `tenant_id`, `estimate_id`, `from_status`, `to_status`, `reason`, `created_by_user_id`, `created_at`                                                                                                     | Append-only                                                                   |

### 12.3 Job Order Tables

| Table                          | Purpose                          | Key Columns                                                                                                                                                                                                                                                       | Important Constraints / Indexes                                                                 |
| ------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `job_orders`                   | Service work orders              | `id`, `tenant_id`, `branch_id`, `customer_id`, `motorcycle_id`, `job_order_number`, `status`, `service_advisor_user_id`, `primary_mechanic_user_id`, `mileage_at_intake`, `customer_concern`, `internal_notes`, `completed_at`, `released_at`, `no_charge_reason` | Unique `(tenant_id, job_order_number)`; index `(tenant_id, branch_id, status, created_at desc)` |
| `job_order_status_events`      | Job status history               | `tenant_id`, `job_order_id`, `from_status`, `to_status`, `reason`, `created_by_user_id`, `created_at`                                                                                                                                                             | Append-only                                                                                     |
| `job_order_mechanics`          | Additional mechanics             | `tenant_id`, `job_order_id`, `user_id`, `assignment_type`, `assigned_at`, `removed_at`                                                                                                                                                                            | Unique active assignment                                                                        |
| `job_order_lines`              | Labor/service/part lines         | `id`, `tenant_id`, `job_order_id`, `line_type`, `service_id`, `product_id`, `description`, `quantity`, `unit_price`, `authorized_amount`, `status`, `inventory_reservation_id`, `completed_at`, `line_order`                                                      | Index `(tenant_id, job_order_id)`                                                               |
| `job_order_line_snapshots`     | Historical copied catalog values | `tenant_id`, `job_order_line_id`, `source_name`, `source_price`, `source_disclaimer`, `captured_at`                                                                                                                                                               | One snapshot per source-backed line                                                             |
| `mechanic_work_sessions`       | Mechanic time tracking           | `id`, `tenant_id`, `branch_id`, `job_order_id`, `mechanic_user_id`, `status`, `started_at`, `finished_at`, `total_active_seconds`, `notes`                                                                                                                        | Partial unique one unfinished session per mechanic                                              |
| `mechanic_work_session_pauses` | Pause intervals                  | `id`, `tenant_id`, `work_session_id`, `paused_at`, `resumed_at`, `resumed_by_user_id`                                                                                                                                                                             | Check resume after pause                                                                        |

### 12.4 Job Order Status Enum

```text
pending
in_progress
waiting_for_parts
completed
released
cancelled
```

### 12.5 Job Order Line Type Enum

```text
service
labor
part
```

### 12.6 Key Constraints

- A mechanic cannot have more than one unfinished session:

```sql
create unique index ux_one_unfinished_session_per_mechanic
on mechanic_work_sessions(tenant_id, mechanic_user_id)
where finished_at is null;
```

- Released and cancelled job orders are final; enforce through service transition logic and audit.
- Consumed part lines cannot be directly edited after completion.

---

## 13. Inventory, FIFO, Reservations, Transfers, and Adjustments

This is the highest-risk domain. Treat inventory writes as serialized business transactions.

### 13.1 Inventory Core Tables

| Table                          | Purpose                                 | Key Columns                                                                                                                                                                                                                    | Important Constraints / Indexes                                                                                       |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `product_categories`           | Tenant product categories               | `id`, `tenant_id`, `name`, `normalized_name`, `status`                                                                                                                                                                         | Unique active `(tenant_id, normalized_name)`                                                                          |
| `products`                     | Tenant product catalog                  | `id`, `tenant_id`, `category_id`, `name`, `normalized_name`, `sku`, `normalized_sku`, `barcode`, `normalized_barcode`, `supplier_code`, `brand`, `unit_of_measure`, `default_cost`, `selling_price`, `reorder_level`, `status` | Unique `(tenant_id, normalized_sku)` across active/inactive; partial unique active barcode                            |
| `stock_balances`               | Current branch/product quantity summary | `tenant_id`, `branch_id`, `product_id`, `on_hand_qty`, `reserved_qty`, `available_qty_generated`, `updated_at`, `lock_version`                                                                                                 | PK `(tenant_id, branch_id, product_id)`; check `on_hand_qty >= 0`, `reserved_qty >= 0`, `on_hand_qty >= reserved_qty` |
| `inventory_ledger_entries`     | Immutable stock movement ledger         | `id`, `tenant_id`, `branch_id`, `product_id`, `transaction_type`, `quantity_delta_on_hand`, `quantity_delta_reserved`, `unit_cost`, `total_cost`, `source_type`, `source_id`, `occurred_at`, `created_by_user_id`              | Append-only; index `(tenant_id, branch_id, product_id, occurred_at desc)`                                             |
| `fifo_layers`                  | FIFO cost layers                        | `id`, `tenant_id`, `branch_id`, `product_id`, `quantity_received`, `remaining_quantity`, `unit_cost`, `source_transaction_type`, `source_transaction_id`, `received_at`, `original_source_layer_id`                            | Index open FIFO `(tenant_id, branch_id, product_id, received_at, id) where remaining_quantity > 0`                    |
| `fifo_consumptions`            | FIFO consumption history                | `id`, `tenant_id`, `branch_id`, `product_id`, `fifo_layer_id`, `quantity_consumed`, `unit_cost`, `total_cost`, `source_type`, `source_id`, `consumed_at`                                                                       | Index `(tenant_id, source_type, source_id)`                                                                           |
| `inventory_reservations`       | Active/released/consumed reservations   | `id`, `tenant_id`, `branch_id`, `product_id`, `source_type`, `source_id`, `requested_quantity`, `reserved_quantity`, `status`, `reserved_at`, `released_at`, `consumed_at`                                                     | Index active by product/branch                                                                                        |
| `fifo_reservation_allocations` | FIFO layer allocation for reservations  | `id`, `tenant_id`, `reservation_id`, `fifo_layer_id`, `reserved_quantity`, `unit_cost_snapshot`, `status`, `allocated_at`, `released_at`, `consumed_at`                                                                        | Index active allocations by FIFO layer                                                                                |

### 13.2 Inventory Transaction Type Enum

```text
purchase_receive
job_order_reservation
reservation_release
job_order_consumption
inventory_adjustment_increase
inventory_adjustment_decrease
inventory_transfer_reservation
inventory_transfer_reservation_release
inventory_transfer_out
inventory_transfer_in
inventory_transfer_variance_loss
supplier_return
refund_inventory_reversal
void_inventory_reversal
```

### 13.3 Inventory Reservation Status Enum

```text
active
released
consumed
cancelled
```

### 13.4 FIFO Allocation Rule

When reserving stock:

1. Lock `stock_balances` for `(tenant_id, branch_id, product_id)`.
2. Verify `on_hand_qty - reserved_qty >= requested_qty`.
3. Select open FIFO layers ordered by `(received_at, id)` with `FOR UPDATE`.
4. Allocate from oldest layers using:

```text
allocatable = fifo_layers.remaining_quantity - sum(active fifo_reservation_allocations.reserved_quantity)
```

5. Insert `inventory_reservations`.
6. Insert `fifo_reservation_allocations`.
7. Increase `stock_balances.reserved_qty`.
8. Insert immutable `inventory_ledger_entries`.

### 13.5 FIFO Consumption Rule

When consuming a reservation:

1. Lock reservation.
2. Lock stock balance.
3. Lock allocated FIFO layers.
4. Convert allocation records from `active` to `consumed`.
5. Decrease FIFO layer `remaining_quantity`.
6. Decrease `stock_balances.on_hand_qty`.
7. Decrease `stock_balances.reserved_qty`.
8. Insert `fifo_consumptions`.
9. Insert `inventory_ledger_entries`.
10. Complete all in one transaction.

### 13.6 Inventory Adjustment Tables

| Table                                | Purpose                            | Key Columns                                                                                                                                                              | Important Constraints / Indexes                                  |
| ------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `inventory_adjustments`              | Adjustment request/workflow header | `id`, `tenant_id`, `branch_id`, `adjustment_number`, `status`, `reason`, `value_impact`, `approval_required`, `requested_by_user_id`, `approved_by_user_id`, `posted_at` | Unique `(tenant_id, adjustment_number)`; index pending approvals |
| `inventory_adjustment_lines`         | Product-level adjustments          | `id`, `tenant_id`, `adjustment_id`, `product_id`, `adjustment_type`, `quantity_difference`, `final_counted_quantity`, `unit_cost`, `estimated_fifo_cost`                 | Check valid quantity                                             |
| `inventory_adjustment_status_events` | Status history                     | `tenant_id`, `adjustment_id`, `from_status`, `to_status`, `reason`, `created_by_user_id`, `created_at`                                                                   | Append-only                                                      |

Inventory adjustment status enum:

```text
draft
pending_approval
approved
posted
rejected
cancelled
```

### 13.7 Inventory Transfer Tables

| Table                              | Purpose                | Key Columns                                                                                                                                                                                      | Important Constraints / Indexes                                    |
| ---------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `inventory_transfers`              | Branch transfer header | `id`, `tenant_id`, `transfer_number`, `source_branch_id`, `destination_branch_id`, `status`, `created_by_user_id`, `sent_by_user_id`, `received_by_user_id`, `sent_at`, `received_at`, `remarks` | Unique `(tenant_id, transfer_number)`; check source != destination |
| `inventory_transfer_lines`         | Transfer products      | `id`, `tenant_id`, `transfer_id`, `product_id`, `requested_quantity`, `reserved_quantity`, `sent_quantity`, `received_quantity`, `variance_quantity`, `variance_reason`, `reservation_id`        | Check non-negative quantities                                      |
| `inventory_transfer_status_events` | Status history         | `tenant_id`, `transfer_id`, `from_status`, `to_status`, `reason`, `created_by_user_id`, `created_at`                                                                                             | Append-only                                                        |

Inventory transfer status enum:

```text
draft
pending
in_transit
received
cancelled
```

### 13.8 Inventory Performance Indexes

```sql
create index idx_stock_balances_branch_product
on stock_balances(tenant_id, branch_id, product_id);

create index idx_inventory_ledger_product_date
on inventory_ledger_entries(tenant_id, branch_id, product_id, occurred_at desc);

create index idx_fifo_open_layers
on fifo_layers(tenant_id, branch_id, product_id, received_at, id)
where remaining_quantity > 0;

create index idx_active_reservations
on inventory_reservations(tenant_id, branch_id, product_id, status)
where status = 'active';

create index idx_active_fifo_allocations
on fifo_reservation_allocations(tenant_id, fifo_layer_id, status)
where status = 'active';
```

### 13.9 Partitioning Recommendation

Prepare these append-only tables for monthly partitioning after volume justifies it:

- `inventory_ledger_entries`
- `fifo_consumptions`
- `audit_logs`
- `notification_attempts`
- `background_job_attempts`

Partitioning is not required for day-one launch, but table definitions and indexes should avoid assumptions that block future partitioning.

---

## 14. Suppliers, Purchases, Returns, and Accounts Payable

### 14.1 Supplier Tables

| Table                    | Purpose                    | Key Columns                                                                                                            | Important Constraints / Indexes              |
| ------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `suppliers`              | Tenant supplier catalog    | `id`, `tenant_id`, `name`, `normalized_name`, `contact_person`, `mobile_number`, `email`, `address`, `notes`, `status` | Unique active `(tenant_id, normalized_name)` |
| `supplier_status_events` | Supplier lifecycle history | `tenant_id`, `supplier_id`, `from_status`, `to_status`, `reason`, `created_by_user_id`, `created_at`                   | Append-only                                  |

### 14.2 Purchase Tables

| Table                          | Purpose                      | Key Columns                                                                                                                                                    | Important Constraints / Indexes                                                     |
| ------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `purchase_orders`              | Purchase order header        | `id`, `tenant_id`, `branch_id`, `supplier_id`, `purchase_order_number`, `status`, `payment_terms`, `order_date`, `expected_receive_date`, `created_by_user_id` | Unique `(tenant_id, purchase_order_number)`; index `(tenant_id, branch_id, status)` |
| `purchase_order_lines`         | Ordered products             | `id`, `tenant_id`, `purchase_order_id`, `product_id`, `ordered_quantity`, `received_quantity`, `unit_cost`, `line_total`, `notes`                              | Check quantities                                                                    |
| `purchase_receivings`          | Receiving transaction header | `id`, `tenant_id`, `branch_id`, `purchase_order_id`, `supplier_id`, `received_at`, `received_by_user_id`, `payment_method`, `payment_reference`, `posted_at`   | Index `(tenant_id, purchase_order_id)`                                              |
| `purchase_receiving_lines`     | Received product rows        | `id`, `tenant_id`, `receiving_id`, `purchase_order_line_id`, `product_id`, `received_quantity`, `received_unit_cost`, `fifo_layer_id`                          | Posted rows immutable                                                               |
| `purchase_order_status_events` | PO status history            | `tenant_id`, `purchase_order_id`, `from_status`, `to_status`, `reason`, `created_by_user_id`, `created_at`                                                     | Append-only                                                                         |

Purchase order status enum:

```text
draft
ordered
partially_received
received
closed
cancelled
```

### 14.3 Accounts Payable Tables

| Table                   | Purpose                   | Key Columns                                                                                                                     | Important Constraints / Indexes                  |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `supplier_payables`     | Optional AP source ledger | `id`, `tenant_id`, `supplier_id`, `branch_id`, `source_type`, `source_id`, `amount_delta`, `occurred_at`                        | Sum by supplier gives AP balance                 |
| `supplier_payments`     | Manual supplier payments  | `id`, `tenant_id`, `supplier_id`, `amount`, `payment_date`, `payment_method`, `reference_number`, `notes`, `created_by_user_id` | Check amount > 0                                 |
| `supplier_credits`      | Supplier credits          | `id`, `tenant_id`, `supplier_id`, `branch_id`, `amount`, `reason`, `source_type`, `source_id`, `created_by_user_id`             | Check amount > 0                                 |
| `supplier_returns`      | Supplier return header    | `id`, `tenant_id`, `branch_id`, `supplier_id`, `original_receiving_id`, `status`, `reason`, `posted_at`, `created_by_user_id`   | Index `(tenant_id, supplier_id, posted_at desc)` |
| `supplier_return_lines` | Supplier return products  | `id`, `tenant_id`, `supplier_return_id`, `product_id`, `returned_quantity`, `inventory_value`, `financial_value`                | Check returned quantity > 0                      |

### 14.4 AP Balance Recommendation

Use an append-only `supplier_payables` ledger for AP-impacting events.

Balance formula:

```text
Supplier Balance = sum(amount_delta)
```

Where:

- Credit purchase receiving creates positive `amount_delta`.
- Supplier payment creates negative `amount_delta`.
- Supplier credit creates negative `amount_delta`.
- Supplier return may create negative payable or supplier credit depending payment state.

This is safer than recalculating from heterogeneous source tables on every query.

---

## 15. Invoices, Billing Allocations, Payments, Receipts, Refunds, and AR

### 15.1 Invoice Tables

| Table                         | Purpose                             | Key Columns                                                                                                                                                                                                                                                                                                                                    | Important Constraints / Indexes                       |
| ----------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `invoices`                    | Invoice header                      | `id`, `tenant_id`, `branch_id`, `customer_id`, `invoice_number`, `status`, `invoice_date`, `due_date`, `subtotal`, `line_discount_total`, `invoice_discount_total`, `tax_total`, `total`, `net_paid_amount`, `remaining_collectible_balance`, `tax_profile_snapshot`, `tax_mode_snapshot`, `vat_rate_snapshot`, `discount_reason`, `issued_at` | Unique `(tenant_id, invoice_number)`; index AR status |
| `invoice_lines`               | Invoice line items                  | `id`, `tenant_id`, `invoice_id`, `job_order_line_id`, `line_type`, `product_id`, `service_id`, `description`, `quantity`, `unit_price`, `line_discount_amount`, `allocated_invoice_discount_amount`, `taxable_amount`, `tax_amount`, `line_total`, `line_order`                                                                                | Check totals non-negative                             |
| `invoice_job_orders`          | Invoice-job-order links             | `tenant_id`, `invoice_id`, `job_order_id`                                                                                                                                                                                                                                                                                                      | Unique `(tenant_id, invoice_id, job_order_id)`        |
| `invoice_billing_allocations` | Prevent overbilling job order lines | `id`, `tenant_id`, `invoice_id`, `invoice_line_id`, `job_order_line_id`, `allocated_quantity`, `allocated_amount`, `status`                                                                                                                                                                                                                    | Index active allocations by job order line            |
| `invoice_status_events`       | Invoice status history              | `tenant_id`, `invoice_id`, `from_status`, `to_status`, `reason`, `created_by_user_id`, `created_at`                                                                                                                                                                                                                                            | Append-only                                           |

Invoice status enum:

```text
draft
pending
partially_paid
paid
overdue
cancelled
voided
refunded
```

Invoice allocation status enum:

```text
reserved
final
released
closed
```

### 15.2 Payment and Receipt Tables

| Table                        | Purpose                      | Key Columns                                                                                                                                               | Important Constraints / Indexes                                        |
| ---------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `payments`                   | Customer payment records     | `id`, `tenant_id`, `invoice_id`, `amount`, `payment_date`, `payment_method`, `reference_number`, `refundable_amount`, `created_by_user_id`                | Check amount > 0; immutable                                            |
| `receipts`                   | Immutable receipt proof      | `id`, `tenant_id`, `payment_id`, `receipt_number`, `amount`, `payment_method_snapshot`, `receipt_date`, `customer_id`, `invoice_id`                       | Unique `(tenant_id, receipt_number)`; unique `(tenant_id, payment_id)` |
| `refunds`                    | Payment refunds              | `id`, `tenant_id`, `invoice_id`, `payment_id`, `amount`, `reason`, `collection_should_continue`, `close_after_refund`, `created_by_user_id`, `created_at` | Check amount > 0                                                       |
| `refund_inventory_reversals` | Returned parts during refund | `id`, `tenant_id`, `refund_id`, `job_order_line_id`, `product_id`, `quantity_returned`, `inventory_ledger_entry_id`, `fifo_layer_id`                      | Prevent over-return by source line                                     |
| `void_inventory_reversals`   | Returned parts during void   | `id`, `tenant_id`, `invoice_id`, `job_order_line_id`, `product_id`, `quantity_returned`, `inventory_ledger_entry_id`, `fifo_layer_id`                     | Prevent over-return by source line                                     |

Payment method enum:

```text
cash
gcash
maya
bank_transfer
credit_card
check
other
```

### 15.3 Accounts Receivable Design

Use invoice fields for fast AR queries:

- `net_paid_amount`
- `remaining_collectible_balance`
- `due_date`
- `status`

Optional append-only AR ledger:

| Table                        | Purpose                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `accounts_receivable_ledger` | Optional ledger of invoice issue/payment/refund/void AR effects. Useful for audit-heavy financial reporting. |

Recommended AR query index:

```sql
create index idx_invoices_ar
on invoices(tenant_id, branch_id, status, due_date)
where remaining_collectible_balance > 0
  and status in ('pending', 'partially_paid', 'overdue');
```

### 15.4 Critical Invoice Allocation Rule

When creating or updating a draft invoice:

1. Lock source `job_order_lines`.
2. Lock existing non-released allocations for those lines.
3. Calculate remaining billable quantity/amount.
4. Insert or update `invoice_billing_allocations` as `reserved`.
5. Block negative remaining billable values.
6. Commit together with invoice draft changes.

When issuing:

- Change allocations from `reserved` to `final`.

When cancelling or voiding:

- Change allocations to `released`.

When refunding with explicit closure:

- Change allocations to `closed`.

---

## 16. Expenses

### 16.1 Tables

| Table                   | Purpose                     | Key Columns                                                                                                                                                                 | Important Constraints / Indexes                   |
| ----------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `expense_categories`    | Tenant expense categories   | `id`, `tenant_id`, `name`, `normalized_name`, `status`                                                                                                                      | Unique active `(tenant_id, normalized_name)`      |
| `expenses`              | Expense records             | `id`, `tenant_id`, `branch_id`, `category_id`, `expense_date`, `amount`, `payment_method`, `reference_number`, `description`, `status`, `void_reason`, `created_by_user_id` | Index `(tenant_id, branch_id, expense_date desc)` |
| `expense_status_events` | Expense status/edit history | `tenant_id`, `expense_id`, `from_status`, `to_status`, `reason`, `created_by_user_id`, `created_at`                                                                         | Append-only                                       |

Expense status enum:

```text
active
voided
```

Edits should preserve history through audit logs and, if financial reports require exact restatement history, through `expense_status_events` or `expense_versions`.

---

## 17. Reminders and Internal Notifications

### 17.1 Reminder Tables

| Table                    | Purpose                          | Key Columns                                                                                                                                                     | Important Constraints / Indexes               |
| ------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `reminder_rules`         | Tenant reminder configuration    | `id`, `tenant_id`, `name`, `reminder_type`, `channel`, `status`, `schedule_config_json`, `template_id`                                                          | Index active by tenant/type                   |
| `customer_reminders`     | Concrete reminder instances      | `id`, `tenant_id`, `customer_id`, `motorcycle_id`, `job_order_id`, `reminder_type`, `channel`, `status`, `scheduled_for`, `sent_at`, `cancelled_at`             | Index due reminders `(status, scheduled_for)` |
| `notification_templates` | Tenant/system templates          | `id`, `tenant_id`, `template_type`, `channel`, `subject`, `body`, `status`                                                                                      | Unique active template per type/channel       |
| `notification_outbox`    | Provider-send outbox             | `id`, `tenant_id`, `recipient_type`, `recipient_id`, `channel`, `destination`, `subject`, `body`, `status`, `scheduled_for`, `attempt_count`, `next_attempt_at` | Index due sends                               |
| `notification_attempts`  | Send attempts/provider responses | `notification_outbox_id`, `attempt_number`, `provider`, `provider_message_id`, `status`, `response_json`, `attempted_at`                                        | Append-only                                   |
| `in_app_notifications`   | User-visible notifications       | `id`, `tenant_id`, `user_id`, `type`, `title`, `body`, `read_at`, `created_at`                                                                                  | Index unread by user                          |

### 17.2 Notification Status Enum

```text
pending
processing
sent
failed
cancelled
suppressed
```

### 17.3 Plan Enforcement

Before inserting sendable reminder/notification outbox rows, the application must check tenant plan channel availability. Database can support this with plan tables, but channel enforcement remains service-layer logic.

---

## 18. File Management, Export, and Offline Cache

### 18.1 File Tables

| Table                | Purpose                       | Key Columns                                                                                                                                                                                       | Important Constraints / Indexes               |
| -------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `files`              | Object storage metadata       | `id`, `tenant_id`, `storage_provider`, `bucket`, `object_key`, `original_filename`, `content_type`, `size_bytes`, `checksum_sha256`, `status`, `uploaded_by_user_id`, `uploaded_at`, `deleted_at` | Index `(tenant_id, status, uploaded_at desc)` |
| `file_links`         | Polymorphic file associations | `id`, `tenant_id`, `file_id`, `entity_type`, `entity_id`, `purpose`, `linked_at`                                                                                                                  | Index `(tenant_id, entity_type, entity_id)`   |
| `file_access_events` | Optional file access audit    | `tenant_id`, `file_id`, `user_id`, `access_type`, `accessed_at`                                                                                                                                   | Append-only                                   |

File status enum:

```text
active
soft_deleted
retained
deleted
```

### 18.2 Export Tables

| Table                                | Purpose                      | Key Columns                                                                                                                       | Important Constraints / Indexes       |
| ------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `tenant_export_jobs`                 | Export job state             | `id`, `tenant_id`, `requested_by_user_id`, `status`, `requested_at`, `started_at`, `completed_at`, `expires_at`, `failure_reason` | Rate-limited by service               |
| `tenant_export_files`                | Export package metadata      | `id`, `tenant_id`, `export_job_id`, `file_id`, `manifest_json`, `row_counts_json`, `checksum_sha256`                              | Unique per job/file                   |
| `tenant_export_included_attachments` | Attachment packaging details | `tenant_id`, `export_job_id`, `source_file_id`, `export_path`, `included`, `failure_reason`                                       | Supports full attachment export audit |

### 18.3 Offline Read-Only Cache Tables

Offline cache is mainly a client/PWA concern, but the backend should expose controlled cache snapshots.

| Table                     | Purpose                                        | Key Columns                                                                                            |
| ------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `offline_cache_manifests` | Server-side metadata for cacheable read models | `id`, `tenant_id`, `user_id`, `scope_hash`, `generated_at`, `expires_at`, `etag`, `record_counts_json` |
| `sync_versions`           | Version clock for read models                  | `tenant_id`, `entity_type`, `branch_id`, `version_number`, `updated_at`                                |

Rules:

- No offline write queue table is allowed in this build.
- Offline cache payloads must respect user permission and branch scope.
- Cached sensitive records must expire and be invalidated on logout, deactivation, or permission changes.

---

## 19. Audit, Idempotency, Background Jobs, and Observability

### 19.1 Audit Tables

| Table                      | Purpose                       | Key Columns                                                                                                                                                                                                                                 | Important Constraints / Indexes                                                          |
| -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `audit_logs`               | Immutable critical action log | `id`, `tenant_id`, `actor_user_id`, `actor_type`, `support_access_session_id`, `action`, `entity_type`, `entity_id`, `branch_id`, `before_json`, `after_json`, `metadata_json`, `ip_address`, `user_agent`, `created_at`, `retention_class` | Append-only; index `(tenant_id, created_at desc)`, `(tenant_id, entity_type, entity_id)` |
| `platform_audit_logs`      | Platform admin/global audit   | `id`, `platform_admin_user_id`, `tenant_id`, `action`, `entity_type`, `entity_id`, `metadata_json`, `created_at`                                                                                                                            | Retained per platform policy                                                             |
| `audit_retention_policies` | Retention metadata            | `retention_class`, `retention_days`, `description`                                                                                                                                                                                          | Unique retention class                                                                   |

### 19.2 Idempotency Tables

| Table                | Purpose                             | Key Columns                                                                                                                                                                                 | Important Constraints / Indexes                                                                        |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `idempotency_keys`   | Critical write duplicate prevention | `id`, `tenant_id`, `user_id`, `endpoint`, `request_intent_hash`, `idempotency_key_hash`, `status`, `response_status_code`, `response_body_json`, `locked_until`, `created_at`, `expires_at` | Unique `(tenant_id, user_id, endpoint, request_intent_hash, idempotency_key_hash)`                     |
| `document_sequences` | Tenant document numbering           | `tenant_id`, `sequence_type`, `sequence_date`, `last_value`                                                                                                                                 | PK `(tenant_id, sequence_type, sequence_date)` or `(tenant_id, sequence_type)` for non-daily sequences |

Sequence types:

```text
job_order_daily
estimate_daily
purchase_order_daily
inventory_transfer_daily
invoice
receipt
inventory_adjustment
```

### 19.3 Background Job / Outbox Tables

| Table                     | Purpose                     | Key Columns                                                                                                                                                                   | Important Constraints / Indexes      |
| ------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `background_jobs`         | Durable job queue           | `id`, `tenant_id`, `job_type`, `status`, `payload_json`, `run_after`, `attempt_count`, `max_attempts`, `locked_by`, `locked_until`, `created_at`, `completed_at`, `failed_at` | Index due jobs `(status, run_after)` |
| `background_job_attempts` | Attempt history             | `job_id`, `attempt_number`, `started_at`, `finished_at`, `status`, `error_message`, `metadata_json`                                                                           | Append-only                          |
| `outbox_events`           | Transactional domain events | `id`, `tenant_id`, `event_type`, `aggregate_type`, `aggregate_id`, `payload_json`, `status`, `created_at`, `published_at`                                                     | Index unpublished events             |

Job status enum:

```text
queued
processing
succeeded
failed
dead_lettered
cancelled
```

### 19.4 Observability Tables

Database should not replace external monitoring, but store operational breadcrumbs:

| Table                  | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `rate_limit_events`    | Log rate-limit violations                                     |
| `integration_events`   | Provider call tracking for SMS/email/storage                  |
| `system_health_events` | Optional internal operational events                          |
| `error_events`         | Optional sampled application errors if not fully externalized |

---

## 20. Reports and Dashboard Design

### 20.1 Source of Truth

Reports must derive from transactional source tables:

- Sales/revenue: issued invoices, invoice lines, payments/refunds depending report basis.
- COGS: FIFO consumption records tied to job order consumption.
- Inventory valuation: remaining FIFO layer quantities and unit costs.
- Accounts receivable: invoices with collectible balance.
- Accounts payable: supplier payable ledger.
- Expenses: non-voided expenses.
- Productivity: mechanic work sessions and completed job orders.

### 20.2 Reporting Tables / Materialized Views

| Object                             | Purpose                                         | Refresh Strategy                       |
| ---------------------------------- | ----------------------------------------------- | -------------------------------------- |
| `report_daily_sales`               | Daily sales aggregates by tenant/branch/date    | Incremental from invoice events        |
| `report_daily_payments`            | Daily collected cash/payment-method summary     | Incremental from payment/refund events |
| `report_daily_inventory_movements` | Inventory movement aggregates                   | Incremental from inventory ledger      |
| `report_stock_valuation_snapshots` | Snapshot stock valuation by branch/product/date | Nightly and on-demand                  |
| `report_mechanic_productivity`     | Mechanic productivity aggregates                | Nightly/incremental                    |
| `report_customer_activity`         | New/repeat/inactive customer metrics            | Nightly                                |
| `dashboard_snapshots`              | Cached dashboard metrics                        | Frequent background refresh            |

### 20.3 Report Query Indexes

```sql
create index idx_invoices_report_date
on invoices(tenant_id, branch_id, invoice_date, status);

create index idx_invoice_lines_report
on invoice_lines(tenant_id, invoice_id, line_type, product_id, service_id);

create index idx_payments_report_date
on payments(tenant_id, payment_date, payment_method);

create index idx_refunds_report_date
on refunds(tenant_id, created_at);

create index idx_expenses_report_date
on expenses(tenant_id, branch_id, expense_date, status);

create index idx_mechanic_sessions_report
on mechanic_work_sessions(tenant_id, mechanic_user_id, finished_at);
```

---

## 21. Full-Text Search and Query Optimization

### 21.1 Required Search Areas

| Search Area | Fields                                                      |
| ----------- | ----------------------------------------------------------- |
| Customers   | name, mobile number, email, tags, motorcycle plate/model    |
| Motorcycles | plate, engine, chassis, brand, model, customer name         |
| Products    | SKU, barcode, name, brand, category                         |
| Suppliers   | name, contact, email, mobile                                |
| Job Orders  | job order number, customer, motorcycle, status              |
| Invoices    | invoice number, customer, receipt number, payment reference |
| Purchases   | PO number, supplier, product                                |
| Files       | filename, linked entity                                     |

### 21.2 PostgreSQL Extensions

Recommended:

```sql
create extension if not exists pg_trgm;
create extension if not exists unaccent;
```

Optional:

```sql
create extension if not exists citext;
```

### 21.3 Search Index Pattern

For exact lookup:

```sql
create index idx_customers_normalized_mobile
on customers(tenant_id, normalized_mobile)
where status = 'active' and normalized_mobile is not null;
```

For fuzzy search:

```sql
create index idx_customers_name_trgm
on customers using gin(normalized_name gin_trgm_ops);
```

For FTS:

```sql
create index idx_products_search_vector
on product_search_documents using gin(search_vector);
```

### 21.4 Query Rules

- Always filter by `tenant_id`.
- Branch-scoped screens must filter by `(tenant_id, branch_id)`.
- Use keyset pagination for large lists.
- Avoid offset pagination for high-volume ledgers.
- Use date-range predicates for reports.
- Avoid joining audit logs into operational list queries.
- Read models can denormalize display names, status labels, and snapshots for list performance.

---

## 22. Critical Transactions

### 22.1 Required Transaction Boundaries

The following operations must run in one database transaction:

| Operation                         | Required Locks / Safeguards                                          |
| --------------------------------- | -------------------------------------------------------------------- |
| Invoice issuance                  | invoice row, invoice lines, billing allocations, sequence row        |
| Payment + receipt                 | invoice row, payment insert, receipt sequence row, receipt insert    |
| Refund                            | payment row, invoice row, refund insert, optional inventory reversal |
| Invoice cancel/void               | invoice row, allocations, refund checks                              |
| Job order completion              | job order, reservations, stock balances, FIFO layers, ledger         |
| Inventory reservation             | stock balance, FIFO layers, reservation allocations                  |
| Reservation release               | reservation, stock balance, FIFO allocation rows                     |
| Inventory adjustment posting      | adjustment, stock balance, FIFO layers, ledger                       |
| Purchase receiving                | PO lines, stock balance, FIFO layers, AP ledger                      |
| Supplier return                   | supplier return, stock balance, FIFO layers, AP/credit records       |
| Supplier payment                  | supplier payable balance validation, supplier payment, AP ledger     |
| Inventory transfer status changes | transfer, lines, source/destination stock balances, FIFO layers      |
| Tenant deletion                   | deletion job, tenant rows, related data batches                      |

### 22.2 Document Number Generation

Use `document_sequences` with row-level lock:

```text
1. Begin transaction.
2. Select sequence row FOR UPDATE.
3. Increment last_value.
4. Format document number.
5. Insert target document with unique constraint.
6. Commit.
```

Daily reset sequences include:

- Job orders: `JO-YYYYMMDD-000001`
- Estimates: `EST-YYYYMMDD-000001`
- Purchase orders: `PO-YYYYMMDD-000001`
- Transfers: `TR-YYYYMMDD-000001`

Tenant-wide continuous sequences include:

- Invoices: `{INVOICE_PREFIX}{6_DIGIT_SEQUENCE}`
- Receipts: `RCPT-{6_DIGIT_SEQUENCE}`

### 22.3 Idempotency Enforcement

For client-retryable critical writes:

1. Insert idempotency row as `processing`.
2. If duplicate key exists, return existing result or safe duplicate response.
3. Execute business transaction.
4. Persist response.
5. Mark idempotency row as `succeeded`.

---

## 23. Security and Compliance Design

### 23.1 Data Protection

- Passwords: hash only.
- Tokens: hash only.
- Payment cards: do not store card number, CVV, stripe data, or equivalent data.
- File storage: store object metadata only in DB; object content in encrypted storage.
- Backups: encrypted.
- Audit: append-only and retained according to retention policy.

### 23.2 Tenant Data Access

Application authorization must check:

1. Authenticated user status.
2. Email verification.
3. Tenant status.
4. Tenant membership.
5. Permission.
6. Branch assignment or tenant-wide branch access.
7. Record ownership/scope.

Database RLS should additionally enforce tenant boundary.

### 23.3 Deletion and Retention

- Normal operational records use deactivation/soft deletion.
- Tenant deletion job removes active production tenant data after retention rules.
- Platform-retained audit records may remain according to audit-retention carveout.
- Object storage files require a deletion manifest and retry-safe deletion jobs.
- Backups may retain deleted data until backup retention expires.

---

## 24. Data Integrity Constraints

### 24.1 Must-Have Check Constraints

Examples:

```sql
alter table stock_balances
add constraint chk_stock_non_negative
check (on_hand_qty >= 0 and reserved_qty >= 0 and on_hand_qty >= reserved_qty);

alter table payments
add constraint chk_payment_amount_positive
check (amount > 0);

alter table refunds
add constraint chk_refund_amount_positive
check (amount > 0);

alter table invoice_lines
add constraint chk_invoice_line_non_negative
check (
  quantity >= 0 and
  unit_price >= 0 and
  line_total >= 0 and
  tax_amount >= 0
);
```

### 24.2 Must-Have Unique Constraints

| Constraint                                     | Purpose                                    |
| ---------------------------------------------- | ------------------------------------------ |
| `(tenant_id, invoice_number)`                  | Prevent duplicate invoices                 |
| `(tenant_id, receipt_number)`                  | Prevent duplicate receipts                 |
| `(tenant_id, job_order_number)`                | Prevent duplicate job orders               |
| `(tenant_id, estimate_number)`                 | Prevent duplicate estimates                |
| `(tenant_id, purchase_order_number)`           | Prevent duplicate POs                      |
| `(tenant_id, transfer_number)`                 | Prevent duplicate transfers                |
| `(tenant_id, normalized_sku)`                  | SKU unique across active/inactive products |
| Active `(tenant_id, normalized_barcode)`       | Active barcode uniqueness                  |
| Active `(tenant_id, normalized_branch_name)`   | Active branch name uniqueness              |
| Active `(tenant_id, normalized_supplier_name)` | Active supplier name uniqueness            |
| Active `(tenant_id, normalized_service_name)`  | Active service uniqueness                  |
| Active `(tenant_id, normalized_category_name)` | Active product category uniqueness         |
| Global active `normalized_email`               | Active user email uniqueness               |

### 24.3 Immutability Enforcement

Use one or more of:

- Application service rules.
- Database triggers that block updates/deletes on append-only tables.
- Restricted database permissions.
- Audit triggers for sensitive tables.

Append-only tables:

- `inventory_ledger_entries`
- `fifo_consumptions`
- `payments`
- `receipts`
- `refunds`
- `audit_logs`
- `platform_audit_logs`
- `notification_attempts`
- `status_events`

---

## 25. Indexing Strategy

### 25.1 Global Rules

Every operational index must start with `tenant_id` unless the table is platform-global.

Branch-scoped indexes should usually start:

```text
(tenant_id, branch_id, ...)
```

Status list screens should use:

```text
(tenant_id, branch_id, status, created_at desc)
```

### 25.2 High-Value Indexes

```sql
-- Job order board
create index idx_job_orders_board
on job_orders(tenant_id, branch_id, status, created_at desc);

-- Customer lookup
create index idx_customers_active_name
on customers(tenant_id, normalized_name)
where status = 'active';

-- Motorcycle lookup
create index idx_motorcycles_active_plate
on motorcycles(tenant_id, normalized_plate_number)
where status = 'active' and normalized_plate_number is not null;

-- Product search/list
create index idx_products_active_category
on products(tenant_id, category_id, status, normalized_name);

-- Low stock
create index idx_stock_low_stock_scan
on stock_balances(tenant_id, branch_id, product_id)
where on_hand_qty >= reserved_qty;

-- Invoices list
create index idx_invoices_list
on invoices(tenant_id, branch_id, status, invoice_date desc);

-- AR
create index idx_invoices_ar_due
on invoices(tenant_id, branch_id, due_date, status)
where remaining_collectible_balance > 0;

-- AP
create index idx_supplier_payables_supplier
on supplier_payables(tenant_id, supplier_id, occurred_at desc);

-- Files by entity
create index idx_file_links_entity
on file_links(tenant_id, entity_type, entity_id);
```

### 25.3 Avoid Over-Indexing

Do not create indexes for every foreign key blindly if write volume is high. Prioritize:

- Tenant/branch list queries.
- Status dashboards.
- Search.
- Reporting date filters.
- Ledger and FIFO access paths.
- Foreign keys used in cascaded tenant export/deletion.

---

## 26. Migration and Seed Data Plan

### 26.1 Required Seed Data

- Permissions from PRD Section 7.12.
- Standard subscription plans: Basic, Mid, High.
- Default plan limits.
- Default role templates per tenant.
- Default product categories per tenant during onboarding:
  - Engine Oil
  - Tires
  - Accessories
  - Brake Parts
  - CVT Parts
  - Lubricants
- Default expense categories if finalized by product.
- Default notification templates if finalized by product.

### 26.2 Migration Standards

- All migrations must be reversible where practical.
- Destructive migrations require explicit approval and backup.
- New non-null columns on populated tables must be introduced safely:
  1. Add nullable column.
  2. Backfill.
  3. Add constraint.
  4. Enforce not null.
- Large indexes should be created concurrently in production.

---

## 27. Validation and QA Strategy

### 27.1 Database-Level Test Cases

Create automated tests for:

- Tenant A cannot read/write Tenant B data.
- Branch-scoped users cannot access unassigned branch records.
- Duplicate invoice/receipt/job order numbers cannot occur under concurrent requests.
- Payment cannot exceed invoice balance.
- Refund cannot exceed refundable amount.
- Invoice billing allocation cannot overbill a job order line.
- Stock cannot become negative.
- On-hand cannot become lower than reserved.
- FIFO reservation cannot allocate more than layer allocatable quantity.
- FIFO consumption uses oldest layers first.
- Job order completion consumes reservations atomically.
- Inventory transfer variance records correct loss quantity and FIFO value.
- Supplier return cannot return reserved, consumed, transferred, or already returned stock.
- Receipts cannot be edited.
- Inventory ledger entries cannot be edited.
- Audit logs cannot be edited.
- Read-only tenant cannot create operational records.
- Suspended tenant blocks non-owner access.
- Tenant deletion preserves retained platform audit records and deletes eligible tenant records.

### 27.2 Performance Test Cases

- Customer search under large tenant dataset.
- Product search under large product catalog.
- Job order board by branch/status.
- Daily sales dashboard.
- Inventory valuation by branch/date.
- FIFO consumption under concurrent reservations.
- Tenant export for large attachment volume.
- Audit log query by entity and by date range.

---

## 28. Risks and Mitigations

| Risk                            | Impact                                      | Mitigation                                                        |
| ------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| FIFO and reservation bugs       | Incorrect stock and COGS                    | Lock stock/FIFO rows, test concurrency, keep immutable ledger     |
| Overbilling with draft invoices | Revenue and customer disputes               | Billing allocation table with transactional locks                 |
| Audit log growth                | Query and storage cost                      | Partition by time, retain by policy, separate operational indexes |
| Tenant deletion complexity      | Data retention or privacy failure           | Deletion jobs, manifests, retry state, legal carveouts            |
| Report slowness                 | Poor user experience                        | Materialized reporting tables and indexed read models             |
| RLS misconfiguration            | Data leak risk                              | App-layer authorization plus RLS tests                            |
| Background job duplication      | Duplicate messages/exports/lifecycle events | Outbox, idempotency keys, unique source event constraints         |
| Sequence contention             | Slow document creation during bursts        | Tenant-scoped sequence rows, short transactions                   |
| Large files in DB               | DB bloat                                    | Store files in object storage, metadata only in DB                |

---

## 29. Remaining Open Technical Decisions

These are not PRD ambiguities, but implementation choices that should be finalized before migrations:

1. **ORM choice:** Prisma, Drizzle, TypeORM, or direct SQL migration tool.
2. **ID format:** UUIDv7 preferred; ULID acceptable if stack standardizes on text IDs.
3. **RLS adoption:** Recommended, but must align with backend architecture.
4. **Partitioning start date:** Can be deferred, but append-only table design should be partition-ready.
5. **Reporting refresh approach:** Materialized views vs maintained aggregate tables.
6. **Exact file storage provider:** S3-compatible, Supabase Storage, Google Cloud Storage, or equivalent.
7. **Audit trigger depth:** Application-only audit vs database trigger-backed audit for critical tables.
8. **Decimal quantity precision:** `numeric(14,3)` recommended unless the business requires finer granularity.
9. **Search implementation:** Dedicated search tables in PostgreSQL first; external search engine only if needed later.

---

## 30. Recommended Implementation Order for Database Work

This is not a product phase split. It is a safe dependency order for database migrations.

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

## 31. Acceptance Criteria for This Database Design

The database design is acceptable when:

- All tenant-owned tables have `tenant_id`.
- All branch-specific operational tables have `tenant_id` and `branch_id`.
- All document numbers have unique tenant-scoped constraints.
- Inventory cannot change without ledger entries.
- FIFO layers and reservation allocations can represent oldest-first reservation and consumption.
- Job order completion, transfer receiving, purchase receiving, supplier return, payment, refund, invoice issuance, and void/cancel operations are transaction-safe.
- Payments generate exactly one immutable receipt.
- Issued financial documents preserve tax and pricing snapshots.
- Soft-deleted/deactivated entities remain available historically.
- Full-text search can support the required search surfaces.
- Audit logs cover critical actions and platform support access.
- Idempotency keys prevent duplicate side effects.
- Reporting tables can be generated from transactional source data.
- Tenant export and deletion can be executed and audited.

---

## 32. Appendix A: Minimal Critical DDL Sketch

This is a sketch, not a complete migration file.

```sql
create table tenants (
  id uuid primary key,
  business_name text not null,
  normalized_business_name text not null,
  shop_email text not null,
  normalized_shop_email text not null,
  status text not null,
  timezone text not null default 'Asia/Manila',
  country char(2) not null default 'PH',
  currency char(3) not null default 'PHP',
  onboarding_completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table branches (
  id uuid not null,
  tenant_id uuid not null references tenants(id),
  name text not null,
  normalized_name text not null,
  address text not null,
  contact_number text not null,
  business_hours_json jsonb not null,
  status text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

create table stock_balances (
  tenant_id uuid not null,
  branch_id uuid not null,
  product_id uuid not null,
  on_hand_qty numeric(14,3) not null default 0,
  reserved_qty numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0,
  primary key (tenant_id, branch_id, product_id),
  check (on_hand_qty >= 0),
  check (reserved_qty >= 0),
  check (on_hand_qty >= reserved_qty)
);

create table fifo_layers (
  id uuid primary key,
  tenant_id uuid not null,
  branch_id uuid not null,
  product_id uuid not null,
  quantity_received numeric(14,3) not null check (quantity_received > 0),
  remaining_quantity numeric(14,3) not null check (remaining_quantity >= 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  source_transaction_type text not null,
  source_transaction_id uuid not null,
  received_at timestamptz not null,
  original_source_layer_id uuid null
);

create table inventory_reservations (
  id uuid primary key,
  tenant_id uuid not null,
  branch_id uuid not null,
  product_id uuid not null,
  source_type text not null,
  source_id uuid not null,
  requested_quantity numeric(14,3) not null check (requested_quantity > 0),
  reserved_quantity numeric(14,3) not null check (reserved_quantity > 0),
  status text not null,
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  consumed_at timestamptz
);

create table fifo_reservation_allocations (
  id uuid primary key,
  tenant_id uuid not null,
  reservation_id uuid not null references inventory_reservations(id),
  fifo_layer_id uuid not null references fifo_layers(id),
  reserved_quantity numeric(14,3) not null check (reserved_quantity > 0),
  unit_cost_snapshot numeric(14,2) not null,
  status text not null,
  allocated_at timestamptz not null default now(),
  released_at timestamptz,
  consumed_at timestamptz
);

create table inventory_ledger_entries (
  id uuid primary key,
  tenant_id uuid not null,
  branch_id uuid not null,
  product_id uuid not null,
  transaction_type text not null,
  quantity_delta_on_hand numeric(14,3) not null default 0,
  quantity_delta_reserved numeric(14,3) not null default 0,
  unit_cost numeric(14,2),
  total_cost numeric(14,2),
  source_type text not null,
  source_id uuid not null,
  occurred_at timestamptz not null default now(),
  created_by_user_id uuid
);

create table invoices (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  customer_id uuid not null,
  invoice_number text not null,
  status text not null,
  invoice_date date not null,
  due_date date,
  subtotal numeric(14,2) not null default 0,
  line_discount_total numeric(14,2) not null default 0,
  invoice_discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  net_paid_amount numeric(14,2) not null default 0,
  remaining_collectible_balance numeric(14,2) not null default 0,
  tax_profile_snapshot text,
  tax_mode_snapshot text,
  vat_rate_snapshot numeric(5,4),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, invoice_number)
);

create table payments (
  id uuid primary key,
  tenant_id uuid not null,
  invoice_id uuid not null references invoices(id),
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null,
  payment_method text not null,
  reference_number text,
  refundable_amount numeric(14,2) not null,
  created_by_user_id uuid,
  created_at timestamptz not null default now()
);

create table receipts (
  id uuid primary key,
  tenant_id uuid not null,
  payment_id uuid not null unique references payments(id),
  receipt_number text not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method_snapshot text not null,
  receipt_date date not null,
  customer_id uuid not null,
  invoice_id uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, receipt_number)
);

create table idempotency_keys (
  id uuid primary key,
  tenant_id uuid not null,
  user_id uuid not null,
  endpoint text not null,
  request_intent_hash text not null,
  idempotency_key_hash text not null,
  status text not null,
  response_status_code integer,
  response_body_json jsonb,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (tenant_id, user_id, endpoint, request_intent_hash, idempotency_key_hash)
);
```

---

## 33. Final Recommendation

Use PostgreSQL as the system of record, with strict tenant-scoped relational modeling, immutable ledgers for inventory and financial actions, transactionally maintained FIFO/reservation records, and materialized reporting read models.

The biggest database design priority is not reducing table count. The biggest priority is preserving business invariants under concurrent operations. The schema should intentionally separate:

- Current state summaries for fast reads.
- Immutable ledgers for truth and audit.
- Workflow headers/lines for operational screens.
- Status histories for traceability.
- Reporting snapshots for performance.

This design is suitable for a production SaaS foundation and can scale incrementally without replacing the core data model.
