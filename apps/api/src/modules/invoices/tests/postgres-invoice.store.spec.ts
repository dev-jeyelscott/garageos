import { describe, expect, it } from 'vitest';

import type {
  DatabaseQueryClient,
  DatabaseQueryResult,
  DatabaseRow,
} from '../../../shared/database/database-client';
import {
  type InvoiceBillingAllocationRow,
  type InvoiceJobOrderRow,
  type InvoiceLineRow,
  type InvoiceRow,
  type InvoiceStatusEventRow,
  mapInvoiceLineRow,
  mapInvoiceRow,
} from '../application/invoice.mappers';
import { InvoiceStore } from '../application/invoice.store';
import { INVOICE_PROVIDERS } from '../invoice.providers';
import { PostgresInvoiceStore } from '../persistence/postgres-invoice.store';

const tenantId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const invoiceId = '33333333-3333-4333-8333-333333333333';
const customerId = '44444444-4444-4444-8444-444444444444';
const userId = '55555555-5555-4555-8555-555555555555';
const jobOrderId = '66666666-6666-4666-8666-666666666666';
const invoiceLineId = '77777777-7777-4777-8777-777777777777';
const jobOrderLineId = '88888888-8888-4888-8888-888888888888';
const createdAt = new Date('2026-07-02T01:00:00.000Z');
const invoiceDate = new Date('2026-07-02T00:00:00.000Z');

describe('Invoice provider registration', () => {
  it('binds the invoice store to the Postgres implementation', () => {
    expect(INVOICE_PROVIDERS).toEqual([
      {
        provide: InvoiceStore,
        useClass: PostgresInvoiceStore,
      },
    ]);
  });
});

describe('invoice mappers', () => {
  it('maps documented invoice enum values and dates', () => {
    const result = mapInvoiceRow(createInvoiceRow({ status: 'partially_paid' }));

    expect(result).toMatchObject({
      id: invoiceId,
      tenantId,
      branchId,
      customerId,
      status: 'partially_paid',
      taxProfile: 'vat_registered',
      taxMode: 'tax_exclusive',
    });
    expect(result.invoiceDate).toBeInstanceOf(Date);
  });

  it('rejects undocumented invoice statuses', () => {
    expect(() => mapInvoiceRow(createInvoiceRow({ status: 'posted' }))).toThrow(
      'Unknown invoice status: posted.',
    );
  });

  it('rejects undocumented invoice line types', () => {
    expect(() => mapInvoiceLineRow(createInvoiceLineRow({ line_type: 'package' }))).toThrow(
      'Unknown invoice line type: package.',
    );
  });
});

