import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import type { AuditService } from '../../../shared/audit/audit.service';
import type {
  DatabaseConnection,
  DatabaseConnectionProvider,
  DatabaseQueryResult,
  DatabaseRow,
} from '../../../shared/database/database-client';
import { PostgresDatabaseTransactionRunner } from '../../../shared/database/postgres-database-transaction-runner';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import { InvoicesService } from '../application/invoices.service';
import { PostgresInvoiceStore } from '../persistence/postgres-invoice.store';

const DATABASE_URL = process.env.DATABASE_URL;
const describeDatabase = DATABASE_URL === undefined ? describe.skip : describe;

const tenantId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const customerId = '33333333-3333-4333-8333-333333333333';
const motorcycleId = '44444444-4444-4444-8444-444444444444';
const userOneId = '55555555-5555-4555-8555-555555555555';
const userTwoId = '66666666-6666-4666-8666-666666666666';
const jobOrderId = '77777777-7777-4777-8777-777777777777';
const jobOrderLineId = '88888888-8888-4888-8888-888888888888';
const serviceId = '99999999-9999-4999-8999-999999999999';
const invoiceDate = new Date('2026-07-02T00:00:00.000Z');

type DraftInvoiceResult = Awaited<ReturnType<InvoicesService['createDraftInvoice']>>;

describeDatabase('Postgres invoice billing allocation concurrency', () => {
  let adminPool: Pool | null = null;
  let database: SchemaScopedDatabase | null = null;
  let schemaName: string | null = null;
  let service: InvoicesService | null = null;

  beforeAll(async () => {
    if (DATABASE_URL === undefined) {
      throw new Error('DATABASE_URL is required for database-backed invoice concurrency tests.');
    }

    schemaName = `invoice_concurrency_${randomUUID().replace(/-/g, '_')}`;
    adminPool = new Pool({ connectionString: DATABASE_URL, max: 1 });

    await adminPool.query(`create schema ${quoteIdentifier(schemaName)}`);
    await createMinimalInvoiceSchema(adminPool, schemaName);

    database = new SchemaScopedDatabase(DATABASE_URL, schemaName);

    const invoiceStore = new PostgresInvoiceStore(database);
    const transactionRunner = new PostgresDatabaseTransactionRunner(database);

    service = new InvoicesService(invoiceStore, transactionRunner, createNoopAuditService());

    await seedMinimalBillingContext(database);
  });

  afterAll(async () => {
    await database?.end();

    if (adminPool !== null && schemaName !== null) {
      try {
        await adminPool.query(`drop schema if exists ${quoteIdentifier(schemaName)} cascade`);
      } finally {
        await adminPool.end();
      }
    }
  });

  it('allows only one concurrent draft invoice to reserve the same job order line', async () => {
    if (service === null || database === null) {
      throw new Error('Database-backed invoice test was not initialized.');
    }

    const attempts = await Promise.allSettled([
      service.createDraftInvoice(
        {
          job_order_ids: [jobOrderId],
          job_order_line_ids: [jobOrderLineId],
          invoice_date: invoiceDate,
        },
        createSession(userOneId),
      ),
      service.createDraftInvoice(
        {
          job_order_ids: [jobOrderId],
          job_order_line_ids: [jobOrderLineId],
          invoice_date: invoiceDate,
        },
        createSession(userTwoId),
      ),
    ]);

    const fulfilled = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<DraftInvoiceResult> =>
        attempt.status === 'fulfilled',
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      code: 'invoice_overbilling_blocked',
    });

    expect(fulfilled[0]?.value.invoice.status).toBe('draft');
    expect(fulfilled[0]?.value.lines).toHaveLength(1);
    expect(fulfilled[0]?.value.lines[0]).toMatchObject({
      originating_job_order_line_id: jobOrderLineId,
      quantity: '1.000',
      taxable_base_amount: '1000.00',
      line_total: '1120.00',
    });

    const allocationTotals = await database.query<{
      allocation_count: number;
      allocated_quantity: string;
      allocated_amount: string;
    }>(
      `
        select
          count(*)::int as allocation_count,
          coalesce(sum(allocated_quantity), 0)::numeric(14,3)::text as allocated_quantity,
          coalesce(sum(allocated_amount), 0)::numeric(14,2)::text as allocated_amount
        from invoice_billing_allocations
        where tenant_id = $1::uuid
          and job_order_line_id = $2::uuid
          and status in ('reserved', 'final', 'closed')
      `,
      [tenantId, jobOrderLineId],
    );
    const allocationTotal = getRequiredRow(allocationTotals, 'load persisted allocation totals');

    expect(allocationTotal).toEqual({
      allocation_count: 1,
      allocated_quantity: '1.000',
      allocated_amount: '0.00',
    });

    const invoiceCountResult = await database.query<{ invoice_count: number }>(
      `
        select count(*)::int as invoice_count
        from invoices
        where tenant_id = $1::uuid
      `,
      [tenantId],
    );
    const invoiceCount = getRequiredRow(invoiceCountResult, 'load persisted invoice count');

    expect(invoiceCount.invoice_count).toBe(1);
  });
});

