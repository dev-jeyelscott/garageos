exports.up = async (pgm) => {
  pgm.sql(`
    create table job_orders (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      customer_id uuid not null references customers(id),
      motorcycle_id uuid not null references motorcycles(id),
      job_order_number text not null,
      status text not null default 'pending',
      service_advisor_user_id uuid not null references users(id),
      primary_mechanic_user_id uuid references users(id),
      mileage_at_intake integer not null,
      customer_concern text not null,
      internal_notes text,
      completed_at timestamptz,
      released_at timestamptz,
      no_charge_reason text,
      release_with_balance_reason text,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      lock_version integer not null default 0,

      unique(tenant_id, id),
      unique(tenant_id, branch_id, id),
      unique(tenant_id, job_order_number),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      constraint chk_job_order_status check (
        status in (
          'pending',
          'in_progress',
          'waiting_for_parts',
          'completed',
          'released',
          'cancelled'
        )
      ),

      constraint chk_job_order_mileage check (
        mileage_at_intake >= 0
      ),

      constraint chk_job_order_customer_concern check (
        char_length(trim(customer_concern)) > 0
      ),

      constraint chk_job_order_completed_at check (
        status not in ('completed', 'released')
        or completed_at is not null
      ),

      constraint chk_job_order_released_at check (
        status <> 'released'
        or released_at is not null
      )
    );

    create index idx_job_orders_board
      on job_orders(tenant_id, branch_id, status, created_at desc);

    create index idx_job_orders_customer
      on job_orders(tenant_id, customer_id, created_at desc);

    create index idx_job_orders_motorcycle
      on job_orders(tenant_id, motorcycle_id, created_at desc);

    alter table estimates
      add constraint fk_estimates_converted_job_order
      foreign key (tenant_id, converted_job_order_id)
      references job_orders(tenant_id, id);

    create table job_order_status_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      job_order_id uuid not null,
      from_status text,
      to_status text not null,
      reason text,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),

      foreign key (tenant_id, job_order_id)
        references job_orders(tenant_id, id),

      constraint chk_job_order_status_events_from_status check (
        from_status is null
        or from_status in (
          'pending',
          'in_progress',
          'waiting_for_parts',
          'completed',
          'released',
          'cancelled'
        )
      ),

      constraint chk_job_order_status_events_to_status check (
        to_status in (
          'pending',
          'in_progress',
          'waiting_for_parts',
          'completed',
          'released',
          'cancelled'
        )
      )
    );

    create index idx_job_order_status_events_order_time
      on job_order_status_events(tenant_id, job_order_id, created_at desc);

    create table job_order_mechanics (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      job_order_id uuid not null,
      user_id uuid not null references users(id),
      assignment_type text not null,
      assigned_at timestamptz not null default now(),
      assigned_by_user_id uuid references users(id),
      removed_at timestamptz,

      foreign key (tenant_id, job_order_id)
        references job_orders(tenant_id, id),

      constraint chk_job_order_mechanics_assignment_type check (
        char_length(trim(assignment_type)) > 0
      )
    );

    create unique index ux_job_order_mechanics_active
      on job_order_mechanics(
        tenant_id,
        job_order_id,
        user_id,
        assignment_type
      )
      where removed_at is null;

    create index idx_job_order_mechanics_user_active
      on job_order_mechanics(tenant_id, user_id)
      where removed_at is null;

    create table job_order_lines (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      job_order_id uuid not null,
      line_type text not null,
      service_id uuid references services(id),
      product_id uuid,
      description text not null,
      quantity numeric(14,3) not null default 1,
      unit_price numeric(14,2) not null default 0,
      authorized_amount numeric(14,2) not null default 0,
      status text not null default 'active',
      inventory_reservation_id uuid,
      completed_at timestamptz,
      line_order integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),

      unique(tenant_id, id),

      foreign key (tenant_id, job_order_id)
        references job_orders(tenant_id, id),

      constraint chk_job_order_line_type check (
        line_type in ('service', 'labor', 'part')
      ),

      constraint chk_job_order_line_status check (
        status in ('active', 'completed', 'cancelled')
      ),

      constraint chk_job_order_line_description check (
        char_length(trim(description)) > 0
      ),

      constraint chk_job_order_line_amounts check (
        quantity > 0
        and unit_price >= 0
        and authorized_amount >= 0
      ),

      constraint chk_job_order_line_completed_at check (
        status <> 'completed'
        or completed_at is not null
      )
    );

    create index idx_job_order_lines_order
      on job_order_lines(tenant_id, job_order_id, line_order);

    create index idx_job_order_lines_status
      on job_order_lines(tenant_id, job_order_id, status);

    create index idx_job_order_lines_service
      on job_order_lines(tenant_id, service_id)
      where service_id is not null;

    create table job_order_line_snapshots (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      job_order_line_id uuid not null,
      source_name text,
      source_price numeric(14,2),
      source_disclaimer text,
      captured_at timestamptz not null default now(),

      unique(tenant_id, job_order_line_id),

      foreign key (tenant_id, job_order_line_id)
        references job_order_lines(tenant_id, id),

      constraint chk_job_order_line_snapshot_price check (
        source_price is null
        or source_price >= 0
      )
    );

    create table mechanic_work_sessions (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      job_order_id uuid not null,
      mechanic_user_id uuid not null references users(id),
      status text not null default 'active',
      started_at timestamptz not null default now(),
      finished_at timestamptz,
      total_active_seconds integer not null default 0,
      notes text,

      unique(tenant_id, id),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      foreign key (tenant_id, branch_id, job_order_id)
        references job_orders(tenant_id, branch_id, id),

      constraint chk_mechanic_session_status check (
        status in ('active', 'paused', 'finished')
      ),

      constraint chk_mechanic_session_duration check (
        total_active_seconds >= 0
      ),

      constraint chk_mechanic_session_finished_at check (
        status <> 'finished'
        or finished_at is not null
      ),

      constraint chk_mechanic_session_time_order check (
        finished_at is null
        or finished_at >= started_at
      )
    );

    create unique index ux_one_unfinished_session_per_mechanic
      on mechanic_work_sessions(tenant_id, mechanic_user_id)
      where finished_at is null;

    create index idx_mechanic_work_sessions_job_order
      on mechanic_work_sessions(tenant_id, job_order_id, started_at desc);

    create index idx_mechanic_work_sessions_mechanic
      on mechanic_work_sessions(tenant_id, mechanic_user_id, started_at desc);

    create table mechanic_work_session_pauses (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      work_session_id uuid not null,
      paused_at timestamptz not null,
      resumed_at timestamptz,
      resumed_by_user_id uuid references users(id),

      foreign key (tenant_id, work_session_id)
        references mechanic_work_sessions(tenant_id, id),

      constraint chk_pause_resume_order check (
        resumed_at is null
        or resumed_at >= paused_at
      )
    );

    create index idx_mechanic_work_session_pauses_session
      on mechanic_work_session_pauses(
        tenant_id,
        work_session_id,
        paused_at desc
      );
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists idx_mechanic_work_session_pauses_session;
    drop table if exists mechanic_work_session_pauses;

    drop index if exists idx_mechanic_work_sessions_mechanic;
    drop index if exists idx_mechanic_work_sessions_job_order;
    drop index if exists ux_one_unfinished_session_per_mechanic;
    drop table if exists mechanic_work_sessions;

    drop table if exists job_order_line_snapshots;

    drop index if exists idx_job_order_lines_service;
    drop index if exists idx_job_order_lines_status;
    drop index if exists idx_job_order_lines_order;
    drop table if exists job_order_lines;

    drop index if exists idx_job_order_mechanics_user_active;
    drop index if exists ux_job_order_mechanics_active;
    drop table if exists job_order_mechanics;

    drop index if exists idx_job_order_status_events_order_time;
    drop table if exists job_order_status_events;

    alter table estimates
      drop constraint if exists fk_estimates_converted_job_order;

    drop index if exists idx_job_orders_motorcycle;
    drop index if exists idx_job_orders_customer;
    drop index if exists idx_job_orders_board;
    drop table if exists job_orders;
  `);
};
