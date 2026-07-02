import { Inject, Injectable } from '@nestjs/common';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import { assertBranchAccessAllowed } from '../../../shared/authorization/branch-access';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import { BranchStore } from '../../branches/application/branch.store';
import { ProductStore } from '../../products/application/product.store';
import { SupplierStore } from '../../suppliers/application/supplier.store';
import type { CancelPurchaseOrderRequest } from '../api/purchase-order-lifecycle.schemas';
import type {
  PurchaseOrderLineResponse,
  PurchaseOrderMutationResponse,
  PurchaseOrderResponse,
} from './purchase-order-draft.service';
import {
  PURCHASE_ORDER_STATUSES,
  type PurchaseOrderLineRecord,
  type PurchaseOrderRecord,
  type PurchaseOrderStatus,
} from './purchase-order.records';
import { PurchaseOrderStore } from './purchase-order.store';

const IDEMPOTENCY_RETENTION_HOURS = 24;

@Injectable()
export class PurchaseOrderLifecycleService {
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

  async orderPurchaseOrder(
    purchaseOrderId: string,
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
      assertOrderableStatus(existing.status);
      await assertOrderReferences({
        branchStore: this.branchStore,
        supplierStore: this.supplierStore,
        productStore: this.productStore,
        tenantId: context.tenantId,
        purchaseOrder: existing,
        transaction,
      });

      const updated = await this.transitionPurchaseOrderStatus({
        context,
        purchaseOrder: existing,
        fromStatus: PURCHASE_ORDER_STATUSES.DRAFT,
        toStatus: PURCHASE_ORDER_STATUSES.ORDERED,
        transaction,
      });

      await this.auditService.record({
        tenantId: context.tenantId,
        branchId: updated.branchId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'purchase_orders.ordered',
        entityType: 'purchase_order',
        entityId: updated.id,
        beforeJson: toPurchaseOrderResponse(existing),
        afterJson: toPurchaseOrderResponse(updated),
        reason: 'purchase_order_ordered',
        client: transaction,
      });

      return {
        purchase_order: toPurchaseOrderResponse(updated),
      };
    });
  }

  async cancelPurchaseOrder(
    purchaseOrderId: string,
    request: CancelPurchaseOrderRequest,
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
    assertPurchasePermission(context, isShopOwner, 'purchases.cancel');

    const reason = normalizeCancellationReason(request.reason);

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
      assertCancellableStatus(existing.status);
      assertPurchaseOrderHasNoReceivingEffects(existing);

      const updated = await this.transitionPurchaseOrderStatus({
        context,
        purchaseOrder: existing,
        fromStatus: existing.status,
        toStatus: PURCHASE_ORDER_STATUSES.CANCELLED,
        transaction,
      });

      await this.auditService.record({
        tenantId: context.tenantId,
        branchId: updated.branchId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'purchase_orders.cancelled',
        entityType: 'purchase_order',
        entityId: updated.id,
        beforeJson: toPurchaseOrderResponse(existing),
        afterJson: {
          ...toPurchaseOrderResponse(updated),
          cancellation_reason: reason,
        },
        reason,
        client: transaction,
      });

      return {
        purchase_order: toPurchaseOrderResponse(updated),
      };
    });
  }

  async closePurchaseOrder(
    purchaseOrderId: string,
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
      assertCloseableStatus(existing.status);

      const updated = await this.transitionPurchaseOrderStatus({
        context,
        purchaseOrder: existing,
        fromStatus: existing.status,
        toStatus: PURCHASE_ORDER_STATUSES.CLOSED,
        transaction,
      });

      await this.auditService.record({
        tenantId: context.tenantId,
        branchId: updated.branchId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'purchase_orders.closed',
        entityType: 'purchase_order',
        entityId: updated.id,
        beforeJson: toPurchaseOrderResponse(existing),
        afterJson: toPurchaseOrderResponse(updated),
        reason: 'purchase_order_closed',
        client: transaction,
      });

      return {
        purchase_order: toPurchaseOrderResponse(updated),
      };
    });
  }

  private async transitionPurchaseOrderStatus(input: {
    readonly context: ResolvedTenantContext;
    readonly purchaseOrder: PurchaseOrderRecord;
    readonly fromStatus: PurchaseOrderStatus;
    readonly toStatus: PurchaseOrderStatus;
    readonly transaction: DatabaseQueryClient;
  }): Promise<PurchaseOrderRecord> {
    const statusUpdate = await this.purchaseOrderStore.updatePurchaseOrderStatus(
      {
        tenantId: input.context.tenantId,
        purchaseOrderId: input.purchaseOrder.id,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
      },
      input.transaction,
    );

    if (statusUpdate === null) {
      throw GarageOsApiException.workflowTransitionBlocked(
        'Purchase order status changed before the workflow action completed.',
        [
          {
            field: 'status',
            code: 'purchase_order_status_conflict',
            message: 'Purchase order status changed.',
          },
        ],
      );
    }

    const updated = await this.purchaseOrderStore.findPurchaseOrderById(
      input.context.tenantId,
      input.purchaseOrder.id,
      input.transaction,
    );

    if (updated === null) {
      throw new Error('Purchase order repository failed to reload updated purchase order.');
    }

    return updated;
  }
}

