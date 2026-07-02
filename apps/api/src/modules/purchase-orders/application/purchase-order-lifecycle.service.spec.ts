import { describe, expect, it } from 'vitest';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { DatabaseTransactionRunner } from '../../../shared/database/database-transaction';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
import type { BranchStore, BranchSummaryRecord } from '../../branches/application/branch.store';
import type { ProductRecord, ProductStore } from '../../products/application/product.store';
import type { SupplierRecord, SupplierStore } from '../../suppliers/application/supplier.store';
import {
  PURCHASE_ORDER_STATUSES,
  PURCHASE_PAYMENT_TERMS,
  type PurchaseOrderForReceivingRecord,
  type PurchaseOrderLineRecord,
  type PurchaseOrderRecord,
  type PurchaseReceivingLineRecord,
  type PurchaseReceivingRecord,
  type SupplierPayableRecord,
} from './purchase-order.records';
import {
  PurchaseOrderStore,
  type AllocatePurchaseOrderNumberInput,
  type CreateDraftPurchaseOrderInput,
  type CreatePurchaseReceivingInput,
  type CreatePurchaseReceivingLineInput,
  type CreateSupplierPayableInput,
  type IncrementPurchaseOrderLineReceivedQuantityInput,
  type SetReceivingLineFifoLayerInput,
  type UpdateDraftPurchaseOrderInput,
  type UpdatePurchaseOrderStatusInput,
} from './purchase-order.store';
import { PurchaseOrderLifecycleService } from './purchase-order-lifecycle.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '11111111-1111-4111-8111-111111111112';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER_ID = '44444444-4444-4444-8444-444444444444';
const PURCHASE_ORDER_ID = '55555555-5555-4555-8555-555555555555';
const LINE_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';

class ImmediateTransactionRunner implements DatabaseTransactionRunner {
  async runInTransaction<Result>(
    work: (transaction: DatabaseQueryClient) => Promise<Result>,
  ): Promise<Result> {
    return work({
      query: async () => ({ rows: [], rowCount: 0 }),
    });
  }
}

class FakePurchaseOrderStore extends PurchaseOrderStore {
  purchaseOrder: PurchaseOrderRecord | null = buildPurchaseOrder(PURCHASE_ORDER_STATUSES.DRAFT);
  sideEffects: string[] = [];
  queriedTenantIds: string[] = [];
  statusUpdates: UpdatePurchaseOrderStatusInput[] = [];

  async getTenantTimezone(
    _tenantId: string,
    _client?: DatabaseQueryClient,
  ): Promise<string | null> {
    return 'Asia/Manila';
  }

  async allocatePurchaseOrderNumber(
    _input: AllocatePurchaseOrderNumberInput,
    _client?: DatabaseQueryClient,
  ): Promise<string | null> {
    return 'PO-20260702-000001';
  }

  async findPurchaseOrderById(
    tenantId: string,
    purchaseOrderId: string,
    _client?: DatabaseQueryClient,
  ): Promise<PurchaseOrderRecord | null> {
    this.queriedTenantIds.push(tenantId);

    if (tenantId !== TENANT_ID || purchaseOrderId !== PURCHASE_ORDER_ID) {
      return null;
    }

    return this.purchaseOrder;
  }

  async findPurchaseOrderByIdForUpdate(
    tenantId: string,
    purchaseOrderId: string,
    _client?: DatabaseQueryClient,
  ): Promise<PurchaseOrderRecord | null> {
    this.queriedTenantIds.push(tenantId);

    if (tenantId !== TENANT_ID || purchaseOrderId !== PURCHASE_ORDER_ID) {
      return null;
    }

    return this.purchaseOrder;
  }

