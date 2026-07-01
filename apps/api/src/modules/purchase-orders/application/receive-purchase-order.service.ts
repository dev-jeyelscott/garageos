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
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import { FifoLayerService } from '../../inventory/application/fifo-layer.service';
import { InventoryLedgerService } from '../../inventory/application/inventory-ledger.service';
import { INVENTORY_TRANSACTION_TYPES } from '../../inventory/application/inventory-ledger.store';
import { InventoryStockBalancesService } from '../../inventory/application/inventory-stock-balances.service';
import { ProductStore } from '../../products/application/product.store';
import type { ReceivePurchaseOrderRequest } from '../api/purchase-receiving.schemas';
import {
  PURCHASE_ORDER_STATUSES,
  PURCHASE_PAYMENT_TERMS,
  type PurchaseOrderLineRecord,
  type PurchaseOrderStatus,
} from './purchase-order.records';
import { PurchaseOrderStore } from './purchase-order.store';

const IDEMPOTENCY_RETENTION_HOURS = 24;

export interface PurchaseReceivingLineEffect {
  readonly purchase_order_line_id: string;
  readonly receiving_line_id: string;
  readonly product_id: string;
  readonly received_quantity: string;
  readonly received_unit_cost: string;
  readonly fifo_layer_id: string;
  readonly inventory_ledger_entry_id: string;
  readonly line_total: string;
}

export interface PurchaseReceivingResponse {
  readonly purchase_order_id: string;
  readonly receiving_id: string;
  readonly status: PurchaseOrderStatus;
  readonly fifo_layer_ids: readonly string[];
  readonly inventory_ledger_entry_ids: readonly string[];
  readonly ap_effect: {
    readonly created: boolean;
    readonly supplier_payable_id: string | null;
    readonly amount_delta: string;
  };
  readonly lines: readonly PurchaseReceivingLineEffect[];
}

