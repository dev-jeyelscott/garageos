exports.up = async (pgm) => {
  pgm.sql(`
    create table notification_templates (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid references tenants(id),
      template_type text not null,
      channel text not null,
      subject text,
      body text not null,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),

      constraint chk_notification_template_channel check (
        channel in ('in_app', 'push', 'email', 'sms')
      ),

      constraint chk_notification_template_status check (
        status in ('active', 'inactive')
      ),

      constraint chk_notification_template_body check (
        char_length(trim(body)) > 0
      )
    );

    create unique index ux_notification_templates_active
      on notification_templates(tenant_id, template_type, channel)
      where status = 'active';

    create index idx_notification_templates_tenant_status
      on notification_templates(tenant_id, status);

    create table customer_reminders (
      id uuid primary key default gen_random_uuid(),
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
      failure_reason text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      lock_version integer not null default 0,

      constraint chk_customer_reminder_status check (
        status in ('scheduled', 'due', 'sent', 'failed', 'cancelled')
      ),

      constraint chk_customer_reminder_due_target check (
        due_date is not null
        or due_mileage is not null
        or scheduled_for is not null
      ),

      constraint chk_customer_reminder_due_mileage check (
        due_mileage is null
        or due_mileage >= 0
      ),

      constraint chk_customer_reminder_sent_at check (
        status <> 'sent'
        or sent_at is not null
      ),

      constraint chk_customer_reminder_cancelled_at check (
        status <> 'cancelled'
        or cancelled_at is not null
      )
    );

    create index idx_customer_reminders_due
      on customer_reminders(tenant_id, status, scheduled_for);

    create index idx_customer_reminders_customer
      on customer_reminders(tenant_id, customer_id, created_at desc);

    create index idx_customer_reminders_motorcycle
      on customer_reminders(tenant_id, motorcycle_id, created_at desc)
      where motorcycle_id is not null;

    create table reminder_deliveries (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      reminder_id uuid not null references customer_reminders(id),
      channel text not null,
      destination text,
      status text not null default 'pending',
      attempt_count integer not null default 0,
      sent_at timestamptz,
      failure_reason text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),

      constraint chk_reminder_delivery_channel check (
        channel in ('in_app', 'push', 'email', 'sms')
      ),

      constraint chk_reminder_delivery_status check (
        status in ('pending', 'sent', 'failed')
      ),

      constraint chk_reminder_delivery_attempt_count check (
        attempt_count >= 0
      ),

      constraint chk_reminder_delivery_sent_at check (
        status <> 'sent'
        or sent_at is not null
      )
    );

    create index idx_reminder_deliveries_reminder
      on reminder_deliveries(tenant_id, reminder_id, created_at desc);

    create index idx_reminder_deliveries_status
      on reminder_deliveries(tenant_id, status, created_at desc);

    create table notification_outbox (
      id uuid primary key default gen_random_uuid(),
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
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),

      constraint chk_notification_outbox_channel check (
        channel in ('in_app', 'push', 'email', 'sms')
      ),

      constraint chk_notification_outbox_status check (
        status in ('pending', 'sent', 'failed', 'cancelled')
      ),

      constraint chk_notification_outbox_body check (
        char_length(trim(body)) > 0
      ),

      constraint chk_notification_outbox_attempt_count check (
        attempt_count >= 0
      )
    );

    create index idx_notification_outbox_due
      on notification_outbox(status, scheduled_for, next_attempt_at);

    create index idx_notification_outbox_tenant_status
      on notification_outbox(tenant_id, status, created_at desc);

    create table notification_attempts (
      id uuid primary key default gen_random_uuid(),
      notification_outbox_id uuid not null references notification_outbox(id),
      attempt_number integer not null,
      provider text,
      provider_message_id text,
      status text not null,
      response_json jsonb,
      attempted_at timestamptz not null default now(),

      unique(notification_outbox_id, attempt_number),

      constraint chk_notification_attempt_number check (
        attempt_number > 0
      ),

      constraint chk_notification_attempt_status check (
        status in ('pending', 'sent', 'failed')
      )
    );

    create index idx_notification_attempts_outbox
      on notification_attempts(notification_outbox_id, attempted_at desc);

    create table in_app_notifications (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      user_id uuid not null references users(id),
      type text not null,
      title text not null,
      body text not null,
      read_at timestamptz,
      dismissed_at timestamptz,
      created_at timestamptz not null default now(),

      constraint chk_in_app_notification_title check (
        char_length(trim(title)) > 0
      ),

      constraint chk_in_app_notification_body check (
        char_length(trim(body)) > 0
      )
    );

    create index idx_in_app_notifications_unread
      on in_app_notifications(tenant_id, user_id, created_at desc)
      where read_at is null;

    create index idx_in_app_notifications_user
      on in_app_notifications(tenant_id, user_id, created_at desc);

    create table outbox_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid references tenants(id),
      event_type text not null,
      aggregate_type text not null,
      aggregate_id uuid not null,
      payload_json jsonb not null,
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      published_at timestamptz,
      failure_reason text,

      constraint chk_outbox_events_status check (
        status in ('pending', 'published', 'failed')
      ),

      constraint chk_outbox_events_published_at check (
        status <> 'published'
        or published_at is not null
      )
    );

    create index idx_outbox_events_pending
      on outbox_events(status, created_at)
      where status = 'pending';

    create index idx_outbox_events_aggregate
      on outbox_events(tenant_id, aggregate_type, aggregate_id);
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists idx_outbox_events_aggregate;
    drop index if exists idx_outbox_events_pending;
    drop table if exists outbox_events;

    drop index if exists idx_in_app_notifications_user;
    drop index if exists idx_in_app_notifications_unread;
    drop table if exists in_app_notifications;

    drop index if exists idx_notification_attempts_outbox;
    drop table if exists notification_attempts;

    drop index if exists idx_notification_outbox_tenant_status;
    drop index if exists idx_notification_outbox_due;
    drop table if exists notification_outbox;

    drop index if exists idx_reminder_deliveries_status;
    drop index if exists idx_reminder_deliveries_reminder;
    drop table if exists reminder_deliveries;

    drop index if exists idx_customer_reminders_motorcycle;
    drop index if exists idx_customer_reminders_customer;
    drop index if exists idx_customer_reminders_due;
    drop table if exists customer_reminders;

    drop index if exists idx_notification_templates_tenant_status;
    drop index if exists ux_notification_templates_active;
    drop table if exists notification_templates;
  `);
};