  async createDraftPurchaseOrder(
    _input: CreateDraftPurchaseOrderInput,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseOrderRecord> {
    this.sideEffects.push('draft_create');
    throw new Error('not expected');
  }

  async updateDraftPurchaseOrder(
    _input: UpdateDraftPurchaseOrderInput,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseOrderRecord | null> {
    this.sideEffects.push('draft_update');
    throw new Error('not expected');
  }

  async lockPurchaseOrderForReceiving(
    _tenantId: string,
    _purchaseOrderId: string,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseOrderForReceivingRecord | null> {
    return null;
  }

  async listPurchaseOrderLinesForUpdate(
    _tenantId: string,
    _purchaseOrderId: string,
    _client: DatabaseQueryClient,
  ): Promise<readonly PurchaseOrderLineRecord[]> {
    return [];
  }

  async createReceiving(
    _input: CreatePurchaseReceivingInput,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseReceivingRecord> {
    this.sideEffects.push('receiving');
    throw new Error('not expected');
  }

  async createReceivingLine(
    _input: CreatePurchaseReceivingLineInput,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseReceivingLineRecord> {
    this.sideEffects.push('receiving_line');
    throw new Error('not expected');
  }

  async setReceivingLineFifoLayerId(
    _input: SetReceivingLineFifoLayerInput,
    _client: DatabaseQueryClient,
  ): Promise<void> {
    this.sideEffects.push('fifo_layer_link');
  }

  async incrementPurchaseOrderLineReceivedQuantity(
    _input: IncrementPurchaseOrderLineReceivedQuantityInput,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseOrderLineRecord | null> {
    this.sideEffects.push('received_quantity_increment');
    return null;
  }

  async updatePurchaseOrderStatus(
    input: UpdatePurchaseOrderStatusInput,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseOrderForReceivingRecord | null> {
    this.statusUpdates.push(input);

    if (
      this.purchaseOrder === null ||
      input.tenantId !== TENANT_ID ||
      input.purchaseOrderId !== PURCHASE_ORDER_ID ||
      this.purchaseOrder.status !== input.fromStatus
    ) {
      return null;
    }

    this.purchaseOrder = {
      ...this.purchaseOrder,
      status: input.toStatus,
      lockVersion: this.purchaseOrder.lockVersion + 1,
      updatedAt: new Date('2026-07-02T01:00:00.000Z'),
    };

    return {
      id: this.purchaseOrder.id,
      tenantId: this.purchaseOrder.tenantId,
      branchId: this.purchaseOrder.branchId,
      supplierId: this.purchaseOrder.supplierId,
      purchaseOrderNumber: this.purchaseOrder.purchaseOrderNumber,
      status: this.purchaseOrder.status,
      paymentTerms: this.purchaseOrder.paymentTerms,
      branchStatus: 'active',
      supplierStatus: 'active',
    };
  }

  async createSupplierPayable(
    _input: CreateSupplierPayableInput,
    _client: DatabaseQueryClient,
  ): Promise<SupplierPayableRecord> {
    this.sideEffects.push('supplier_payable');
    throw new Error('not expected');
  }
}

class FakeBranchStore {
  status: BranchSummaryRecord['status'] = 'active';

  async findBranchById(
    tenantId: string,
    branchId: string,
    _client?: DatabaseQueryClient,
  ): Promise<BranchSummaryRecord | null> {
    if (tenantId !== TENANT_ID || branchId !== BRANCH_ID) {
      return null;
    }

    return buildBranch(this.status);
  }
}

class FakeSupplierStore {
  status: SupplierRecord['status'] = 'active';

  async findSupplierById(
    tenantId: string,
    supplierId: string,
    _client?: DatabaseQueryClient,
  ): Promise<SupplierRecord | null> {
    if (tenantId !== TENANT_ID || supplierId !== SUPPLIER_ID) {
      return null;
    }

    return buildSupplier(this.status);
  }
}

class FakeProductStore {
  isOwner = false;
  status: ProductRecord['status'] = 'active';

  async isActiveShopOwner(): Promise<boolean> {
    return this.isOwner;
  }

  async findProductById(
    tenantId: string,
    productId: string,
    _client?: DatabaseQueryClient,
  ): Promise<ProductRecord | null> {
    if (tenantId !== TENANT_ID || productId !== PRODUCT_ID) {
      return null;
    }

    return buildProduct(this.status);
  }
}

function buildService(
  options: {
    readonly store?: FakePurchaseOrderStore;
    readonly branchStore?: FakeBranchStore;
    readonly supplierStore?: FakeSupplierStore;
    readonly productStore?: FakeProductStore;
  } = {},
): {
  readonly service: PurchaseOrderLifecycleService;
  readonly store: FakePurchaseOrderStore;
  readonly branchStore: FakeBranchStore;
  readonly supplierStore: FakeSupplierStore;
  readonly productStore: FakeProductStore;
  readonly auditRecords: unknown[];
} {
  const store = options.store ?? new FakePurchaseOrderStore();
  const branchStore = options.branchStore ?? new FakeBranchStore();
  const supplierStore = options.supplierStore ?? new FakeSupplierStore();
  const productStore = options.productStore ?? new FakeProductStore();
  const auditRecords: unknown[] = [];
  const auditService = {
    record: async (input: unknown) => {
      auditRecords.push(input);

      return input;
    },
  };

  return {
    service: new PurchaseOrderLifecycleService(
      store,
      branchStore as unknown as BranchStore,
      supplierStore as unknown as SupplierStore,
      productStore as unknown as ProductStore,
      new ImmediateTransactionRunner(),
      auditService as never,
    ),
    store,
    branchStore,
    supplierStore,
    productStore,
    auditRecords,
  };
}

interface BuildSessionOptions {
  readonly tenantId?: string;
  readonly tenantStatus?: TenantStatus;
  readonly effectivePermissions?: TenantContextAuthenticatedSession['effective_permissions'];
  readonly branches?: TenantContextAuthenticatedSession['branches'];
  readonly tenantWideBranchAccess?: boolean;
}

function buildSession(options: BuildSessionOptions = {}): TenantContextAuthenticatedSession {
  const tenantId = options.tenantId ?? TENANT_ID;

  return {
    actor: {
      user_id: USER_ID,
      user_type: 'tenant_user',
      tenant_id: tenantId,
      session_id: 'session-id',
      email_verified: true,
      support_access_session_id: null,
    },
    tenant: {
      id: tenantId,
      status: options.tenantStatus ?? 'active',
    },
    effective_permissions: options.effectivePermissions ?? ['purchases.update', 'purchases.cancel'],
    branches: options.branches ?? [{ id: BRANCH_ID }],
    tenant_wide_branch_access: options.tenantWideBranchAccess ?? false,
    subscription_status_source: 'system_computed',
  };
}

describe('PurchaseOrderLifecycleService', () => {
  it('orders an eligible draft purchase order and records audit without side effects', async () => {
    const { service, store, auditRecords } = buildService();

    const response = await service.orderPurchaseOrder(PURCHASE_ORDER_ID, buildSession());

    expect(response.purchase_order.status).toBe(PURCHASE_ORDER_STATUSES.ORDERED);
    expect(response.purchase_order.lock_version).toBe(1);
    expect(store.statusUpdates).toHaveLength(1);
    expect(store.sideEffects).toEqual([]);
    expect(auditRecords).toHaveLength(1);
    expect(auditRecords[0]).toMatchObject({
      action: 'purchase_orders.ordered',
      entityType: 'purchase_order',
      branchId: BRANCH_ID,
    });
  });

  it('rejects order when status transition is invalid', async () => {
    const store = new FakePurchaseOrderStore();
    store.purchaseOrder = buildPurchaseOrder(PURCHASE_ORDER_STATUSES.ORDERED);
    const { service } = buildService({ store });

    await expect(
      service.orderPurchaseOrder(PURCHASE_ORDER_ID, buildSession()),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
      details: [{ field: 'status', code: 'purchase_order_not_orderable' }],
    });
  });

  it('enforces tenant isolation for order', async () => {
    const { service, store } = buildService();

    await expect(
      service.orderPurchaseOrder(PURCHASE_ORDER_ID, buildSession({ tenantId: OTHER_TENANT_ID })),
    ).rejects.toMatchObject({ code: 'resource_not_found' });

    expect(store.queriedTenantIds).toContain(OTHER_TENANT_ID);
  });

  it('enforces branch access for order', async () => {
    const { service } = buildService();

    await expect(
      service.orderPurchaseOrder(
        PURCHASE_ORDER_ID,
        buildSession({ branches: [], tenantWideBranchAccess: false }),
      ),
    ).rejects.toMatchObject({ code: 'branch_access_denied' });
  });

  it('enforces purchases.update permission for order', async () => {
    const { service } = buildService();

    await expect(
      service.orderPurchaseOrder(PURCHASE_ORDER_ID, buildSession({ effectivePermissions: [] })),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'purchases.update' }],
    });
  });

  it('respects tenant lifecycle write blocking for order', async () => {
    const { service } = buildService();

    await expect(
      service.orderPurchaseOrder(PURCHASE_ORDER_ID, buildSession({ tenantStatus: 'read_only' })),
    ).rejects.toMatchObject({ code: 'subscription_access_blocked' });
  });

  it('revalidates active branch, supplier, product, and line requirements before order', async () => {
    const store = new FakePurchaseOrderStore();
    store.purchaseOrder = buildPurchaseOrder(PURCHASE_ORDER_STATUSES.DRAFT, { lines: [] });
    const { service } = buildService({ store });

    await expect(
      service.orderPurchaseOrder(PURCHASE_ORDER_ID, buildSession()),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
      details: [{ field: 'lines', code: 'purchase_order_lines_required' }],
    });

    const branchStore = new FakeBranchStore();
    branchStore.status = 'inactive';
    await expect(
      buildService({ branchStore }).service.orderPurchaseOrder(PURCHASE_ORDER_ID, buildSession()),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: [{ field: 'branch_id', code: 'branch_not_active' }],
    });

    const supplierStore = new FakeSupplierStore();
    supplierStore.status = 'inactive';
    await expect(
      buildService({ supplierStore }).service.orderPurchaseOrder(PURCHASE_ORDER_ID, buildSession()),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: [{ field: 'supplier_id', code: 'supplier_not_active' }],
    });

    const productStore = new FakeProductStore();
    productStore.status = 'inactive';
    await expect(
      buildService({ productStore }).service.orderPurchaseOrder(PURCHASE_ORDER_ID, buildSession()),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: [{ field: 'lines.0.product_id', code: 'product_not_active' }],
    });
  });

