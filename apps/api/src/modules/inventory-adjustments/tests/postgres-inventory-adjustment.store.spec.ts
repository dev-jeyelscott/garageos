import { describe, expect, it } from 'vitest';

import type {
  DatabaseQueryClient,
  DatabaseQueryResult,
  DatabaseRow,
} from '../../../shared/database/database-client';
import { InventoryAdjustmentStore } from '../application/inventory-adjustment.store';
import { INVENTORY_ADJUSTMENT_PROVIDERS } from '../inventory-adjustment.providers';
import { PostgresInventoryAdjustmentStore } from '../persistence/postgres-inventory-adjustment.store';

const tenantId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const adjustmentId = '33333333-3333-4333-8333-333333333333';
const productId = '44444444-4444-4444-8444-444444444444';
const userId = '55555555-5555-4555-8555-555555555555';
const createdAt = new Date('2026-06-30T01:00:00.000Z');

describe('Inventory adjustment provider registration', () => {
  it('binds the inventory adjustment store to the Postgres implementation', () => {
    expect(INVENTORY_ADJUSTMENT_PROVIDERS).toEqual([
      {
        provide: InventoryAdjustmentStore,
        useClass: PostgresInventoryAdjustmentStore,
      },
    ]);
  });
});

describe('PostgresInventoryAdjustmentStore', () => {
  it('creates a draft adjustment header without creating stock, FIFO, or ledger records', async () => {
    const client = new RecordingDatabaseClient([[createAdjustmentRow()]]);
    const store = new PostgresInventoryAdjustmentStore(client);

    const result = await store.createDraftAdjustment({
      id: adjustmentId,
      tenantId,
      branchId,
      adjustmentNumber: 'IA-0001',
      reason: 'Cycle count',
      valueImpact: '0.00',
      approvalRequired: false,
      requestedByUserId: userId,
      createdAt,
    });

    expect(client.queries).toHaveLength(1);
    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain(
      'insert into inventory_adjustments',
    );
    expect(normalizeSql(client.queries[0]?.sql ?? '')).not.toMatch(
      /stock_balances|fifo_layers|fifo_consumptions|inventory_ledger_entries/,
    );
    expect(client.queries[0]?.values).toEqual([
      adjustmentId,
      tenantId,
      branchId,
      'IA-0001',
      'Cycle count',
      '0.00',
      false,
      userId,
      createdAt,
    ]);
    expect(result).toMatchObject({
      id: adjustmentId,
      tenantId,
      branchId,
      adjustmentNumber: 'IA-0001',
      status: 'draft',
      requestedByUserId: userId,
    });
  });

  it('creates multiple draft lines', async () => {
    const client = new RecordingDatabaseClient([
      [createLineRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }), createLineRow()],
    ]);
    const store = new PostgresInventoryAdjustmentStore(client);

    const result = await store.createDraftAdjustmentLines({
      tenantId,
      adjustmentId,
      lines: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          productId,
          adjustmentType: 'increase',
          quantityDifference: '2.000',
          finalCountedQuantity: null,
          unitCost: '100.00',
          estimatedFifoCost: null,
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          productId,
          adjustmentType: 'final_count',
          quantityDifference: null,
          finalCountedQuantity: '5.000',
          unitCost: null,
          estimatedFifoCost: '250.00',
        },
      ],
    });

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain(
      'insert into inventory_adjustment_lines',
    );
    expect(client.queries[0]?.values).toHaveLength(18);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      tenantId,
      adjustmentId,
      adjustmentType: 'increase',
      quantityDifference: '2.000',
    });
  });

  it('updates only draft adjustments and includes tenant scope plus optional lock version', async () => {
    const client = new RecordingDatabaseClient([[createAdjustmentRow({ lock_version: 2 })]]);
    const store = new PostgresInventoryAdjustmentStore(client);

    const result = await store.updateDraftAdjustment({
      tenantId,
      adjustmentId,
      reason: 'Updated count',
      valueImpact: '25.00',
      approvalRequired: true,
      lockVersion: 1,
      updatedAt: createdAt,
    });

    const sql = normalizeSql(client.queries[0]?.sql ?? '');
    expect(sql).toContain('where tenant_id = $1::uuid');
    expect(sql).toContain("and status = 'draft'");
    expect(sql).toContain('lock_version = lock_version + 1');
    expect(client.queries[0]?.values).toEqual([
      tenantId,
      adjustmentId,
      'Updated count',
      '25.00',
      true,
      createdAt,
      1,
    ]);
    expect(result?.lockVersion).toBe(2);
  });

  it('returns null when a draft update is not visible or not draft', async () => {
    const client = new RecordingDatabaseClient([[]]);
    const store = new PostgresInventoryAdjustmentStore(client);

    await expect(
      store.updateDraftAdjustment({
        tenantId,
        adjustmentId,
        reason: 'No change',
        valueImpact: '0.00',
        approvalRequired: false,
        updatedAt: createdAt,
      }),
    ).resolves.toBeNull();
  });

  it('replaces draft lines only after confirming the tenant-scoped draft adjustment exists', async () => {
    const client = new RecordingDatabaseClient([
      [{ value: 1 }],
      [],
      [createLineRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })],
    ]);
    const store = new PostgresInventoryAdjustmentStore(client);

    const result = await store.replaceDraftAdjustmentLines({
      tenantId,
      adjustmentId,
      lines: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          productId,
          adjustmentType: 'decrease',
          quantityDifference: '-1.000',
          finalCountedQuantity: null,
          unitCost: null,
          estimatedFifoCost: '75.00',
        },
      ],
    });

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain("and status = 'draft'");
    expect(normalizeSql(client.queries[1]?.sql ?? '')).toContain(
      'delete from inventory_adjustment_lines',
    );
    expect(normalizeSql(client.queries[2]?.sql ?? '')).toContain(
      'insert into inventory_adjustment_lines',
    );
    expect(result).toHaveLength(1);
  });

  it('does not replace lines when the adjustment is not tenant-visible draft', async () => {
    const client = new RecordingDatabaseClient([[]]);
    const store = new PostgresInventoryAdjustmentStore(client);

    const result = await store.replaceDraftAdjustmentLines({
      tenantId,
      adjustmentId,
      lines: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          productId,
          adjustmentType: 'increase',
          quantityDifference: '1.000',
          finalCountedQuantity: null,
          unitCost: null,
          estimatedFifoCost: null,
        },
      ],
    });

    expect(result).toEqual([]);
    expect(client.queries).toHaveLength(1);
  });

  it('loads an adjustment with lines using tenant scope', async () => {
    const client = new RecordingDatabaseClient([[createAdjustmentRow()], [createLineRow()]]);
    const store = new PostgresInventoryAdjustmentStore(client);

    const result = await store.findAdjustmentWithLines({ tenantId, adjustmentId });

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain('where tenant_id = $1::uuid');
    expect(normalizeSql(client.queries[1]?.sql ?? '')).toContain('where tenant_id = $1::uuid');
    expect(result?.adjustment.id).toBe(adjustmentId);
    expect(result?.lines[0]?.productId).toBe(productId);
  });

  it('locks a posting candidate with FOR UPDATE and loads lines in the same client', async () => {
    const client = new RecordingDatabaseClient([[createAdjustmentRow()], [createLineRow()]]);
    const store = new PostgresInventoryAdjustmentStore(client);

    const result = await store.lockAdjustmentWithLinesForPosting(
      { tenantId, adjustmentId },
      client,
    );

    const sql = normalizeSql(client.queries[0]?.sql ?? '');
    expect(sql).toContain("and status in ('draft', 'approved')");
    expect(sql).toContain('for update');
    expect(result?.lines).toHaveLength(1);
  });

  it('keeps posting locks status-limited to postable adjustments', async () => {
    const client = new RecordingDatabaseClient([[createAdjustmentRow()], [createLineRow()]]);
    const store = new PostgresInventoryAdjustmentStore(client);

    await store.lockAdjustmentWithLinesForPosting({ tenantId, adjustmentId }, client);

    const sql = normalizeSql(client.queries[0]?.sql ?? '');
    expect(sql).toContain("and status in ('draft', 'approved')");
  });

  it('locks update candidates across all tenant-visible statuses', async () => {
    const client = new RecordingDatabaseClient([
      [createAdjustmentRow({ status: 'rejected' })],
      [createLineRow()],
    ]);
    const store = new PostgresInventoryAdjustmentStore(client);

    const result = await store.lockAdjustmentWithLinesForUpdate({ tenantId, adjustmentId }, client);

    const sql = normalizeSql(client.queries[0]?.sql ?? '');
    expect(sql).toContain('where tenant_id = $1::uuid');
    expect(sql).toContain('and id = $2::uuid');
    expect(sql).toContain('for update');
    expect(sql).not.toContain('and status in');
    expect(result?.adjustment.status).toBe('rejected');
  });

  it('inserts an initial draft status event with null from status and required actor', async () => {
    const client = new RecordingDatabaseClient([[createStatusEventRow()]]);
    const store = new PostgresInventoryAdjustmentStore(client);

    const result = await store.insertStatusEvent({
      id: '66666666-6666-4666-8666-666666666666',
      tenantId,
      adjustmentId,
      fromStatus: null,
      toStatus: 'draft',
      reason: null,
      createdByUserId: userId,
      createdAt,
    });

    expect(normalizeSql(client.queries[0]?.sql ?? '')).toContain(
      'insert into inventory_adjustment_status_events',
    );
    expect(client.queries[0]?.values).toEqual([
      '66666666-6666-4666-8666-666666666666',
      tenantId,
      adjustmentId,
      null,
      'draft',
      null,
      userId,
      createdAt,
    ]);
    expect(result).toMatchObject({
      fromStatus: null,
      toStatus: 'draft',
      createdByUserId: userId,
    });
  });

  it('lists status events for a tenant-scoped adjustment', async () => {
    const client = new RecordingDatabaseClient([[createStatusEventRow()]]);
    const store = new PostgresInventoryAdjustmentStore(client);

    await store.listStatusEvents({ tenantId, adjustmentId });

    const sql = normalizeSql(client.queries[0]?.sql ?? '');
    expect(sql).toContain('from inventory_adjustment_status_events');
    expect(sql).toContain('where tenant_id = $1::uuid');
    expect(sql).toContain('and adjustment_id = $2::uuid');
    expect(sql).toContain('order by created_at desc, id desc');
  });

  it('lists adjustments by branch, status, and date range with stable ordering', async () => {
    const fromDate = new Date('2026-06-01T00:00:00.000Z');
    const toDate = new Date('2026-06-30T23:59:59.000Z');
    const client = new RecordingDatabaseClient([[createAdjustmentListRow()]]);
    const store = new PostgresInventoryAdjustmentStore(client);

    const result = await store.listAdjustments({
      tenantId,
      branchId,
      status: 'draft',
      fromDate,
      toDate,
      limit: 25,
    });

    const sql = normalizeSql(client.queries[0]?.sql ?? '');
    expect(sql).toContain('where adjustment.tenant_id = $1::uuid');
    expect(sql).toContain('adjustment.branch_id = $2::uuid');
    expect(sql).toContain('adjustment.status = $3::text');
    expect(sql).toContain('adjustment.created_at >= $4::timestamptz');
    expect(sql).toContain('adjustment.created_at <= $5::timestamptz');
    expect(sql).toContain('order by adjustment.created_at desc, adjustment.id desc');
    expect(client.queries[0]?.values).toEqual([tenantId, branchId, 'draft', fromDate, toDate, 25]);
    expect(result[0]?.lineCount).toBe(2);
  });

  it('keeps listing tenant scope even when optional filters are omitted', async () => {
    const client = new RecordingDatabaseClient([[]]);
    const store = new PostgresInventoryAdjustmentStore(client);

    await store.listAdjustments({ tenantId, limit: 10 });

    expect(client.queries[0]?.values).toEqual([tenantId, null, null, null, null, 10]);
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

function createAdjustmentRow(overrides: Partial<DatabaseRow> = {}): DatabaseRow {
  return {
    id: adjustmentId,
    tenant_id: tenantId,
    branch_id: branchId,
    adjustment_number: 'IA-0001',
    status: 'draft',
    reason: 'Cycle count',
    value_impact: '0.00',
    approval_required: false,
    requested_by_user_id: userId,
    approved_by_user_id: null,
    posted_at: null,
    created_at: createdAt.toISOString(),
    updated_at: createdAt.toISOString(),
    lock_version: 0,
    ...overrides,
  };
}

function createLineRow(overrides: Partial<DatabaseRow> = {}): DatabaseRow {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    tenant_id: tenantId,
    adjustment_id: adjustmentId,
    product_id: productId,
    adjustment_type: 'increase',
    quantity_difference: '2.000',
    final_counted_quantity: null,
    unit_cost: '100.00',
    estimated_fifo_cost: null,
    ...overrides,
  };
}

function createStatusEventRow(overrides: Partial<DatabaseRow> = {}): DatabaseRow {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    tenant_id: tenantId,
    adjustment_id: adjustmentId,
    from_status: null,
    to_status: 'draft',
    reason: null,
    created_by_user_id: userId,
    created_at: createdAt.toISOString(),
    ...overrides,
  };
}

function createAdjustmentListRow(overrides: Partial<DatabaseRow> = {}): DatabaseRow {
  return {
    ...createAdjustmentRow(),
    line_count: 2,
    ...overrides,
  };
}
