const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

require('dotenv').config({
  path: path.resolve(__dirname, '../../../.env'),
});

const DATABASE_URL = process.env.DATABASE_URL;

const EXPECTED = {
  migrationCount: 23,
  publicTableCount: 106,
  subscriptionPlans: 3,
  subscriptionPlanLimits: 27,
  permissions: 128,
};

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

function assertEqual(label, actual, expected) {
  if (Number(actual) !== Number(expected)) {
    throw new Error(`${label} expected ${expected}, received ${actual}`);
  }

  console.log(`✓ ${label}: ${actual}`);
}

async function count(client, sql) {
  const result = await client.query(sql);
  return Number(result.rows[0].count);
}

async function validateMigrationFiles(client) {
  const migrationsDir = path.resolve(__dirname, '../migrations');

  const migrationFiles = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.js'));

  const appliedMigrationCount = await count(client, 'select count(*) from schema_migrations');

  assertEqual('migration files', migrationFiles.length, EXPECTED.migrationCount);

  assertEqual('applied migrations', appliedMigrationCount, EXPECTED.migrationCount);
}

async function validateBaselineCounts(client) {
  const publicTableCount = await count(
    client,
    `
      select count(*)
      from information_schema.tables
      where table_schema = 'public'
    `,
  );

  const subscriptionPlans = await count(client, 'select count(*) from subscription_plans');

  const subscriptionPlanLimits = await count(
    client,
    'select count(*) from subscription_plan_limits',
  );

  const permissions = await count(client, 'select count(*) from permissions');

  assertEqual('public tables', publicTableCount, EXPECTED.publicTableCount);
  assertEqual('subscription plans', subscriptionPlans, EXPECTED.subscriptionPlans);
  assertEqual('subscription plan limits', subscriptionPlanLimits, EXPECTED.subscriptionPlanLimits);
  assertEqual('permissions', permissions, EXPECTED.permissions);
}

async function validateTenantDuplicateApprovalSchema(client) {
  const duplicateApprovalColumnCount = await count(
    client,
    `
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tenants'
        and column_name in (
          'duplicate_approved_at',
          'duplicate_approved_by_platform_admin_user_id',
          'duplicate_approval_reason'
        )
    `,
  );

  const duplicateApprovalConstraintCount = await count(
    client,
    `
      select count(*)
      from pg_constraint
      where conname = 'chk_tenants_duplicate_approval_complete'
    `,
  );

  const oldDuplicateIndexCount = await count(
    client,
    `
      select count(*)
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'ux_tenants_active_business_email'
    `,
  );

  const unapprovedDuplicateIndexCount = await count(
    client,
    `
      select count(*)
      from pg_class index_class
      join pg_index index_definition
        on index_definition.indexrelid = index_class.oid
      join pg_class table_class
        on table_class.oid = index_definition.indrelid
      join pg_namespace namespace
        on namespace.oid = table_class.relnamespace
      where namespace.nspname = 'public'
        and table_class.relname = 'tenants'
        and index_class.relname = 'ux_tenants_unapproved_business_email'
        and pg_get_expr(index_definition.indpred, index_definition.indrelid) ilike '%status%'
        and pg_get_expr(index_definition.indpred, index_definition.indrelid) ilike '%deleted%'
        and pg_get_expr(index_definition.indpred, index_definition.indrelid) ilike '%duplicate_approved_at IS NULL%'
    `,
  );

  const duplicateApprovalAuditIndexCount = await count(
    client,
    `
      select count(*)
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'idx_tenants_duplicate_approval'
    `,
  );

  assertEqual('tenant duplicate approval columns', duplicateApprovalColumnCount, 3);
  assertEqual(
    'tenant duplicate approval completeness constraint',
    duplicateApprovalConstraintCount,
    1,
  );
  assertEqual('old tenant duplicate unique index removed', oldDuplicateIndexCount, 0);
  assertEqual('unapproved tenant duplicate unique index', unapprovedDuplicateIndexCount, 1);
  assertEqual('tenant duplicate approval audit index', duplicateApprovalAuditIndexCount, 1);
}

async function validateRoleManagementSchema(client) {
  const roleLockVersionColumnCount = await count(
    client,
    `
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'roles'
        and column_name = 'lock_version'
        and data_type = 'integer'
    `,
  );

  const roleTenantStatusIndexCount = await count(
    client,
    `
      select count(*)
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'idx_roles_tenant_status'
    `,
  );

  assertEqual('roles lock_version column', roleLockVersionColumnCount, 1);
  assertEqual('roles tenant status index', roleTenantStatusIndexCount, 1);
}

