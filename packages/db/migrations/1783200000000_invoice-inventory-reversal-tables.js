exports.up = async (pgm) => {
  pgm.sql(`
    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'ux_inventory_ledger_entries_tenant_id_id'
          and conrelid = 'inventory_ledger_entries'::regclass
      ) then
        alter table inventory_ledger_entries
          add constraint ux_inventory_ledger_entries_tenant_id_id
          unique (tenant_id, id);
      end if;

      if not exists (
        select 1
        from pg_constraint
        where conname = 'ux_fifo_layers_tenant_id_id'
          and conrelid = 'fifo_layers'::regclass
      ) then
        alter table fifo_layers
          add constraint ux_fifo_layers_tenant_id_id
          unique (tenant_id, id);
      end if;
    end $$;

    create table refund_inventory_reversals (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      refund_id uuid not null,
      job_order_line_id uuid not null,
      product_id uuid not null,
      quantity_returned numeric(14,3) not null,
      inventory_ledger_entry_id uuid not null,
      fifo_layer_id uuid not null,
      created_at timestamptz not null default now(),

      unique(tenant_id, id),

      foreign key (tenant_id, refund_id)
        references refunds(tenant_id, id),

      foreign key (tenant_id, job_order_line_id)
        references job_order_lines(tenant_id, id),

      foreign key (tenant_id, product_id)
        references products(tenant_id, id),

      foreign key (tenant_id, inventory_ledger_entry_id)
        references inventory_ledger_entries(tenant_id, id),

      foreign key (tenant_id, fifo_layer_id)
        references fifo_layers(tenant_id, id),

      constraint chk_refund_inventory_reversal_quantity check (
        quantity_returned > 0
      )
    );

    create index idx_refund_inventory_reversals_refund
      on refund_inventory_reversals(tenant_id, refund_id);

    create index idx_refund_inventory_reversals_job_order_line
      on refund_inventory_reversals(tenant_id, job_order_line_id);

    create table void_inventory_reversals (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      invoice_id uuid not null,
      job_order_line_id uuid not null,
      product_id uuid not null,
      quantity_returned numeric(14,3) not null,
      inventory_ledger_entry_id uuid not null,
      fifo_layer_id uuid not null,
      created_at timestamptz not null default now(),

      unique(tenant_id, id),

      foreign key (tenant_id, invoice_id)
        references invoices(tenant_id, id),

      foreign key (tenant_id, job_order_line_id)
        references job_order_lines(tenant_id, id),

      foreign key (tenant_id, product_id)
        references products(tenant_id, id),

      foreign key (tenant_id, inventory_ledger_entry_id)
        references inventory_ledger_entries(tenant_id, id),

      foreign key (tenant_id, fifo_layer_id)
        references fifo_layers(tenant_id, id),

      constraint chk_void_inventory_reversal_quantity check (
        quantity_returned > 0
      )
    );

    create index idx_void_inventory_reversals_invoice
      on void_inventory_reversals(tenant_id, invoice_id);

    create index idx_void_inventory_reversals_job_order_line
      on void_inventory_reversals(tenant_id, job_order_line_id);
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists idx_void_inventory_reversals_job_order_line;
    drop index if exists idx_void_inventory_reversals_invoice;
    drop table if exists void_inventory_reversals;

    drop index if exists idx_refund_inventory_reversals_job_order_line;
    drop index if exists idx_refund_inventory_reversals_refund;
    drop table if exists refund_inventory_reversals;

    alter table if exists fifo_layers
      drop constraint if exists ux_fifo_layers_tenant_id_id;

    alter table if exists inventory_ledger_entries
      drop constraint if exists ux_inventory_ledger_entries_tenant_id_id;
  `);
};