describe('PostgresInvoiceStore', () => {
  it('creates a draft invoice header without payment, receipt, refund, or ledger side effects', async () => {
    const client = new RecordingDatabaseClient([[createInvoiceRow()]]);
    const store = new PostgresInvoiceStore(client);

    const result = await store.createDraftInvoice({
      id: invoiceId,
      tenantId,
      branchId,
      customerId,
      invoiceNumber: 'INV-20260702-000001',
      invoiceDate,
      dueDate: null,
      taxProfile: 'vat_registered',
      taxMode: 'tax_exclusive',
      vatRate: '0.1200',
      subtotalAmount: '1000.00',
      discountAmount: '0.00',
      taxAmount: '120.00',
      totalAmount: '1120.00',
      remainingCollectibleBalance: '1120.00',
      discountReason: null,
      createdByUserId: userId,
      createdAt,
    });

    const sql = normalizeSql(client.queries[0]?.sql ?? '');
    expect(sql).toContain('insert into invoices');
    expect(sql).toContain("'draft'");
    expect(sql).not.toMatch(/payments|receipts|refunds|accounts_receivable_ledger/);
    expect(client.queries[0]?.values).toEqual([
      invoiceId,
      tenantId,
      branchId,
      customerId,
      'INV-20260702-000001',
      invoiceDate,
      null,
      'vat_registered',
      'tax_exclusive',
      '0.1200',
      '1000.00',
      '0.00',
      '120.00',
      '1120.00',
      '1120.00',
      null,
      userId,
      createdAt,
    ]);
    expect(result).toMatchObject({
      id: invoiceId,
      tenantId,
      branchId,
      status: 'draft',
      remainingCollectibleBalance: '1120.00',
    });
  });

  it('creates tenant-scoped invoice job order links', async () => {
    const client = new RecordingDatabaseClient([[createInvoiceJobOrderRow()]]);
    const store = new PostgresInvoiceStore(client);

    const result = await store.createInvoiceJobOrderLinks({
      tenantId,
      invoiceId,
      jobOrders: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          jobOrderId,
          createdAt,
        },
      ],
    });

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain('insert into invoice_job_orders');
    expect(client.queries[0]?.values).toEqual([
      '99999999-9999-4999-8999-999999999999',
      tenantId,
      invoiceId,
      jobOrderId,
      createdAt,
    ]);
    expect(result[0]).toMatchObject({ tenantId, invoiceId, jobOrderId });
  });

  it('creates invoice lines with documented line types and monetary snapshots', async () => {
    const client = new RecordingDatabaseClient([[createInvoiceLineRow()]]);
    const store = new PostgresInvoiceStore(client);

    const result = await store.createInvoiceLines({
      tenantId,
      invoiceId,
      lines: [createInvoiceLineInput()],
    });

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain('insert into invoice_lines');
    expect(client.queries[0]?.values).toHaveLength(16);
    expect(result[0]).toMatchObject({
      tenantId,
      invoiceId,
      lineType: 'service',
      taxableBaseAmount: '1000.00',
      taxAmount: '120.00',
    });
  });

  it('creates billing allocations as reserved by default for draft invoice workflows', async () => {
    const client = new RecordingDatabaseClient([
      [createJobOrderLineCapacityRow()],
      [],
      [createBillingAllocationRow()],
    ]);
    const store = new PostgresInvoiceStore(client);

    const result = await store.createBillingAllocations({
      tenantId,
      invoiceId,
      allocations: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          invoiceLineId,
          jobOrderLineId,
          allocatedQuantity: '1.000',
          allocatedAmount: null,
          status: 'reserved',
          createdAt,
        },
      ],
    });

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain('from job_order_lines');
    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain('for update');
    expect(normalizeSql(client.queries[1]?.sql ?? '')).toContain(
      "status in ('reserved', 'final', 'closed')",
    );
    expect(normalizeSql(client.queries[2]?.sql ?? '')).toContain(
      'insert into invoice_billing_allocations',
    );
    expect(result[0]).toMatchObject({
      tenantId,
      invoiceId,
      invoiceLineId,
      jobOrderLineId,
      status: 'reserved',
    });
  });

  it('does not create billing allocations when remaining line quantity is exhausted', async () => {
    const client = new RecordingDatabaseClient([
      [createJobOrderLineCapacityRow()],
      [
        {
          job_order_line_id: jobOrderLineId,
          allocated_quantity: '1.000',
          allocated_amount: '0.00',
        },
      ],
    ]);
    const store = new PostgresInvoiceStore(client);

    const result = await store.createBillingAllocations({
      tenantId,
      invoiceId,
      allocations: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          invoiceLineId,
          jobOrderLineId,
          allocatedQuantity: '1.000',
          allocatedAmount: null,
          status: 'reserved',
          createdAt,
        },
      ],
    });

    expect(result).toEqual([]);
    expect(client.queries).toHaveLength(2);
  });

  it('replaces lines only for tenant-scoped draft invoices and removes draft allocations first', async () => {
    const client = new RecordingDatabaseClient([[{ value: 1 }], [], [], [createInvoiceLineRow()]]);
    const store = new PostgresInvoiceStore(client);

    const result = await store.replaceDraftInvoiceLines({
      tenantId,
      invoiceId,
      lines: [createInvoiceLineInput()],
    });

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain("and status = 'draft'");
    expect(normalizeSql(client.queries[1]?.sql ?? '')).toContain(
      'delete from invoice_billing_allocations',
    );
    expect(normalizeSql(client.queries[2]?.sql ?? '')).toContain('delete from invoice_lines');
    expect(normalizeSql(client.queries[3]?.sql ?? '')).toContain('insert into invoice_lines');
    expect(result).toHaveLength(1);
  });

  it('does not replace lines when the invoice is not tenant-visible draft', async () => {
    const client = new RecordingDatabaseClient([[]]);
    const store = new PostgresInvoiceStore(client);

    const result = await store.replaceDraftInvoiceLines({
      tenantId,
      invoiceId,
      lines: [createInvoiceLineInput()],
    });

    expect(result).toEqual([]);
    expect(client.queries).toHaveLength(1);
  });

  it('loads an invoice with tenant-scoped detail records', async () => {
    const client = new RecordingDatabaseClient([
      [createInvoiceRow()],
      [createInvoiceJobOrderRow()],
      [createInvoiceLineRow()],
      [createBillingAllocationRow()],
    ]);
    const store = new PostgresInvoiceStore(client);

    const result = await store.findInvoiceWithDetails({ tenantId, invoiceId });

    expect(client.queries.map((query) => normalizeSql(query.sql))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('from invoices'),
        expect.stringContaining('from invoice_job_orders'),
        expect.stringContaining('from invoice_lines'),
        expect.stringContaining('from invoice_billing_allocations'),
      ]),
    );
    expect(result?.invoice.id).toBe(invoiceId);
    expect(result?.jobOrders).toHaveLength(1);
    expect(result?.lines).toHaveLength(1);
    expect(result?.billingAllocations).toHaveLength(1);
  });

  it('locks invoices for update before attaching details', async () => {
    const client = new RecordingDatabaseClient([
      [createInvoiceRow()],
      [createInvoiceJobOrderRow()],
      [createInvoiceLineRow()],
      [createBillingAllocationRow()],
    ]);
    const store = new PostgresInvoiceStore(client);

    await store.lockInvoiceWithDetailsForUpdate({ tenantId, invoiceId }, client);

    const sql = normalizeSql(client.queries[0]?.sql ?? '');
    expect(sql).toContain('where tenant_id = $1::uuid');
    expect(sql).toContain('and id = $2::uuid');
    expect(sql).toContain('for update');
  });

  it('inserts invoice status events with required actor and tenant scope', async () => {
    const client = new RecordingDatabaseClient([[createStatusEventRow()]]);
    const store = new PostgresInvoiceStore(client);

    const result = await store.insertStatusEvent({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      tenantId,
      invoiceId,
      fromStatus: null,
      toStatus: 'draft',
      reason: 'invoice_created',
      createdByUserId: userId,
      createdAt,
    });

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain(
      'insert into invoice_status_events',
    );
    expect(client.queries[0]?.values).toEqual([
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      tenantId,
      invoiceId,
      null,
      'draft',
      'invoice_created',
      userId,
      createdAt,
    ]);
    expect(result).toMatchObject({ fromStatus: null, toStatus: 'draft' });
  });

  it('lists invoices with branch, status, customer, date filters, and stable ordering', async () => {
    const client = new RecordingDatabaseClient([[createInvoiceRow()]]);
    const store = new PostgresInvoiceStore(client);

    const result = await store.listInvoices({
      tenantId,
      branchId,
      status: 'draft',
      customerId,
      fromDate: invoiceDate,
      toDate: invoiceDate,
      limit: 25,
    });

    const sql = normalizeSql(client.queries[0]?.sql ?? '');
    expect(sql).toContain('where tenant_id = $1::uuid');
    expect(sql).toContain('branch_id = $2::uuid');
    expect(sql).toContain('status = $3::text');
    expect(sql).toContain('customer_id = $4::uuid');
    expect(sql).toContain('invoice_date >= $5::date');
    expect(sql).toContain('invoice_date <= $6::date');
    expect(sql).toContain('order by invoice_date desc, created_at desc, id desc');
    expect(client.queries[0]?.values).toEqual([
      tenantId,
      branchId,
      'draft',
      customerId,
      invoiceDate,
      invoiceDate,
      25,
    ]);
    expect(result[0]?.tenantId).toBe(tenantId);
  });

  it('finds the latest tenant-scoped invoice number for a date prefix', async () => {
    const client = new RecordingDatabaseClient([[{ invoice_number: 'INV-20260702-000003' }]]);
    const store = new PostgresInvoiceStore(client);

    const result = await store.findLatestInvoiceNumberForDate({
      tenantId,
      datePrefix: 'INV-20260702',
    });

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain('invoice_number like $2');
    expect(client.queries[0]?.values).toEqual([tenantId, 'INV-20260702-%']);
    expect(result).toBe('INV-20260702-000003');
  });
});