@Injectable()
export class ReceivePurchaseOrderService {
  constructor(
    @Inject(PurchaseOrderStore)
    private readonly purchaseOrderStore: PurchaseOrderStore,
    @Inject(ProductStore)
    private readonly productStore: ProductStore,
    @Inject(InventoryStockBalancesService)
    private readonly inventoryStockBalancesService: InventoryStockBalancesService,
    @Inject(FifoLayerService)
    private readonly fifoLayerService: FifoLayerService,
    @Inject(InventoryLedgerService)
    private readonly inventoryLedgerService: InventoryLedgerService,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async receive(
    purchaseOrderId: string,
    request: ReceivePurchaseOrderRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<PurchaseReceivingResponse> {
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
    assertPurchaseReceivePermission(context, isShopOwner);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const receivedAt = request.received_at ?? new Date();
      const postedAt = new Date();

      const purchaseOrder = await this.purchaseOrderStore.lockPurchaseOrderForReceiving(
        context.tenantId,
        purchaseOrderId,
        transaction,
      );

      if (purchaseOrder === null) {
        throw GarageOsApiException.resourceNotFound('Purchase order was not found.');
      }

      assertBranchAccessAllowed({ context, branchId: purchaseOrder.branchId });

      if (purchaseOrder.branchStatus !== 'active') {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Purchase receiving requires an active branch.',
          [
            {
              field: 'branch_id',
              code: 'branch_inactive',
              message: 'Receiving branch must be active.',
            },
          ],
        );
      }

      if (purchaseOrder.supplierStatus !== 'active') {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Purchase receiving requires an active supplier.',
          [
            {
              field: 'supplier_id',
              code: 'supplier_inactive',
              message: 'Supplier must be active before receiving stock.',
            },
          ],
        );
      }

      if (!isReceivableStatus(purchaseOrder.status)) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Only ordered or partially received purchase orders can be received.',
          [
            {
              field: 'status',
              code: 'purchase_order_not_receivable',
              message: 'Purchase order is not in a receivable status.',
            },
          ],
        );
      }

      if (purchaseOrder.paymentTerms === PURCHASE_PAYMENT_TERMS.CASH && !request.payment_method) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'payment_method',
            code: 'required_for_cash_purchase',
            message: 'Cash purchases require a payment method at receiving time.',
          },
        ]);
      }

      const persistedLines = await this.purchaseOrderStore.listPurchaseOrderLinesForUpdate(
        context.tenantId,
        purchaseOrder.id,
        transaction,
      );

      if (persistedLines.length === 0) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Purchase order must have at least one valid line before receiving.',
          [
            {
              field: 'lines',
              code: 'purchase_order_lines_required',
              message: 'Purchase order must have at least one valid line before receiving.',
            },
          ],
        );
      }

      const requestedLines = matchRequestedLines(request, persistedLines);

      const receiving = await this.purchaseOrderStore.createReceiving(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          branchId: purchaseOrder.branchId,
          purchaseOrderId: purchaseOrder.id,
          supplierId: purchaseOrder.supplierId,
          receivedAt,
          receivedByUserId: context.actorUserId,
          paymentMethod:
            purchaseOrder.paymentTerms === PURCHASE_PAYMENT_TERMS.CASH
              ? (request.payment_method ?? null)
              : null,
          paymentReference:
            purchaseOrder.paymentTerms === PURCHASE_PAYMENT_TERMS.CASH
              ? (request.payment_reference ?? null)
              : null,
          postedAt,
        },
        transaction,
      );

      const updatedLines = new Map<string, PurchaseOrderLineRecord>();
      const lineEffects: PurchaseReceivingLineEffect[] = [];
      const fifoLayerIds: string[] = [];
      const inventoryLedgerEntryIds: string[] = [];
      let receivedTotal = '0.00';

      for (const requestedLine of requestedLines.values()) {
        const persistedLine = persistedLines.find(
          (line) => line.id === requestedLine.purchase_order_line_id,
        );

        if (persistedLine === undefined) {
          throw GarageOsApiException.validationFailed([
            {
              field: 'lines.purchase_order_line_id',
              code: 'unknown_purchase_order_line',
              message: 'Purchase order line does not belong to this purchase order.',
            },
          ]);
        }

        assertLineCanReceive(persistedLine, requestedLine.received_quantity);

        const receivingLine = await this.purchaseOrderStore.createReceivingLine(
          {
            id: randomUUID(),
            tenantId: context.tenantId,
            receivingId: receiving.id,
            purchaseOrderLineId: persistedLine.id,
            productId: persistedLine.productId,
            receivedQuantity: requestedLine.received_quantity,
            receivedUnitCost: requestedLine.received_unit_cost,
            fifoLayerId: null,
          },
          transaction,
        );

        const fifoLayer = await this.fifoLayerService.createLayer(
          {
            tenantId: context.tenantId,
            branchId: purchaseOrder.branchId,
            productId: persistedLine.productId,
            quantityReceived: requestedLine.received_quantity,
            unitCost: requestedLine.received_unit_cost,
            sourceTransactionType: INVENTORY_TRANSACTION_TYPES.PURCHASE_RECEIVE,
            sourceTransactionId: receivingLine.id,
            receivedAt,
            originalSourceLayerId: null,
          },
          transaction,
        );

        await this.purchaseOrderStore.setReceivingLineFifoLayerId(
          {
            tenantId: context.tenantId,
            receivingLineId: receivingLine.id,
            fifoLayerId: fifoLayer.id,
          },
          transaction,
        );

        await this.inventoryStockBalancesService.incrementOnHandStock(
          {
            tenantId: context.tenantId,
            branchId: purchaseOrder.branchId,
            productId: persistedLine.productId,
            quantityReceived: requestedLine.received_quantity,
          },
          transaction,
        );

        const lineTotal = calculateLineTotal(
          requestedLine.received_quantity,
          requestedLine.received_unit_cost,
        );

        const ledgerEntry = await this.inventoryLedgerService.recordLedgerEntry(
          {
            tenantId: context.tenantId,
            branchId: purchaseOrder.branchId,
            productId: persistedLine.productId,
            transactionType: INVENTORY_TRANSACTION_TYPES.PURCHASE_RECEIVE,
            quantityDeltaOnHand: requestedLine.received_quantity,
            quantityDeltaReserved: '0.000',
            unitCost: requestedLine.received_unit_cost,
            totalCost: lineTotal,
            sourceType: 'purchase_receiving_line',
            sourceId: receivingLine.id,
            occurredAt: receivedAt,
            createdByUserId: context.actorUserId,
          },
          transaction,
        );

        const updatedLine =
          await this.purchaseOrderStore.incrementPurchaseOrderLineReceivedQuantity(
            {
              tenantId: context.tenantId,
              purchaseOrderId: purchaseOrder.id,
              purchaseOrderLineId: persistedLine.id,
              receivedQuantity: requestedLine.received_quantity,
            },
            transaction,
          );

        if (updatedLine === null) {
          throw GarageOsApiException.workflowTransitionBlocked(
            'Purchase order line receiving quantity changed before receiving completed.',
            [
              {
                field: 'lines.received_quantity',
                code: 'purchase_order_line_receive_conflict',
                message: 'Receiving would exceed remaining ordered quantity.',
              },
            ],
          );
        }

        updatedLines.set(updatedLine.id, updatedLine);
        receivedTotal = sumMoneyAmounts([receivedTotal, lineTotal]);
        fifoLayerIds.push(fifoLayer.id);
        inventoryLedgerEntryIds.push(ledgerEntry.id);
        lineEffects.push({
          purchase_order_line_id: persistedLine.id,
          receiving_line_id: receivingLine.id,
          product_id: persistedLine.productId,
          received_quantity: requestedLine.received_quantity,
          received_unit_cost: requestedLine.received_unit_cost,
          fifo_layer_id: fifoLayer.id,
          inventory_ledger_entry_id: ledgerEntry.id,
          line_total: lineTotal,
        });
      }

      const statusAfterReceiving = calculatePurchaseOrderStatusAfterReceiving(
        persistedLines,
        updatedLines,
      );

      const updatedPurchaseOrder = await this.purchaseOrderStore.updatePurchaseOrderStatus(
        {
          tenantId: context.tenantId,
          purchaseOrderId: purchaseOrder.id,
          fromStatus: purchaseOrder.status,
          toStatus: statusAfterReceiving,
        },
        transaction,
      );

      if (updatedPurchaseOrder === null) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Purchase order status changed before receiving completed.',
          [
            {
              field: 'status',
              code: 'purchase_order_status_conflict',
              message: 'Purchase order status changed.',
            },
          ],
        );
      }

      const supplierPayable =
        purchaseOrder.paymentTerms === PURCHASE_PAYMENT_TERMS.CREDIT
          ? await this.purchaseOrderStore.createSupplierPayable(
              {
                id: randomUUID(),
                tenantId: context.tenantId,
                supplierId: purchaseOrder.supplierId,
                branchId: purchaseOrder.branchId,
                sourceType: 'purchase_receiving',
                sourceId: receiving.id,
                amountDelta: receivedTotal,
                occurredAt: receivedAt,
              },
              transaction,
            )
          : null;

      await this.auditService.record({
        tenantId: context.tenantId,
        branchId: purchaseOrder.branchId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'purchase_orders.received',
        entityType: 'purchase_order',
        entityId: purchaseOrder.id,
        beforeJson: {
          status: purchaseOrder.status,
          payment_terms: purchaseOrder.paymentTerms,
        },
        afterJson: {
          status: statusAfterReceiving,
          receiving_id: receiving.id,
          payment_terms: purchaseOrder.paymentTerms,
          line_effects: lineEffects,
          ap_effect: {
            created: supplierPayable !== null,
            supplier_payable_id: supplierPayable?.id ?? null,
            amount_delta: supplierPayable?.amountDelta ?? '0.00',
          },
        },
        createdAt: postedAt,
        client: transaction,
      });

      return {
        purchase_order_id: purchaseOrder.id,
        receiving_id: receiving.id,
        status: statusAfterReceiving,
        fifo_layer_ids: fifoLayerIds,
        inventory_ledger_entry_ids: inventoryLedgerEntryIds,
        ap_effect: {
          created: supplierPayable !== null,
          supplier_payable_id: supplierPayable?.id ?? null,
          amount_delta: supplierPayable?.amountDelta ?? '0.00',
        },
        lines: lineEffects,
      };
    });
  }
}

function assertPurchaseReceivePermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes('purchases.receive')) {
    throw GarageOsApiException.forbidden('purchases.receive');
  }
}

function isReceivableStatus(status: PurchaseOrderStatus): boolean {
  return (
    status === PURCHASE_ORDER_STATUSES.ORDERED ||
    status === PURCHASE_ORDER_STATUSES.PARTIALLY_RECEIVED
  );
}

function matchRequestedLines(
  request: ReceivePurchaseOrderRequest,
  persistedLines: readonly PurchaseOrderLineRecord[],
): Map<string, ReceivePurchaseOrderRequest['lines'][number]> {
  const persistedLineIds = new Set(persistedLines.map((line) => line.id));
  const requestedLines = new Map<string, ReceivePurchaseOrderRequest['lines'][number]>();

  for (const [index, line] of request.lines.entries()) {
    if (!persistedLineIds.has(line.purchase_order_line_id)) {
      throw GarageOsApiException.validationFailed([
        {
          field: `lines.${index}.purchase_order_line_id`,
          code: 'unknown_purchase_order_line',
          message: 'Purchase order line does not belong to this purchase order.',
        },
      ]);
    }

    requestedLines.set(line.purchase_order_line_id, line);
  }

  return requestedLines;
}

function assertLineCanReceive(line: PurchaseOrderLineRecord, receivedQuantity: string): void {
  const remainingQuantity = subtractQuantities(line.orderedQuantity, line.receivedQuantity);

  if (compareQuantities(remainingQuantity, '0.000') <= 0) {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Purchase order line has no remaining quantity to receive.',
      [
        {
          field: 'lines.received_quantity',
          code: 'purchase_order_line_already_received',
          message: 'Purchase order line has no remaining quantity to receive.',
        },
      ],
    );
  }

  if (compareQuantities(receivedQuantity, remainingQuantity) > 0) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'lines.received_quantity',
        code: 'over_receiving_blocked',
        message: 'Received quantity cannot exceed remaining ordered quantity.',
      },
    ]);
  }
}

