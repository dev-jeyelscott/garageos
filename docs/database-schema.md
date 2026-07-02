# GarageOS Database Schema

**Document:** `database-schema.md`  
**Source Documents:** `requirements-v2.4.md`, `database-design.md`  
**Generated:** 2026-06-24  
**Status:** Build-ready physical schema specification  
**Database Target:** PostgreSQL 16+

---

## 1. Purpose

This document converts the GarageOS PRD and database design into a concrete PostgreSQL-oriented schema specification. It defines tables, key columns, constraints, indexes, enums, transaction rules, and seed data needed to implement the full single-scope GarageOS build.

This is not a migration file yet. It is the canonical schema blueprint from which migrations, ORM models, ERD diagrams, API contracts, and QA fixtures should be produced.

---

## 2. Core Schema Principles

1. **Shared database, shared schema, strict tenant isolation.**
2. **Every tenant-owned business table includes `tenant_id`.**
3. **Every branch-specific operational table includes both `tenant_id` and `branch_id`.**
4. **Ledger-first inventory.** Stock-changing operations must create immutable `inventory_ledger_entries`.
5. **FIFO costing.** FIFO layers and FIFO reservation allocations are first-class tables.
6. **Financial immutability.** Issued invoices, payments, receipts, refunds, ledger records, and audit logs are append-only or correction-only.
7. **Idempotent critical writes.** Client-retryable financial, inventory, billing, and deletion operations must use idempotency keys.
8. **Document numbers are tenant-scoped and never reused.**
9. **Soft deletion/deactivation is preferred.** Hard deletion occurs only through tenant deletion lifecycle jobs.
10. **Database constraints protect invariants; service logic enforces workflow transitions.**

---

## 3. PostgreSQL Standards

### 3.1 Recommended Extensions

```sql
create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists pgcrypto;
```

Optional if the stack prefers case-insensitive column types:

```sql
create extension if not exists citext;
```

### 3.2 Common Column Patterns

Mutable tenant tables should generally include:

```sql
id uuid primary key,
tenant_id uuid not null,
created_at timestamptz not null default now(),
created_by_user_id uuid null,
updated_at timestamptz not null default now(),
updated_by_user_id uuid null,
lock_version integer not null default 0
```

Append-only tables should generally include:

```sql
id uuid primary key,
tenant_id uuid null,
created_at timestamptz not null default now(),
created_by_user_id uuid null
```

### 3.3 Data Types

| Data             | Type                                 | Rule                                      |
| ---------------- | ------------------------------------ | ----------------------------------------- |
| Primary IDs      | `uuid`                               | UUIDv7 preferred.                         |
| Money            | `numeric(14,2)`                      | No binary floating point.                 |
| Quantity         | `numeric(14,3)`                      | Supports fractional consumables.          |
| Event timestamp  | `timestamptz`                        | Store canonical UTC timestamp.            |
| Business date    | `date`                               | Interpret using tenant timezone.          |
| Status / enum    | `text` with check or PostgreSQL enum | Lowercase API-safe values.                |
| Provider payload | `jsonb`                              | Only for non-core transactional payloads. |

---

## 4. Enum Catalog

Recommended implementation: use PostgreSQL enum types for stable enums, or `text` + check constraints if the team wants easier enum migration.

### 4.1 Tenant and Subscription

```text
tenant_status:
  pending_setup, active, grace_period, read_only, suspended, pending_deletion, deleted

subscription_status_source:
  system_computed, platform_override

support_access_mode:
  read_only, write_allowed

standard_plan_code:
  basic, mid, high
```

### 4.2 Users, Roles, Branches

```text
user_type:
  tenant_user, platform_admin

user_status:
  active, inactive

employee_status:
  active, inactive

role_type:
  shop_owner, manager, service_advisor, mechanic, cashier, inventory_clerk, custom

branch_status:
  active, inactive
```

### 4.3 Customer and Motorcycle

```text
customer_status:
  active, merged, soft_deleted

motorcycle_status:
  active, soft_deleted
```

### 4.4 Service Workflows

```text
service_status:
  active, inactive

estimate_status:
  draft, presented, approved, converted, cancelled, expired

estimate_approval_method:
  verbal, sms, email, signed_document, other

job_order_status:
  pending, in_progress, waiting_for_parts, completed, released, cancelled

job_order_line_type:
  service, labor, part

job_order_line_status:
  active, completed, cancelled

mechanic_work_session_status:
  active, paused, finished
```

### 4.5 Inventory

```text
product_status:
  active, inactive

category_status:
  active, inactive

inventory_transaction_type:
  purchase_receive,
  job_order_reservation,
  reservation_release,
  job_order_consumption,
  inventory_adjustment_increase,
  inventory_adjustment_decrease,
  inventory_transfer_reservation,
  inventory_transfer_reservation_release,
  inventory_transfer_out,
  inventory_transfer_in,
  inventory_transfer_variance_loss,
  supplier_return,
  refund_inventory_reversal,
  void_inventory_reversal

inventory_reservation_status:
  active, released, consumed, cancelled

fifo_allocation_status:
  active, released, consumed, cancelled

inventory_adjustment_status:
  draft, pending_approval, approved, posted, rejected, cancelled

inventory_transfer_status:
  draft, pending, in_transit, received, cancelled
```

### 4.6 Purchasing and AP

```text
supplier_status:
  active, inactive

purchase_order_status:
  draft, ordered, partially_received, received, closed, cancelled

purchase_payment_terms:
  cash, credit

supplier_return_status:
  draft, posted, cancelled
```

### 4.7 Sales, Payments, Tax, AR

```text
invoice_status:
  draft, pending, partially_paid, paid, overdue, cancelled, voided, refunded

invoice_line_type:
  service, labor, part, custom

billing_allocation_status:
  reserved, final, released, closed

payment_method:
  cash, gcash, maya, bank_transfer, credit_card, check, other

refund_status:
  posted, voided

tax_profile:
  vat_registered, non_vat, no_tax

tax_mode:
  tax_inclusive, tax_exclusive, no_tax
```

### 4.8 Expenses, Reminders, Notifications, Files, Jobs

```text
expense_status:
  active, voided

reminder_status:
  scheduled, due, sent, failed, cancelled

notification_delivery_status:
  pending, sent, failed, read, dismissed

file_status:
  active, soft_deleted, retained, quarantined, deleted

background_job_status:
  queued, running, succeeded, failed, cancelled, dead_lettered

idempotency_status:
  processing, succeeded, failed, expired

audit_actor_type:
  tenant_user, platform_admin, system
```

---

## 5. Platform, Plans, Tenant Lifecycle

### 5.1 `tenants`

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
  deletion_scheduled_for timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0,
  constraint chk_tenants_status check (status in ('pending_setup','active','grace_period','read_only','suspended','pending_deletion','deleted'))
);

