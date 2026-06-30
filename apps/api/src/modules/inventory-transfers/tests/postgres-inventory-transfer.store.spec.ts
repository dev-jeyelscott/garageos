import { describe, expect, it } from 'vitest';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import { PostgresInventoryTransferStore } from '../persistence/postgres-inventory-transfer.store';

const tenantId = '11111111-1111-4111-8111-111111111111';
const transferId = '22222222-2222-4222-8222-222222222222';
const sourceBranchId = '33333333-3333-4333-8333-333333333333';
const destinationBranchId = '44444444-4444-4444-8444-444444444444';
const productId = '55555555-5555-4555-8555-555555555555';
const userId = '66666666-6666-4666-8666-666666666666';
const now = new Date('2026-06-30T00:00:00.000Z');

describe('PostgresInventoryTransferStore', () => {
  it('inserts a draft transfer under tenant scope', async () => {
    const client = new RecordingClient([
      {
        id: transferId,
        tenant_id: tenantId,
        transfer_number: 'TR-20260630-000001',
        source_branch_id: sourceBranchId,
        destination_branch_id: destinationBranchId,
        status: 'draft',
        created_by_user_id: userId,
        sent_by_user_id: null,
        received_by_user_id: null,
        cancelled_by_user_id: null,
        sent_at: null,
        received_at: null,
        cancelled_at: null,
        cancellation_disposition: null,
        remarks: 'Restock satellite branch.',
        created_at: now,
        updated_at: now,
        lock_version: 0,
      },
    ]);
    const store = new PostgresInventoryTransferStore(client);

    const transfer = await store.createDraftTransfer({
      id: transferId,
      tenantId,
      transferNumber: 'TR-20260630-000001',
      sourceBranchId,
      destinationBranchId,
      remarks: 'Restock satellite branch.',
      createdByUserId: userId,
      createdAt: now,
    });

    expect(transfer).toMatchObject({
      id: transferId,
      tenantId,
      status: 'draft',
    });
    expect(client.queries[0]?.sql).toContain('insert into inventory_transfers');
    expect(client.queries[0]?.values).toEqual([
      transferId,
      tenantId,
      'TR-20260630-000001',
      sourceBranchId,
      destinationBranchId,
      'Restock satellite branch.',
      userId,
      now,
    ]);
  });

  it('inserts draft lines without reservation or stock movement fields', async () => {
    const client = new RecordingClient([
      {
        id: '77777777-7777-4777-8777-777777777777',
        tenant_id: tenantId,
        transfer_id: transferId,
        product_id: productId,
        requested_quantity: '5.000',
        reserved_quantity: null,
        sent_quantity: null,
        received_quantity: null,
        variance_quantity: null,
        variance_reason: null,
        reservation_id: null,
      },
    ]);
    const store = new PostgresInventoryTransferStore(client);

    const lines = await store.createDraftTransferLines({
      tenantId,
      transferId,
      lines: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          productId,
          requestedQuantity: '5.000',
        },
      ],
    });

    expect(lines[0]).toMatchObject({
      tenantId,
      transferId,
      productId,
      requestedQuantity: '5.000',
      reservedQuantity: null,
    });
    expect(client.queries[0]?.sql).toContain('insert into inventory_transfer_lines');
    expect(client.queries[0]?.sql).not.toContain('inventory_ledger_entries');
    expect(client.queries[0]?.sql).not.toContain('fifo_layers');
    expect(client.queries[0]?.sql).not.toContain('inventory_reservations');
  });

  it('allocates transfer numbers through document_sequences', async () => {
    const client = new RecordingClient([{ last_value: 1 }]);
    const store = new PostgresInventoryTransferStore(client);

    const transferNumber = await store.findLatestTransferNumberForDate({
      tenantId,
      datePrefix: 'TR-20260630',
    });

    expect(transferNumber).toBe('TR-20260630-000001');
    expect(client.queries[0]?.sql).toContain('insert into document_sequences');
    expect(client.queries[0]?.sql).toContain('on conflict');
    expect(client.queries[0]?.values).toEqual([tenantId, '2026-06-30']);
  });

  it('updates transfer line sent quantity under tenant scope', async () => {
    const lineId = '77777777-7777-4777-8777-777777777777';
    const client = new RecordingClient([
      {
        id: lineId,
        tenant_id: tenantId,
        transfer_id: transferId,
        product_id: productId,
        requested_quantity: '5.000',
        reserved_quantity: '5.000',
        sent_quantity: '3.000',
        received_quantity: null,
        variance_quantity: null,
        variance_reason: null,
        reservation_id: '88888888-8888-4888-8888-888888888888',
      },
    ]);
    const store = new PostgresInventoryTransferStore(client);

    const line = await store.updateTransferLineSentQuantity({
      tenantId,
      lineId,
      sentQuantity: '3.000',
    });

    expect(line.sentQuantity).toBe('3.000');
    expect(client.queries[0]?.sql).toContain('where tenant_id = $1::uuid');
    expect(client.queries[0]?.sql).toContain('and id = $2::uuid');
    expect(client.queries[0]?.values).toEqual([tenantId, lineId, '3.000']);
  });

  it('updates pending transfer to in_transit with sender fields under tenant scope', async () => {
    const client = new RecordingClient([
      {
        id: transferId,
        tenant_id: tenantId,
        transfer_number: 'TR-20260630-000001',
        source_branch_id: sourceBranchId,
        destination_branch_id: destinationBranchId,
        status: 'in_transit',
        created_by_user_id: userId,
        sent_by_user_id: userId,
        received_by_user_id: null,
        cancelled_by_user_id: null,
        sent_at: now,
        received_at: null,
        cancelled_at: null,
        cancellation_disposition: null,
        remarks: null,
        created_at: now,
        updated_at: now,
        lock_version: 1,
      },
    ]);
    const store = new PostgresInventoryTransferStore(client);

    const transfer = await store.updateTransferStatusToInTransit({
      tenantId,
      transferId,
      expectedStatus: 'pending',
      sentByUserId: userId,
      sentAt: now,
    });

    expect(transfer).toMatchObject({
      status: 'in_transit',
      sentByUserId: userId,
      sentAt: now,
    });
    expect(client.queries[0]?.sql).toContain('where tenant_id = $1::uuid');
    expect(client.queries[0]?.sql).toContain('and id = $2::uuid');
    expect(client.queries[0]?.sql).toContain('and status = $3');
    expect(client.queries[0]?.values).toEqual([tenantId, transferId, 'pending', userId, now]);
  });
});

class RecordingClient implements DatabaseQueryClient {
  readonly queries: { sql: string; values: readonly unknown[] }[] = [];

  constructor(private readonly rows: readonly Record<string, unknown>[] = []) {}

  async query<Row>(sql: string, values: readonly unknown[] = []) {
    this.queries.push({ sql, values });

    return {
      rows: this.rows as Row[],
      rowCount: this.rows.length,
    };
  }
}
