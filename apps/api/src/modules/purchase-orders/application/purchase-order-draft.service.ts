import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import { assertBranchAccessAllowed } from '../../../shared/authorization/branch-access';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import { normalizeLockVersion } from '../../../shared/locking/optimistic-locking';
import {
  DEFAULT_DOCUMENT_NUMBER_TIMEZONE,
  formatTenantBusinessDate,
} from '../../../shared/numbering/document-numbering';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import { BranchStore } from '../../branches/application/branch.store';
import { ProductStore } from '../../products/application/product.store';
import { SupplierStore } from '../../suppliers/application/supplier.store';
import type {
  CreatePurchaseOrderRequest,
  UpdatePurchaseOrderRequest,
} from '../api/purchase-order-draft.schemas';
import {
  PURCHASE_ORDER_STATUSES,
  type PurchaseOrderLineRecord,
  type PurchaseOrderRecord,
  type PurchaseOrderStatus,
  type PurchasePaymentTerms,
} from './purchase-order.records';
import { PurchaseOrderStore, type CreateDraftPurchaseOrderLineInput } from './purchase-order.store';

const IDEMPOTENCY_RETENTION_HOURS = 24;

export interface PurchaseOrderLineResponse {
  readonly id: string;
  readonly product_id: string;
  readonly product_name: string | null;
  readonly ordered_quantity: string;
  readonly received_quantity: string;
  readonly unit_cost: string;
  readonly line_total: string;
  readonly notes: string | null;
}

export interface PurchaseOrderResponse {
  readonly id: string;
  readonly purchase_order_number: string;
  readonly status: PurchaseOrderStatus;
  readonly payment_terms: PurchasePaymentTerms;
  readonly branch_id: string;
  readonly branch_name: string | null;
  readonly supplier_id: string;
  readonly supplier_name: string | null;
  readonly order_date: string;
  readonly expected_receive_date: string | null;
  readonly ordered_total_amount: string;
  readonly received_total_amount: string;
  readonly ordered_line_count: number;
  readonly received_line_count: number;
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly line_items: readonly PurchaseOrderLineResponse[];
  readonly receiving_status_summary: readonly {
    readonly label: string;
    readonly value: string;
  }[];
}

export interface PurchaseOrderMutationResponse {
  readonly purchase_order: PurchaseOrderResponse;
}

interface NormalizedPurchaseOrderInput {
  readonly branchId: string;
  readonly supplierId: string;
  readonly paymentTerms: PurchasePaymentTerms;
  readonly orderDate: string;
  readonly expectedReceiveDate: string | null;
  readonly lines: readonly CreateDraftPurchaseOrderLineInput[];
}

@Injectable()
export class PurchaseOrderDraftService {
  constructor(
    @Inject(PurchaseOrderStore)
    private readonly purchaseOrderStore: PurchaseOrderStore,
    @Inject(BranchStore)
    private readonly branchStore: BranchStore,
    @Inject(SupplierStore)
    private readonly supplierStore: SupplierStore,
    @Inject(ProductStore)
    private readonly productStore: ProductStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async createPurchaseOrder(
    request: CreatePurchaseOrderRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<PurchaseOrderMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.productStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertPurchasePermission(context, isShopOwner, 'purchases.create');

    const input = normalizePurchaseOrderInput(request);
    assertBranchAccessAllowed({ context, branchId: input.branchId });

    return this.transactionRunner.runInTransaction(async (transaction) => {
      await assertPurchaseOrderReferences({
        branchStore: this.branchStore,
        supplierStore: this.supplierStore,
        productStore: this.productStore,
        tenantId: context.tenantId,
        input,
        transaction,
      });

      const createdAt = new Date();
      const timezone =
        (await this.purchaseOrderStore.getTenantTimezone(context.tenantId, transaction)) ??
        DEFAULT_DOCUMENT_NUMBER_TIMEZONE;
      const datePart = formatTenantBusinessDate(createdAt, timezone);
      const purchaseOrderNumber = await this.purchaseOrderStore.allocatePurchaseOrderNumber(
        {
          tenantId: context.tenantId,
          datePart,
        },
        transaction,
      );

      if (purchaseOrderNumber === null) {
        throw new Error('Purchase order number allocation failed.');
      }

      const purchaseOrder = await translateDuplicatePurchaseOrderNumber(async () =>
        this.purchaseOrderStore.createDraftPurchaseOrder(
          {
            id: randomUUID(),
            tenantId: context.tenantId,
            branchId: input.branchId,
            supplierId: input.supplierId,
            purchaseOrderNumber,
            paymentTerms: input.paymentTerms,
            orderDate: input.orderDate,
            expectedReceiveDate: input.expectedReceiveDate,
            createdByUserId: context.actorUserId,
            createdAt,
            lines: input.lines,
          },
          transaction,
        ),
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        branchId: purchaseOrder.branchId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'purchase_orders.created',
        entityType: 'purchase_order',
        entityId: purchaseOrder.id,
        afterJson: toPurchaseOrderResponse(purchaseOrder),
        reason: 'purchase_order_created',
        client: transaction,
      });

      return {
        purchase_order: toPurchaseOrderResponse(purchaseOrder),
      };
    });
  }

