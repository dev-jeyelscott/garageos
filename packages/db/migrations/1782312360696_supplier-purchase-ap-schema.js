exports.up = async (pgm) => {
  pgm.sql(`
    create table suppliers (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      name text not null,
      normalized_name text not null,
      contact_person text,
      mobile_number text,
      email text,
      address text,
      notes text,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      created_by_user_id uuid references users(id),
      updated_at timestamptz not null default now(),
      updated_by_user_id uuid references users(id),
      lock_version integer not null default 0,

      unique(tenant_id, id),

      constraint chk_supplier_name check (
        char_length(trim(name)) between 2 and 180
      ),

      constraint chk_supplier_status check (
        status in ('active', 'inactive')
      )
    );

    create unique index ux_suppliers_active_name
      on suppliers(tenant_id, normalized_name)
      where status = 'active';

    create index idx_suppliers_tenant_status
      on suppliers(tenant_id, status);

    create table purchase_orders (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      supplier_id uuid not null,
      purchase_order_number text not null,
      status text not null default 'draft',
      payment_terms text not null,
      order_date date not null,
      expected_receive_date date,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      lock_version integer not null default 0,

      unique(tenant_id, id),
      unique(tenant_id, purchase_order_number),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      foreign key (tenant_id, supplier_id)
        references suppliers(tenant_id, id),

      constraint chk_purchase_order_number_format check (
        purchase_order_number ~ '^PO-[0-9]{8}-[0-9]{6}$'
      ),

      constraint chk_purchase_order_status check (
        status in (
          'draft',
          'ordered',
          'partially_received',
          'received',
          'closed',
          'cancelled'
        )
      ),

      constraint chk_purchase_payment_terms check (
        payment_terms in ('cash', 'credit')
      )
    );

    create index idx_purchase_orders_branch_status
      on purchase_orders(
        tenant_id,
        branch_id,
        status,
        order_date desc
      );

    create index idx_purchase_orders_supplier
      on purchase_orders(
        tenant_id,
        supplier_id,
        order_date desc
      );

    create table purchase_order_lines (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      purchase_order_id uuid not null,
      product_id uuid not null,
      ordered_quantity numeric(14,3) not null,
      received_quantity numeric(14,3) not null default 0,
      unit_cost numeric(14,2) not null,
      line_total numeric(14,2) not null,
      notes text,

      unique(tenant_id, id),

      foreign key (tenant_id, purchase_order_id)
        references purchase_orders(tenant_id, id),

      foreign key (tenant_id, product_id)
        references products(tenant_id, id),

      constraint chk_po_line_qty check (
        ordered_quantity > 0
        and received_quantity >= 0
        and received_quantity <= ordered_quantity
      ),

      constraint chk_po_line_cost check (
        unit_cost >= 0
        and line_total >= 0
      )
    );

    create index idx_purchase_order_lines_order
      on purchase_order_lines(tenant_id, purchase_order_id);

    create index idx_purchase_order_lines_product
      on purchase_order_lines(tenant_id, product_id);

    create table purchase_receivings (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      purchase_order_id uuid not null,
      supplier_id uuid not null,
      received_at timestamptz not null default now(),
      received_by_user_id uuid not null references users(id),
      payment_method text,
      payment_reference text,
      posted_at timestamptz,

      unique(tenant_id, id),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      foreign key (tenant_id, purchase_order_id)
        references purchase_orders(tenant_id, id),

      foreign key (tenant_id, supplier_id)
        references suppliers(tenant_id, id),

      constraint chk_purchase_receiving_payment_method check (
        payment_method is null
        or payment_method in (
          'cash',
          'gcash',
          'maya',
          'bank_transfer',
          'credit_card',
          'check',
          'other'
        )
      )
    );

    create index idx_purchase_receivings_order
      on purchase_receivings(tenant_id, purchase_order_id, received_at desc);

    create index idx_purchase_receivings_supplier
      on purchase_receivings(tenant_id, supplier_id, received_at desc);

    create table purchase_receiving_lines (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      receiving_id uuid not null,
      purchase_order_line_id uuid not null,
      product_id uuid not null,
      received_quantity numeric(14,3) not null,
      received_unit_cost numeric(14,2) not null,
      fifo_layer_id uuid,

      foreign key (tenant_id, receiving_id)
        references purchase_receivings(tenant_id, id),

      foreign key (tenant_id, purchase_order_line_id)
        references purchase_order_lines(tenant_id, id),

      foreign key (tenant_id, product_id)
        references products(tenant_id, id),

      foreign key (tenant_id, fifo_layer_id)
        references fifo_layers(tenant_id, id),

      constraint chk_receiving_line_qty check (
        received_quantity > 0
        and received_unit_cost >= 0
      )
    );

    create index idx_purchase_receiving_lines_receiving
      on purchase_receiving_lines(tenant_id, receiving_id);

    create index idx_purchase_receiving_lines_product
      on purchase_receiving_lines(tenant_id, product_id);

    create table supplier_payables (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      supplier_id uuid not null,
      branch_id uuid,
      source_type text not null,
      source_id uuid not null,
      amount_delta numeric(14,2) not null,
      occurred_at timestamptz not null default now(),
      created_by_user_id uuid references users(id),

      foreign key (tenant_id, supplier_id)
        references suppliers(tenant_id, id),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      constraint chk_supplier_payable_non_zero check (
        amount_delta <> 0
      )
    );

    create index idx_supplier_payables_supplier
      on supplier_payables(tenant_id, supplier_id, occurred_at desc);

    create index idx_supplier_payables_source
      on supplier_payables(tenant_id, source_type, source_id);

    create table supplier_payments (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      supplier_id uuid not null,
      amount numeric(14,2) not null,
      payment_date date not null,
      payment_method text not null,
      reference_number text,
      notes text,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),

      unique(tenant_id, id),

      foreign key (tenant_id, supplier_id)
        references suppliers(tenant_id, id),

      constraint chk_supplier_payment_amount check (
        amount > 0
      ),

      constraint chk_supplier_payment_method check (
        payment_method in (
          'cash',
          'gcash',
          'maya',
          'bank_transfer',
          'credit_card',
          'check',
          'other'
        )
      )
    );

    create index idx_supplier_payments_supplier_date
      on supplier_payments(tenant_id, supplier_id, payment_date desc);

    create table supplier_credits (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      supplier_id uuid not null,
      branch_id uuid,
      amount numeric(14,2) not null,
      reason text not null,
      source_type text not null,
      source_id uuid not null,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),

      unique(tenant_id, id),

      foreign key (tenant_id, supplier_id)
        references suppliers(tenant_id, id),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      constraint chk_supplier_credit_amount check (
        amount > 0
      ),

      constraint chk_supplier_credit_reason check (
        char_length(trim(reason)) > 0
      )
    );

    create index idx_supplier_credits_supplier_date
      on supplier_credits(tenant_id, supplier_id, created_at desc);

    create index idx_supplier_credits_source
      on supplier_credits(tenant_id, source_type, source_id);

    create table supplier_returns (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      supplier_id uuid not null,
      original_receiving_id uuid,
      status text not null default 'draft',
      reason text not null,
      financial_value numeric(14,2) not null default 0,
      supplier_credit_id uuid,
      posted_at timestamptz,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),

      unique(tenant_id, id),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      foreign key (tenant_id, supplier_id)
        references suppliers(tenant_id, id),

      foreign key (tenant_id, original_receiving_id)
        references purchase_receivings(tenant_id, id),

      foreign key (tenant_id, supplier_credit_id)
        references supplier_credits(tenant_id, id),

      constraint chk_supplier_return_status check (
        status in ('draft', 'posted', 'cancelled')
      ),

      constraint chk_supplier_return_reason check (
        char_length(trim(reason)) > 0
      ),

      constraint chk_supplier_return_financial_value check (
        financial_value >= 0
      ),

      constraint chk_supplier_return_posted_at check (
        status <> 'posted'
        or posted_at is not null
      )
    );

    create index idx_supplier_returns_supplier
      on supplier_returns(tenant_id, supplier_id, created_at desc);

    create index idx_supplier_returns_branch_status
      on supplier_returns(tenant_id, branch_id, status, created_at desc);

    create table supplier_return_lines (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      supplier_return_id uuid not null,
      product_id uuid not null,
      returned_quantity numeric(14,3) not null,
      unit_cost numeric(14,2) not null,
      total_cost numeric(14,2) not null,

      foreign key (tenant_id, supplier_return_id)
        references supplier_returns(tenant_id, id),

      foreign key (tenant_id, product_id)
        references products(tenant_id, id),

      constraint chk_supplier_return_line_amounts check (
        returned_quantity > 0
        and unit_cost >= 0
        and total_cost >= 0
      )
    );

    create index idx_supplier_return_lines_return
      on supplier_return_lines(tenant_id, supplier_return_id);

    create index idx_supplier_return_lines_product
      on supplier_return_lines(tenant_id, product_id);
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists idx_supplier_return_lines_product;
    drop index if exists idx_supplier_return_lines_return;
    drop table if exists supplier_return_lines;

    drop index if exists idx_supplier_returns_branch_status;
    drop index if exists idx_supplier_returns_supplier;
    drop table if exists supplier_returns;

    drop index if exists idx_supplier_credits_source;
    drop index if exists idx_supplier_credits_supplier_date;
    drop table if exists supplier_credits;

    drop index if exists idx_supplier_payments_supplier_date;
    drop table if exists supplier_payments;

    drop index if exists idx_supplier_payables_source;
    drop index if exists idx_supplier_payables_supplier;
    drop table if exists supplier_payables;

    drop index if exists idx_purchase_receiving_lines_product;
    drop index if exists idx_purchase_receiving_lines_receiving;
    drop table if exists purchase_receiving_lines;

    drop index if exists idx_purchase_receivings_supplier;
    drop index if exists idx_purchase_receivings_order;
    drop table if exists purchase_receivings;

    drop index if exists idx_purchase_order_lines_product;
    drop index if exists idx_purchase_order_lines_order;
    drop table if exists purchase_order_lines;

    drop index if exists idx_purchase_orders_supplier;
    drop index if exists idx_purchase_orders_branch_status;
    drop table if exists purchase_orders;

    drop index if exists idx_suppliers_tenant_status;
    drop index if exists ux_suppliers_active_name;
    drop table if exists suppliers;
  `);
};
