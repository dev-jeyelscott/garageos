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
import { INVENTORY_TRANSACTION_TYPES } from '../../inventory/application/inventory-ledger.store';
import { InventoryReservationService } from '../../inventory/application/inventory-reservation.service';
import { ProductStore } from '../../products/application/product.store';
import type { CancelInventoryTransferRequest } from '../api/inventory-transfer.schemas';
import {
  INVENTORY_TRANSFER_STATUSES,
  type InventoryTransferLineRecord,
  type InventoryTransferStatus,
} from './inventory-transfer.records';
import {
  toCancelInventoryTransferResponse,
  type InventoryTransferCancelResponse,
  type InventoryTransferReservationReleaseResponse,
} from './inventory-transfer-response.mapper';
import { InventoryTransferStore } from './inventory-transfer.store';

const IDEMPOTENCY_RETENTION_HOURS = 24;

type CancellationDisposition = 'returned_to_source' | 'lost_or_damaged';

interface CancelLineEffect {
  readonly line_id: string;
  readonly product_id: string;
  readonly reservation_id: string | null;
  readonly released_quantity: string | null;
  readonly consumed_quantity: string | null;
  readonly variance_loss_amount: string;
  readonly ledger_entry_ids: readonly string[];
}

@Injectable()
export class CancelInventoryTransferService {
  constructor(
    @Inject(InventoryTransferStore)
    private readonly inventoryTransferStore: InventoryTransferStore,
    @Inject(ProductStore)
    private readonly productStore: ProductStore,
    private readonly inventoryReservationService: InventoryReservationService,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async cancelTransfer(
    transferId: string,
    request: CancelInventoryTransferRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<InventoryTransferCancelResponse> {
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
    assertInventoryTransferCancelPermission(context, isShopOwner);

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
      assertCancellableStatus(transfer.status);

      const disposition = resolveDisposition(transfer.status, request);
      const persistedLines = await this.inventoryTransferStore.listTransferLinesForUpdate(
        context.tenantId,
        transfer.id,
        transaction,
      );
      const ledgerEntryIds: string[] = [];
      const lineEffects: CancelLineEffect[] = [];
      const releasedReservations: InventoryTransferReservationReleaseResponse[] = [];

      if (transfer.status === INVENTORY_TRANSFER_STATUSES.PENDING) {
        for (const line of persistedLines) {
          assertLineHasReservation(line);
          const releaseResult =
            await this.inventoryReservationService.releaseInventoryInTransaction(
              {
                tenantId: context.tenantId,
                reservationId: line.reservationId,
                transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_RESERVATION_RELEASE,
                releasedAt: now,
                releasedByUserId: context.actorUserId,
              },
              transaction,
            );

          ledgerEntryIds.push(releaseResult.ledgerEntry.id);
          releasedReservations.push({
            line_id: line.id,
            product_id: line.productId,
            reservation_id: releaseResult.reservation.id,
            released_quantity: line.reservedQuantity,
            ledger_entry_id: releaseResult.ledgerEntry.id,
          });
          lineEffects.push({
            line_id: line.id,
            product_id: line.productId,
            reservation_id: line.reservationId,
            released_quantity: line.reservedQuantity,
            consumed_quantity: null,
            variance_loss_amount: '0.00',
            ledger_entry_ids: [releaseResult.ledgerEntry.id],
          });
        }
      }

      if (
        transfer.status === INVENTORY_TRANSFER_STATUSES.IN_TRANSIT &&
        disposition === 'returned_to_source'
      ) {
        for (const line of persistedLines) {
          assertLineHasReservation(line);
          const releaseResult =
            await this.inventoryReservationService.releaseInventoryInTransaction(
              {
                tenantId: context.tenantId,
                reservationId: line.reservationId,
                transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_RESERVATION_RELEASE,
                releasedAt: now,
                releasedByUserId: context.actorUserId,
              },
              transaction,
            );

          ledgerEntryIds.push(releaseResult.ledgerEntry.id);
          releasedReservations.push({
            line_id: line.id,
            product_id: line.productId,
            reservation_id: releaseResult.reservation.id,
            released_quantity: line.reservedQuantity,
            ledger_entry_id: releaseResult.ledgerEntry.id,
          });
          lineEffects.push({
            line_id: line.id,
            product_id: line.productId,
            reservation_id: line.reservationId,
            released_quantity: line.reservedQuantity,
            consumed_quantity: null,
            variance_loss_amount: '0.00',
            ledger_entry_ids: [releaseResult.ledgerEntry.id],
          });
        }
      }

      if (
        transfer.status === INVENTORY_TRANSFER_STATUSES.IN_TRANSIT &&
        disposition === 'lost_or_damaged'
      ) {
        for (const line of persistedLines) {
          assertLineReadyForLoss(line);
          const consumeResult =
            await this.inventoryReservationService.consumeInventoryTransferReservationInTransaction(
              {
                tenantId: context.tenantId,
                reservationId: line.reservationId,
                receivedQuantity: '0.000',
                expectedSentQuantity: line.sentQuantity,
                expectedBranchId: transfer.sourceBranchId,
                expectedProductId: line.productId,
                expectedSourceType: 'inventory_transfer_line',
                expectedSourceId: line.id,
                consumedAt: now,
                consumedByUserId: context.actorUserId,
              },
              transaction,
            );

          await this.inventoryTransferStore.updateTransferLineReceivedQuantity(
            {
              tenantId: context.tenantId,
              lineId: line.id,
              receivedQuantity: '0.000',
              varianceQuantity: consumeResult.varianceQuantity,
              varianceReason: request.reason ?? null,
            },
            transaction,
          );

          const lineLedgerEntryIds = consumeResult.ledgerEntries.map((entry) => entry.id);
          ledgerEntryIds.push(...lineLedgerEntryIds);
          lineEffects.push({
            line_id: line.id,
            product_id: line.productId,
            reservation_id: line.reservationId,
            released_quantity: null,
            consumed_quantity: consumeResult.sentQuantity,
            variance_loss_amount: consumeResult.varianceLossCost,
            ledger_entry_ids: lineLedgerEntryIds,
          });
        }
      }

      const cancelledTransfer = await this.inventoryTransferStore.updateTransferStatusToCancelled(
        {
          tenantId: context.tenantId,
          transferId: transfer.id,
          expectedStatus: transfer.status,
          cancelledByUserId: context.actorUserId,
          cancelledAt: now,
          cancellationDisposition: disposition,
        },
        transaction,
      );

      if (cancelledTransfer === null) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Inventory transfer status changed before cancellation completed.',
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
          fromStatus: transfer.status,
          toStatus: INVENTORY_TRANSFER_STATUSES.CANCELLED,
          reason: request.reason ?? null,
          createdByUserId: context.actorUserId,
          createdAt: now,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        branchId: transfer.sourceBranchId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'inventory_transfers.cancelled',
        entityType: 'inventory_transfer',
        entityId: transfer.id,
        beforeJson: {
          status: transfer.status,
          source_branch_id: transfer.sourceBranchId,
          destination_branch_id: transfer.destinationBranchId,
        },
        afterJson: {
          status: INVENTORY_TRANSFER_STATUSES.CANCELLED,
          source_branch_id: transfer.sourceBranchId,
          destination_branch_id: transfer.destinationBranchId,
          disposition,
          reason: request.reason ?? null,
          line_effects: lineEffects,
          released_reservations: releasedReservations,
          ledger_entry_ids: ledgerEntryIds,
        },
        reason: request.reason ?? null,
        createdAt: now,
        client: transaction,
      });

      return toCancelInventoryTransferResponse(
        cancelledTransfer,
        ledgerEntryIds,
        disposition,
        sumMoneyAmounts(lineEffects.map((effect) => effect.variance_loss_amount)),
      );
    });
  }
}

function assertInventoryTransferCancelPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes('inventory.transfer.cancel')) {
    throw GarageOsApiException.forbidden('inventory.transfer.cancel');
  }
}

function assertCancellableStatus(status: InventoryTransferStatus): void {
  if (
    status === INVENTORY_TRANSFER_STATUSES.DRAFT ||
    status === INVENTORY_TRANSFER_STATUSES.PENDING ||
    status === INVENTORY_TRANSFER_STATUSES.IN_TRANSIT
  ) {
    return;
  }

  throw GarageOsApiException.workflowTransitionBlocked(
    'Only draft, pending, and in-transit inventory transfers can be cancelled.',
    [
      {
        field: 'status',
        code: 'transfer_not_cancellable',
        message: 'Received and already cancelled transfers cannot be cancelled.',
      },
    ],
  );
}

function resolveDisposition(
  status: InventoryTransferStatus,
  request: CancelInventoryTransferRequest,
): CancellationDisposition | null {
  if (status !== INVENTORY_TRANSFER_STATUSES.IN_TRANSIT) {
    return request.disposition ?? null;
  }

  if (request.disposition === undefined) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'disposition',
        code: 'disposition_required',
        message: 'Disposition is required when cancelling an in-transit transfer.',
      },
    ]);
  }

  if (request.disposition === 'lost_or_damaged' && request.reason === undefined) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'reason',
        code: 'variance_reason_required',
        message: 'Reason is required when cancelling lost or damaged in-transit stock.',
      },
    ]);
  }

  return request.disposition;
}

function assertLineHasReservation(
  line: InventoryTransferLineRecord,
): asserts line is InventoryTransferLineRecord & {
  readonly reservedQuantity: string;
  readonly reservationId: string;
} {
  if (line.reservedQuantity === null || line.reservationId === null) {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Inventory transfer line has no active reservation.',
      [
        {
          field: 'lines',
          code: 'transfer_line_reservation_missing',
          message: 'Every cancellable transfer line must have an active reservation.',
        },
      ],
    );
  }
}

function assertLineReadyForLoss(
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
          message: 'Every lost or damaged transfer line must have a sent quantity.',
        },
      ],
    );
  }
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