async function validateProductCategoriesSchema(client) {
  const columnCount = await count(
    client,
    `
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'product_categories'
        and column_name in (
          'id',
          'tenant_id',
          'name',
          'normalized_name',
          'status',
          'created_at',
          'created_by_user_id',
          'updated_at',
          'updated_by_user_id',
          'deactivated_at',
          'reactivated_at',
          'lock_version'
        )
    `,
  );

  const statusConstraintCount = await count(
    client,
    `
      select count(*)
      from pg_constraint
      where conname = 'chk_product_categories_status'
    `,
  );

  const uniqueIndexCount = await count(
    client,
    `
      select count(*)
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'ux_product_categories_active_name'
    `,
  );

  const tenantStatusIndexCount = await count(
    client,
    `
      select count(*)
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'idx_product_categories_tenant_status'
    `,
  );

  assertEqual('product categories columns', columnCount, 12);
  assertEqual('product categories status constraint', statusConstraintCount, 1);
  assertEqual('product categories active name unique index', uniqueIndexCount, 1);
  assertEqual('product categories tenant status index', tenantStatusIndexCount, 1);
}

async function validateProductsFoundationSchema(client) {
  const columnCount = await count(
    client,
    `
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'products'
        and column_name in (
          'id',
          'tenant_id',
          'category_id',
          'name',
          'normalized_name',
          'sku',
          'normalized_sku',
          'barcode',
          'normalized_barcode',
          'supplier_code',
          'brand',
          'unit_of_measure',
          'default_cost',
          'selling_price',
          'reorder_level',
          'description',
          'status',
          'created_at',
          'created_by_user_id',
          'updated_at',
          'updated_by_user_id',
          'deactivated_at',
          'reactivated_at',
          'lock_version'
        )
    `,
  );

  const statusConstraintCount = await count(
    client,
    `
      select count(*)
      from pg_constraint
      where conname = 'chk_products_status'
    `,
  );

  const amountConstraintCount = await count(
    client,
    `
      select count(*)
      from pg_constraint
      where conname = 'chk_products_amounts'
    `,
  );

  const skuIndexCount = await count(
    client,
    `
      select count(*)
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'ux_products_tenant_sku'
    `,
  );

  const activeBarcodeIndexCount = await count(
    client,
    `
      select count(*)
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'ux_products_active_barcode'
    `,
  );

  const activeCategoryIndexCount = await count(
    client,
    `
      select count(*)
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'idx_products_active_category'
    `,
  );

  const searchIdentityIndexCount = await count(
    client,
    `
      select count(*)
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'idx_products_search_identity'
    `,
  );

  assertEqual('products foundation columns', columnCount, 24);
  assertEqual('products status constraint', statusConstraintCount, 1);
  assertEqual('products amount constraint', amountConstraintCount, 1);
  assertEqual('products tenant SKU unique index', skuIndexCount, 1);
  assertEqual('products active barcode unique index', activeBarcodeIndexCount, 1);
  assertEqual('products active category index', activeCategoryIndexCount, 1);
  assertEqual('products search identity index', searchIdentityIndexCount, 1);
}

async function validateStockBalancesFoundationSchema(client) {
  const columnCount = await count(
    client,
    `
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'stock_balances'
        and column_name in (
          'tenant_id',
          'branch_id',
          'product_id',
          'on_hand_qty',
          'reserved_qty',
          'updated_at',
          'lock_version'
        )
    `,
  );

  const primaryKeyCount = await count(
    client,
    `
      select count(*)
      from pg_constraint constraint_definition
      inner join pg_class table_class
        on table_class.oid = constraint_definition.conrelid
      inner join pg_namespace namespace
        on namespace.oid = table_class.relnamespace
      where namespace.nspname = 'public'
        and table_class.relname = 'stock_balances'
        and constraint_definition.contype = 'p'
        and pg_get_constraintdef(constraint_definition.oid) ilike '%PRIMARY KEY (tenant_id, branch_id, product_id)%'
    `,
  );

  const nonNegativeConstraintCount = await count(
    client,
    `
      select count(*)
      from pg_constraint
      where conname = 'chk_stock_non_negative'
    `,
  );

  const branchForeignKeyCount = await count(
    client,
    `
      select count(*)
      from pg_constraint constraint_definition
      inner join pg_class table_class
        on table_class.oid = constraint_definition.conrelid
      inner join pg_namespace namespace
        on namespace.oid = table_class.relnamespace
      where namespace.nspname = 'public'
        and table_class.relname = 'stock_balances'
        and constraint_definition.contype = 'f'
        and pg_get_constraintdef(constraint_definition.oid) ilike '%FOREIGN KEY (tenant_id, branch_id)%'
    `,
  );

  const branchProductIndexCount = await count(
    client,
    `
      select count(*)
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'idx_stock_balances_branch_product'
    `,
  );

  const productBranchIndexCount = await count(
    client,
    `
      select count(*)
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'idx_stock_balances_product_branch'
    `,
  );

  assertEqual('stock balances foundation columns', columnCount, 7);
  assertEqual('stock balances primary key', primaryKeyCount, 1);
  assertEqual('stock balances non-negative constraint', nonNegativeConstraintCount, 1);
  assertEqual('stock balances branch foreign key', branchForeignKeyCount, 1);
  assertEqual('stock balances branch product index', branchProductIndexCount, 1);
  assertEqual('stock balances product branch index', productBranchIndexCount, 1);
}