  it('cancels an eligible ordered purchase order with reason and audit coverage', async () => {
    const store = new FakePurchaseOrderStore();
    store.purchaseOrder = buildPurchaseOrder(PURCHASE_ORDER_STATUSES.ORDERED);
    const { service, auditRecords } = buildService({ store });

    const response = await service.cancelPurchaseOrder(
      PURCHASE_ORDER_ID,
      { reason: 'Supplier can no longer fulfill the order.' },
      buildSession(),
    );

    expect(response.purchase_order.status).toBe(PURCHASE_ORDER_STATUSES.CANCELLED);
    expect(store.sideEffects).toEqual([]);
    expect(auditRecords).toHaveLength(1);
    expect(auditRecords[0]).toMatchObject({
      action: 'purchase_orders.cancelled',
      reason: 'Supplier can no longer fulfill the order.',
    });
  });

  it('rejects cancel when status transition is invalid', async () => {
    const store = new FakePurchaseOrderStore();
    store.purchaseOrder = buildPurchaseOrder(PURCHASE_ORDER_STATUSES.RECEIVED, {
      receivedQuantity: '5.000',
    });
    const { service } = buildService({ store });

    await expect(
      service.cancelPurchaseOrder(
        PURCHASE_ORDER_ID,
        { reason: 'Duplicate order.' },
        buildSession(),
      ),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
      details: [{ field: 'status', code: 'purchase_order_not_cancellable' }],
    });
  });

  it('blocks cancel when receiving effects are present', async () => {
    const store = new FakePurchaseOrderStore();
    store.purchaseOrder = buildPurchaseOrder(PURCHASE_ORDER_STATUSES.ORDERED, {
      receivedQuantity: '1.000',
    });
    const { service } = buildService({ store });

    await expect(
      service.cancelPurchaseOrder(
        PURCHASE_ORDER_ID,
        { reason: 'Duplicate order.' },
        buildSession(),
      ),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
      details: [
        {
          field: 'lines.received_quantity',
          code: 'purchase_order_cancel_has_receiving_effects',
        },
      ],
    });
  });

  it('enforces tenant isolation for cancel', async () => {
    const { service, store } = buildService();

    await expect(
      service.cancelPurchaseOrder(
        PURCHASE_ORDER_ID,
        { reason: 'Wrong tenant.' },
        buildSession({ tenantId: OTHER_TENANT_ID }),
      ),
    ).rejects.toMatchObject({ code: 'resource_not_found' });

    expect(store.queriedTenantIds).toContain(OTHER_TENANT_ID);
  });

  it('enforces branch access for cancel', async () => {
    const { service } = buildService();

    await expect(
      service.cancelPurchaseOrder(
        PURCHASE_ORDER_ID,
        { reason: 'Duplicate order.' },
        buildSession({ branches: [], tenantWideBranchAccess: false }),
      ),
    ).rejects.toMatchObject({ code: 'branch_access_denied' });
  });

  it('enforces purchases.cancel permission for cancel', async () => {
    const { service } = buildService();

    await expect(
      service.cancelPurchaseOrder(
        PURCHASE_ORDER_ID,
        { reason: 'Duplicate order.' },
        buildSession({ effectivePermissions: ['purchases.update'] }),
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'purchases.cancel' }],
    });
  });

  it('respects tenant lifecycle write blocking for cancel', async () => {
    const { service } = buildService();

    await expect(
      service.cancelPurchaseOrder(
        PURCHASE_ORDER_ID,
        { reason: 'Duplicate order.' },
        buildSession({ tenantStatus: 'read_only' }),
      ),
    ).rejects.toMatchObject({ code: 'subscription_access_blocked' });
  });

  it('closes a partially received purchase order with audit coverage', async () => {
    const store = new FakePurchaseOrderStore();
    store.purchaseOrder = buildPurchaseOrder(PURCHASE_ORDER_STATUSES.PARTIALLY_RECEIVED, {
      receivedQuantity: '2.000',
    });
    const { service, auditRecords } = buildService({ store });

    const response = await service.closePurchaseOrder(PURCHASE_ORDER_ID, buildSession());

    expect(response.purchase_order.status).toBe(PURCHASE_ORDER_STATUSES.CLOSED);
    expect(store.sideEffects).toEqual([]);
    expect(auditRecords).toHaveLength(1);
    expect(auditRecords[0]).toMatchObject({
      action: 'purchase_orders.closed',
      entityType: 'purchase_order',
    });
  });

  it('closes a fully received purchase order', async () => {
    const store = new FakePurchaseOrderStore();
    store.purchaseOrder = buildPurchaseOrder(PURCHASE_ORDER_STATUSES.RECEIVED, {
      receivedQuantity: '5.000',
    });
    const { service } = buildService({ store });

    await expect(
      service.closePurchaseOrder(PURCHASE_ORDER_ID, buildSession()),
    ).resolves.toMatchObject({
      purchase_order: {
        status: PURCHASE_ORDER_STATUSES.CLOSED,
      },
    });
  });

  it('rejects close when status transition is invalid', async () => {
    const { service } = buildService();

    await expect(
      service.closePurchaseOrder(PURCHASE_ORDER_ID, buildSession()),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
      details: [{ field: 'status', code: 'purchase_order_not_closeable' }],
    });
  });

  it('enforces tenant isolation for close', async () => {
    const { service, store } = buildService();

    await expect(
      service.closePurchaseOrder(PURCHASE_ORDER_ID, buildSession({ tenantId: OTHER_TENANT_ID })),
    ).rejects.toMatchObject({ code: 'resource_not_found' });

    expect(store.queriedTenantIds).toContain(OTHER_TENANT_ID);
  });

  it('enforces branch access for close', async () => {
    const store = new FakePurchaseOrderStore();
    store.purchaseOrder = buildPurchaseOrder(PURCHASE_ORDER_STATUSES.RECEIVED, {
      receivedQuantity: '5.000',
    });
    const { service } = buildService({ store });

    await expect(
      service.closePurchaseOrder(
        PURCHASE_ORDER_ID,
        buildSession({ branches: [], tenantWideBranchAccess: false }),
      ),
    ).rejects.toMatchObject({ code: 'branch_access_denied' });
  });

  it('enforces purchases.update permission for close', async () => {
    const store = new FakePurchaseOrderStore();
    store.purchaseOrder = buildPurchaseOrder(PURCHASE_ORDER_STATUSES.RECEIVED, {
      receivedQuantity: '5.000',
    });
    const { service } = buildService({ store });

    await expect(
      service.closePurchaseOrder(PURCHASE_ORDER_ID, buildSession({ effectivePermissions: [] })),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'purchases.update' }],
    });
  });

  it('respects tenant lifecycle write blocking for close', async () => {
    const store = new FakePurchaseOrderStore();
    store.purchaseOrder = buildPurchaseOrder(PURCHASE_ORDER_STATUSES.RECEIVED, {
      receivedQuantity: '5.000',
    });
    const { service } = buildService({ store });

    await expect(
      service.closePurchaseOrder(PURCHASE_ORDER_ID, buildSession({ tenantStatus: 'read_only' })),
    ).rejects.toMatchObject({ code: 'subscription_access_blocked' });
  });

  it('does not create receiving, inventory, FIFO, AP, or payment side effects for lifecycle actions', async () => {
    const store = new FakePurchaseOrderStore();
    const { service } = buildService({ store });

    store.purchaseOrder = buildPurchaseOrder(PURCHASE_ORDER_STATUSES.DRAFT);
    await service.orderPurchaseOrder(PURCHASE_ORDER_ID, buildSession());

    store.purchaseOrder = buildPurchaseOrder(PURCHASE_ORDER_STATUSES.ORDERED);
    await service.cancelPurchaseOrder(
      PURCHASE_ORDER_ID,
      { reason: 'Supplier cancelled availability.' },
      buildSession(),
    );

    store.purchaseOrder = buildPurchaseOrder(PURCHASE_ORDER_STATUSES.RECEIVED, {
      receivedQuantity: '5.000',
    });
    await service.closePurchaseOrder(PURCHASE_ORDER_ID, buildSession());

    expect(store.sideEffects).toEqual([]);
  });
});

