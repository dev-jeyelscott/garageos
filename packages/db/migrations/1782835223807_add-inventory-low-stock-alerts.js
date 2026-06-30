exports.up = (pgm) => {
  pgm.sql(`
    create table inventory_low_stock_alerts (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      product_id uuid not null references products(id),
      status text not null,
      available_qty numeric(14,3) not null,
      reorder_level numeric(14,3) not null,
      triggered_at timestamptz not null default now(),
      resolved_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint fk_inventory_low_stock_alerts_branch
        foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),
      constraint chk_inventory_low_stock_alerts_status
        check (status in ('active', 'resolved')),
      constraint chk_inventory_low_stock_alerts_quantities
        check (available_qty >= 0 and reorder_level >= 0),
      constraint chk_inventory_low_stock_alerts_resolution
        check (
          (status = 'active' and resolved_at is null)
          or
          (status = 'resolved' and resolved_at is not null)
        )
    );

    create unique index ux_inventory_low_stock_alerts_active
      on inventory_low_stock_alerts(tenant_id, branch_id, product_id)
      where status = 'active';

    create index idx_inventory_low_stock_alerts_branch_active
      on inventory_low_stock_alerts(tenant_id, branch_id, triggered_at desc)
      where status = 'active';

    create index idx_inventory_low_stock_alerts_product_status
      on inventory_low_stock_alerts(tenant_id, product_id, status);

    insert into inventory_low_stock_alerts (
      tenant_id,
      branch_id,
      product_id,
      status,
      available_qty,
      reorder_level,
      triggered_at,
      created_at,
      updated_at
    )
    select
      sb.tenant_id,
      sb.branch_id,
      sb.product_id,
      'active',
      sb.on_hand_qty - sb.reserved_qty,
      p.reorder_level,
      now(),
      now(),
      now()
    from stock_balances sb
    inner join products p
      on p.tenant_id = sb.tenant_id
     and p.id = sb.product_id
    where (sb.on_hand_qty - sb.reserved_qty) <= p.reorder_level
    on conflict do nothing;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    drop table if exists inventory_low_stock_alerts;
  `);
};