class RecordingDatabaseClient implements DatabaseQueryClient {
  readonly queries: {
    readonly sql: string;
    readonly values: readonly unknown[] | undefined;
  }[] = [];

  private index = 0;

  constructor(private readonly rowSets: readonly (readonly DatabaseRow[])[]) {}

  async query<Row extends DatabaseRow = DatabaseRow>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<Row>> {
    this.queries.push({ sql, values });
    const rows = this.rowSets[this.index] ?? [];
    this.index += 1;

    return {
      rows: rows as readonly Row[] as Row[],
      rowCount: rows.length,
    };
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createInvoiceLineInput() {
  return {
    id: invoiceLineId,
    originatingJobOrderLineId: jobOrderLineId,
    lineType: 'service' as const,
    productId: null,
    serviceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    description: 'Tune up service',
    quantity: '1.000',
    unitPrice: '1000.00',
    lineDiscountAmount: '0.00',
    allocatedInvoiceDiscountAmount: '0.00',
    taxableBaseAmount: '1000.00',
    taxAmount: '120.00',
    lineTotal: '1120.00',
    lineOrder: 0,
  };
}

function createInvoiceRow(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: invoiceId,
    tenant_id: tenantId,
    branch_id: branchId,
    customer_id: customerId,
    invoice_number: 'INV-20260702-000001',
    invoice_date: invoiceDate.toISOString(),
    due_date: null,
    status: 'draft',
    tax_profile: 'vat_registered',
    tax_mode: 'tax_exclusive',
    vat_rate: '0.1200',
    subtotal_amount: '1000.00',
    discount_amount: '0.00',
    tax_amount: '120.00',
    total_amount: '1120.00',
    amount_paid: '0.00',
    amount_refunded: '0.00',
    remaining_collectible_balance: '1120.00',
    discount_reason: null,
    issued_at: null,
    cancelled_at: null,
    voided_at: null,
    refunded_at: null,
    created_by_user_id: userId,
    created_at: createdAt.toISOString(),
    updated_at: createdAt.toISOString(),
    lock_version: 0,
    ...overrides,
  };
}

function createInvoiceJobOrderRow(overrides: Partial<InvoiceJobOrderRow> = {}): InvoiceJobOrderRow {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    tenant_id: tenantId,
    invoice_id: invoiceId,
    job_order_id: jobOrderId,
    created_at: createdAt.toISOString(),
    ...overrides,
  };
}

