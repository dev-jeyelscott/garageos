exports.up = (pgm) => {
  pgm.sql(`
    create table if not exists fifo_layers (
      id uuid primary key,
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      product_id uuid not null references products(id),
      quantity_received numeric(14,3) not null,
      remaining_quantity numeric(14,3) not null,
      unit_cost numeric(14,2) not null,
      source_transaction_type text not null,
      source_transaction_id uuid not null,
      received_at timestamptz not null,
      original_source_layer_id uuid references fifo_layers(id),
      foreign key (tenant_id, branch_id) references branches(tenant_id, id),
      constraint chk_fifo_layer_quantities check (
        quantity_received > 0
        and remaining_quantity >= 0
        and remaining_quantity <= quantity_received
      ),
      constraint chk_fifo_layer_cost check (unit_cost >= 0)
    );

    alter table fifo_layers
      add column if not exists id uuid,
      add column if not exists tenant_id uuid,
      add column if not exists branch_id uuid,
      add column if not exists product_id uuid,
      add column if not exists quantity_received numeric(14,3),
      add column if not exists remaining_quantity numeric(14,3),
      add column if not exists unit_cost numeric(14,2),
      add column if not exists source_transaction_type text,
      add column if not exists source_transaction_id uuid,
      add column if not exists received_at timestamptz,
      add column if not exists original_source_layer_id uuid;

    alter table fifo_layers
      alter column id set not null,
      alter column tenant_id set not null,
      alter column branch_id set not null,
      alter column product_id set not null,
      alter column quantity_received set not null,
      alter column remaining_quantity set not null,
      alter column unit_cost set not null,
      alter column source_transaction_type set not null,
      alter column source_transaction_id set not null,
      alter column received_at set not null;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint constraint_definition
        inner join pg_class table_class
          on table_class.oid = constraint_definition.conrelid
        inner join pg_namespace namespace
          on namespace.oid = table_class.relnamespace
        where namespace.nspname = 'public'
          and table_class.relname = 'fifo_layers'
          and constraint_definition.contype = 'p'
      ) then
        alter table fifo_layers
          add constraint fifo_layers_pkey primary key (id);
      end if;

      if not exists (
        select 1
        from pg_constraint constraint_definition
        inner join pg_class table_class
          on table_class.oid = constraint_definition.conrelid
        inner join pg_namespace namespace
          on namespace.oid = table_class.relnamespace
        where namespace.nspname = 'public'
          and table_class.relname = 'fifo_layers'
          and constraint_definition.contype = 'f'
          and pg_get_constraintdef(constraint_definition.oid) ilike '%FOREIGN KEY (product_id)%REFERENCES products(id)%'
      ) then
        alter table fifo_layers
          add constraint fk_fifo_layers_product
          foreign key (product_id) references products(id);
      end if;

      if not exists (
        select 1
        from pg_constraint constraint_definition
        inner join pg_class table_class
          on table_class.oid = constraint_definition.conrelid
        inner join pg_namespace namespace
          on namespace.oid = table_class.relnamespace
        where namespace.nspname = 'public'
          and table_class.relname = 'fifo_layers'
          and constraint_definition.contype = 'f'
          and pg_get_constraintdef(constraint_definition.oid) ilike '%FOREIGN KEY (tenant_id, branch_id)%REFERENCES branches(tenant_id, id)%'
      ) then
        alter table fifo_layers
          add constraint fk_fifo_layers_branch
          foreign key (tenant_id, branch_id) references branches(tenant_id, id);
      end if;

      if not exists (
        select 1
        from pg_constraint constraint_definition
        inner join pg_class table_class
          on table_class.oid = constraint_definition.conrelid
        inner join pg_namespace namespace
          on namespace.oid = table_class.relnamespace
        where namespace.nspname = 'public'
          and table_class.relname = 'fifo_layers'
          and constraint_definition.contype = 'f'
          and pg_get_constraintdef(constraint_definition.oid) ilike '%FOREIGN KEY (original_source_layer_id)%REFERENCES fifo_layers(id)%'
      ) then
        alter table fifo_layers
          add constraint fk_fifo_layers_original_source_layer
          foreign key (original_source_layer_id) references fifo_layers(id);
      end if;

      if not exists (
        select 1
        from pg_constraint
        where conname = 'chk_fifo_layer_quantities'
      ) then
        alter table fifo_layers
          add constraint chk_fifo_layer_quantities
          check (
            quantity_received > 0
            and remaining_quantity >= 0
            and remaining_quantity <= quantity_received
          );
      end if;

      if not exists (
        select 1
        from pg_constraint
        where conname = 'chk_fifo_layer_cost'
      ) then
        alter table fifo_layers
          add constraint chk_fifo_layer_cost
          check (unit_cost >= 0);
      end if;
    end $$;

    create index if not exists idx_fifo_open_layers
      on fifo_layers(tenant_id, branch_id, product_id, received_at, id)
      where remaining_quantity > 0;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    -- Intentionally no-op.
    -- fifo_layers belongs to the baseline inventory schema in many local databases.
    -- This migration hardens the foundation without destructively rolling back
    -- baseline FIFO persistence.
  `);
};
