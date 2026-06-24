exports.up = async (pgm) => {
  pgm.sql(`
    create table product_categories (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      name text not null,
      normalized_name text not null,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),

      unique(tenant_id, id),

      constraint chk_product_category_name check (
        char_length(trim(name)) between 2 and 120
      ),

      constraint chk_product_category_status check (
        status in ('active', 'inactive')
      )
    );

    create unique index ux_product_categories_active_name
      on product_categories(tenant_id, normalized_name)
      where status = 'active';

    create index idx_product_categories_tenant_status
      on product_categories(tenant_id, status);

    create table products (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      category_id uuid not null,
      name text not null,
      normalized_name text not null,
      sku text not null,
      normalized_sku text not null,
      barcode text,
      normalized_barcode text,
      supplier_code text,
      brand text,
      unit_of_measure text not null,
      default_cost numeric(14,2) not null default 0,
      selling_price numeric(14,2) not null default 0,
      reorder_level numeric(14,3) not null default 0,
      description text,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      created_by_user_id uuid references users(id),
      updated_at timestamptz not null default now(),
      updated_by_user_id uuid references users(id),
      lock_version integer not null default 0,

      unique(tenant_id, id),
      unique(tenant_id, normalized_sku),

      foreign key (tenant_id, category_id)
        references product_categories(tenant_id, id),

      constraint chk_product_name check (
        char_length(trim(name)) between 2 and 180
      ),

      constraint chk_product_sku check (
        char_length(trim(sku)) between 1 and 80
      ),

      constraint chk_product_unit_of_measure check (
        char_length(trim(unit_of_measure)) > 0
      ),

      constraint chk_product_status check (
        status in ('active', 'inactive')
      ),

      constraint chk_product_amounts check (
        default_cost >= 0
        and selling_price >= 0
        and reorder_level >= 0
      )
    );

    create unique index ux_products_active_barcode
      on products(tenant_id, normalized_barcode)
      where status = 'active'
        and normalized_barcode is not null;

    create index idx_products_active_category
      on products(tenant_id, category_id, status, normalized_name);

    create index idx_products_name_trgm
      on products using gin(normalized_name gin_trgm_ops);

    create table stock_balances (
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      product_id uuid not null,
      on_hand_qty numeric(14,3) not null default 0,
      reserved_qty numeric(14,3) not null default 0,
      updated_at timestamptz not null default now(),
      lock_version integer not null default 0,

      primary key(tenant_id, branch_id, product_id),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      foreign key (tenant_id, product_id)
        references products(tenant_id, id),

      constraint chk_stock_non_negative check (
        on_hand_qty >= 0
        and reserved_qty >= 0
        and on_hand_qty >= reserved_qty
      )
    );

    create index idx_stock_balances_branch_product
      on stock_balances(tenant_id, branch_id, product_id);

    create table inventory_ledger_entries (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      product_id uuid not null,
      transaction_type text not null,
      quantity_delta_on_hand numeric(14,3) not null default 0,
      quantity_delta_reserved numeric(14,3) not null default 0,
      unit_cost numeric(14,2),
      total_cost numeric(14,2),
      source_type text not null,
      source_id uuid not null,
      occurred_at timestamptz not null default now(),
      created_by_user_id uuid references users(id),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      foreign key (tenant_id, product_id)
        references products(tenant_id, id),

      constraint chk_inventory_ledger_transaction_type check (
        transaction_type in (
          'purchase_receive',
          'job_order_reservation',
          'reservation_release',
          'job_order_consumption',
          'inventory_adjustment_increase',
          'inventory_adjustment_decrease',
          'inventory_transfer_reservation',
          'inventory_transfer_reservation_release',
          'inventory_transfer_out',
          'inventory_transfer_in',
          'inventory_transfer_variance_loss',
          'supplier_return',
          'refund_inventory_reversal',
          'void_inventory_reversal'
        )
      ),

      constraint chk_inventory_ledger_non_zero_delta check (
        quantity_delta_on_hand <> 0
        or quantity_delta_reserved <> 0
      ),

      constraint chk_inventory_ledger_costs check (
        (unit_cost is null or unit_cost >= 0)
        and (total_cost is null or total_cost >= 0)
      )
    );

    create index idx_inventory_ledger_product_date
      on inventory_ledger_entries(
        tenant_id,
        branch_id,
        product_id,
        occurred_at desc
      );

    create index idx_inventory_ledger_source
      on inventory_ledger_entries(tenant_id, source_type, source_id);

    create table fifo_layers (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      product_id uuid not null,
      quantity_received numeric(14,3) not null,
      remaining_quantity numeric(14,3) not null,
      unit_cost numeric(14,2) not null,
      source_transaction_type text not null,
      source_transaction_id uuid not null,
      received_at timestamptz not null,
      original_source_layer_id uuid,

      unique(tenant_id, id),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      foreign key (tenant_id, product_id)
        references products(tenant_id, id),

      foreign key (tenant_id, original_source_layer_id)
        references fifo_layers(tenant_id, id),

      constraint chk_fifo_layer_quantities check (
        quantity_received > 0
        and remaining_quantity >= 0
        and remaining_quantity <= quantity_received
      ),

      constraint chk_fifo_layer_cost check (
        unit_cost >= 0
      )
    );

    create index idx_fifo_open_layers
      on fifo_layers(
        tenant_id,
        branch_id,
        product_id,
        received_at,
        id
      )
      where remaining_quantity > 0;

    create table inventory_reservations (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      product_id uuid not null,
      source_type text not null,
      source_id uuid not null,
      requested_quantity numeric(14,3) not null,
      reserved_quantity numeric(14,3) not null,
      status text not null default 'active',
      reserved_at timestamptz not null default now(),
      released_at timestamptz,
      consumed_at timestamptz,

      unique(tenant_id, id),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      foreign key (tenant_id, product_id)
        references products(tenant_id, id),

      constraint chk_inventory_reservation_status check (
        status in ('active', 'released', 'consumed', 'cancelled')
      ),

      constraint chk_inventory_reservation_qty check (
        requested_quantity > 0
        and reserved_quantity > 0
        and reserved_quantity <= requested_quantity
      ),

      constraint chk_inventory_reservation_released_at check (
        status not in ('released', 'cancelled')
        or released_at is not null
      ),

      constraint chk_inventory_reservation_consumed_at check (
        status <> 'consumed'
        or consumed_at is not null
      )
    );

    create index idx_active_reservations
      on inventory_reservations(
        tenant_id,
        branch_id,
        product_id,
        status
      )
      where status = 'active';

    create index idx_inventory_reservations_source
      on inventory_reservations(tenant_id, source_type, source_id);

    create table fifo_reservation_allocations (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      reservation_id uuid not null,
      fifo_layer_id uuid not null,
      reserved_quantity numeric(14,3) not null,
      unit_cost_snapshot numeric(14,2) not null,
      status text not null default 'active',
      allocated_at timestamptz not null default now(),
      released_at timestamptz,
      consumed_at timestamptz,

      unique(tenant_id, id),

      foreign key (tenant_id, reservation_id)
        references inventory_reservations(tenant_id, id),

      foreign key (tenant_id, fifo_layer_id)
        references fifo_layers(tenant_id, id),

      constraint chk_fifo_allocation_status check (
        status in ('active', 'released', 'consumed', 'cancelled')
      ),

      constraint chk_fifo_allocation_qty check (
        reserved_quantity > 0
      ),

      constraint chk_fifo_allocation_cost check (
        unit_cost_snapshot >= 0
      ),

      constraint chk_fifo_allocation_released_at check (
        status not in ('released', 'cancelled')
        or released_at is not null
      ),

      constraint chk_fifo_allocation_consumed_at check (
        status <> 'consumed'
        or consumed_at is not null
      )
    );

    create index idx_active_fifo_allocations
      on fifo_reservation_allocations(
        tenant_id,
        fifo_layer_id,
        status
      )
      where status = 'active';

    create index idx_fifo_allocations_reservation
      on fifo_reservation_allocations(tenant_id, reservation_id);

    create table fifo_consumptions (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      product_id uuid not null,
      fifo_layer_id uuid not null,
      quantity_consumed numeric(14,3) not null,
      unit_cost numeric(14,2) not null,
      total_cost numeric(14,2) not null,
      source_type text not null,
      source_id uuid not null,
      consumed_at timestamptz not null default now(),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      foreign key (tenant_id, product_id)
        references products(tenant_id, id),

      foreign key (tenant_id, fifo_layer_id)
        references fifo_layers(tenant_id, id),

      constraint chk_fifo_consumption_qty check (
        quantity_consumed > 0
      ),

      constraint chk_fifo_consumption_costs check (
        unit_cost >= 0
        and total_cost >= 0
      )
    );

    create index idx_fifo_consumptions_source
      on fifo_consumptions(tenant_id, source_type, source_id);

    create index idx_fifo_consumptions_product_time
      on fifo_consumptions(
        tenant_id,
        branch_id,
        product_id,
        consumed_at desc
      );

    alter table estimate_lines
      add constraint fk_estimate_lines_product
      foreign key (tenant_id, product_id)
      references products(tenant_id, id);

    alter table job_order_lines
      add constraint fk_job_order_lines_product
      foreign key (tenant_id, product_id)
      references products(tenant_id, id);

    alter table job_order_lines
      add constraint fk_job_order_lines_inventory_reservation
      foreign key (tenant_id, inventory_reservation_id)
      references inventory_reservations(tenant_id, id);
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    alter table job_order_lines
      drop constraint if exists fk_job_order_lines_inventory_reservation;

    alter table job_order_lines
      drop constraint if exists fk_job_order_lines_product;

    alter table estimate_lines
      drop constraint if exists fk_estimate_lines_product;

    drop index if exists idx_fifo_consumptions_product_time;
    drop index if exists idx_fifo_consumptions_source;
    drop table if exists fifo_consumptions;

    drop index if exists idx_fifo_allocations_reservation;
    drop index if exists idx_active_fifo_allocations;
    drop table if exists fifo_reservation_allocations;

    drop index if exists idx_inventory_reservations_source;
    drop index if exists idx_active_reservations;
    drop table if exists inventory_reservations;

    drop index if exists idx_fifo_open_layers;
    drop table if exists fifo_layers;

    drop index if exists idx_inventory_ledger_source;
    drop index if exists idx_inventory_ledger_product_date;
    drop table if exists inventory_ledger_entries;

    drop index if exists idx_stock_balances_branch_product;
    drop table if exists stock_balances;

    drop index if exists idx_products_name_trgm;
    drop index if exists idx_products_active_category;
    drop index if exists ux_products_active_barcode;
    drop table if exists products;

    drop index if exists idx_product_categories_tenant_status;
    drop index if exists ux_product_categories_active_name;
    drop table if exists product_categories;
  `);
};