function buildPurchaseOrder(
  status: PurchaseOrderRecord['status'],
  options: {
    readonly lines?: readonly PurchaseOrderLineRecord[];
    readonly receivedQuantity?: string;
  } = {},
): PurchaseOrderRecord {
  return {
    id: PURCHASE_ORDER_ID,
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    branchName: 'Main Branch',
    supplierId: SUPPLIER_ID,
    supplierName: 'Acme Parts',
    purchaseOrderNumber: 'PO-20260702-000001',
    status,
    paymentTerms: PURCHASE_PAYMENT_TERMS.CREDIT,
    orderDate: '2026-07-02',
    expectedReceiveDate: '2026-07-05',
    lockVersion: 0,
    createdAt: new Date('2026-07-02T00:00:00.000Z'),
    updatedAt: new Date('2026-07-02T00:00:00.000Z'),
    lines: options.lines ?? [
      {
        id: LINE_ID,
        tenantId: TENANT_ID,
        purchaseOrderId: PURCHASE_ORDER_ID,
        productId: PRODUCT_ID,
        productName: 'Oil Filter',
        orderedQuantity: '5.000',
        receivedQuantity: options.receivedQuantity ?? '0.000',
        unitCost: '100.00',
        lineTotal: '500.00',
        notes: null,
      },
    ],
  };
}