async function validateEstimatesBaselineSchema(client) {
  const estimateColumnCount = await count(
    client,
    `
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'estimates'
        and column_name in (
          'id',
          'tenant_id',
          'branch_id',
          'customer_id',
          'motorcycle_id',
          'estimate_number',
          'status',
          'valid_until_date',
          'approval_method',
          'approved_by_customer_name',
          'approved_at',
          'converted_job_order_id',
          'created_by_user_id',
          'created_at',
          'updated_at',
          'updated_by_user_id',
          'lock_version'
        )
    `,
  );

  const estimateLineColumnCount = await count(
    client,
    `
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'estimate_lines'
        and column_name in (
          'id',
          'tenant_id',
          'estimate_id',
          'line_type',
          'service_id',
          'product_id',
          'description',
          'quantity',
          'unit_price',
          'line_total',
          'line_order'
        )
    `,
  );

  const estimateStatusConstraintCount = await count(
    client,
    `
      select count(*)
      from pg_constraint
      where conname = 'chk_estimates_status'
    `,
  );

  const estimateLineTypeConstraintCount = await count(
    client,
    `
      select count(*)
      from pg_constraint
      where conname = 'chk_estimate_lines_type'
    `,
  );

  const estimateBranchStatusIndexCount = await count(
    client,
    `
      select count(*)
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'idx_estimates_branch_status'
    `,
  );

  const estimateLineOrderIndexCount = await count(
    client,
    `
      select count(*)
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'idx_estimate_lines_estimate_order'
    `,
  );

  assertEqual('estimates baseline columns', estimateColumnCount, 17);
  assertEqual('estimate lines baseline columns', estimateLineColumnCount, 11);
  assertEqual('estimates status constraint', estimateStatusConstraintCount, 1);
  assertEqual('estimate lines type constraint', estimateLineTypeConstraintCount, 1);
  assertEqual('estimates branch status index', estimateBranchStatusIndexCount, 1);
  assertEqual('estimate lines estimate order index', estimateLineOrderIndexCount, 1);
}

async function validateMoneyPrecision(client) {
  const result = await client.query(`
    select table_name, column_name, numeric_precision, numeric_scale
    from information_schema.columns
    where table_schema = 'public'
      and data_type = 'numeric'
      and (
        column_name like '%amount%'
        or column_name like '%price%'
        or column_name like '%cost%'
        or column_name like '%balance%'
        or column_name like '%revenue%'
        or column_name like '%discount%'
        or column_name like '%tax%'
        or column_name like '%value%'
      )
    order by table_name, column_name
  `);

  const invalid = result.rows.filter((row) => {
    const isVatRate = row.column_name === 'vat_rate';
    const isQuantityLikeValue =
      row.table_name === 'subscription_plan_limits' && row.column_name === 'numeric_value';

    if (isVatRate) {
      return Number(row.numeric_precision) !== 5 || Number(row.numeric_scale) !== 4;
    }

    if (isQuantityLikeValue) {
      return Number(row.numeric_precision) !== 14 || Number(row.numeric_scale) !== 3;
    }

    return Number(row.numeric_precision) !== 14 || Number(row.numeric_scale) !== 2;
  });

  if (invalid.length > 0) {
    console.error('Invalid money precision columns:');
    console.table(invalid);
    throw new Error('Money precision validation failed.');
  }

  console.log(`✓ money precision columns: ${result.rows.length}`);
}

async function validateQuantityPrecision(client) {
  const result = await client.query(`
    select table_name, column_name, numeric_precision, numeric_scale
    from information_schema.columns
    where table_schema = 'public'
      and data_type = 'numeric'
      and (
        column_name like '%quantity%'
        or column_name like '%qty%'
      )
    order by table_name, column_name
  `);

  const invalid = result.rows.filter((row) => {
    return Number(row.numeric_precision) !== 14 || Number(row.numeric_scale) !== 3;
  });

  if (invalid.length > 0) {
    console.error('Invalid quantity precision columns:');
    console.table(invalid);
    throw new Error('Quantity precision validation failed.');
  }

  console.log(`✓ quantity precision columns: ${result.rows.length}`);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });

  await client.connect();

  try {
    await validateMigrationFiles(client);
    await validateBaselineCounts(client);
    await validateTenantDuplicateApprovalSchema(client);
    await validateRoleManagementSchema(client);
    await validateProductCategoriesSchema(client);
    await validateProductsFoundationSchema(client);
    await validateStockBalancesFoundationSchema(client);
    await validateEstimatesBaselineSchema(client);
    await validateMoneyPrecision(client);
    await validateQuantityPrecision(client);

    console.log('Schema validation passed.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
