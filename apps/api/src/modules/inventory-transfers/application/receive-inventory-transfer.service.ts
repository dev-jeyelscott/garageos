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
import { InventoryReservationService } from '../../inventory/application/inventory-reservation.service';
import {
  InventoryStockBalancesService,
  type StockAvailabilitySnapshot,
} from '../../inventory/application/inventory-stock-balances.service';
import { ProductStore } from '../../products/application/product.store';
import type { ReceiveInventoryTransferRequest } from '../api/inventory-transfer.schemas';
import {
  INVENTORY_TRANSFER_STATUSES,
  type InventoryTransferLineRecord,
} from './inventory-transfer.records';
import {
  toReceiveInventoryTransferResponse,
  type InventoryTransferReceiveResponse,
} from './inventory-transfer-response.mapper';
import { InventoryTransferStore } from './inventory-transfer.store';

const IDEMPOTENCY_RETENTION_HOURS = 24;

interface ReceivedFifoLayerInput {
  readonly productId: string;
  readonly quantityReceived: string;
  readonly unitCost: string;
  readonly sourceLayerId: string;
}

interface ReceiveLineEffect {
  readonly line_id: string;
  readonly product_id: string;
  readonly sent_quantity: string;
  readonly received_quantity: string;
  readonly variance_quantity: string;
  readonly variance_reason: string | null;
  readonly source_ledger_entry_ids: readonly string[];
  readonly destination_ledger_entry_id: string | null;
  readonly variance_loss_amount: string;
}