create unique index ux_tenants_active_business_email
on tenants(normalized_business_name, normalized_shop_email)
where status <> 'deleted';
```

### 5.2 `shop_profiles`

```sql
create table shop_profiles (
  tenant_id uuid primary key references tenants(id),
  shop_name text not null,
  address text not null,
  contact_number text not null,
  email text not null,
  logo_file_id uuid,
  business_hours_json jsonb not null,
  tax_profile text not null,
  tax_mode text not null,
  vat_rate numeric(5,4) not null default 0.1200,
  invoice_prefix text not null,
  receipt_footer_text text,
  reminder_sender_name text,
  default_invoice_due_days integer not null default 7,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_shop_invoice_prefix check (invoice_prefix ~ '^[A-Z0-9]{2,10}-$'),
  constraint chk_shop_tax_profile check (tax_profile in ('vat_registered','non_vat','no_tax')),
  constraint chk_shop_tax_mode check (tax_mode in ('tax_inclusive','tax_exclusive','no_tax')),
  constraint chk_shop_tax_combo check (
    (tax_profile = 'vat_registered' and tax_mode in ('tax_inclusive','tax_exclusive')) or
    (tax_profile in ('non_vat','no_tax') and tax_mode = 'no_tax')
  )
);
```

### 5.3 Subscription Tables

```sql
create table subscription_plans (
  id uuid primary key,
  code text not null unique,
  name text not null,
  status text not null default 'active',
  is_default boolean not null default false,
  default_duration_days integer,
  created_at timestamptz not null default now(),
  constraint chk_plan_code check (code in ('basic','mid','high'))
);

create unique index ux_one_default_subscription_plan
on subscription_plans(is_default)
where is_default = true and status = 'active';

create table subscription_plan_limits (
  id uuid primary key,
  plan_id uuid not null references subscription_plans(id),
  capability_code text not null,
  value_type text not null,
  numeric_value numeric(14,3),
  boolean_value boolean,
  created_at timestamptz not null default now(),
  unique(plan_id, capability_code)
);

create table tenant_subscriptions (
  tenant_id uuid primary key references tenants(id),
  plan_id uuid not null references subscription_plans(id),
  start_date date not null,
  expiration_date date not null,
  status_source text not null default 'system_computed',
  last_renewal_at timestamptz,
  updated_by_platform_admin_user_id uuid,
  updated_at timestamptz not null default now(),
  constraint chk_subscription_dates check (expiration_date >= start_date),
  constraint chk_subscription_status_source check (status_source in ('system_computed','platform_override'))
);

create table tenant_plan_overrides (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  capability_code text not null,
  override_value_json jsonb not null,
  reason text not null,
  effective_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by_platform_admin_user_id uuid not null,
  created_at timestamptz not null default now()
);

create index idx_tenant_plan_overrides_active
on tenant_plan_overrides(tenant_id, capability_code, expires_at);

create table subscription_overrides (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  override_type text not null,
  previous_value_json jsonb,
  new_value_json jsonb not null,
  reason text not null,
  effective_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by_platform_admin_user_id uuid not null,
  created_at timestamptz not null default now()
);

