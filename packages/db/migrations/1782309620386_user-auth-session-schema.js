exports.up = async (pgm) => {
  pgm.sql(`
    create table users (
      id uuid primary key default gen_random_uuid(),
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

      constraint chk_users_type check (
        user_type in ('tenant_user', 'platform_admin')
      ),

      constraint chk_users_status check (
        status in ('active', 'inactive')
      ),

      constraint chk_users_tenant_rule check (
        (
          user_type = 'tenant_user'
          and tenant_id is not null
        )
        or
        (
          user_type = 'platform_admin'
          and tenant_id is null
        )
      )
    );

    create unique index ux_users_active_normalized_email
      on users(normalized_email)
      where status = 'active';

    create index idx_users_tenant_status
      on users(tenant_id, status);

    create table employee_profiles (
      id uuid primary key default gen_random_uuid(),
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

      constraint chk_employee_status check (
        status in ('active', 'inactive')
      )
    );

    create table employee_invitations (
      id uuid primary key default gen_random_uuid(),
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
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id),
      token_hash text not null unique,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    );

    create table email_verification_tokens (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id),
      token_hash text not null unique,
      email text not null,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    );

    create table refresh_sessions (
      id uuid primary key default gen_random_uuid(),
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

    create index idx_refresh_sessions_user_active
      on refresh_sessions(user_id, expires_at)
      where revoked_at is null;

    create index idx_refresh_sessions_tenant
      on refresh_sessions(tenant_id);

    create table login_attempts (
      id uuid primary key default gen_random_uuid(),
      normalized_email text,
      ip_address inet,
      attempted_at timestamptz not null default now(),
      success boolean not null,
      blocked_until timestamptz,
      user_agent text
    );

    create index idx_login_attempts_email_time
      on login_attempts(normalized_email, attempted_at desc);

    create index idx_login_attempts_ip_time
      on login_attempts(ip_address, attempted_at desc);
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists idx_login_attempts_ip_time;
    drop index if exists idx_login_attempts_email_time;
    drop table if exists login_attempts;

    drop index if exists idx_refresh_sessions_tenant;
    drop index if exists idx_refresh_sessions_user_active;
    drop table if exists refresh_sessions;

    drop table if exists email_verification_tokens;
    drop table if exists password_reset_tokens;

    drop index if exists idx_employee_invitations_lookup;
    drop table if exists employee_invitations;

    drop table if exists employee_profiles;

    drop index if exists idx_users_tenant_status;
    drop index if exists ux_users_active_normalized_email;
    drop table if exists users;
  `);
};