class SchemaScopedDatabase implements DatabaseConnectionProvider {
  private readonly pool: Pool;

  constructor(connectionString: string, schemaName: string) {
    this.pool = new Pool({
      connectionString,
      max: 8,
      options: `-c search_path=${schemaName},public`,
    });
  }

  async query<Row extends DatabaseRow = DatabaseRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<Row>> {
    const result = await this.pool.query<Row>(text, toPgQueryValues(values));

    return {
      rows: result.rows,
      rowCount: result.rowCount ?? 0,
    };
  }

  async connect(): Promise<DatabaseConnection> {
    const client = await this.pool.connect();

    return {
      query: async <Row extends DatabaseRow = DatabaseRow>(
        text: string,
        values?: readonly unknown[],
      ): Promise<DatabaseQueryResult<Row>> => {
        const result = await client.query<Row>(text, toPgQueryValues(values));

        return {
          rows: result.rows,
          rowCount: result.rowCount ?? 0,
        };
      },
      release: (): void => {
        client.release();
      },
    };
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}

async function createMinimalInvoiceSchema(pool: Pool, schemaName: string): Promise<void> {
  const schema = quoteIdentifier(schemaName);

  await pool.query(`
    create table ${schema}.tenants (
      id uuid primary key,
      status text not null,
      timezone text not null default 'Asia/Manila'
    );

    create table ${schema}.shop_profiles (
      tenant_id uuid primary key references ${schema}.tenants(id),
      invoice_prefix text not null,
      tax_profile text not null,
      tax_mode text not null,
      vat_rate numeric(5,4) not null,
      default_invoice_due_days integer not null
    );

    create table ${schema}.branches (
      id uuid primary key,
      tenant_id uuid not null references ${schema}.tenants(id)
    );

    create table ${schema}.customers (
      id uuid primary key,
      tenant_id uuid not null references ${schema}.tenants(id)
    );

    create table ${schema}.motorcycles (
      id uuid primary key,
      tenant_id uuid not null references ${schema}.tenants(id),
      customer_id uuid not null references ${schema}.customers(id)
    );

    create table ${schema}.roles (
      id uuid primary key,
      tenant_id uuid not null references ${schema}.tenants(id),
      status text not null,
      role_type text not null
    );

    create table ${schema}.user_roles (
      tenant_id uuid not null references ${schema}.tenants(id),
      user_id uuid not null,
      role_id uuid not null references ${schema}.roles(id),
      removed_at timestamptz
    );

    create table ${schema}.job_orders (
      id uuid primary key,
      tenant_id uuid not null references ${schema}.tenants(id),
      branch_id uuid not null references ${schema}.branches(id),
      customer_id uuid not null references ${schema}.customers(id),
      motorcycle_id uuid not null references ${schema}.motorcycles(id),
      status text not null
    );

    create table ${schema}.job_order_lines (
      id uuid primary key,
      tenant_id uuid not null references ${schema}.tenants(id),
      job_order_id uuid not null references ${schema}.job_orders(id),
      line_type text not null,
      service_id uuid,
      product_id uuid,
      description text not null,
      quantity numeric(14,3) not null,
      unit_price numeric(14,2) not null,
      authorized_amount numeric(14,2) not null,
      status text not null,
      line_order integer not null
    );

    create table ${schema}.invoices (
      id uuid primary key,
      tenant_id uuid not null references ${schema}.tenants(id),
      branch_id uuid not null references ${schema}.branches(id),
      customer_id uuid not null references ${schema}.customers(id),
      invoice_number text not null,
      invoice_date date not null,
      due_date date,
      status text not null,
      tax_profile text,
      tax_mode text,
      vat_rate numeric(5,4),
      subtotal_amount numeric(14,2) not null,
      discount_amount numeric(14,2) not null,
      tax_amount numeric(14,2) not null,
      total_amount numeric(14,2) not null,
      amount_paid numeric(14,2) not null default 0,
      amount_refunded numeric(14,2) not null default 0,
      remaining_collectible_balance numeric(14,2) not null,
      discount_reason text,
      issued_at timestamptz,
      cancelled_at timestamptz,
      voided_at timestamptz,
      refunded_at timestamptz,
      created_by_user_id uuid not null,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      lock_version integer not null default 0,
      unique (tenant_id, invoice_number)
    );

    create table ${schema}.invoice_job_orders (
      id uuid primary key,
      tenant_id uuid not null references ${schema}.tenants(id),
      invoice_id uuid not null references ${schema}.invoices(id),
      job_order_id uuid not null references ${schema}.job_orders(id),
      created_at timestamptz not null
    );

    create table ${schema}.invoice_lines (
      id uuid primary key,
      tenant_id uuid not null references ${schema}.tenants(id),
      invoice_id uuid not null references ${schema}.invoices(id),
      originating_job_order_line_id uuid references ${schema}.job_order_lines(id),
      line_type text not null,
      product_id uuid,
      service_id uuid,
      description text not null,
      quantity numeric(14,3) not null,
      unit_price numeric(14,2) not null,
      line_discount_amount numeric(14,2) not null,
      allocated_invoice_discount_amount numeric(14,2) not null,
      taxable_base_amount numeric(14,2) not null,
      tax_amount numeric(14,2) not null,
      line_total numeric(14,2) not null,
      line_order integer not null
    );

    create table ${schema}.invoice_billing_allocations (
      id uuid primary key,
      tenant_id uuid not null references ${schema}.tenants(id),
      invoice_id uuid not null references ${schema}.invoices(id),
      invoice_line_id uuid not null references ${schema}.invoice_lines(id),
      job_order_line_id uuid not null references ${schema}.job_order_lines(id),
      allocated_quantity numeric(14,3) not null,
      allocated_amount numeric(14,2),
      status text not null,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );

    create index idx_test_invoice_billing_allocations_open
    on ${schema}.invoice_billing_allocations(tenant_id, job_order_line_id, status);

    create table ${schema}.invoice_status_events (
      id uuid primary key,
      tenant_id uuid not null references ${schema}.tenants(id),
      invoice_id uuid not null references ${schema}.invoices(id),
      from_status text,
      to_status text not null,
      reason text,
      created_by_user_id uuid not null,
      created_at timestamptz not null
    );
  `);
}

async function seedMinimalBillingContext(database: SchemaScopedDatabase): Promise<void> {
  await database.query(
    `
      insert into tenants (id, status, timezone)
      values ($1::uuid, 'active', 'Asia/Manila')
    `,
    [tenantId],
  );

  await database.query(
    `
      insert into shop_profiles (
        tenant_id,
        invoice_prefix,
        tax_profile,
        tax_mode,
        vat_rate,
        default_invoice_due_days
      )
      values ($1::uuid, 'INV-', 'vat_registered', 'tax_exclusive', 0.1200, 7)
    `,
    [tenantId],
  );

  await database.query(
    `
      insert into branches (id, tenant_id)
      values ($1::uuid, $2::uuid)
    `,
    [branchId, tenantId],
  );

  await database.query(
    `
      insert into customers (id, tenant_id)
      values ($1::uuid, $2::uuid)
    `,
    [customerId, tenantId],
  );

  await database.query(
    `
      insert into motorcycles (id, tenant_id, customer_id)
      values ($1::uuid, $2::uuid, $3::uuid)
    `,
    [motorcycleId, tenantId, customerId],
  );

  await database.query(
    `
      insert into job_orders (
        id,
        tenant_id,
        branch_id,
        customer_id,
        motorcycle_id,
        status
      )
      values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 'completed')
    `,
    [jobOrderId, tenantId, branchId, customerId, motorcycleId],
  );

  await database.query(
    `
      insert into job_order_lines (
        id,
        tenant_id,
        job_order_id,
        line_type,
        service_id,
        product_id,
        description,
        quantity,
        unit_price,
        authorized_amount,
        status,
        line_order
      )
      values (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        'service',
        $4::uuid,
        null,
        'Tune up service',
        1.000,
        1000.00,
        1000.00,
        'completed',
        0
      )
    `,
    [jobOrderLineId, tenantId, jobOrderId, serviceId],
  );
}

function createSession(userId: string): TenantContextAuthenticatedSession {
  return {
    actor: {
      user_id: userId,
      user_type: 'tenant_user',
      tenant_id: tenantId,
      session_id: `session-${userId}`,
      email_verified: true,
      support_access_session_id: null,
    },
    tenant: {
      id: tenantId,
      status: 'active',
    },
    effective_permissions: ['invoices.create', 'invoices.read'],
    branches: [{ id: branchId }],
    tenant_wide_branch_access: false,
    subscription_status_source: 'system_computed',
  };
}

function createNoopAuditService(): AuditService {
  return {
    async record() {
      return {} as Awaited<ReturnType<AuditService['record']>>;
    },
  } as unknown as AuditService;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function toPgQueryValues(values: readonly unknown[] | undefined): unknown[] | undefined {
  return values === undefined ? undefined : [...values];
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Failed to ${operation}.`);
  }

  return row;
}
