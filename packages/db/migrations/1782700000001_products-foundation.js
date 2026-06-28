exports.up = async (pgm) => {
  pgm.sql(`
    create extension if not exists pg_trgm;

    alter table product_categories
      add column if not exists created_by_user_id uuid references users(id),
      add column if not exists updated_at timestamptz not null default now(),
      add column if not exists updated_by_user_id uuid references users(id),
      add column if not exists deactivated_at timestamptz,
      add column if not exists reactivated_at timestamptz,
      add column if not exists lock_version integer not null default 0;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'chk_product_categories_status'
      ) then
        alter table product_categories
          add constraint chk_product_categories_status
          check (status in ('active', 'inactive'));
      end if;
    end $$;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'uq_product_categories_tenant_id_id'
      ) then
        alter table product_categories
          add constraint uq_product_categories_tenant_id_id
          unique (tenant_id, id);
      end if;
    end $$;

    create index if not exists idx_product_categories_tenant_status
      on product_categories(tenant_id, status, normalized_name);

    create table if not exists products (
      id uuid primary key,
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
      deactivated_at timestamptz,
      reactivated_at timestamptz,
      lock_version integer not null default 0,
      constraint fk_products_category_tenant
        foreign key (tenant_id, category_id)
        references product_categories(tenant_id, id),
      constraint chk_products_status
        check (status in ('active', 'inactive')),
      constraint chk_products_amounts
        check (default_cost >= 0 and selling_price >= 0 and reorder_level >= 0)
    );

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'chk_products_status'
      ) then
        alter table products
          add constraint chk_products_status
          check (status in ('active', 'inactive'));
      end if;
    end $$;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'chk_products_amounts'
      ) then
        alter table products
          add constraint chk_products_amounts
          check (default_cost >= 0 and selling_price >= 0 and reorder_level >= 0);
      end if;
    end $$;

    create unique index if not exists ux_products_tenant_sku
      on products(tenant_id, normalized_sku);

    create unique index if not exists ux_products_active_barcode
      on products(tenant_id, normalized_barcode)
      where status = 'active' and normalized_barcode is not null;

    create index if not exists idx_products_active_category
      on products(tenant_id, category_id, status, normalized_name);

    create index if not exists idx_products_search_identity
      on products(tenant_id, normalized_sku, normalized_barcode);

    create index if not exists idx_products_name_trgm
      on products using gin(normalized_name gin_trgm_ops);
  `);
};
