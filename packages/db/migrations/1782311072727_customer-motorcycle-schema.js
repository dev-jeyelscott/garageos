exports.up = async (pgm) => {
  pgm.sql(`
    create table customers (
      id uuid primary key default gen_random_uuid(),
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
      merged_into_customer_id uuid references customers(id),
      deleted_at timestamptz,
      created_at timestamptz not null default now(),
      created_by_user_id uuid references users(id),
      updated_at timestamptz not null default now(),
      updated_by_user_id uuid references users(id),
      lock_version integer not null default 0,

      constraint chk_customer_name_length check (
        char_length(trim(name)) between 2 and 150
      ),

      constraint chk_customer_contact check (
        mobile_number is not null
        or email is not null
      ),

      constraint chk_customer_status check (
        status in ('active', 'merged', 'soft_deleted')
      ),

      constraint chk_customer_merged_target check (
        status <> 'merged'
        or merged_into_customer_id is not null
      ),

      constraint chk_customer_deleted_at check (
        status <> 'soft_deleted'
        or deleted_at is not null
      )
    );

    create index idx_customers_active_name
      on customers(tenant_id, normalized_name)
      where status = 'active';

    create index idx_customers_mobile
      on customers(tenant_id, normalized_mobile)
      where normalized_mobile is not null;

    create index idx_customers_email
      on customers(tenant_id, normalized_email)
      where normalized_email is not null;

    create index idx_customers_name_trgm
      on customers using gin(normalized_name gin_trgm_ops);

    create table customer_tags (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      name text not null,
      normalized_name text not null,
      status text not null default 'active',
      created_at timestamptz not null default now(),

      constraint chk_customer_tag_status check (
        status in ('active', 'inactive')
      )
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
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      source_customer_id uuid not null references customers(id),
      surviving_customer_id uuid not null references customers(id),
      reason text not null,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),

      constraint chk_customer_merge_not_self check (
        source_customer_id <> surviving_customer_id
      )
    );

    create index idx_customer_merge_events_tenant_time
      on customer_merge_events(tenant_id, created_at desc);

    create table motorcycles (
      id uuid primary key default gen_random_uuid(),
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

      constraint chk_motorcycle_brand_required check (
        char_length(trim(brand)) > 0
      ),

      constraint chk_motorcycle_model_required check (
        char_length(trim(model)) > 0
      ),

      constraint chk_motorcycle_year check (
        year is null
        or year between 1900 and 2100
      ),

      constraint chk_motorcycle_mileage check (
        latest_mileage >= 0
      ),

      constraint chk_motorcycle_status check (
        status in ('active', 'soft_deleted')
      ),

      constraint chk_motorcycle_deleted_at check (
        status <> 'soft_deleted'
        or deleted_at is not null
      )
    );

    create index idx_motorcycles_customer
      on motorcycles(tenant_id, customer_id, status);

    create unique index ux_motorcycles_active_plate
      on motorcycles(tenant_id, normalized_plate_number)
      where status = 'active'
        and normalized_plate_number is not null;

    create unique index ux_motorcycles_active_engine
      on motorcycles(tenant_id, normalized_engine_number)
      where status = 'active'
        and normalized_engine_number is not null;

    create unique index ux_motorcycles_active_chassis
      on motorcycles(tenant_id, normalized_chassis_number)
      where status = 'active'
        and normalized_chassis_number is not null;

    create index idx_motorcycles_model_trgm
      on motorcycles using gin(model gin_trgm_ops);

    create table motorcycle_mileage_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      motorcycle_id uuid not null references motorcycles(id),
      source_type text not null,
      source_id uuid,
      previous_mileage integer,
      new_mileage integer not null,
      reason text,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),

      constraint chk_mileage_event_previous check (
        previous_mileage is null
        or previous_mileage >= 0
      ),

      constraint chk_mileage_event_new check (
        new_mileage >= 0
      )
    );

    create index idx_motorcycle_mileage_events_lookup
      on motorcycle_mileage_events(
        tenant_id,
        motorcycle_id,
        created_at desc
      );
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists idx_motorcycle_mileage_events_lookup;
    drop table if exists motorcycle_mileage_events;

    drop index if exists idx_motorcycles_model_trgm;
    drop index if exists ux_motorcycles_active_chassis;
    drop index if exists ux_motorcycles_active_engine;
    drop index if exists ux_motorcycles_active_plate;
    drop index if exists idx_motorcycles_customer;
    drop table if exists motorcycles;

    drop index if exists idx_customer_merge_events_tenant_time;
    drop table if exists customer_merge_events;

    drop table if exists customer_tag_assignments;

    drop index if exists ux_customer_tags_active_name;
    drop table if exists customer_tags;

    drop index if exists idx_customers_name_trgm;
    drop index if exists idx_customers_email;
    drop index if exists idx_customers_mobile;
    drop index if exists idx_customers_active_name;
    drop table if exists customers;
  `);
};
