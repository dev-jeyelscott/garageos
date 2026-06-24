exports.up = async (pgm) => {
  pgm.sql(`
    create table permissions (
      id uuid primary key default gen_random_uuid(),
      code text not null unique,
      category text not null,
      description text
    );

    create table roles (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      name text not null,
      normalized_name text not null,
      role_type text not null,
      is_seeded_template boolean not null default false,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),

      constraint chk_role_type check (
        role_type in (
          'shop_owner',
          'manager',
          'service_advisor',
          'mechanic',
          'cashier',
          'inventory_clerk',
          'custom'
        )
      ),

      constraint chk_role_status check (
        status in ('active', 'inactive')
      )
    );

    create unique index ux_roles_active_name
      on roles(tenant_id, normalized_name)
      where status = 'active';

    create index idx_roles_tenant_type_status
      on roles(tenant_id, role_type, status);

    create table role_permissions (
      tenant_id uuid not null references tenants(id),
      role_id uuid not null references roles(id),
      permission_id uuid not null references permissions(id),
      created_at timestamptz not null default now(),

      primary key(role_id, permission_id)
    );

    create index idx_role_permissions_tenant
      on role_permissions(tenant_id);

    create table user_roles (
      id uuid primary key default gen_random_uuid(),
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

    create index idx_user_roles_user_active
      on user_roles(tenant_id, user_id)
      where removed_at is null;

    create table branches (
      id uuid not null default gen_random_uuid(),
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

      constraint chk_branch_status check (
        status in ('active', 'inactive')
      )
    );

    create unique index ux_branches_active_name
      on branches(tenant_id, normalized_name)
      where status = 'active';

    create index idx_branches_tenant_status
      on branches(tenant_id, status);

    create table user_branch_assignments (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      user_id uuid not null references users(id),
      branch_id uuid not null,
      assigned_at timestamptz not null default now(),
      assigned_by_user_id uuid references users(id),
      removed_at timestamptz,

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id)
    );

    create unique index ux_user_branch_assignments_active
      on user_branch_assignments(tenant_id, user_id, branch_id)
      where removed_at is null;

    create index idx_user_branch_assignments_user_active
      on user_branch_assignments(tenant_id, user_id)
      where removed_at is null;

    create table branch_status_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null,
      branch_id uuid not null,
      from_status text,
      to_status text not null,
      reason text,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      constraint chk_branch_status_events_to_status check (
        to_status in ('active', 'inactive')
      ),

      constraint chk_branch_status_events_from_status check (
        from_status is null
        or from_status in ('active', 'inactive')
      )
    );

    create index idx_branch_status_events_branch_time
      on branch_status_events(tenant_id, branch_id, created_at desc);

    create table tenant_settings (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null unique references tenants(id),
      timezone_change_locked_after_first_invoice boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop table if exists tenant_settings;

    drop index if exists idx_branch_status_events_branch_time;
    drop table if exists branch_status_events;

    drop index if exists idx_user_branch_assignments_user_active;
    drop index if exists ux_user_branch_assignments_active;
    drop table if exists user_branch_assignments;

    drop index if exists idx_branches_tenant_status;
    drop index if exists ux_branches_active_name;
    drop table if exists branches;

    drop index if exists idx_user_roles_user_active;
    drop index if exists ux_user_roles_active;
    drop table if exists user_roles;

    drop index if exists idx_role_permissions_tenant;
    drop table if exists role_permissions;

    drop index if exists idx_roles_tenant_type_status;
    drop index if exists ux_roles_active_name;
    drop table if exists roles;

    drop table if exists permissions;
  `);
};
