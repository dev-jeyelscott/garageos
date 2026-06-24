exports.up = async (pgm) => {
  pgm.sql(`
    create table audit_retention_policies (
      retention_class text primary key,
      retention_days integer not null,
      description text,

      constraint chk_audit_retention_minimum check (
        retention_days >= 1095
      )
    );

    create table audit_logs (
      id uuid primary key default gen_random_uuid(),
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
      created_at timestamptz not null default now(),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      constraint chk_audit_actor_type check (
        actor_type in ('tenant_user', 'platform_admin', 'system')
      ),

      constraint chk_audit_action check (
        char_length(trim(action)) > 0
      ),

      constraint chk_audit_entity_type check (
        char_length(trim(entity_type)) > 0
      )
    );

    create index idx_audit_logs_tenant_time
      on audit_logs(tenant_id, created_at desc);

    create index idx_audit_logs_entity
      on audit_logs(tenant_id, entity_type, entity_id);

    create index idx_audit_logs_actor_time
      on audit_logs(tenant_id, actor_user_id, created_at desc)
      where actor_user_id is not null;

    create index idx_audit_logs_support_session
      on audit_logs(support_access_session_id)
      where support_access_session_id is not null;

    create table platform_audit_logs (
      id uuid primary key default gen_random_uuid(),
      platform_admin_user_id uuid references users(id),
      tenant_id uuid references tenants(id),
      action text not null,
      entity_type text not null,
      entity_id uuid,
      metadata_json jsonb,
      ip_address inet,
      user_agent text,
      created_at timestamptz not null default now(),

      constraint chk_platform_audit_action check (
        char_length(trim(action)) > 0
      ),

      constraint chk_platform_audit_entity_type check (
        char_length(trim(entity_type)) > 0
      )
    );

    create index idx_platform_audit_logs_admin_time
      on platform_audit_logs(platform_admin_user_id, created_at desc);

    create index idx_platform_audit_logs_tenant_time
      on platform_audit_logs(tenant_id, created_at desc)
      where tenant_id is not null;

    create index idx_platform_audit_logs_entity
      on platform_audit_logs(entity_type, entity_id);

    create table idempotency_keys (
      id uuid primary key default gen_random_uuid(),
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

      unique (
        tenant_id,
        user_id,
        endpoint,
        request_intent_hash,
        idempotency_key_hash
      ),

      constraint chk_idempotency_status check (
        status in ('processing', 'succeeded', 'failed', 'expired')
      ),

      constraint chk_idempotency_endpoint check (
        char_length(trim(endpoint)) > 0
      ),

      constraint chk_idempotency_response_status_code check (
        response_status_code is null
        or response_status_code between 100 and 599
      ),

      constraint chk_idempotency_expires_after_created check (
        expires_at > created_at
      )
    );

    create index idx_idempotency_keys_lookup
      on idempotency_keys(
        tenant_id,
        user_id,
        endpoint,
        idempotency_key_hash
      );

    create index idx_idempotency_keys_cleanup
      on idempotency_keys(status, expires_at);

    create table document_sequences (
      tenant_id uuid not null references tenants(id),
      sequence_type text not null,
      sequence_date date,
      last_value bigint not null default 0,
      updated_at timestamptz not null default now(),

      primary key(tenant_id, sequence_type, sequence_date),

      constraint chk_document_sequence_type check (
        char_length(trim(sequence_type)) > 0
      ),

      constraint chk_document_sequence_last_value check (
        last_value >= 0
      )
    );

    create table background_jobs (
      id uuid primary key default gen_random_uuid(),
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
      correlation_id text,

      constraint chk_background_job_type check (
        char_length(trim(job_type)) > 0
      ),

      constraint chk_background_job_status check (
        status in (
          'queued',
          'running',
          'succeeded',
          'failed',
          'cancelled',
          'dead_lettered'
        )
      ),

      constraint chk_background_job_attempts check (
        attempt_count >= 0
        and max_attempts > 0
        and attempt_count <= max_attempts
      ),

      constraint chk_background_job_completed_at check (
        status <> 'succeeded'
        or completed_at is not null
      ),

      constraint chk_background_job_failed_at check (
        status not in ('failed', 'dead_lettered')
        or failed_at is not null
      )
    );

    create index idx_background_jobs_due
      on background_jobs(status, run_after, locked_until);

    create index idx_background_jobs_tenant_status
      on background_jobs(tenant_id, status, created_at desc);

    create index idx_background_jobs_type_status
      on background_jobs(job_type, status, run_after);

    create table background_job_attempts (
      id uuid primary key default gen_random_uuid(),
      job_id uuid not null references background_jobs(id),
      attempt_number integer not null,
      started_at timestamptz not null default now(),
      finished_at timestamptz,
      status text not null,
      error_message text,
      metadata_json jsonb,

      unique(job_id, attempt_number),

      constraint chk_background_job_attempt_number check (
        attempt_number > 0
      ),

      constraint chk_background_job_attempt_status check (
        status in (
          'running',
          'succeeded',
          'failed',
          'cancelled'
        )
      ),

      constraint chk_background_job_attempt_time_order check (
        finished_at is null
        or finished_at >= started_at
      )
    );

    create index idx_background_job_attempts_job
      on background_job_attempts(job_id, started_at desc);

    create table rate_limit_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid references tenants(id),
      user_id uuid references users(id),
      key text not null,
      endpoint_category text not null,
      ip_address inet,
      occurred_at timestamptz not null default now(),
      metadata_json jsonb,

      constraint chk_rate_limit_key check (
        char_length(trim(key)) > 0
      ),

      constraint chk_rate_limit_endpoint_category check (
        char_length(trim(endpoint_category)) > 0
      )
    );

    create index idx_rate_limit_events_key_time
      on rate_limit_events(key, occurred_at desc);

    create index idx_rate_limit_events_user_time
      on rate_limit_events(tenant_id, user_id, occurred_at desc)
      where user_id is not null;

    create index idx_rate_limit_events_ip_time
      on rate_limit_events(ip_address, occurred_at desc)
      where ip_address is not null;

    create table integration_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid references tenants(id),
      provider text not null,
      integration_type text not null,
      operation text not null,
      status text not null,
      request_id text,
      response_json jsonb,
      error_message text,
      occurred_at timestamptz not null default now(),

      constraint chk_integration_event_provider check (
        char_length(trim(provider)) > 0
      ),

      constraint chk_integration_event_type check (
        char_length(trim(integration_type)) > 0
      ),

      constraint chk_integration_event_operation check (
        char_length(trim(operation)) > 0
      ),

      constraint chk_integration_event_status check (
        status in ('pending', 'succeeded', 'failed')
      )
    );

    create index idx_integration_events_tenant_time
      on integration_events(tenant_id, occurred_at desc);

    create index idx_integration_events_provider_status
      on integration_events(provider, integration_type, status, occurred_at desc);
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists idx_integration_events_provider_status;
    drop index if exists idx_integration_events_tenant_time;
    drop table if exists integration_events;

    drop index if exists idx_rate_limit_events_ip_time;
    drop index if exists idx_rate_limit_events_user_time;
    drop index if exists idx_rate_limit_events_key_time;
    drop table if exists rate_limit_events;

    drop index if exists idx_background_job_attempts_job;
    drop table if exists background_job_attempts;

    drop index if exists idx_background_jobs_type_status;
    drop index if exists idx_background_jobs_tenant_status;
    drop index if exists idx_background_jobs_due;
    drop table if exists background_jobs;

    drop table if exists document_sequences;

    drop index if exists idx_idempotency_keys_cleanup;
    drop index if exists idx_idempotency_keys_lookup;
    drop table if exists idempotency_keys;

    drop index if exists idx_platform_audit_logs_entity;
    drop index if exists idx_platform_audit_logs_tenant_time;
    drop index if exists idx_platform_audit_logs_admin_time;
    drop table if exists platform_audit_logs;

    drop index if exists idx_audit_logs_support_session;
    drop index if exists idx_audit_logs_actor_time;
    drop index if exists idx_audit_logs_entity;
    drop index if exists idx_audit_logs_tenant_time;
    drop table if exists audit_logs;

    drop table if exists audit_retention_policies;
  `);
};
