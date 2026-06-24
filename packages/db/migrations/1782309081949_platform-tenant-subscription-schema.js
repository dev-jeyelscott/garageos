exports.up = async (pgm) => {
  pgm.sql(`
    create table tenants (
      id uuid primary key default gen_random_uuid(),
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

      constraint chk_tenants_status check (
        status in (
          'pending_setup',
          'active',
          'grace_period',
          'read_only',
          'suspended',
          'pending_deletion',
          'deleted'
        )
      )
    );

    create unique index ux_tenants_active_business_email
      on tenants(normalized_business_name, normalized_shop_email)
      where status <> 'deleted';

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

      constraint chk_shop_invoice_prefix check (
        invoice_prefix ~ '^[A-Z0-9]{2,10}-$'
      ),

      constraint chk_shop_tax_profile check (
        tax_profile in ('vat_registered', 'non_vat', 'no_tax')
      ),

      constraint chk_shop_tax_mode check (
        tax_mode in ('tax_inclusive', 'tax_exclusive', 'no_tax')
      ),

      constraint chk_shop_tax_combo check (
        (
          tax_profile = 'vat_registered'
          and tax_mode in ('tax_inclusive', 'tax_exclusive')
        )
        or
        (
          tax_profile in ('non_vat', 'no_tax')
          and tax_mode = 'no_tax'
        )
      )
    );

    create table subscription_plans (
      id uuid primary key default gen_random_uuid(),
      code text not null unique,
      name text not null,
      status text not null default 'active',
      is_default boolean not null default false,
      default_duration_days integer,
      created_at timestamptz not null default now(),

      constraint chk_plan_code check (
        code in ('basic', 'mid', 'high')
      )
    );

    create unique index ux_one_default_subscription_plan
      on subscription_plans(is_default)
      where is_default = true and status = 'active';

    create table subscription_plan_limits (
      id uuid primary key default gen_random_uuid(),
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

      constraint chk_subscription_dates check (
        expiration_date >= start_date
      ),

      constraint chk_subscription_status_source check (
        status_source in ('system_computed', 'platform_override')
      )
    );

    create table tenant_plan_overrides (
      id uuid primary key default gen_random_uuid(),
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
      id uuid primary key default gen_random_uuid(),
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
      id uuid primary key default gen_random_uuid(),
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
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      platform_admin_user_id uuid not null,
      access_mode text not null,
      reason text not null,
      started_at timestamptz not null default now(),
      expires_at timestamptz not null,
      ended_at timestamptz,

      constraint chk_support_access_mode check (
        access_mode in ('read_only', 'write_allowed')
      )
    );

    create index idx_platform_support_access_active
      on platform_support_access_sessions(
        tenant_id,
        platform_admin_user_id,
        expires_at
      )
      where ended_at is null;

    create table tenant_deletion_jobs (
      id uuid primary key default gen_random_uuid(),
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
      where status in ('queued', 'running', 'failed');
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists ux_tenant_deletion_active_job;
    drop table if exists tenant_deletion_jobs;

    drop index if exists idx_platform_support_access_active;
    drop table if exists platform_support_access_sessions;

    drop index if exists idx_tenant_lifecycle_events_tenant_time;
    drop table if exists tenant_lifecycle_events;

    drop table if exists subscription_overrides;

    drop index if exists idx_tenant_plan_overrides_active;
    drop table if exists tenant_plan_overrides;

    drop table if exists tenant_subscriptions;

    drop table if exists subscription_plan_limits;

    drop index if exists ux_one_default_subscription_plan;
    drop table if exists subscription_plans;

    drop table if exists shop_profiles;

    drop index if exists ux_tenants_active_business_email;
    drop table if exists tenants;
  `);
};
