exports.up = (pgm) => {
  pgm.sql(`
    create table if not exists subscription_overrides (
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

    create index if not exists idx_subscription_overrides_tenant_time
      on subscription_overrides(tenant_id, effective_at desc);

    create index if not exists idx_subscription_overrides_active
      on subscription_overrides(tenant_id, override_type, expires_at);
  `);
};

exports.down = () => {
  // Intentionally no-op.
  // subscription_overrides is part of the canonical platform subscription schema.
  // Do not drop it from a rollback of this hardening migration because the table
  // may already exist from an earlier local schema baseline.
};