async function assertOrderReferences(input: {
  readonly branchStore: BranchStore;
  readonly supplierStore: SupplierStore;
  readonly productStore: ProductStore;
  readonly tenantId: string;
  readonly purchaseOrder: PurchaseOrderRecord;
  readonly transaction: Parameters<PurchaseOrderStore['findPurchaseOrderByIdForUpdate']>[2];
}): Promise<void> {
  const branch = await input.branchStore.findBranchById(
    input.tenantId,
    input.purchaseOrder.branchId,
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
    input.purchaseOrder.supplierId,
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

  if (input.purchaseOrder.lines.length === 0) {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Purchase order must have at least one valid line before ordering.',
      [
        {
          field: 'lines',
          code: 'purchase_order_lines_required',
          message: 'Purchase order must have at least one valid line before ordering.',
        },
      ],
    );
  }

  for (const [index, line] of input.purchaseOrder.lines.entries()) {
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

function assertOrderableStatus(status: PurchaseOrderStatus): void {
  if (status === PURCHASE_ORDER_STATUSES.DRAFT) {
    return;
  }

  throw GarageOsApiException.workflowTransitionBlocked(
    'Only draft purchase orders can be ordered.',
    [
      {
        field: 'status',
        code: 'purchase_order_not_orderable',
        message: 'Only draft purchase orders can be ordered.',
      },
    ],
  );
}

function assertCancellableStatus(status: PurchaseOrderStatus): void {
  if (status === PURCHASE_ORDER_STATUSES.DRAFT || status === PURCHASE_ORDER_STATUSES.ORDERED) {
    return;
  }

  throw GarageOsApiException.workflowTransitionBlocked(
    'Only draft or ordered purchase orders can be cancelled.',
    [
      {
        field: 'status',
        code: 'purchase_order_not_cancellable',
        message:
          'Partially received, received, closed, and already cancelled purchase orders cannot be cancelled.',
      },
    ],
  );
}

function assertCloseableStatus(status: PurchaseOrderStatus): void {
  if (
    status === PURCHASE_ORDER_STATUSES.PARTIALLY_RECEIVED ||
    status === PURCHASE_ORDER_STATUSES.RECEIVED
  ) {
    return;
  }

  throw GarageOsApiException.workflowTransitionBlocked(
    'Only partially received or received purchase orders can be closed.',
    [
      {
        field: 'status',
        code: 'purchase_order_not_closeable',
        message: 'Only partially received or received purchase orders can be closed.',
      },
    ],
  );
}

function assertPurchaseOrderHasNoReceivingEffects(purchaseOrder: PurchaseOrderRecord): void {
  const hasReceivedQuantity = purchaseOrder.lines.some(
    (line) => compareQuantities(line.receivedQuantity, '0.000') > 0,
  );

  if (!hasReceivedQuantity) {
    return;
  }

  throw GarageOsApiException.workflowTransitionBlocked(
    'Purchase orders with receiving effects cannot be cancelled.',
    [
      {
        field: 'lines.received_quantity',
        code: 'purchase_order_cancel_has_receiving_effects',
        message:
          'Purchase orders with received quantities must be closed or handled through documented receiving/AP workflows.',
      },
    ],
  );
}

function normalizeCancellationReason(reason: string | undefined): string {
  const normalizedReason = reason?.trim() ?? '';

  if (normalizedReason.length === 0) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'reason',
        code: 'cancellation_reason_required',
        message: 'Cancellation reason is required.',
      },
    ]);
  }

  if (normalizedReason.length > 1000) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'reason',
        code: 'cancellation_reason_too_long',
        message: 'Cancellation reason must be at most 1000 characters.',
      },
    ]);
  }

  return normalizedReason;
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
