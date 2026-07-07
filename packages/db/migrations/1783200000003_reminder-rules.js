exports.up = async (pgm) => {
  pgm.sql(`
    create table reminder_rules (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      name text not null,
      normalized_name text not null,
      reminder_type text not null,
      channel text not null,
      status text not null default 'active',
      schedule_config_json jsonb not null default '{}'::jsonb,
      template_id uuid references notification_templates(id),
      created_by_user_id uuid references users(id),
      updated_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deactivated_at timestamptz,
      reactivated_at timestamptz,
      lock_version integer not null default 0,

      constraint chk_reminder_rules_name check (
        char_length(trim(name)) > 0
      ),

      constraint chk_reminder_rules_channel check (
        channel in (
          'internal_in_app',
          'internal_push',
          'internal_email',
          'customer_email',
          'customer_sms'
        )
      ),

      constraint chk_reminder_rules_status check (
        status in ('active', 'inactive')
      ),

      constraint chk_reminder_rules_schedule_config_object check (
        jsonb_typeof(schedule_config_json) = 'object'
      )
    );

    create unique index ux_reminder_rules_active_name
      on reminder_rules(tenant_id, normalized_name)
      where status = 'active';

    create index idx_reminder_rules_active_type
      on reminder_rules(tenant_id, reminder_type)
      where status = 'active';

    create index idx_reminder_rules_tenant_status
      on reminder_rules(tenant_id, status);
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists idx_reminder_rules_tenant_status;
    drop index if exists idx_reminder_rules_active_type;
    drop index if exists ux_reminder_rules_active_name;
    drop table if exists reminder_rules;
  `);
};
