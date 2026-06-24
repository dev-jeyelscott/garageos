exports.up = async (pgm) => {
  pgm.sql(`
    create table expense_categories (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      name text not null,
      normalized_name text not null,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),

      unique(tenant_id, id),

      constraint chk_expense_category_name check (
        char_length(trim(name)) between 2 and 120
      ),

      constraint chk_expense_category_status check (
        status in ('active', 'inactive')
      )
    );

    create unique index ux_expense_categories_active_name
      on expense_categories(tenant_id, normalized_name)
      where status = 'active';

    create index idx_expense_categories_tenant_status
      on expense_categories(tenant_id, status);

    create table expenses (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      category_id uuid not null,
      expense_date date not null,
      amount numeric(14,2) not null,
      payment_method text not null,
      reference_number text,
      description text not null,
      status text not null default 'active',
      void_reason text,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      updated_by_user_id uuid references users(id),
      lock_version integer not null default 0,

      unique(tenant_id, id),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      foreign key (tenant_id, category_id)
        references expense_categories(tenant_id, id),

      constraint chk_expense_amount check (
        amount > 0
      ),

      constraint chk_expense_description check (
        char_length(trim(description)) > 0
      ),

      constraint chk_expense_status check (
        status in ('active', 'voided')
      ),

      constraint chk_expense_payment_method check (
        payment_method in (
          'cash',
          'gcash',
          'maya',
          'bank_transfer',
          'credit_card',
          'check',
          'other'
        )
      ),

      constraint chk_expense_void_reason check (
        status <> 'voided'
        or (
          void_reason is not null
          and char_length(trim(void_reason)) > 0
        )
      )
    );

    create index idx_expenses_report_date
      on expenses(
        tenant_id,
        branch_id,
        expense_date desc,
        status
      );

    create index idx_expenses_category_date
      on expenses(
        tenant_id,
        category_id,
        expense_date desc
      );

    create table expense_status_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      expense_id uuid not null,
      from_status text,
      to_status text not null,
      reason text,
      before_json jsonb,
      after_json jsonb,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),

      foreign key (tenant_id, expense_id)
        references expenses(tenant_id, id),

      constraint chk_expense_status_events_from_status check (
        from_status is null
        or from_status in ('active', 'voided')
      ),

      constraint chk_expense_status_events_to_status check (
        to_status in ('active', 'voided')
      )
    );

    create index idx_expense_status_events_expense_time
      on expense_status_events(
        tenant_id,
        expense_id,
        created_at desc
      );
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists idx_expense_status_events_expense_time;
    drop table if exists expense_status_events;

    drop index if exists idx_expenses_category_date;
    drop index if exists idx_expenses_report_date;
    drop table if exists expenses;

    drop index if exists idx_expense_categories_tenant_status;
    drop index if exists ux_expense_categories_active_name;
    drop table if exists expense_categories;
  `);
};
