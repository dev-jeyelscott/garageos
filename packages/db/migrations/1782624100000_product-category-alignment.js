exports.up = async (pgm) => {
  pgm.sql(`
    alter table product_categories
      add column if not exists created_by_user_id uuid references users(id),
      add column if not exists updated_by_user_id uuid references users(id),
      add column if not exists deactivated_at timestamptz,
      add column if not exists reactivated_at timestamptz,
      add column if not exists lock_version integer not null default 0;

    alter table product_categories
      drop constraint if exists chk_product_category_name;

    alter table product_categories
      drop constraint if exists chk_product_categories_name_length;

    alter table product_categories
      add constraint chk_product_categories_name_length check (
        char_length(trim(name)) between 2 and 100
      );

    alter table product_categories
      drop constraint if exists chk_product_category_status;

    alter table product_categories
      drop constraint if exists chk_product_categories_status;

    alter table product_categories
      add constraint chk_product_categories_status check (
        status in ('active', 'inactive')
      );

    create index if not exists idx_product_categories_tenant_status
      on product_categories(tenant_id, status);

    create index if not exists idx_product_categories_name_trgm
      on product_categories using gin(normalized_name gin_trgm_ops);

    insert into product_categories (
      id,
      tenant_id,
      name,
      normalized_name,
      status,
      created_at,
      updated_at
    )
    select
      gen_random_uuid(),
      t.id,
      category.name,
      lower(category.name),
      'active',
      now(),
      now()
    from tenants t
    cross join (
      values
        ('Engine Oil'),
        ('Tires'),
        ('Accessories'),
        ('Brake Parts'),
        ('CVT Parts'),
        ('Lubricants')
    ) as category(name)
    where t.status <> 'deleted'
    on conflict do nothing;
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists idx_product_categories_name_trgm;

    alter table product_categories
      drop constraint if exists chk_product_categories_name_length;

    alter table product_categories
      drop constraint if exists chk_product_categories_status;

    alter table product_categories
      drop column if exists created_by_user_id,
      drop column if exists updated_by_user_id,
      drop column if exists deactivated_at,
      drop column if exists reactivated_at,
      drop column if exists lock_version;
  `);
};
