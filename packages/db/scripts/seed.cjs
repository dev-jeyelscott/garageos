const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '../../../.env'),
});

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const plans = [
  {
    code: 'basic',
    name: 'Basic',
    is_default: true,
    default_duration_days: 30,
    limits: {
      max_active_branches: { value_type: 'numeric', numeric_value: '1.000' },
      in_app_notifications: { value_type: 'boolean', boolean_value: true },
      push_notifications: { value_type: 'boolean', boolean_value: true },
      email_notifications: { value_type: 'boolean', boolean_value: false },
      sms_notifications: { value_type: 'boolean', boolean_value: false },
      customer_email_reminders: { value_type: 'boolean', boolean_value: false },
      customer_sms_reminders: { value_type: 'boolean', boolean_value: false },
      branch_comparison_reports: { value_type: 'boolean', boolean_value: false },
      advanced_operational_reports: { value_type: 'boolean', boolean_value: false },
    },
  },
  {
    code: 'mid',
    name: 'Mid',
    is_default: false,
    default_duration_days: 30,
    limits: {
      max_active_branches: { value_type: 'numeric', numeric_value: '3.000' },
      in_app_notifications: { value_type: 'boolean', boolean_value: true },
      push_notifications: { value_type: 'boolean', boolean_value: true },
      email_notifications: { value_type: 'boolean', boolean_value: true },
      sms_notifications: { value_type: 'boolean', boolean_value: false },
      customer_email_reminders: { value_type: 'boolean', boolean_value: true },
      customer_sms_reminders: { value_type: 'boolean', boolean_value: false },
      branch_comparison_reports: { value_type: 'boolean', boolean_value: true },
      advanced_operational_reports: { value_type: 'boolean', boolean_value: false },
    },
  },
  {
    code: 'high',
    name: 'High',
    is_default: false,
    default_duration_days: 30,
    limits: {
      max_active_branches: { value_type: 'numeric', numeric_value: '10.000' },
      in_app_notifications: { value_type: 'boolean', boolean_value: true },
      push_notifications: { value_type: 'boolean', boolean_value: true },
      email_notifications: { value_type: 'boolean', boolean_value: true },
      sms_notifications: { value_type: 'boolean', boolean_value: true },
      customer_email_reminders: { value_type: 'boolean', boolean_value: true },
      customer_sms_reminders: { value_type: 'boolean', boolean_value: true },
      branch_comparison_reports: { value_type: 'boolean', boolean_value: true },
      advanced_operational_reports: { value_type: 'boolean', boolean_value: true },
    },
  },
];

const permissions = [
  'platform.tenants.read',
  'platform.tenants.create',
  'platform.tenants.update',
  'platform.subscriptions.update',
  'platform.plans.update',
  'platform.support_access',
  'platform.audit_logs.read',

  'shop.read',
  'shop.update',
  'shop.billing.update',
  'shop.export_data',

  'branches.create',
  'branches.read',
  'branches.update',
  'branches.deactivate',
  'branches.reactivate',

  'users.create',
  'users.read',
  'users.update',
  'users.deactivate',
  'users.reset_password',
  'users.assign_roles',
  'users.assign_branches',

  'roles.create',
  'roles.read',
  'roles.update',
  'roles.deactivate',
  'permissions.read',

  'customers.create',
  'customers.read',
  'customers.update',
  'customers.merge',
  'customers.soft_delete',
  'customers.restore',

  'motorcycles.create',
  'motorcycles.read',
  'motorcycles.update',
  'motorcycles.soft_delete',
  'motorcycles.restore',

  'job_orders.create',
  'job_orders.read',
  'job_orders.update',
  'job_orders.cancel',
  'job_orders.change_status',
  'job_orders.correct_status',
  'job_orders.release',
  'job_orders.release_with_balance',
  'job_orders.attach_files',

  'estimates.create',
  'estimates.read',
  'estimates.update',
  'estimates.present',
  'estimates.approve',
  'estimates.convert',
  'estimates.cancel',

  'services.create',
  'services.read',
  'services.update',
  'services.deactivate',

  'mechanic_sessions.create',
  'mechanic_sessions.read',
  'mechanic_sessions.pause',
  'mechanic_sessions.resume',
  'mechanic_sessions.finish',

  'products.create',
  'products.read',
  'products.update',
  'products.deactivate',
  'product_categories.manage',

  'inventory.read',
  'inventory.adjust',
  'inventory.adjust.approve',
  'inventory.reserve',
  'inventory.release_reservation',
  'inventory.transfer.create',
  'inventory.transfer.send',
  'inventory.transfer.receive',
  'inventory.transfer.cancel',
  'inventory.force_adjust',

  'suppliers.create',
  'suppliers.read',
  'suppliers.update',
  'suppliers.deactivate',

  'purchases.create',
  'purchases.read',
  'purchases.update',
  'purchases.cancel',
  'purchases.receive',

  'supplier_returns.create',
  'supplier_returns.read',
  'supplier_credits.create',
  'supplier_credits.read',
  'supplier_payments.create',
  'supplier_payments.read',

  'invoices.create',
  'invoices.read',
  'invoices.update_draft',
  'invoices.issue',
  'invoices.cancel',
  'invoices.void',
  'invoices.refund',

  'payments.create',
  'payments.read',
  'payments.refund',
  'receipts.read',

  'expenses.create',
  'expenses.read',
  'expenses.update',
  'expenses.void',
  'expense_categories.manage',

  'reminders.create',
  'reminders.read',
  'reminders.update',
  'reminders.cancel',
  'reminders.send',

  'notifications.read',
  'notifications.update_preferences',
  'notifications.send',

  'reports.view_basic',
  'reports.view_branch',
  'reports.view_advanced',
  'reports.export',

  'files.upload',
  'files.read',
  'files.soft_delete',
  'files.restore',

  'audit_logs.read',
  'settings.update',
];

