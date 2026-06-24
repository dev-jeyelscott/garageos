exports.up = async (pgm) => {
  pgm.sql(`
    create table inventory_adjustments (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      adjustment_number text not null,
      status text not null default 'draft',
      reason text not null,
      value_impact numeric(14,2) not null default 0,
      approval_required boolean not null default false,
      requested_by_user_id uuid not null references users(id),
      approved_by_user_id uuid references users(id),
      posted_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      lock_version integer not null default 0,

      unique(tenant_id, id),
      unique(tenant_id, adjustment_number),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      constraint chk_inventory_adjustment_status check (
        status in (
          'draft',
          'pending_approval',
          'approved',
          'posted',
          'rejected',
          'cancelled'
        )
      ),

      constraint chk_inventory_adjustment_reason check (
        char_length(trim(reason)) > 0
      ),

      constraint chk_inventory_adjustment_value_impact check (
        value_impact >= 0
      ),

      constraint chk_inventory_adjustment_posted_at check (
        status <> 'posted'
        or posted_at is not null
      )
    );

    create index idx_inventory_adjustments_pending
      on inventory_adjustments(
        tenant_id,
        branch_id,
        status,
        created_at desc
      );

    create table inventory_adjustment_lines (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      adjustment_id uuid not null,
      product_id uuid not null,
      adjustment_type text not null,
      quantity_difference numeric(14,3),
      final_counted_quantity numeric(14,3),
      unit_cost numeric(14,2),
      estimated_fifo_cost numeric(14,2),

      foreign key (tenant_id, adjustment_id)
        references inventory_adjustments(tenant_id, id),

      foreign key (tenant_id, product_id)
        references products(tenant_id, id),

      constraint chk_inventory_adjustment_line_type check (
        adjustment_type in (
          'increase',
          'decrease',
          'final_count'
        )
      ),

      constraint chk_inventory_adjustment_line_value check (
        quantity_difference is not null
        or final_counted_quantity is not null
      ),

      constraint chk_inventory_adjustment_line_final_count check (
        final_counted_quantity is null
        or final_counted_quantity >= 0
      ),

      constraint chk_inventory_adjustment_line_costs check (
        (unit_cost is null or unit_cost >= 0)
        and
        (estimated_fifo_cost is null or estimated_fifo_cost >= 0)
      )
    );

    create index idx_inventory_adjustment_lines_adjustment
      on inventory_adjustment_lines(tenant_id, adjustment_id);

    create index idx_inventory_adjustment_lines_product
      on inventory_adjustment_lines(tenant_id, product_id);

    create table inventory_adjustment_status_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      adjustment_id uuid not null,
      from_status text,
      to_status text not null,
      reason text,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),

      foreign key (tenant_id, adjustment_id)
        references inventory_adjustments(tenant_id, id),

      constraint chk_adjustment_status_events_from_status check (
        from_status is null
        or from_status in (
          'draft',
          'pending_approval',
          'approved',
          'posted',
          'rejected',
          'cancelled'
        )
      ),

      constraint chk_adjustment_status_events_to_status check (
        to_status in (
          'draft',
          'pending_approval',
          'approved',
          'posted',
          'rejected',
          'cancelled'
        )
      )
    );

    create index idx_adjustment_status_events_adjustment_time
      on inventory_adjustment_status_events(
        tenant_id,
        adjustment_id,
        created_at desc
      );

    create table inventory_transfers (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      transfer_number text not null,
      source_branch_id uuid not null,
      destination_branch_id uuid not null,
      status text not null default 'draft',
      created_by_user_id uuid references users(id),
      sent_by_user_id uuid references users(id),
      received_by_user_id uuid references users(id),
      cancelled_by_user_id uuid references users(id),
      sent_at timestamptz,
      received_at timestamptz,
      cancelled_at timestamptz,
      cancellation_disposition text,
      remarks text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      lock_version integer not null default 0,

      unique(tenant_id, id),
      unique(tenant_id, transfer_number),

      foreign key (tenant_id, source_branch_id)
        references branches(tenant_id, id),

      foreign key (tenant_id, destination_branch_id)
        references branches(tenant_id, id),

      constraint chk_transfer_status check (
        status in (
          'draft',
          'pending',
          'in_transit',
          'received',
          'cancelled'
        )
      ),

      constraint chk_transfer_different_branches check (
        source_branch_id <> destination_branch_id
      ),

      constraint chk_transfer_sent_fields check (
        status not in ('in_transit', 'received')
        or (
          sent_by_user_id is not null
          and sent_at is not null
        )
      ),

      constraint chk_transfer_received_fields check (
        status <> 'received'
        or (
          received_by_user_id is not null
          and received_at is not null
        )
      ),

      constraint chk_transfer_cancelled_fields check (
        status <> 'cancelled'
        or cancelled_at is not null
      ),

      constraint chk_transfer_cancellation_disposition check (
        cancellation_disposition is null
        or cancellation_disposition in (
          'returned_to_source',
          'lost_or_damaged'
        )
      )
    );

    create index idx_inventory_transfers_source_status
      on inventory_transfers(
        tenant_id,
        source_branch_id,
        status,
        created_at desc
      );

    create index idx_inventory_transfers_destination_status
      on inventory_transfers(
        tenant_id,
        destination_branch_id,
        status,
        created_at desc
      );

    create table inventory_transfer_lines (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      transfer_id uuid not null,
      product_id uuid not null,
      requested_quantity numeric(14,3) not null,
      reserved_quantity numeric(14,3),
      sent_quantity numeric(14,3),
      received_quantity numeric(14,3),
      variance_quantity numeric(14,3),
      variance_reason text,
      reservation_id uuid,

      foreign key (tenant_id, transfer_id)
        references inventory_transfers(tenant_id, id),

      foreign key (tenant_id, product_id)
        references products(tenant_id, id),

      foreign key (tenant_id, reservation_id)
        references inventory_reservations(tenant_id, id),

      constraint chk_transfer_line_requested check (
        requested_quantity > 0
      ),

      constraint chk_transfer_line_non_negative check (
        coalesce(reserved_quantity, 0) >= 0
        and coalesce(sent_quantity, 0) >= 0
        and coalesce(received_quantity, 0) >= 0
        and coalesce(variance_quantity, 0) >= 0
      ),

      constraint chk_transfer_line_reserved_limit check (
        reserved_quantity is null
        or reserved_quantity <= requested_quantity
      ),

      constraint chk_transfer_line_sent_limit check (
        sent_quantity is null
        or reserved_quantity is null
        or sent_quantity <= reserved_quantity
      ),

      constraint chk_transfer_line_received_limit check (
        received_quantity is null
        or sent_quantity is null
        or received_quantity <= sent_quantity
      ),

      constraint chk_transfer_line_variance_reason check (
        variance_quantity is null
        or variance_quantity = 0
        or (
          variance_reason is not null
          and char_length(trim(variance_reason)) > 0
        )
      )
    );

    create index idx_inventory_transfer_lines_transfer
      on inventory_transfer_lines(tenant_id, transfer_id);

    create index idx_inventory_transfer_lines_product
      on inventory_transfer_lines(tenant_id, product_id);

    create index idx_inventory_transfer_lines_reservation
      on inventory_transfer_lines(tenant_id, reservation_id)
      where reservation_id is not null;

    create table inventory_transfer_status_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      transfer_id uuid not null,
      from_status text,
      to_status text not null,
      reason text,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),

      foreign key (tenant_id, transfer_id)
        references inventory_transfers(tenant_id, id),

      constraint chk_transfer_status_events_from_status check (
        from_status is null
        or from_status in (
          'draft',
          'pending',
          'in_transit',
          'received',
          'cancelled'
        )
      ),

      constraint chk_transfer_status_events_to_status check (
        to_status in (
          'draft',
          'pending',
          'in_transit',
          'received',
          'cancelled'
        )
      )
    );

    create index idx_transfer_status_events_transfer_time
      on inventory_transfer_status_events(
        tenant_id,
        transfer_id,
        created_at desc
      );
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists idx_transfer_status_events_transfer_time;
    drop table if exists inventory_transfer_status_events;

    drop index if exists idx_inventory_transfer_lines_reservation;
    drop index if exists idx_inventory_transfer_lines_product;
    drop index if exists idx_inventory_transfer_lines_transfer;
    drop table if exists inventory_transfer_lines;

    drop index if exists idx_inventory_transfers_destination_status;
    drop index if exists idx_inventory_transfers_source_status;
    drop table if exists inventory_transfers;

    drop index if exists idx_adjustment_status_events_adjustment_time;
    drop table if exists inventory_adjustment_status_events;

    drop index if exists idx_inventory_adjustment_lines_product;
    drop index if exists idx_inventory_adjustment_lines_adjustment;
    drop table if exists inventory_adjustment_lines;

    drop index if exists idx_inventory_adjustments_pending;
    drop table if exists inventory_adjustments;
  `);
};