function createInvoiceLineRow(overrides: Partial<InvoiceLineRow> = {}): InvoiceLineRow {
  return {
    id: invoiceLineId,
    tenant_id: tenantId,
    invoice_id: invoiceId,
    originating_job_order_line_id: jobOrderLineId,
    line_type: 'service',
    product_id: null,
    service_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    description: 'Tune up service',
    quantity: '1.000',
    unit_price: '1000.00',
    line_discount_amount: '0.00',
    allocated_invoice_discount_amount: '0.00',
    taxable_base_amount: '1000.00',
    tax_amount: '120.00',
    line_total: '1120.00',
    line_order: 0,
    ...overrides,
  };
}

function createBillingAllocationRow(
  overrides: Partial<InvoiceBillingAllocationRow> = {},
): InvoiceBillingAllocationRow {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenant_id: tenantId,
    invoice_id: invoiceId,
    invoice_line_id: invoiceLineId,
    job_order_line_id: jobOrderLineId,
    allocated_quantity: '1.000',
    allocated_amount: null,
    status: 'reserved',
    created_at: createdAt.toISOString(),
    updated_at: createdAt.toISOString(),
    ...overrides,
  };
}

function createJobOrderLineCapacityRow() {
  return {
    id: jobOrderLineId,
    quantity: '1.000',
    authorized_amount: '1000.00',
  };
}

function createStatusEventRow(
  overrides: Partial<InvoiceStatusEventRow> = {},
): InvoiceStatusEventRow {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    tenant_id: tenantId,
    invoice_id: invoiceId,
    from_status: null,
    to_status: 'draft',
    reason: 'invoice_created',
    created_by_user_id: userId,
    created_at: createdAt.toISOString(),
    ...overrides,
  };
}
