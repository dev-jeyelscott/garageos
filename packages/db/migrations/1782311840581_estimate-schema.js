exports.up = async (pgm) => {
  pgm.sql(`
    create table estimates (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      customer_id uuid not null references customers(id),
      motorcycle_id uuid references motorcycles(id),
      estimate_number text not null,
      status text not null default 'draft',
      valid_until_date date,
      approval_method text,
      approved_by_customer_name text,
      approved_at timestamptz,
      converted_job_order_id uuid,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      lock_version integer not null default 0,

      unique(tenant_id, estimate_number),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      constraint chk_estimate_status check (
        status in (
          'draft',
          'presented',
          'approved',
          'converted',
          'cancelled',
          'expired'
        )
      ),

      constraint chk_estimate_approval_method check (
        approval_method is null
        or approval_method in (
          'verbal',
          'sms',
          'email',
          'signed_document',
          'other'
        )
      ),

      constraint chk_estimate_approved_fields check (
        status <> 'approved'
        or (
          approval_method is not null
          and approved_by_customer_name is not null
          and char_length(trim(approved_by_customer_name)) > 0
          and approved_at is not null
        )
      ),

      constraint chk_estimate_converted_job_order check (
        status <> 'converted'
        or converted_job_order_id is not null
      )
    );

    create index idx_estimates_branch_status
      on estimates(tenant_id, branch_id, status, created_at desc);

    create index idx_estimates_customer
      on estimates(tenant_id, customer_id, created_at desc);

    create index idx_estimates_motorcycle
      on estimates(tenant_id, motorcycle_id, created_at desc)
      where motorcycle_id is not null;

    create table estimate_lines (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      estimate_id uuid not null references estimates(id),
      line_type text not null,
      service_id uuid references services(id),
      product_id uuid,
      description text not null,
      quantity numeric(14,3) not null default 1,
      unit_price numeric(14,2) not null default 0,
      line_total numeric(14,2) not null default 0,
      line_order integer not null default 0,

      constraint chk_estimate_line_description check (
        char_length(trim(description)) > 0
      ),

      constraint chk_estimate_line_type check (
        line_type in ('service', 'labor', 'part', 'custom')
      ),

      constraint chk_estimate_line_amounts check (
        quantity > 0
        and unit_price >= 0
        and line_total >= 0
      )
    );

    create index idx_estimate_lines_estimate
      on estimate_lines(tenant_id, estimate_id, line_order);

    create index idx_estimate_lines_service
      on estimate_lines(tenant_id, service_id)
      where service_id is not null;

    create table estimate_status_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      estimate_id uuid not null references estimates(id),
      from_status text,
      to_status text not null,
      reason text,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),

      constraint chk_estimate_status_events_from_status check (
        from_status is null
        or from_status in (
          'draft',
          'presented',
          'approved',
          'converted',
          'cancelled',
          'expired'
        )
      ),

      constraint chk_estimate_status_events_to_status check (
        to_status in (
          'draft',
          'presented',
          'approved',
          'converted',
          'cancelled',
          'expired'
        )
      )
    );

    create index idx_estimate_status_events_estimate_time
      on estimate_status_events(tenant_id, estimate_id, created_at desc);
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists idx_estimate_status_events_estimate_time;
    drop table if exists estimate_status_events;

    drop index if exists idx_estimate_lines_service;
    drop index if exists idx_estimate_lines_estimate;
    drop table if exists estimate_lines;

    drop index if exists idx_estimates_motorcycle;
    drop index if exists idx_estimates_customer;
    drop index if exists idx_estimates_branch_status;
    drop table if exists estimates;
  `);
};
