exports.up = async (pgm) => {
  pgm.sql(`
    create table services (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      name text not null,
      normalized_name text not null,
      starting_price numeric(14,2) not null default 0,
      variable_price boolean not null default false,
      price_disclaimer text,
      description text,
      status text not null default 'active',
      deactivated_at timestamptz,
      reactivated_at timestamptz,
      created_at timestamptz not null default now(),
      created_by_user_id uuid references users(id),
      updated_at timestamptz not null default now(),
      updated_by_user_id uuid references users(id),
      lock_version integer not null default 0,

      constraint chk_service_name_required check (
        char_length(trim(name)) between 1 and 150
      ),

      constraint chk_service_price check (
        starting_price >= 0
      ),

      constraint chk_service_disclaimer check (
        variable_price = false
        or (
          price_disclaimer is not null
          and char_length(trim(price_disclaimer)) > 0
        )
      ),

      constraint chk_service_status check (
        status in ('active', 'inactive')
      )
    );

    create unique index ux_services_active_name
      on services(tenant_id, normalized_name)
      where status = 'active';

    create index idx_services_list
      on services(tenant_id, status, normalized_name);

    create index idx_services_name_trgm
      on services using gin(normalized_name gin_trgm_ops);
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists idx_services_name_trgm;
    drop index if exists idx_services_list;
    drop index if exists ux_services_active_name;
    drop table if exists services;
  `);
};