function permissionCategory(code) {
  if (code.startsWith('platform.')) return 'platform';
  if (code.startsWith('shop.') || code === 'settings.update') return 'shop';
  if (code.startsWith('branches.')) return 'branches';
  if (code.startsWith('users.')) return 'users';
  if (code.startsWith('roles.') || code.startsWith('permissions.')) return 'roles_permissions';
  if (code.startsWith('customers.')) return 'customers';
  if (code.startsWith('motorcycles.')) return 'motorcycles';
  if (code.startsWith('job_orders.')) return 'job_orders';
  if (code.startsWith('estimates.')) return 'estimates';
  if (code.startsWith('services.')) return 'services';
  if (code.startsWith('mechanic_sessions.')) return 'mechanic_sessions';
  if (code.startsWith('products.') || code.startsWith('product_categories.')) return 'products';
  if (code.startsWith('inventory.')) return 'inventory';
  if (code.startsWith('suppliers.')) return 'suppliers';
  if (
    code.startsWith('purchases.') ||
    code.startsWith('supplier_returns.') ||
    code.startsWith('supplier_credits.') ||
    code.startsWith('supplier_payments.')
  ) {
    return 'purchasing_ap';
  }
  if (code.startsWith('invoices.')) return 'invoices';
  if (code.startsWith('payments.') || code.startsWith('receipts.')) return 'payments_receipts';
  if (code.startsWith('expenses.') || code.startsWith('expense_categories.')) return 'expenses';
  if (code.startsWith('reminders.')) return 'reminders';
  if (code.startsWith('notifications.')) return 'notifications';
  if (code.startsWith('reports.')) return 'reports';
  if (code.startsWith('files.')) return 'files';
  if (code.startsWith('audit_logs.')) return 'audit_logs';

  return 'uncategorized';
}

async function seed() {
  const client = new Client({ connectionString: DATABASE_URL });

  await client.connect();

  try {
    await client.query('begin');

    for (const plan of plans) {
      const planResult = await client.query(
        `
          insert into subscription_plans (
            code,
            name,
            status,
            is_default,
            default_duration_days
          )
          values ($1, $2, 'active', $3, $4)
          on conflict (code)
          do update set
            name = excluded.name,
            status = excluded.status,
            is_default = excluded.is_default,
            default_duration_days = excluded.default_duration_days
          returning id
        `,
        [plan.code, plan.name, plan.is_default, plan.default_duration_days],
      );

      const planId = planResult.rows[0].id;

      for (const [capabilityCode, limit] of Object.entries(plan.limits)) {
        await client.query(
          `
            insert into subscription_plan_limits (
              plan_id,
              capability_code,
              value_type,
              numeric_value,
              boolean_value
            )
            values ($1, $2, $3, $4, $5)
            on conflict (plan_id, capability_code)
            do update set
              value_type = excluded.value_type,
              numeric_value = excluded.numeric_value,
              boolean_value = excluded.boolean_value
          `,
          [
            planId,
            capabilityCode,
            limit.value_type,
            limit.numeric_value ?? null,
            limit.boolean_value ?? null,
          ],
        );
      }
    }

    for (const code of permissions) {
      await client.query(
        `
          insert into permissions (
            code,
            category,
            description
          )
          values ($1, $2, $3)
          on conflict (code)
          do update set
            category = excluded.category,
            description = excluded.description
        `,
        [code, permissionCategory(code), code],
      );
    }

    await client.query('commit');
    console.log('Seeded subscription plans, plan limits, and permissions.');
  } catch (error) {
    await client.query('rollback');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

seed();
