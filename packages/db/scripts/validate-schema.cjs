const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

require('dotenv').config({
  path: path.resolve(__dirname, '../../../.env'),
});

const DATABASE_URL = process.env.DATABASE_URL;

const EXPECTED = {
  migrationCount: 16,
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