function buildBranch(status: BranchSummaryRecord['status']): BranchSummaryRecord {
  return {
    id: BRANCH_ID,
    name: 'Main Branch',
    address: '123 Garage St.',
    contactNumber: '09171234567',
    businessHoursJson: {},
    status,
    lockVersion: 0,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    deactivatedAt: status === 'inactive' ? new Date('2026-07-01T00:00:00Z') : null,
    reactivatedAt: null,
  };
}

function buildSupplier(status: SupplierRecord['status']): SupplierRecord {
  return {
    id: SUPPLIER_ID,
    name: 'Acme Parts',
    normalizedName: 'acme parts',
    contactPerson: null,
    mobileNumber: null,
    email: null,
    address: null,
    notes: null,
    status,
    lockVersion: 0,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    deactivatedAt: status === 'inactive' ? new Date('2026-07-01T00:00:00Z') : null,
    reactivatedAt: null,
  };
}

function buildProduct(status: ProductRecord['status']): ProductRecord {
  return {
    id: PRODUCT_ID,
    tenantId: TENANT_ID,
    categoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    category: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Parts',
      status: 'active',
    },
    name: 'Oil Filter',
    normalizedName: 'oil filter',
    sku: 'OF-001',
    normalizedSku: 'of-001',
    barcode: null,
    normalizedBarcode: null,
    supplierCode: null,
    brand: null,
    unitOfMeasure: 'piece',
    defaultCost: '100.00',
    sellingPrice: '150.00',
    reorderLevel: '5.000',
    description: null,
    status,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    createdByUserId: USER_ID,
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    updatedByUserId: USER_ID,
    deactivatedAt: status === 'inactive' ? new Date('2026-07-01T00:00:00Z') : null,
    reactivatedAt: null,
    lockVersion: 0,
  };
}