  async updatePurchaseOrder(
    purchaseOrderId: string,
    request: UpdatePurchaseOrderRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<PurchaseOrderMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.productStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertPurchasePermission(context, isShopOwner, 'purchases.update');

    const input = normalizePurchaseOrderInput(request);
    const expectedLockVersion = normalizeLockVersion(request.lock_version);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.purchaseOrderStore.findPurchaseOrderByIdForUpdate(
        context.tenantId,
        purchaseOrderId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Purchase order was not found.');
      }

      assertBranchAccessAllowed({ context, branchId: existing.branchId });
      assertBranchAccessAllowed({ context, branchId: input.branchId });
      assertPurchaseOrderIsDraft(existing);

      await assertPurchaseOrderReferences({
        branchStore: this.branchStore,
        supplierStore: this.supplierStore,
        productStore: this.productStore,
        tenantId: context.tenantId,
        input,
        transaction,
      });

      const updatedAt = new Date();
      const updated = await translateDuplicatePurchaseOrderNumber(async () =>
        this.purchaseOrderStore.updateDraftPurchaseOrder(
          {
            tenantId: context.tenantId,
            purchaseOrderId: existing.id,
            branchId: input.branchId,
            supplierId: input.supplierId,
            paymentTerms: input.paymentTerms,
            orderDate: input.orderDate,
            expectedReceiveDate: input.expectedReceiveDate,
            expectedLockVersion,
            updatedByUserId: context.actorUserId,
            updatedAt,
            lines: input.lines,
          },
          transaction,
        ),
      );

      if (updated === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        branchId: updated.branchId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'purchase_orders.updated',
        entityType: 'purchase_order',
        entityId: updated.id,
        beforeJson: toPurchaseOrderResponse(existing),
        afterJson: toPurchaseOrderResponse(updated),
        reason: 'purchase_order_updated',
        client: transaction,
      });

      return {
        purchase_order: toPurchaseOrderResponse(updated),
      };
    });
  }
}

function normalizePurchaseOrderInput(
  request: CreatePurchaseOrderRequest | UpdatePurchaseOrderRequest,
): NormalizedPurchaseOrderInput {
  return {
    branchId: request.branch_id.trim(),
    supplierId: request.supplier_id.trim(),
    paymentTerms: request.payment_terms,
    orderDate: request.order_date.trim(),
    expectedReceiveDate: normalizeNullableText(request.expected_receive_date),
    lines: request.lines.map((line) => ({
      id: randomUUID(),
      productId: line.product_id.trim(),
      orderedQuantity: line.ordered_quantity,
      unitCost: line.unit_cost,
      lineTotal: calculateLineTotal(line.ordered_quantity, line.unit_cost),
      notes: normalizeNullableText(line.notes),
    })),
  };
}

async function assertPurchaseOrderReferences(input: {
  readonly branchStore: BranchStore;
  readonly supplierStore: SupplierStore;
  readonly productStore: ProductStore;
  readonly tenantId: string;
  readonly input: NormalizedPurchaseOrderInput;
  readonly transaction: Parameters<PurchaseOrderStore['createDraftPurchaseOrder']>[1];
}): Promise<void> {
  const branch = await input.branchStore.findBranchById(
    input.tenantId,
    input.input.branchId,
    input.transaction,
  );

  if (branch === null || branch.status !== 'active') {
    throw GarageOsApiException.validationFailed([
      {
        field: 'branch_id',
        code: 'branch_not_active',
        message: 'Purchase order branch must be active and belong to the current tenant.',
      },
    ]);
  }

  const supplier = await input.supplierStore.findSupplierById(
    input.tenantId,
    input.input.supplierId,
    input.transaction,
  );

  if (supplier === null || supplier.status !== 'active') {
    throw GarageOsApiException.validationFailed([
      {
        field: 'supplier_id',
        code: 'supplier_not_active',
        message: 'Purchase order supplier must be active and belong to the current tenant.',
      },
    ]);
  }

  for (const [index, line] of input.input.lines.entries()) {
    const product = await input.productStore.findProductById(
      input.tenantId,
      line.productId,
      input.transaction,
    );

    if (product === null || product.status !== 'active') {
      throw GarageOsApiException.validationFailed([
        {
          field: `lines.${index}.product_id`,
          code: 'product_not_active',
          message: 'Purchase order line product must be active and belong to the current tenant.',
        },
      ]);
    }
  }
}