@Injectable()
export class ReceiveInventoryTransferService {
  constructor(
    @Inject(InventoryTransferStore)
    private readonly inventoryTransferStore: InventoryTransferStore,
    @Inject(ProductStore)
    private readonly productStore: ProductStore,
    private readonly inventoryReservationService: InventoryReservationService,
    private readonly inventoryStockBalancesService: InventoryStockBalancesService,
    private readonly fifoLayerService: FifoLayerService,
    private readonly inventoryLedgerService: InventoryLedgerService,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async receiveInTransit(
    transferId: string,
    request: ReceiveInventoryTransferRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<InventoryTransferReceiveResponse> {
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
    assertInventoryTransferReceivePermission(context, isShopOwner);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const now = new Date();
      const transfer = await this.inventoryTransferStore.lockTransferForUpdate(
        context.tenantId,
        transferId,
        transaction,
      );

      if (transfer === null) {
        throw GarageOsApiException.resourceNotFound('Inventory transfer was not found.');
      }

      assertBranchAccessAllowed({ context, branchId: transfer.sourceBranchId });
      assertBranchAccessAllowed({ context, branchId: transfer.destinationBranchId });

      if (transfer.status !== INVENTORY_TRANSFER_STATUSES.IN_TRANSIT) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Only in-transit inventory transfers can be received.',
          [
            {
              field: 'status',
              code: 'transfer_not_in_transit',
              message: 'Only in-transit inventory transfers can be received.',
            },
          ],
        );
      }

      const persistedLines = await this.inventoryTransferStore.listTransferLinesForUpdate(
        context.tenantId,
        transfer.id,
        transaction,
      );
      const requestedLines = matchRequestedLines(request, persistedLines);
      const lineEffects: ReceiveLineEffect[] = [];
      const ledgerEntryIds: string[] = [];

      for (const persistedLine of persistedLines) {
        const requestedLine = requestedLines.get(persistedLine.id);

        if (requestedLine === undefined) {
          throw GarageOsApiException.validationFailed([
            {
              field: 'lines',
              code: 'transfer_line_missing',
              message: 'Received quantity is required for every transfer line.',
            },
          ]);
        }

        assertLineReadyForReceive(persistedLine);
        assertReceivedQuantityAllowed(persistedLine, requestedLine);

        const consumeResult =
          await this.inventoryReservationService.consumeInventoryTransferReservationInTransaction(
            {
              tenantId: context.tenantId,
              reservationId: persistedLine.reservationId,
              receivedQuantity: requestedLine.received_quantity,
              consumedAt: now,
              consumedByUserId: context.actorUserId,
            },
            transaction,
          );
        const receivedFifoLayers = buildReceivedFifoLayerInputs(
          persistedLine.productId,
          requestedLine.received_quantity,
          consumeResult.fifoConsumptions,
        );
        let destinationStock: StockAvailabilitySnapshot | null = null;
        let destinationLedgerEntryId: string | null = null;

        if (!isZeroQuantity(requestedLine.received_quantity)) {
          destinationStock = await this.inventoryStockBalancesService.incrementOnHandStock(
            {
              tenantId: context.tenantId,
              branchId: transfer.destinationBranchId,
              productId: persistedLine.productId,
              quantityReceived: requestedLine.received_quantity,
            },
            transaction,
          );

          for (const layer of receivedFifoLayers) {
            await this.fifoLayerService.createLayer(
              {
                tenantId: context.tenantId,
                branchId: transfer.destinationBranchId,
                productId: persistedLine.productId,
                quantityReceived: layer.quantityReceived,
                unitCost: layer.unitCost,
                sourceTransactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_IN,
                sourceTransactionId: persistedLine.id,
                receivedAt: now,
                originalSourceLayerId: layer.sourceLayerId,
              },
              transaction,
            );
          }

          const destinationLedgerEntry = await this.inventoryLedgerService.recordLedgerEntry(
            {
              tenantId: context.tenantId,
              branchId: transfer.destinationBranchId,
              productId: persistedLine.productId,
              transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_IN,
              quantityDeltaOnHand: requestedLine.received_quantity,
              quantityDeltaReserved: '0.000',
              unitCost: null,
              totalCost: sumMoneyAmounts(
                receivedFifoLayers.map((layer) =>
                  calculateTotalCost(layer.quantityReceived, layer.unitCost),
                ),
              ),
              sourceType: 'inventory_transfer_line',
              sourceId: persistedLine.id,
              occurredAt: now,
              createdByUserId: context.actorUserId,
            },
            transaction,
          );
          destinationLedgerEntryId = destinationLedgerEntry.id;
          ledgerEntryIds.push(destinationLedgerEntry.id);
        }

        await this.inventoryTransferStore.updateTransferLineReceivedQuantity(
          {
            tenantId: context.tenantId,
            lineId: persistedLine.id,
            receivedQuantity: requestedLine.received_quantity,
            varianceQuantity: consumeResult.varianceQuantity,
            varianceReason: requestedLine.variance_reason ?? null,
          },
          transaction,
        );

        ledgerEntryIds.push(...consumeResult.ledgerEntries.map((entry) => entry.id));
        lineEffects.push({
          line_id: persistedLine.id,
          product_id: persistedLine.productId,
          sent_quantity: consumeResult.sentQuantity,
          received_quantity: requestedLine.received_quantity,
          variance_quantity: consumeResult.varianceQuantity,
          variance_reason: requestedLine.variance_reason ?? null,
          source_ledger_entry_ids: consumeResult.ledgerEntries.map((entry) => entry.id),
          destination_ledger_entry_id: destinationLedgerEntryId,
          variance_loss_amount: consumeResult.varianceLossCost,
        });

        void destinationStock;
      }

      const receivedTransfer = await this.inventoryTransferStore.updateTransferStatusToReceived(
        {
          tenantId: context.tenantId,
          transferId: transfer.id,
          expectedStatus: INVENTORY_TRANSFER_STATUSES.IN_TRANSIT,
          receivedByUserId: context.actorUserId,
          receivedAt: now,
        },
        transaction,
      );

      if (receivedTransfer === null) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Inventory transfer status changed before receive completed.',
          [
            {
              field: 'status',
              code: 'transfer_status_conflict',
              message: 'Transfer status changed.',
            },
          ],
        );
      }

      await this.inventoryTransferStore.insertStatusEvent(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          transferId: transfer.id,
          fromStatus: INVENTORY_TRANSFER_STATUSES.IN_TRANSIT,
          toStatus: INVENTORY_TRANSFER_STATUSES.RECEIVED,
          reason: null,
          createdByUserId: context.actorUserId,
          createdAt: now,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        branchId: transfer.destinationBranchId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'inventory_transfers.received',
        entityType: 'inventory_transfer',
        entityId: transfer.id,
        beforeJson: {
          status: INVENTORY_TRANSFER_STATUSES.IN_TRANSIT,
          source_branch_id: transfer.sourceBranchId,
          destination_branch_id: transfer.destinationBranchId,
        },
        afterJson: {
          status: INVENTORY_TRANSFER_STATUSES.RECEIVED,
          source_branch_id: transfer.sourceBranchId,
          destination_branch_id: transfer.destinationBranchId,
          line_effects: lineEffects,
        },
        createdAt: now,
        client: transaction,
      });

      return toReceiveInventoryTransferResponse(
        receivedTransfer,
        ledgerEntryIds,
        sumMoneyAmounts(lineEffects.map((effect) => effect.variance_loss_amount)),
      );
    });
  }
}

function assertInventoryTransferReceivePermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes('inventory.transfer.receive')) {
    throw GarageOsApiException.forbidden('inventory.transfer.receive');
  }
}

function matchRequestedLines(
  request: ReceiveInventoryTransferRequest,
  persistedLines: readonly InventoryTransferLineRecord[],
): Map<string, ReceiveInventoryTransferRequest['lines'][number]> {
  const persistedLineIds = new Set(persistedLines.map((line) => line.id));
  const requestedLines = new Map<string, ReceiveInventoryTransferRequest['lines'][number]>();

  for (const [index, line] of request.lines.entries()) {
    if (!persistedLineIds.has(line.line_id)) {
      throw GarageOsApiException.validationFailed([
        {
          field: `lines.${index}.line_id`,
          code: 'unknown_transfer_line',
          message: 'Transfer line does not belong to this transfer.',
        },
      ]);
    }

    requestedLines.set(line.line_id, line);
  }

  if (requestedLines.size !== persistedLines.length) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'lines',
        code: 'transfer_line_count_mismatch',
        message: 'Received quantity is required for every transfer line.',
      },
    ]);
  }

  return requestedLines;
}

function assertLineReadyForReceive(
  line: InventoryTransferLineRecord,
): asserts line is InventoryTransferLineRecord & {
  readonly sentQuantity: string;
  readonly reservationId: string;
} {
  if (line.sentQuantity === null || line.reservationId === null) {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Inventory transfer line has not been sent.',
      [
        {
          field: 'lines',
          code: 'transfer_line_not_sent',
          message: 'Every transfer line must have a sent quantity before receive.',
        },
      ],
    );
  }
}

function assertReceivedQuantityAllowed(
  line: InventoryTransferLineRecord & { readonly sentQuantity: string },
  requestedLine: ReceiveInventoryTransferRequest['lines'][number],
): void {
  if (compareQuantities(requestedLine.received_quantity, line.sentQuantity) > 0) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'lines.received_quantity',
        code: 'received_quantity_exceeds_sent',
        message: 'Received quantity cannot exceed sent quantity.',
      },
    ]);
  }

  if (
    compareQuantities(requestedLine.received_quantity, line.sentQuantity) < 0 &&
    requestedLine.variance_reason === undefined
  ) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'lines.variance_reason',
        code: 'variance_reason_required',
        message: 'Variance reason is required when received quantity is less than sent quantity.',
      },
    ]);
  }
}

function buildReceivedFifoLayerInputs(
  productId: string,
  receivedQuantity: string,
  fifoConsumptions: readonly {
    readonly fifoLayerId: string;
    readonly quantityConsumed: string;
    readonly unitCost: string;
  }[],
): readonly ReceivedFifoLayerInput[] {
  let remainingReceivedUnits = parseQuantityUnits(receivedQuantity);
  const layers: ReceivedFifoLayerInput[] = [];

  for (const consumption of fifoConsumptions) {
    if (remainingReceivedUnits === 0n) {
      break;
    }

    const consumptionUnits = parseQuantityUnits(consumption.quantityConsumed);
    const receivedUnits =
      remainingReceivedUnits < consumptionUnits ? remainingReceivedUnits : consumptionUnits;

    if (receivedUnits > 0n) {
      layers.push({
        productId,
        quantityReceived: formatQuantityUnits(receivedUnits),
        unitCost: consumption.unitCost,
        sourceLayerId: consumption.fifoLayerId,
      });
    }

    remainingReceivedUnits -= receivedUnits;
  }

  return layers;
}

function compareQuantities(left: string, right: string): number {
  const leftUnits = parseQuantityUnits(left);
  const rightUnits = parseQuantityUnits(right);

  if (leftUnits === rightUnits) {
    return 0;
  }

  return leftUnits > rightUnits ? 1 : -1;
}

function isZeroQuantity(value: string): boolean {
  return parseQuantityUnits(value) === 0n;
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

function calculateTotalCost(quantity: string, unitCost: string): string {
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
