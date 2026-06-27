const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

require('dotenv').config({
  path: path.resolve(__dirname, '../../../.env'),
});

const DATABASE_URL = process.env.DATABASE_URL;

const EXPECTED = {
  migrationCount: 17,
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