function calculatePurchaseOrderStatusAfterReceiving(
  persistedLines: readonly PurchaseOrderLineRecord[],
  updatedLines: ReadonlyMap<string, PurchaseOrderLineRecord>,
): PurchaseOrderStatus {
  const allLinesFullyReceived = persistedLines.every((line) => {
    const currentLine = updatedLines.get(line.id) ?? line;

    return compareQuantities(currentLine.receivedQuantity, currentLine.orderedQuantity) >= 0;
  });

  return allLinesFullyReceived
    ? PURCHASE_ORDER_STATUSES.RECEIVED
    : PURCHASE_ORDER_STATUSES.PARTIALLY_RECEIVED;
}

function compareQuantities(left: string, right: string): number {
  const leftUnits = parseQuantityUnits(left);
  const rightUnits = parseQuantityUnits(right);

  if (leftUnits === rightUnits) {
    return 0;
  }

  return leftUnits > rightUnits ? 1 : -1;
}

function subtractQuantities(left: string, right: string): string {
  return formatQuantityUnits(parseQuantityUnits(left) - parseQuantityUnits(right));
}

function parseQuantityUnits(value: string): bigint {
  const [wholePart = '0', decimalPart = ''] = value.split('.');

  return BigInt(wholePart) * 1000n + BigInt(decimalPart.padEnd(3, '0'));
}

function formatQuantityUnits(value: bigint): string {
  const wholePart = value / 1000n;
  const decimalPart = value % 1000n;

  return `${wholePart.toString()}.${decimalPart.toString().padStart(3, '0')}`;
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

function parseMoneyCents(value: string): bigint {
  const [wholePart = '0', decimalPart = ''] = value.split('.');

  return BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, '0'));
}

function formatMoneyCents(value: bigint): string {
  const wholePart = value / 100n;
  const decimalPart = value % 100n;

  return `${wholePart.toString()}.${decimalPart.toString().padStart(2, '0')}`;
}
