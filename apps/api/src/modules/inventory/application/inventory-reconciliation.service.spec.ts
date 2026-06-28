import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../../../shared/api/api-error-code';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  INVENTORY_RECONCILIATION_ISSUE_CODES,
  INVENTORY_RECONCILIATION_ISSUE_SEVERITIES,
  INVENTORY_RECONCILIATION_REFERENCE_TYPES,
  InventoryReconciliationStore,
  type CheckInventoryReconciliationInput,
  type InventoryReconciliationIssueRecord,
} from './inventory-reconciliation.store';
import { InventoryReconciliationService } from './inventory-reconciliation.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';

describe('InventoryReconciliationService', () => {
  it('returns a consistent report when no reconciliation issues are found', async () => {
    const { service, store } = createService();

    const report = await service.checkInventoryReconciliation({
      tenantId: ` ${TENANT_ID} `,
    });

    expect(store.listInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchId: null,
        productId: null,
      },
    ]);
    expect(report).toEqual({
      is_consistent: true,
      issue_count: 0,
      issues: [],
    });
  });

  it('returns scoped reconciliation issues with normalized input', async () => {
    const { service, store } = createService();

    store.issues = [
      createInventoryReconciliationIssueRecord({
        issueCode: INVENTORY_RECONCILIATION_ISSUE_CODES.STOCK_BALANCE_LEDGER_ON_HAND_MISMATCH,
        referenceType: INVENTORY_RECONCILIATION_REFERENCE_TYPES.STOCK_BALANCE,
        expectedQuantity: '10.000',
        actualQuantity: '9.000',
        differenceQuantity: '-1.000',
      }),
    ];

    const report = await service.checkInventoryReconciliation({
      tenantId: TENANT_ID,
      branchId: ` ${BRANCH_ID} `,
      productId: ` ${PRODUCT_ID} `,
    });

    expect(store.listInputs).toEqual([
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
      },
    ]);
    expect(report).toEqual({
      is_consistent: false,
      issue_count: 1,
      issues: [
        {
          code: INVENTORY_RECONCILIATION_ISSUE_CODES.STOCK_BALANCE_LEDGER_ON_HAND_MISMATCH,
          severity: INVENTORY_RECONCILIATION_ISSUE_SEVERITIES.CRITICAL,
          reference_type: INVENTORY_RECONCILIATION_REFERENCE_TYPES.STOCK_BALANCE,
          reference_id: null,
          tenant_id: TENANT_ID,
          branch_id: BRANCH_ID,
          product_id: PRODUCT_ID,
          expected_quantity: '10.000',
          actual_quantity: '9.000',
          difference_quantity: '-1.000',
          details: {
            expected_source: 'inventory_ledger_entries.quantity_delta_on_hand',
            actual_source: 'stock_balances.on_hand_qty',
          },
        },
      ],
    });
  });

  it('can run inside an existing transaction client', async () => {
    const { service, store } = createService();
    const transaction = {} as DatabaseQueryClient;

    await service.checkInventoryReconciliationInTransaction(
      {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
      },
      transaction,
    );

    expect(store.clients).toEqual([transaction]);
  });

  it('rejects invalid tenant IDs before calling the store', async () => {
    const { service, store } = createService();

    await expect(
      service.checkInventoryReconciliation({
        tenantId: 'not-a-uuid',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        {
          field: 'tenant_id',
          code: 'invalid_uuid',
        },
      ],
    });

    expect(store.listInputs).toEqual([]);
  });

  it('rejects invalid optional branch and product IDs before calling the store', async () => {
    const { service, store } = createService();

    await expect(
      service.checkInventoryReconciliation({
        tenantId: TENANT_ID,
        branchId: 'not-a-uuid',
        productId: PRODUCT_ID,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
      details: [
        {
          field: 'branch_id',
          code: 'invalid_uuid',
        },
      ],
    });

    expect(store.listInputs).toEqual([]);
  });
});

function createService(): {
  readonly service: InventoryReconciliationService;
  readonly store: FakeInventoryReconciliationStore;
} {
  const store = new FakeInventoryReconciliationStore();

  return {
    service: new InventoryReconciliationService(store),
    store,
  };
}

function createInventoryReconciliationIssueRecord(
  overrides: Partial<InventoryReconciliationIssueRecord> = {},
): InventoryReconciliationIssueRecord {
  return {
    issueCode:
      overrides.issueCode ??
      INVENTORY_RECONCILIATION_ISSUE_CODES.STOCK_BALANCE_LEDGER_ON_HAND_MISMATCH,
    severity: overrides.severity ?? INVENTORY_RECONCILIATION_ISSUE_SEVERITIES.CRITICAL,
    referenceType:
      overrides.referenceType ?? INVENTORY_RECONCILIATION_REFERENCE_TYPES.STOCK_BALANCE,
    referenceId: overrides.referenceId ?? null,
    tenantId: overrides.tenantId ?? TENANT_ID,
    branchId: overrides.branchId ?? BRANCH_ID,
    productId: overrides.productId ?? PRODUCT_ID,
    expectedQuantity: overrides.expectedQuantity ?? '10.000',
    actualQuantity: overrides.actualQuantity ?? '9.000',
    differenceQuantity: overrides.differenceQuantity ?? '-1.000',
    details: overrides.details ?? {
      expected_source: 'inventory_ledger_entries.quantity_delta_on_hand',
      actual_source: 'stock_balances.on_hand_qty',
    },
  };
}

class FakeInventoryReconciliationStore extends InventoryReconciliationStore {
  readonly listInputs: CheckInventoryReconciliationInput[] = [];
  readonly clients: DatabaseQueryClient[] = [];
  issues: readonly InventoryReconciliationIssueRecord[] = [];

  async listReconciliationIssues(
    input: CheckInventoryReconciliationInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly InventoryReconciliationIssueRecord[]> {
    this.listInputs.push(input);

    if (client !== undefined) {
      this.clients.push(client);
    }

    return this.issues;
  }
}