create table tenant_lifecycle_events (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  from_status text,
  to_status text not null,
  source text not null,
  reason text,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_tenant_lifecycle_events_tenant_time
on tenant_lifecycle_events(tenant_id, effective_at desc);

create table platform_support_access_sessions (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  platform_admin_user_id uuid not null,
  access_mode text not null,
  reason text not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  constraint chk_support_access_mode check (access_mode in ('read_only','write_allowed'))
);

create index idx_platform_support_access_active
on platform_support_access_sessions(tenant_id, platform_admin_user_id, expires_at)
where ended_at is null;

create table tenant_deletion_jobs (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  scheduled_for timestamptz not null,
  status text not null,
  started_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index ux_tenant_deletion_active_job
on tenant_deletion_jobs(tenant_id)
where status in ('queued','running','failed');
```

---

## 6. Authentication, Employees, Roles, Permissions

```sql
create table users (
  id uuid primary key,
  tenant_id uuid references tenants(id),
  user_type text not null,
  email text not null,
  normalized_email text not null,
  password_hash text not null,
  email_verified_at timestamptz,
  status text not null default 'active',
  full_name text not null,
  mobile_number text,
  password_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0,
  constraint chk_users_type check (user_type in ('tenant_user','platform_admin')),
  constraint chk_users_status check (status in ('active','inactive')),
  constraint chk_users_tenant_rule check (
    (user_type = 'tenant_user' and tenant_id is not null) or
    (user_type = 'platform_admin' and tenant_id is null)
  )
);

create unique index ux_users_active_normalized_email
on users(normalized_email)
where status = 'active';

create index idx_users_tenant_status
on users(tenant_id, status);

create table employee_profiles (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  full_name text not null,
  mobile_number text,
  status text not null default 'active',
  tenant_wide_branch_access boolean not null default false,
  deactivated_at timestamptz,
  reactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, user_id),
  constraint chk_employee_status check (status in ('active','inactive'))
);

create table permissions (
  id uuid primary key,
  code text not null unique,
  category text not null,
  description text
);

create table roles (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  name text not null,
  normalized_name text not null,
  role_type text not null,
  is_seeded_template boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_role_status check (status in ('active','inactive'))
);

create unique index ux_roles_active_name
on roles(tenant_id, normalized_name)
where status = 'active';

create table role_permissions (
  tenant_id uuid not null references tenants(id),
  role_id uuid not null references roles(id),
  permission_id uuid not null references permissions(id),
  created_at timestamptz not null default now(),
  primary key(role_id, permission_id)
);

create table user_roles (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  role_id uuid not null references roles(id),
  assigned_at timestamptz not null default now(),
  assigned_by_user_id uuid references users(id),
  removed_at timestamptz
);

create unique index ux_user_roles_active
on user_roles(tenant_id, user_id, role_id)
where removed_at is null;

create table employee_invitations (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  email text not null,
  normalized_email text not null,
  token_hash text not null unique,
  status text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  assigned_role_config_json jsonb,
  assigned_branch_config_json jsonb,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);

create index idx_employee_invitations_lookup
on employee_invitations(tenant_id, normalized_email, status);

create table password_reset_tokens (
  id uuid primary key,
  user_id uuid not null references users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table email_verification_tokens (
  id uuid primary key,
  user_id uuid not null references users(id),
  token_hash text not null unique,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table refresh_sessions (
  id uuid primary key,
  user_id uuid not null references users(id),
  tenant_id uuid references tenants(id),
  token_family_id uuid not null,
  refresh_token_hash text not null unique,
  remember_me boolean not null default false,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by_session_id uuid,
  created_at timestamptz not null default now()
);

create table login_attempts (
  id uuid primary key,
  normalized_email text,
  ip_address inet,
  attempted_at timestamptz not null default now(),
  success boolean not null,
  blocked_until timestamptz,
  user_agent text
);

create index idx_login_attempts_email_time on login_attempts(normalized_email, attempted_at desc);
create index idx_login_attempts_ip_time on login_attempts(ip_address, attempted_at desc);
```

---

## 7. Shop Settings and Branch Access

```sql
create table branches (
  id uuid not null,
  tenant_id uuid not null references tenants(id),
  name text not null,
  normalized_name text not null,
  address text not null,
  contact_number text not null,
  business_hours_json jsonb not null,
  status text not null default 'active',
  deactivated_at timestamptz,
  reactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0,
  primary key(tenant_id, id),
  constraint chk_branch_status check (status in ('active','inactive'))
);

create unique index ux_branches_active_name
on branches(tenant_id, normalized_name)
where status = 'active';

create index idx_branches_tenant_status on branches(tenant_id, status);

create table user_branch_assignments (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  branch_id uuid not null,
  assigned_at timestamptz not null default now(),
  assigned_by_user_id uuid references users(id),
  removed_at timestamptz,
  foreign key (tenant_id, branch_id) references branches(tenant_id, id)
);

create unique index ux_user_branch_assignments_active
on user_branch_assignments(tenant_id, user_id, branch_id)
where removed_at is null;

create table branch_status_events (
  id uuid primary key,
  tenant_id uuid not null,
  branch_id uuid not null,
  from_status text,
  to_status text not null,
  reason text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id)
);

create table tenant_settings (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  setting_key text not null,
  setting_value_json jsonb not null,
  updated_by_user_id uuid references users(id),
  updated_at timestamptz not null default now(),
  unique(tenant_id, setting_key)
);
```

---

## 8. Customers, Tags, Motorcycles

```sql
create table customers (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  name text not null,
  normalized_name text not null,
  mobile_number text,
  normalized_mobile text,
  email text,
  normalized_email text,
  address text,
  birthday date,
  notes text,
  status text not null default 'active',
  merged_into_customer_id uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users(id),
  lock_version integer not null default 0,
  constraint chk_customer_contact check (mobile_number is not null or email is not null),
  constraint chk_customer_status check (status in ('active','merged','soft_deleted'))
);

create index idx_customers_active_name on customers(tenant_id, normalized_name) where status = 'active';
create index idx_customers_mobile on customers(tenant_id, normalized_mobile) where normalized_mobile is not null;
create index idx_customers_email on customers(tenant_id, normalized_email) where normalized_email is not null;
create index idx_customers_name_trgm on customers using gin(normalized_name gin_trgm_ops);

create table customer_tags (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  name text not null,
  normalized_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create unique index ux_customer_tags_active_name
on customer_tags(tenant_id, normalized_name)
where status = 'active';

create table customer_tag_assignments (
  tenant_id uuid not null references tenants(id),
  customer_id uuid not null references customers(id),
  tag_id uuid not null references customer_tags(id),
  created_at timestamptz not null default now(),
  primary key(tenant_id, customer_id, tag_id)
);

create table customer_merge_events (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  source_customer_id uuid not null references customers(id),
  surviving_customer_id uuid not null references customers(id),
  reason text not null,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table motorcycles (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  customer_id uuid not null references customers(id),
  brand text not null,
  model text not null,
  year integer,
  color text,
  plate_number text,
  normalized_plate_number text,
  engine_number text,
  normalized_engine_number text,
  chassis_number text,
  normalized_chassis_number text,
  latest_mileage integer not null default 0,
  status text not null default 'active',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0,
  constraint chk_motorcycle_mileage check (latest_mileage >= 0),
  constraint chk_motorcycle_status check (status in ('active','soft_deleted'))
);

create index idx_motorcycles_customer on motorcycles(tenant_id, customer_id, status);
create index idx_motorcycles_plate on motorcycles(tenant_id, normalized_plate_number) where normalized_plate_number is not null;
create index idx_motorcycles_model_trgm on motorcycles using gin(model gin_trgm_ops);

create table motorcycle_mileage_events (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  motorcycle_id uuid not null references motorcycles(id),
  source_type text not null,
  source_id uuid,
  previous_mileage integer,
  new_mileage integer not null,
  reason text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  constraint chk_mileage_event_new check (new_mileage >= 0)
);

create index idx_motorcycle_mileage_events_lookup
on motorcycle_mileage_events(tenant_id, motorcycle_id, created_at desc);
```

---

## 9. Service Catalog, Estimates, Job Orders

```sql
create table services (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  name text not null,
  normalized_name text not null,
  starting_price numeric(14,2) not null default 0,
  variable_price boolean not null default false,
  price_disclaimer text,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_service_price check (starting_price >= 0),
  constraint chk_service_disclaimer check (variable_price = false or price_disclaimer is not null)
);

create unique index ux_services_active_name
on services(tenant_id, normalized_name)
where status = 'active';

create table estimates (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  customer_id uuid not null references customers(id),
  motorcycle_id uuid references motorcycles(id),
  estimate_number text not null,
  status text not null default 'draft',
  valid_until_date date,
  approval_method text,
  approved_by_customer_name text,
  approved_at timestamptz,
  converted_job_order_id uuid,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, estimate_number),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id)
);

create index idx_estimates_branch_status on estimates(tenant_id, branch_id, status, created_at desc);

create table estimate_lines (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  estimate_id uuid not null references estimates(id),
  line_type text not null,
  service_id uuid references services(id),
  product_id uuid,
  description text not null,
  quantity numeric(14,3) not null default 1,
  unit_price numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  line_order integer not null default 0,
  constraint chk_estimate_line_amounts check (quantity > 0 and unit_price >= 0 and line_total >= 0)
);

create table estimate_status_events (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  estimate_id uuid not null references estimates(id),
  from_status text,
  to_status text not null,
  reason text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table job_orders (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  customer_id uuid not null references customers(id),
  motorcycle_id uuid not null references motorcycles(id),
  job_order_number text not null,
  status text not null default 'pending',
  service_advisor_user_id uuid not null references users(id),
  primary_mechanic_user_id uuid references users(id),
  mileage_at_intake integer not null,
  customer_concern text not null,
  internal_notes text,
  completed_at timestamptz,
  released_at timestamptz,
  no_charge_reason text,
  release_with_balance_reason text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0,
  unique(tenant_id, job_order_number),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  constraint chk_job_order_mileage check (mileage_at_intake >= 0)
);

create index idx_job_orders_board on job_orders(tenant_id, branch_id, status, created_at desc);
create index idx_job_orders_customer on job_orders(tenant_id, customer_id, created_at desc);
create index idx_job_orders_motorcycle on job_orders(tenant_id, motorcycle_id, created_at desc);

create table job_order_status_events (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  job_order_id uuid not null references job_orders(id),
  from_status text,
  to_status text not null,
  reason text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table job_order_mechanics (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  job_order_id uuid not null references job_orders(id),
  user_id uuid not null references users(id),
  assignment_type text not null,
  assigned_at timestamptz not null default now(),
  removed_at timestamptz
);

create unique index ux_job_order_mechanics_active
on job_order_mechanics(tenant_id, job_order_id, user_id, assignment_type)
where removed_at is null;

create table job_order_lines (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  job_order_id uuid not null references job_orders(id),
  line_type text not null,
  service_id uuid references services(id),
  product_id uuid,
  description text not null,
  quantity numeric(14,3) not null default 1,
  unit_price numeric(14,2) not null default 0,
  authorized_amount numeric(14,2) not null default 0,
  status text not null default 'active',
  inventory_reservation_id uuid,
  completed_at timestamptz,
  line_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_job_order_line_amounts check (quantity > 0 and unit_price >= 0 and authorized_amount >= 0)
);

create index idx_job_order_lines_order on job_order_lines(tenant_id, job_order_id);

create table job_order_line_snapshots (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  job_order_line_id uuid not null references job_order_lines(id),
  source_name text,
  source_price numeric(14,2),
  source_disclaimer text,
  captured_at timestamptz not null default now(),
  unique(tenant_id, job_order_line_id)
);

create table mechanic_work_sessions (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  job_order_id uuid not null references job_orders(id),
  mechanic_user_id uuid not null references users(id),
  status text not null default 'active',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  total_active_seconds integer not null default 0,
  notes text,
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  constraint chk_mechanic_session_duration check (total_active_seconds >= 0)
);

create unique index ux_one_unfinished_session_per_mechanic
on mechanic_work_sessions(tenant_id, mechanic_user_id)
where finished_at is null;

create table mechanic_work_session_pauses (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  work_session_id uuid not null references mechanic_work_sessions(id),
  paused_at timestamptz not null,
  resumed_at timestamptz,
  resumed_by_user_id uuid references users(id),
  constraint chk_pause_resume_order check (resumed_at is null or resumed_at >= paused_at)
);
```

---

## 10. Inventory, FIFO, Transfers, Adjustments

```sql
create table product_categories (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  name text not null,
  normalized_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create unique index ux_product_categories_active_name
on product_categories(tenant_id, normalized_name)
where status = 'active';

create table products (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  category_id uuid not null references product_categories(id),
  name text not null,
  normalized_name text not null,
  sku text not null,
  normalized_sku text not null,
  barcode text,
  normalized_barcode text,
  supplier_code text,
  brand text,
  unit_of_measure text not null,
  default_cost numeric(14,2) not null default 0,
  selling_price numeric(14,2) not null default 0,
  reorder_level numeric(14,3) not null default 0,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0,
  unique(tenant_id, normalized_sku),
  constraint chk_product_amounts check (default_cost >= 0 and selling_price >= 0 and reorder_level >= 0)
);

create unique index ux_products_active_barcode
on products(tenant_id, normalized_barcode)
where status = 'active' and normalized_barcode is not null;

create index idx_products_active_category on products(tenant_id, category_id, status, normalized_name);
create index idx_products_name_trgm on products using gin(normalized_name gin_trgm_ops);

create table stock_balances (
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  product_id uuid not null references products(id),
  on_hand_qty numeric(14,3) not null default 0,
  reserved_qty numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0,
  primary key(tenant_id, branch_id, product_id),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  constraint chk_stock_non_negative check (on_hand_qty >= 0 and reserved_qty >= 0 and on_hand_qty >= reserved_qty)
);

create index idx_stock_balances_branch_product on stock_balances(tenant_id, branch_id, product_id);

create table inventory_ledger_entries (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  product_id uuid not null references products(id),
  transaction_type text not null,
  quantity_delta_on_hand numeric(14,3) not null default 0,
  quantity_delta_reserved numeric(14,3) not null default 0,
  unit_cost numeric(14,2),
  total_cost numeric(14,2),
  source_type text not null,
  source_id uuid not null,
  occurred_at timestamptz not null default now(),
  created_by_user_id uuid references users(id),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id)
);

create index idx_inventory_ledger_product_date
on inventory_ledger_entries(tenant_id, branch_id, product_id, occurred_at desc);

create table fifo_layers (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  product_id uuid not null references products(id),
  quantity_received numeric(14,3) not null,
  remaining_quantity numeric(14,3) not null,
  unit_cost numeric(14,2) not null,
  source_transaction_type text not null,
  source_transaction_id uuid not null,
  received_at timestamptz not null,
  original_source_layer_id uuid references fifo_layers(id),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  constraint chk_fifo_layer_quantities check (quantity_received > 0 and remaining_quantity >= 0 and remaining_quantity <= quantity_received),
  constraint chk_fifo_layer_cost check (unit_cost >= 0)
);

create index idx_fifo_open_layers
on fifo_layers(tenant_id, branch_id, product_id, received_at, id)
where remaining_quantity > 0;

create table inventory_reservations (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  product_id uuid not null references products(id),
  source_type text not null,
  source_id uuid not null,
  requested_quantity numeric(14,3) not null,
  reserved_quantity numeric(14,3) not null,
  status text not null default 'active',
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  consumed_at timestamptz,
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  constraint chk_inventory_reservation_qty check (requested_quantity > 0 and reserved_quantity > 0)
);

create index idx_active_reservations
on inventory_reservations(tenant_id, branch_id, product_id, status)
where status = 'active';

create table fifo_reservation_allocations (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  reservation_id uuid not null references inventory_reservations(id),
  fifo_layer_id uuid not null references fifo_layers(id),
  reserved_quantity numeric(14,3) not null,
  unit_cost_snapshot numeric(14,2) not null,
  status text not null default 'active',
  allocated_at timestamptz not null default now(),
  released_at timestamptz,
  consumed_at timestamptz,
  constraint chk_fifo_allocation_qty check (reserved_quantity > 0)
);

create index idx_active_fifo_allocations
on fifo_reservation_allocations(tenant_id, fifo_layer_id, status)
where status = 'active';

create table fifo_consumptions (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  product_id uuid not null references products(id),
  fifo_layer_id uuid not null references fifo_layers(id),
  quantity_consumed numeric(14,3) not null,
  unit_cost numeric(14,2) not null,
  total_cost numeric(14,2) not null,
  source_type text not null,
  source_id uuid not null,
  consumed_at timestamptz not null default now(),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  constraint chk_fifo_consumption_qty check (quantity_consumed > 0)
);

create index idx_fifo_consumptions_source on fifo_consumptions(tenant_id, source_type, source_id);
```

### 10.1 Inventory Adjustments

```sql
create table inventory_adjustments (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  adjustment_number text not null,
  status text not null default 'draft',
  reason text not null,
  value_impact numeric(14,2) not null default 0,
  approval_required boolean not null default false,
  requested_by_user_id uuid not null references users(id),
  approved_by_user_id uuid references users(id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(tenant_id, adjustment_number),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id)
);

create index idx_inventory_adjustments_pending on inventory_adjustments(tenant_id, branch_id, status, created_at desc);

create table inventory_adjustment_lines (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  adjustment_id uuid not null references inventory_adjustments(id),
  product_id uuid not null references products(id),
  adjustment_type text not null,
  quantity_difference numeric(14,3),
  final_counted_quantity numeric(14,3),
  unit_cost numeric(14,2),
  estimated_fifo_cost numeric(14,2),
  constraint chk_inventory_adjustment_line_value check (quantity_difference is not null or final_counted_quantity is not null)
);

create table inventory_adjustment_status_events (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  adjustment_id uuid not null references inventory_adjustments(id),
  from_status text,
  to_status text not null,
  reason text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);
```

### 10.2 Inventory Transfers

```sql
create table inventory_transfers (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  transfer_number text not null,
  source_branch_id uuid not null,
  destination_branch_id uuid not null,
  status text not null default 'draft',
  created_by_user_id uuid references users(id),
  sent_by_user_id uuid references users(id),
  received_by_user_id uuid references users(id),
  sent_at timestamptz,
  received_at timestamptz,
  remarks text,
  created_at timestamptz not null default now(),
  unique(tenant_id, transfer_number),
  foreign key (tenant_id, source_branch_id) references branches(tenant_id, id),
  foreign key (tenant_id, destination_branch_id) references branches(tenant_id, id),
  constraint chk_transfer_different_branches check (source_branch_id <> destination_branch_id)
);

create index idx_inventory_transfers_source_status on inventory_transfers(tenant_id, source_branch_id, status, created_at desc);
create index idx_inventory_transfers_destination_status on inventory_transfers(tenant_id, destination_branch_id, status, created_at desc);

create table inventory_transfer_lines (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  transfer_id uuid not null references inventory_transfers(id),
  product_id uuid not null references products(id),
  requested_quantity numeric(14,3) not null,
  reserved_quantity numeric(14,3),
  sent_quantity numeric(14,3),
  received_quantity numeric(14,3),
  variance_quantity numeric(14,3),
  variance_reason text,
  reservation_id uuid references inventory_reservations(id),
  constraint chk_transfer_line_requested check (requested_quantity > 0),
  constraint chk_transfer_line_non_negative check (
    coalesce(reserved_quantity,0) >= 0 and coalesce(sent_quantity,0) >= 0 and
    coalesce(received_quantity,0) >= 0 and coalesce(variance_quantity,0) >= 0
  )
);

create table inventory_transfer_status_events (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  transfer_id uuid not null references inventory_transfers(id),
  from_status text,
  to_status text not null,
  reason text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);
```

---

## 11. Suppliers, Purchases, Supplier Returns, AP

```sql
create table suppliers (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  name text not null,
  normalized_name text not null,
  contact_person text,
  mobile_number text,
  email text,
  address text,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index ux_suppliers_active_name
on suppliers(tenant_id, normalized_name)
where status = 'active';

create table purchase_orders (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  supplier_id uuid not null references suppliers(id),
  purchase_order_number text not null,
  status text not null default 'draft',
  payment_terms text not null,
  order_date date not null,
  expected_receive_date date,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, purchase_order_number),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  constraint chk_purchase_payment_terms check (payment_terms in ('cash','credit'))
);

create index idx_purchase_orders_branch_status on purchase_orders(tenant_id, branch_id, status, order_date desc);

create table purchase_order_lines (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  purchase_order_id uuid not null references purchase_orders(id),
  product_id uuid not null references products(id),
  ordered_quantity numeric(14,3) not null,
  received_quantity numeric(14,3) not null default 0,
  unit_cost numeric(14,2) not null,
  line_total numeric(14,2) not null,
  notes text,
  constraint chk_po_line_qty check (ordered_quantity > 0 and received_quantity >= 0 and received_quantity <= ordered_quantity),
  constraint chk_po_line_cost check (unit_cost >= 0 and line_total >= 0)
);

create table purchase_receivings (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  purchase_order_id uuid not null references purchase_orders(id),
  supplier_id uuid not null references suppliers(id),
  received_at timestamptz not null default now(),
  received_by_user_id uuid not null references users(id),
  payment_method text,
  payment_reference text,
  posted_at timestamptz,
  foreign key (tenant_id, branch_id) references branches(tenant_id, id)
);

create table purchase_receiving_lines (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  receiving_id uuid not null references purchase_receivings(id),
  purchase_order_line_id uuid not null references purchase_order_lines(id),
  product_id uuid not null references products(id),
  received_quantity numeric(14,3) not null,
  received_unit_cost numeric(14,2) not null,
  fifo_layer_id uuid references fifo_layers(id),
  constraint chk_receiving_line_qty check (received_quantity > 0 and received_unit_cost >= 0)
);

create table supplier_payables (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  supplier_id uuid not null references suppliers(id),
  branch_id uuid,
  source_type text not null,
  source_id uuid not null,
  amount_delta numeric(14,2) not null,
  occurred_at timestamptz not null default now()
);

create index idx_supplier_payables_supplier on supplier_payables(tenant_id, supplier_id, occurred_at desc);

create table supplier_payments (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  supplier_id uuid not null references suppliers(id),
  amount numeric(14,2) not null,
  payment_date date not null,
  payment_method text not null,
  reference_number text,
  notes text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  constraint chk_supplier_payment_amount check (amount > 0)
);

create table supplier_credits (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  supplier_id uuid not null references suppliers(id),
  branch_id uuid,
  amount numeric(14,2) not null,
  reason text not null,
  source_type text,
  source_id uuid,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  constraint chk_supplier_credit_amount check (amount > 0)
);

create table supplier_returns (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  supplier_id uuid not null references suppliers(id),
  original_receiving_id uuid references purchase_receivings(id),
  status text not null default 'draft',
  reason text not null,
  financial_value numeric(14,2) not null default 0,
  supplier_credit_id uuid references supplier_credits(id),
  posted_at timestamptz,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id)
);

create table supplier_return_lines (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  supplier_return_id uuid not null references supplier_returns(id),
  product_id uuid not null references products(id),
  returned_quantity numeric(14,3) not null,
  unit_cost numeric(14,2) not null,
  total_cost numeric(14,2) not null,
  constraint chk_supplier_return_line_amounts check (returned_quantity > 0 and unit_cost >= 0 and total_cost >= 0)
);
```

---

## 12. Invoices, Billing Allocations, Payments, Receipts, Refunds, AR

```sql
create table invoices (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  customer_id uuid not null references customers(id),
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  status text not null default 'draft',
  tax_profile text,
  tax_mode text,
  vat_rate numeric(5,4),
  subtotal_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  amount_refunded numeric(14,2) not null default 0,
  remaining_collectible_balance numeric(14,2) not null default 0,
  discount_reason text,
  issued_at timestamptz,
  cancelled_at timestamptz,
  voided_at timestamptz,
  refunded_at timestamptz,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0,
  unique(tenant_id, invoice_number),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  constraint chk_invoice_amounts check (
    subtotal_amount >= 0 and discount_amount >= 0 and tax_amount >= 0 and total_amount >= 0 and
    amount_paid >= 0 and amount_refunded >= 0 and remaining_collectible_balance >= 0
  )
);

create index idx_invoices_list on invoices(tenant_id, branch_id, status, invoice_date desc);
create index idx_invoices_ar_due on invoices(tenant_id, branch_id, due_date, status) where remaining_collectible_balance > 0;

create table invoice_job_orders (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  invoice_id uuid not null references invoices(id),
  job_order_id uuid not null references job_orders(id),
  created_at timestamptz not null default now(),
  unique(tenant_id, invoice_id, job_order_id)
);

create table invoice_lines (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  invoice_id uuid not null references invoices(id),
  originating_job_order_line_id uuid references job_order_lines(id),
  line_type text not null,
  product_id uuid references products(id),
  service_id uuid references services(id),
  description text not null,
  quantity numeric(14,3) not null default 1,
  unit_price numeric(14,2) not null default 0,
  line_discount_amount numeric(14,2) not null default 0,
  allocated_invoice_discount_amount numeric(14,2) not null default 0,
  taxable_base_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  line_order integer not null default 0,
  constraint chk_invoice_line_non_negative check (
    quantity > 0 and unit_price >= 0 and line_discount_amount >= 0 and
    allocated_invoice_discount_amount >= 0 and taxable_base_amount >= 0 and tax_amount >= 0 and line_total >= 0
  )
);

create index idx_invoice_lines_report on invoice_lines(tenant_id, invoice_id, line_type, product_id, service_id);

create table invoice_billing_allocations (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  invoice_id uuid not null references invoices(id),
  invoice_line_id uuid not null references invoice_lines(id),
  job_order_line_id uuid not null references job_order_lines(id),
  allocated_quantity numeric(14,3),
  allocated_amount numeric(14,2),
  status text not null default 'reserved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_billing_allocation_value check (allocated_quantity is not null or allocated_amount is not null)
);

create index idx_billing_allocations_line_status
on invoice_billing_allocations(tenant_id, job_order_line_id, status);

create table invoice_status_events (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  invoice_id uuid not null references invoices(id),
  from_status text,
  to_status text not null,
  reason text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  invoice_id uuid not null references invoices(id),
  amount numeric(14,2) not null,
  refundable_amount numeric(14,2) not null,
  payment_date date not null,
  payment_method text not null,
  reference_number text,
  notes text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  constraint chk_payment_amount_positive check (amount > 0 and refundable_amount >= 0 and refundable_amount <= amount)
);

create index idx_payments_invoice on payments(tenant_id, invoice_id, created_at desc);
create index idx_payments_report_date on payments(tenant_id, payment_date, payment_method);

create table receipts (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  invoice_id uuid not null references invoices(id),
  payment_id uuid not null unique references payments(id),
  receipt_number text not null,
  amount numeric(14,2) not null,
  payment_method text not null,
  issued_at timestamptz not null default now(),
  created_by_user_id uuid references users(id),
  unique(tenant_id, receipt_number),
  constraint chk_receipt_amount check (amount > 0)
);

create table refunds (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  invoice_id uuid not null references invoices(id),
  payment_id uuid not null references payments(id),
  amount numeric(14,2) not null,
  reason text not null,
  collection_should_continue boolean not null default true,
  close_invoice_after_refund boolean not null default false,
  inventory_reversal_selected boolean not null default false,
  status text not null default 'posted',
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  constraint chk_refund_amount_positive check (amount > 0)
);

create index idx_refunds_payment on refunds(tenant_id, payment_id, created_at desc);
create index idx_refunds_report_date on refunds(tenant_id, created_at);
```

---

## 13. Expenses

```sql
create table expense_categories (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  name text not null,
  normalized_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create unique index ux_expense_categories_active_name
on expense_categories(tenant_id, normalized_name)
where status = 'active';

create table expenses (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  category_id uuid not null references expense_categories(id),
  expense_date date not null,
  amount numeric(14,2) not null,
  payment_method text not null,
  reference_number text,
  description text not null,
  status text not null default 'active',
  void_reason text,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  constraint chk_expense_amount check (amount > 0)
);

create index idx_expenses_report_date on expenses(tenant_id, branch_id, expense_date desc, status);

create table expense_status_events (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  expense_id uuid not null references expenses(id),
  from_status text,
  to_status text not null,
  reason text,
  before_json jsonb,
  after_json jsonb,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);
```

---

## 14. Reminders and Notifications

```sql
create table notification_templates (
  id uuid primary key,
  tenant_id uuid references tenants(id),
  template_type text not null,
  channel text not null,
  subject text,
  body text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table customer_reminders (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  customer_id uuid not null references customers(id),
  motorcycle_id uuid references motorcycles(id),
  job_order_id uuid references job_orders(id),
  reminder_type text not null,
  status text not null default 'scheduled',
  due_date date,
  due_mileage integer,
  message_snapshot text,
  created_by_user_id uuid references users(id),
  scheduled_for timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_customer_reminders_due on customer_reminders(tenant_id, status, scheduled_for);

create table reminder_deliveries (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  reminder_id uuid not null references customer_reminders(id),
  channel text not null,
  destination text,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  sent_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

create table notification_outbox (
  id uuid primary key,
  tenant_id uuid references tenants(id),
  recipient_type text not null,
  recipient_id uuid,
  channel text not null,
  destination text,
  subject text,
  body text not null,
  status text not null default 'pending',
  scheduled_for timestamptz not null default now(),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notification_outbox_due on notification_outbox(status, scheduled_for, next_attempt_at);

create table notification_attempts (
  id uuid primary key,
  notification_outbox_id uuid not null references notification_outbox(id),
  attempt_number integer not null,
  provider text,
  provider_message_id text,
  status text not null,
  response_json jsonb,
  attempted_at timestamptz not null default now(),
  unique(notification_outbox_id, attempt_number)
);

create table in_app_notifications (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_in_app_notifications_unread on in_app_notifications(tenant_id, user_id, created_at desc) where read_at is null;
```

---

## 15. Files, Exports, Offline Cache

```sql
create table files (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  storage_provider text not null,
  bucket text not null,
  object_key text not null,
  original_filename text not null,
  content_type text not null,
  size_bytes bigint not null,
  checksum_sha256 text,
  status text not null default 'active',
  malware_scan_status text,
  uploaded_by_user_id uuid references users(id),
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz,
  permanent_delete_after timestamptz,
  unique(storage_provider, bucket, object_key),
  constraint chk_file_size check (size_bytes > 0)
);

create index idx_files_tenant_status on files(tenant_id, status, uploaded_at desc);

create table file_links (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  file_id uuid not null references files(id),
  entity_type text not null,
  entity_id uuid not null,
  purpose text,
  linked_at timestamptz not null default now()
);

create index idx_file_links_entity on file_links(tenant_id, entity_type, entity_id);

create table tenant_export_jobs (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  requested_by_user_id uuid not null references users(id),
  status text not null default 'queued',
  include_attachments boolean not null default true,
  include_soft_deleted boolean not null default false,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  failure_reason text
);

create index idx_tenant_export_jobs_tenant_status on tenant_export_jobs(tenant_id, status, requested_at desc);

create table tenant_export_files (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  export_job_id uuid not null references tenant_export_jobs(id),
  file_id uuid references files(id),
  manifest_json jsonb not null,
  row_counts_json jsonb,
  checksum_sha256 text,
  created_at timestamptz not null default now()
);

create table tenant_export_included_attachments (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  export_job_id uuid not null references tenant_export_jobs(id),
  source_file_id uuid not null references files(id),
  export_path text not null,
  included boolean not null,
  failure_reason text
);

create table offline_cache_manifests (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  scope_hash text not null,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  etag text not null,
  record_counts_json jsonb not null
);

create table sync_versions (
  tenant_id uuid not null references tenants(id),
  entity_type text not null,
  branch_id uuid,
  version_number bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key(tenant_id, entity_type, branch_id)
);
```

---

## 16. Audit, Idempotency, Background Jobs, Operations

```sql
create table audit_logs (
  id uuid primary key,
  tenant_id uuid references tenants(id),
  actor_user_id uuid references users(id),
  actor_type text not null,
  support_access_session_id uuid references platform_support_access_sessions(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  branch_id uuid,
  before_json jsonb,
  after_json jsonb,
  metadata_json jsonb,
  reason text,
  ip_address inet,
  user_agent text,
  retention_class text not null default 'standard_3_year',
  created_at timestamptz not null default now()
);

create index idx_audit_logs_tenant_time on audit_logs(tenant_id, created_at desc);
create index idx_audit_logs_entity on audit_logs(tenant_id, entity_type, entity_id);

create table platform_audit_logs (
  id uuid primary key,
  platform_admin_user_id uuid references users(id),
  tenant_id uuid references tenants(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata_json jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table audit_retention_policies (
  retention_class text primary key,
  retention_days integer not null,
  description text,
  constraint chk_audit_retention_minimum check (retention_days >= 1095)
);

create table idempotency_keys (
  id uuid primary key,
  tenant_id uuid references tenants(id),
  user_id uuid references users(id),
  endpoint text not null,
  request_intent_hash text not null,
  idempotency_key_hash text not null,
  status text not null default 'processing',
  response_status_code integer,
  response_body_json jsonb,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique(tenant_id, user_id, endpoint, request_intent_hash, idempotency_key_hash)
);

create table document_sequences (
  tenant_id uuid not null references tenants(id),
  sequence_type text not null,
  sequence_date date,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key(tenant_id, sequence_type, sequence_date)
);

create table background_jobs (
  id uuid primary key,
  tenant_id uuid references tenants(id),
  job_type text not null,
  status text not null default 'queued',
  payload_json jsonb not null,
  run_after timestamptz not null default now(),
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  locked_by text,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  correlation_id text
);

create index idx_background_jobs_due on background_jobs(status, run_after, locked_until);

create table background_job_attempts (
  id uuid primary key,
  job_id uuid not null references background_jobs(id),
  attempt_number integer not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  error_message text,
  metadata_json jsonb,
  unique(job_id, attempt_number)
);

create table outbox_events (
  id uuid primary key,
  tenant_id uuid references tenants(id),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload_json jsonb not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index idx_outbox_events_pending on outbox_events(status, created_at) where status = 'pending';

create table rate_limit_events (
  id uuid primary key,
  tenant_id uuid references tenants(id),
  user_id uuid references users(id),
  key text not null,
  endpoint_category text not null,
  ip_address inet,
  occurred_at timestamptz not null default now(),
  metadata_json jsonb
);

create table integration_events (
  id uuid primary key,
  tenant_id uuid references tenants(id),
  provider text not null,
  integration_type text not null,
  operation text not null,
  status text not null,
  request_id text,
  response_json jsonb,
  error_message text,
  occurred_at timestamptz not null default now()
);
```

---

## 17. Reporting Read Models

Transactional source tables remain the source of truth. Reporting tables are cache/read models and can be rebuilt.

```sql
create table report_daily_sales (
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  report_date date not null,
  gross_revenue numeric(14,2) not null default 0,
  discounts numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  net_revenue numeric(14,2) not null default 0,
  refund_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(tenant_id, branch_id, report_date)
);

create table report_daily_payments (
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  report_date date not null,
  payment_method text not null,
  collected_amount numeric(14,2) not null default 0,
  refunded_amount numeric(14,2) not null default 0,
  net_collected_amount numeric(14,2) not null default 0,
  primary key(tenant_id, branch_id, report_date, payment_method)
);

create table report_stock_valuation_snapshots (
  tenant_id uuid not null references tenants(id),
  branch_id uuid not null,
  product_id uuid not null references products(id),
  snapshot_date date not null,
  quantity_on_hand numeric(14,3) not null,
  stock_value numeric(14,2) not null,
  primary key(tenant_id, branch_id, product_id, snapshot_date)
);

create table dashboard_snapshots (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  branch_id uuid,
  snapshot_type text not null,
  snapshot_date date not null,
  metrics_json jsonb not null,
  generated_at timestamptz not null default now()
);

create index idx_dashboard_snapshots_lookup
on dashboard_snapshots(tenant_id, branch_id, snapshot_type, snapshot_date desc);
```

---

## 18. Search Read Models

```sql
create table customer_search_documents (
  tenant_id uuid not null references tenants(id),
  customer_id uuid not null references customers(id),
  search_vector tsvector not null,
  search_text text not null,
  updated_at timestamptz not null default now(),
  primary key(tenant_id, customer_id)
);

create index idx_customer_search_vector on customer_search_documents using gin(search_vector);
create index idx_customer_search_trgm on customer_search_documents using gin(search_text gin_trgm_ops);

create table product_search_documents (
  tenant_id uuid not null references tenants(id),
  product_id uuid not null references products(id),
  search_vector tsvector not null,
  search_text text not null,
  updated_at timestamptz not null default now(),
  primary key(tenant_id, product_id)
);

create index idx_product_search_vector on product_search_documents using gin(search_vector);
create index idx_product_search_trgm on product_search_documents using gin(search_text gin_trgm_ops);
```

Additional search documents should be created for motorcycles, suppliers, job orders, invoices, purchases, and files using the same pattern.

---

## 19. Critical Transaction Boundaries

The following operations must run inside one database transaction with row-level locks on affected rows:

| Operation                         | Required Locked Rows / Tables                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Document number generation        | `document_sequences` row.                                                                                                            |
| Invoice draft/update/issue        | `invoices`, `invoice_lines`, `invoice_billing_allocations`, source `job_order_lines`.                                                |
| Payment + receipt                 | `invoices`, `payments`, `receipts`, `document_sequences`.                                                                            |
| Refund                            | `payments`, `invoices`, `refunds`, optional stock/FIFO rows.                                                                         |
| Job order completion              | `job_orders`, `inventory_reservations`, `stock_balances`, `fifo_layers`, `fifo_reservation_allocations`, `inventory_ledger_entries`. |
| Inventory reservation             | `stock_balances`, `fifo_layers`, `fifo_reservation_allocations`, `inventory_reservations`.                                           |
| Reservation release               | `inventory_reservations`, `stock_balances`, `fifo_reservation_allocations`.                                                          |
| Inventory adjustment posting      | `inventory_adjustments`, `stock_balances`, `fifo_layers`, `inventory_ledger_entries`.                                                |
| Purchase receiving                | `purchase_order_lines`, `stock_balances`, `fifo_layers`, `supplier_payables`.                                                        |
| Supplier return                   | `supplier_returns`, `stock_balances`, `fifo_layers`, `supplier_payables`, `supplier_credits`.                                        |
| Inventory transfer receive/cancel | `inventory_transfers`, `inventory_transfer_lines`, source/destination `stock_balances`, `fifo_layers`.                               |
| Tenant deletion                   | `tenant_deletion_jobs`, tenant-owned records, outbox/deletion manifests.                                                             |

---

## 20. Must-Have Index Rules

1. Every high-volume tenant table must have at least one leading `tenant_id` index.
2. Every branch operational list must have `(tenant_id, branch_id, status, created_at desc)` or equivalent.
3. Large ledgers must use keyset pagination on `(tenant_id, branch_id, occurred_at, id)`.
4. Report queries must use tenant, branch, status, and date predicates.
5. Full-text and trigram indexes must never replace exact normalized lookup indexes.
6. Append-only growth tables should be partition-ready:
   - `inventory_ledger_entries`
   - `fifo_consumptions`
   - `audit_logs`
   - `notification_attempts`
   - `background_job_attempts`

---

## 21. Immutability Rules

The following tables should be append-only or protected by database triggers/restricted permissions:

```text
inventory_ledger_entries
fifo_consumptions
payments
receipts
refunds
audit_logs
platform_audit_logs
notification_attempts
*_status_events
supplier_payables
```

Recommended trigger pattern:

```sql
create or replace function prevent_update_delete()
returns trigger as $$
begin
  raise exception 'table % is append-only', tg_table_name;
end;
$$ language plpgsql;
```

Apply the trigger to append-only tables after migration and seed loading.

---

## 22. Row-Level Security Recommendation

RLS is recommended as defense-in-depth.

Example:

```sql
alter table customers enable row level security;

create policy tenant_isolation_customers
on customers
using (tenant_id = current_setting('app.tenant_id')::uuid);
```

Platform support access should use controlled session claims and must always be backed by `platform_support_access_sessions` and audit logs.

---

## 23. Seed Data

### 23.1 Platform Seeds

- Subscription plans: `basic`, `mid`, `high`.
- Plan limits:
  - Basic: 1 active branch, in-app/push enabled, email/SMS/customer email/customer SMS disabled.
  - Mid: 3 active branches, customer email enabled, SMS disabled, branch reports enabled.
  - High: 10 active branches, customer SMS enabled, advanced reports enabled.
- Permission codes from PRD Section 7.12.
- Audit retention policy: minimum `1095` days.

### 23.2 Per-Tenant Onboarding Seeds

- Role templates:
  - Shop Owner
  - Manager
  - Service Advisor
  - Mechanic
  - Cashier
  - Inventory Clerk
- Product categories:
  - Engine Oil
  - Tires
  - Accessories
  - Brake Parts
  - CVT Parts
  - Lubricants
- Default notification templates when finalized.

---

## 24. QA Acceptance Checklist

The schema is acceptable only if automated tests prove:

- Tenant-owned records cannot be accessed across tenants.
- Branch-scoped records require branch access.
- Duplicate document numbers cannot occur under concurrent requests.
- Payments cannot exceed invoice remaining balance.
- Refunds cannot exceed refundable balance.
- Receipts are immutable and one-to-one with payments.
- Invoice billing allocations prevent overbilling across concurrent drafts and issued invoices.
- Stock balances cannot become negative.
- On-hand cannot become lower than reserved.
- FIFO reservation allocations cannot exceed allocatable FIFO layer quantity.
- FIFO consumption uses oldest available allocated layers.
- Purchase receiving creates FIFO layers and AP only for credit purchases.
- Cash purchases do not create AP.
- Supplier returns reduce stock and AP or create supplier credit according to payment state.
- Inventory transfers preserve FIFO cost references.
- Read-only/suspended/pending-deletion tenant statuses block operational writes.
- Audit logs are written for critical actions and cannot be edited.
- Tenant export includes attachment manifest and optional attachment binaries.
- Tenant deletion preserves platform-retained audit records and removes eligible tenant operational records.

---

## 25. Remaining Engineering Decisions

These are implementation decisions, not product ambiguities:

1. ORM and migration tooling.
2. UUIDv7 generation strategy.
3. Whether enums are PostgreSQL enum types or `text` with checks.
4. Whether RLS is enabled from day one.
5. Whether append-only table immutability is trigger-enforced from day one.
6. Whether reporting read models are materialized views or maintained aggregate tables.
7. When to introduce monthly partitioning for append-only tables.

---

## 26. Recommended Migration Order

1. Extensions, enum/check scaffolding, utility functions.
2. Platform, tenants, plans, subscriptions.
3. Users, auth tokens, roles, permissions.
4. Shop profiles, branches, branch assignments.
5. Customers, motorcycles, files.
6. Services, estimates, job orders, mechanic sessions.
7. Products, stock balances, FIFO, reservations, inventory ledger.
8. Inventory adjustments and transfers.
9. Suppliers, purchases, supplier returns, AP.
10. Invoices, billing allocations, payments, receipts, refunds.
11. Expenses.
12. Reminders, notifications, outbox.
13. Audit logs, idempotency, background jobs, operations tables.
14. Export, offline cache, reporting/search read models.
15. RLS policies, immutable triggers, performance indexes, partitioning prep.
