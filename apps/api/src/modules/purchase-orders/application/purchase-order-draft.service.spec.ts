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
import type { CreatePurchaseOrderRequest } from '../api/purchase-order-draft.schemas';
import { PurchaseOrderDraftService } from './purchase-order-draft.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_BRANCH_ID = '33333333-3333-4333-8333-333333333334';
const SUPPLIER_ID = '44444444-4444-4444-8444-444444444444';
const PURCHASE_ORDER_ID = '55555555-5555-4555-8555-555555555555';
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
  purchaseOrder: PurchaseOrderRecord | null = null;
  allocatedNumbers: string[] = [];
  sideEffects: string[] = [];

  async getTenantTimezone(
    _tenantId: string,
    _client?: DatabaseQueryClient,
  ): Promise<string | null> {
    return 'Asia/Manila';
  }

  async allocatePurchaseOrderNumber(
    input: AllocatePurchaseOrderNumberInput,
    _client?: DatabaseQueryClient,
  ): Promise<string | null> {
    const next = `PO-${input.datePart}-${String(this.allocatedNumbers.length + 1).padStart(6, '0')}`;
    this.allocatedNumbers.push(next);

    return next;
  }

  async findPurchaseOrderById(
    _tenantId: string,
    _purchaseOrderId: string,
    _client?: DatabaseQueryClient,
  ): Promise<PurchaseOrderRecord | null> {
    return this.purchaseOrder;
  }

  async findPurchaseOrderByIdForUpdate(
    _tenantId: string,
    _purchaseOrderId: string,
    _client?: DatabaseQueryClient,
  ): Promise<PurchaseOrderRecord | null> {
    return this.purchaseOrder;
  }

  async createDraftPurchaseOrder(
    input: CreateDraftPurchaseOrderInput,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseOrderRecord> {
    const created: PurchaseOrderRecord = {
      id: input.id,
      tenantId: input.tenantId,
      branchId: input.branchId,
      branchName: 'Main Branch',
      supplierId: input.supplierId,
      supplierName: 'Acme Parts',
      purchaseOrderNumber: input.purchaseOrderNumber,
      status: PURCHASE_ORDER_STATUSES.DRAFT,
      paymentTerms: input.paymentTerms as PurchaseOrderRecord['paymentTerms'],
      orderDate: input.orderDate,
      expectedReceiveDate: input.expectedReceiveDate,
      lockVersion: 0,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      lines: input.lines.map((line) => ({
        id: line.id,
        tenantId: input.tenantId,
        purchaseOrderId: input.id,
        productId: line.productId,
        productName: 'Oil Filter',
        orderedQuantity: line.orderedQuantity,
        receivedQuantity: '0.000',
        unitCost: line.unitCost,
        lineTotal: line.lineTotal,
        notes: line.notes,
      })),
    };
    this.purchaseOrder = created;

    return created;
  }

  async updateDraftPurchaseOrder(
    input: UpdateDraftPurchaseOrderInput,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseOrderRecord | null> {
    if (
      this.purchaseOrder === null ||
      this.purchaseOrder.lockVersion !== input.expectedLockVersion
    ) {
      return null;
    }

    const updated: PurchaseOrderRecord = {
      ...this.purchaseOrder,
      branchId: input.branchId,
      branchName: input.branchId === OTHER_BRANCH_ID ? 'Other Branch' : 'Main Branch',
      supplierId: input.supplierId,
      supplierName: 'Acme Parts',
      paymentTerms: input.paymentTerms as PurchaseOrderRecord['paymentTerms'],
      orderDate: input.orderDate,
      expectedReceiveDate: input.expectedReceiveDate,
      lockVersion: this.purchaseOrder.lockVersion + 1,
      updatedAt: input.updatedAt,
      lines: input.lines.map((line) => ({
        id: line.id,
        tenantId: input.tenantId,
        purchaseOrderId: input.purchaseOrderId,
        productId: line.productId,
        productName: 'Oil Filter',
        orderedQuantity: line.orderedQuantity,
        receivedQuantity: '0.000',
        unitCost: line.unitCost,
        lineTotal: line.lineTotal,
        notes: line.notes,
      })),
    };
    this.purchaseOrder = updated;

    return updated;
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
  ): Promise<void> {}

  async incrementPurchaseOrderLineReceivedQuantity(
    _input: IncrementPurchaseOrderLineReceivedQuantityInput,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseOrderLineRecord | null> {
    return null;
  }

  async updatePurchaseOrderStatus(
    _input: UpdatePurchaseOrderStatusInput,
    _client: DatabaseQueryClient,
  ): Promise<PurchaseOrderForReceivingRecord | null> {
    return null;
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
  branch: BranchSummaryRecord = buildBranch(BRANCH_ID, 'active');

  async findBranchById(
    _tenantId: string,
    branchId: string,
    _client?: DatabaseQueryClient,
  ): Promise<BranchSummaryRecord | null> {
    if (branchId !== this.branch.id && branchId !== OTHER_BRANCH_ID) {
      return null;
    }

    return branchId === OTHER_BRANCH_ID ? buildBranch(OTHER_BRANCH_ID, 'active') : this.branch;
  }
}

class FakeSupplierStore {
  supplier: SupplierRecord = buildSupplier('active');

  async findSupplierById(
    _tenantId: string,
    supplierId: string,
    _client?: DatabaseQueryClient,
  ): Promise<SupplierRecord | null> {
    return supplierId === SUPPLIER_ID ? this.supplier : null;
  }
}

class FakeProductStore {
  isOwner = false;
  product: ProductRecord = buildProduct('active');

  async isActiveShopOwner(): Promise<boolean> {
    return this.isOwner;
  }

  async findProductById(
    _tenantId: string,
    productId: string,
    _client?: DatabaseQueryClient,
  ): Promise<ProductRecord | null> {
    return productId === PRODUCT_ID ? this.product : null;
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
  readonly service: PurchaseOrderDraftService;
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
    service: new PurchaseOrderDraftService(
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
  readonly tenantStatus?: TenantStatus;
  readonly effectivePermissions?: TenantContextAuthenticatedSession['effective_permissions'];
  readonly branches?: TenantContextAuthenticatedSession['branches'];
  readonly tenantWideBranchAccess?: boolean;
}

function buildSession(options: BuildSessionOptions = {}): TenantContextAuthenticatedSession {
  return {
    actor: {
      user_id: USER_ID,
      user_type: 'tenant_user',
      tenant_id: TENANT_ID,
      session_id: 'session-id',
      email_verified: true,
      support_access_session_id: null,
    },
    tenant: {
      id: TENANT_ID,
      status: options.tenantStatus ?? 'active',
    },
    effective_permissions: options.effectivePermissions ?? ['purchases.create', 'purchases.update'],
    branches: options.branches ?? [{ id: BRANCH_ID }],
    tenant_wide_branch_access: options.tenantWideBranchAccess ?? false,
    subscription_status_source: 'system_computed',
  };
}

const createRequest: CreatePurchaseOrderRequest = {
  branch_id: BRANCH_ID,
  supplier_id: SUPPLIER_ID,
  payment_terms: PURCHASE_PAYMENT_TERMS.CREDIT,
  order_date: '2026-07-02',
  expected_receive_date: '2026-07-05',
  lines: [
    {
      product_id: PRODUCT_ID,
      ordered_quantity: '5.000',
      unit_cost: '100.00',
      notes: 'Initial PO line.',
    },
  ],
};

describe('PurchaseOrderDraftService', () => {
  it('creates a draft purchase order with tenant, branch, supplier, product, number, and audit coverage', async () => {
    const { service, store, auditRecords } = buildService();

    const response = await service.createPurchaseOrder(createRequest, buildSession());

    expect(response.purchase_order.status).toBe(PURCHASE_ORDER_STATUSES.DRAFT);
    expect(response.purchase_order.purchase_order_number).toMatch(/^PO-\d{8}-000001$/);
    expect(response.purchase_order.branch_id).toBe(BRANCH_ID);
    expect(response.purchase_order.supplier_id).toBe(SUPPLIER_ID);
    expect(response.purchase_order.ordered_total_amount).toBe('500.00');
    expect(response.purchase_order.received_total_amount).toBe('0.00');
    expect(response.purchase_order.lock_version).toBe(0);
    expect(response.purchase_order.line_items).toHaveLength(1);
    expect(store.sideEffects).toEqual([]);
    expect(auditRecords).toHaveLength(1);
    expect(auditRecords[0]).toMatchObject({
      action: 'purchase_orders.created',
      entityType: 'purchase_order',
      branchId: BRANCH_ID,
    });
  });

  it('blocks draft purchase order create when tenant lifecycle blocks operational writes', async () => {
    const { service, store, auditRecords } = buildService();

    await expect(
      service.createPurchaseOrder(createRequest, buildSession({ tenantStatus: 'read_only' })),
    ).rejects.toMatchObject({ code: 'subscription_access_blocked' });

    expect(store.purchaseOrder).toBeNull();
    expect(auditRecords).toHaveLength(0);
  });

  it('blocks draft purchase order create without purchases.create permission', async () => {
    const { service, store, auditRecords } = buildService();

    await expect(
      service.createPurchaseOrder(createRequest, buildSession({ effectivePermissions: [] })),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: 'purchases.create' }],
    });

    expect(store.purchaseOrder).toBeNull();
    expect(auditRecords).toHaveLength(0);
  });

  it('blocks draft purchase order create when branch access is denied', async () => {
    const { service, store, auditRecords } = buildService();

    await expect(
      service.createPurchaseOrder(
        createRequest,
        buildSession({ branches: [], tenantWideBranchAccess: false }),
      ),
    ).rejects.toMatchObject({ code: 'branch_access_denied' });

    expect(store.purchaseOrder).toBeNull();
    expect(auditRecords).toHaveLength(0);
  });

  it('blocks draft purchase order create for an inactive supplier', async () => {
    const supplierStore = new FakeSupplierStore();
    supplierStore.supplier = buildSupplier('inactive');
    const { service, store, auditRecords } = buildService({ supplierStore });

    await expect(service.createPurchaseOrder(createRequest, buildSession())).rejects.toMatchObject({
      code: 'validation_failed',
      details: [{ field: 'supplier_id', code: 'supplier_not_active' }],
    });

    expect(store.purchaseOrder).toBeNull();
    expect(auditRecords).toHaveLength(0);
  });

  it('blocks draft purchase order create for an inactive product line', async () => {
    const productStore = new FakeProductStore();
    productStore.product = buildProduct('inactive');
    const { service, store, auditRecords } = buildService({ productStore });

    await expect(service.createPurchaseOrder(createRequest, buildSession())).rejects.toMatchObject({
      code: 'validation_failed',
      details: [{ field: 'lines.0.product_id', code: 'product_not_active' }],
    });

    expect(store.purchaseOrder).toBeNull();
    expect(auditRecords).toHaveLength(0);
  });

  it('updates only draft purchase orders with optimistic locking and audit coverage', async () => {
    const { service, store, auditRecords } = buildService();
    await service.createPurchaseOrder(createRequest, buildSession());

    const response = await service.updatePurchaseOrder(
      PURCHASE_ORDER_ID,
      {
        ...createRequest,
        branch_id: OTHER_BRANCH_ID,
        payment_terms: PURCHASE_PAYMENT_TERMS.CASH,
        expected_receive_date: '2026-07-06',
        lines: [
          {
            product_id: PRODUCT_ID,
            ordered_quantity: '2.000',
            unit_cost: '125.00',
          },
        ],
        lock_version: 0,
      },
      buildSession({ branches: [{ id: BRANCH_ID }, { id: OTHER_BRANCH_ID }] }),
    );

    expect(response.purchase_order.branch_id).toBe(OTHER_BRANCH_ID);
    expect(response.purchase_order.payment_terms).toBe(PURCHASE_PAYMENT_TERMS.CASH);
    expect(response.purchase_order.expected_receive_date).toBe('2026-07-06');
    expect(response.purchase_order.ordered_total_amount).toBe('250.00');
    expect(response.purchase_order.lock_version).toBe(1);
    expect(store.sideEffects).toEqual([]);
    expect(auditRecords).toHaveLength(2);
    expect(auditRecords[1]).toMatchObject({
      action: 'purchase_orders.updated',
      entityType: 'purchase_order',
      branchId: OTHER_BRANCH_ID,
    });
  });

  it('returns version conflict for stale draft purchase order updates', async () => {
    const { service } = buildService();
    await service.createPurchaseOrder(createRequest, buildSession());

    await expect(
      service.updatePurchaseOrder(
        PURCHASE_ORDER_ID,
        {
          ...createRequest,
          lock_version: 5,
        },
        buildSession(),
      ),
    ).rejects.toMatchObject({ code: 'version_conflict' });
  });

  it('blocks update once a purchase order is no longer draft', async () => {
    const { service, store } = buildService();
    await service.createPurchaseOrder(createRequest, buildSession());
    store.purchaseOrder = {
      ...(store.purchaseOrder as PurchaseOrderRecord),
      status: PURCHASE_ORDER_STATUSES.ORDERED,
    };

    await expect(
      service.updatePurchaseOrder(
        PURCHASE_ORDER_ID,
        {
          ...createRequest,
          lock_version: 0,
        },
        buildSession(),
      ),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
      details: [{ field: 'status', code: 'purchase_order_not_mutable' }],
    });
  });
});

function buildBranch(id: string, status: BranchSummaryRecord['status']): BranchSummaryRecord {
  return {
    id,
    name: id === OTHER_BRANCH_ID ? 'Other Branch' : 'Main Branch',
    address: '123 Garage St.',
    contactNumber: '09171234567',
    businessHoursJson: {},
    status,
    lockVersion: 0,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    deactivatedAt: null,
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
