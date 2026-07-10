exports.up = (pgm) => {
  pgm.sql(`
    create table user_notification_preferences (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      user_id uuid not null references users(id),
      notification_type text not null,
      channel text not null,
      enabled boolean not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),

      constraint ux_user_notification_preferences_scope
        unique (tenant_id, user_id, notification_type, channel),

      constraint chk_user_notification_preferences_type check (
        notification_type in (
          'low_stock',
          'new_job_order',
          'assignment',
          'service_completion',
          'payment',
          'subscription_renewal_alert',
          'inventory_transfer_update',
          'purchase_receiving_update',
          'reminder_due_alert',
          'failed_reminder_delivery',
          'employee_deactivation',
          'role_permission_change'
        )
      ),

      constraint chk_user_notification_preferences_channel check (
        channel in ('in_app', 'push', 'email', 'sms')
      )
    );

    create index idx_user_notification_preferences_user
      on user_notification_preferences(tenant_id, user_id, notification_type, channel);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    drop index if exists idx_user_notification_preferences_user;
    drop table if exists user_notification_preferences;
  `);
};
