exports.up = (pgm) => {
  pgm.sql(`
    create table if not exists stock_balances (
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      product_id uuid not null references products(id),
      on_hand_qty numeric(14,3) not null default 0,
      reserved_qty numeric(14,3) not null default 0,
      updated_at timestamptz not null default now(),
      lock_version integer not null default 0,
      primary key (tenant_id, branch_id, product_id),
      foreign key (tenant_id, branch_id) references branches(tenant_id, id),
      constraint chk_stock_non_negative check (
        on_hand_qty >= 0
        and reserved_qty >= 0
        and on_hand_qty >= reserved_qty
      )
    );

    create index if not exists idx_stock_balances_branch_product
      on stock_balances(tenant_id, branch_id, product_id);

    create index if not exists idx_stock_balances_product_branch
      on stock_balances(tenant_id, product_id, branch_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    drop index if exists idx_stock_balances_product_branch;
    drop index if exists idx_stock_balances_branch_product;
    drop table if exists stock_balances;
  `);
};