function assertPurchaseOrderIsDraft(purchaseOrder: Pick<PurchaseOrderRecord, 'status'>): void {
  if (purchaseOrder.status !== PURCHASE_ORDER_STATUSES.DRAFT) {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Only draft purchase orders can be updated.',
      [
        {
          field: 'status',
          code: 'purchase_order_not_mutable',
          message:
            'Purchase order update is blocked after it is ordered, received, closed, or cancelled.',
        },
      ],
    );
  }
}

function assertPurchasePermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

function toPurchaseOrderResponse(purchaseOrder: PurchaseOrderRecord): PurchaseOrderResponse {
  const orderedTotalAmount = sumMoneyAmounts(
    purchaseOrder.lines.map((line) => calculateLineTotal(line.orderedQuantity, line.unitCost)),
  );
  const receivedTotalAmount = sumMoneyAmounts(
    purchaseOrder.lines.map((line) => calculateLineTotal(line.receivedQuantity, line.unitCost)),
  );
  const receivedLineCount = purchaseOrder.lines.filter(
    (line) => compareQuantities(line.receivedQuantity, '0.000') > 0,
  ).length;

  return {
    id: purchaseOrder.id,
    purchase_order_number: purchaseOrder.purchaseOrderNumber,
    status: purchaseOrder.status,
    payment_terms: purchaseOrder.paymentTerms,
    branch_id: purchaseOrder.branchId,
    branch_name: purchaseOrder.branchName,
    supplier_id: purchaseOrder.supplierId,
    supplier_name: purchaseOrder.supplierName,
    order_date: purchaseOrder.orderDate,
    expected_receive_date: purchaseOrder.expectedReceiveDate,
    ordered_total_amount: orderedTotalAmount,
    received_total_amount: receivedTotalAmount,
    ordered_line_count: purchaseOrder.lines.length,
    received_line_count: receivedLineCount,
    lock_version: purchaseOrder.lockVersion,
    created_at: purchaseOrder.createdAt.toISOString(),
    updated_at: purchaseOrder.updatedAt.toISOString(),
    line_items: purchaseOrder.lines.map(toPurchaseOrderLineResponse),
    receiving_status_summary: [
      { label: 'Status', value: purchaseOrder.status },
      { label: 'Ordered total', value: orderedTotalAmount },
      { label: 'Received total', value: receivedTotalAmount },
    ],
  };
}

function toPurchaseOrderLineResponse(line: PurchaseOrderLineRecord): PurchaseOrderLineResponse {
  return {
    id: line.id,
    product_id: line.productId,
    product_name: line.productName ?? null,
    ordered_quantity: line.orderedQuantity,
    received_quantity: line.receivedQuantity,
    unit_cost: line.unitCost,
    line_total: line.lineTotal ?? calculateLineTotal(line.orderedQuantity, line.unitCost),
    notes: line.notes ?? null,
  };
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim().replace(/\s+/g, ' ');

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function compareQuantities(left: string, right: string): number {
  const leftUnits = parseQuantityUnits(left);
  const rightUnits = parseQuantityUnits(right);

  if (leftUnits === rightUnits) {
    return 0;
  }

  return leftUnits > rightUnits ? 1 : -1;
}

function calculateLineTotal(quantity: string, unitCost: string): string {
  const quantityUnits = parseQuantityUnits(quantity);
  const unitCostCents = parseMoneyCents(unitCost);
  const totalCents = (quantityUnits * unitCostCents + 500n) / 1000n;

  return formatMoneyCents(totalCents);
}

function sumMoneyAmounts(amounts: readonly string[]): string {
  const totalCents = amounts.reduce((total, amount) => total + parseMoneyCents(amount), 0n);

  return formatMoneyCents(totalCents);
}

function parseQuantityUnits(value: string): bigint {
  const [wholePart = '0', decimalPart = ''] = value.split('.');

  return BigInt(wholePart) * 1000n + BigInt(decimalPart.padEnd(3, '0'));
}

function parseMoneyCents(value: string): bigint {
  const [wholePart = '0', decimalPart = ''] = value.split('.');

  return BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, '0'));
}

function formatMoneyCents(value: bigint): string {
  const wholePart = value / 100n;
  const decimalPart = value % 100n;

  return `${wholePart.toString()}.${decimalPart.toString().padStart(2, '0')}`;
}

async function translateDuplicatePurchaseOrderNumber<Result>(
  work: () => Promise<Result>,
): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    if (isUniqueViolation(error, ['ux_purchase_orders_number'])) {
      throw GarageOsApiException.duplicateResource(
        'A purchase order with this number already exists for this tenant.',
      );
    }

    throw error;
  }
}

function isUniqueViolation(error: unknown, constraints: readonly string[]): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'constraint' in error &&
    (error as { code?: unknown; constraint?: unknown }).code === '23505' &&
    constraints.includes(String((error as { constraint?: unknown }).constraint))
  );
}
