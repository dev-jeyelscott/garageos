import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
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
import type { SendInventoryTransferRequest } from '../api/inventory-transfer.schemas';
import {
  INVENTORY_TRANSFER_STATUSES,
  type InventoryTransferLineRecord,
} from './inventory-transfer.records';
import {
  toSendInventoryTransferResponse,
  type InventoryTransferReservationReleaseResponse,
  type InventoryTransferSendResponse,
  type InventoryTransferSentLineResponse,
} from './inventory-transfer-response.mapper';
import { InventoryTransferStore } from './inventory-transfer.store';

const IDEMPOTENCY_RETENTION_HOURS = 24;

@Injectable()
export class SendInventoryTransferService {
  constructor(
    @Inject(InventoryTransferStore)
    private readonly inventoryTransferStore: InventoryTransferStore,
    @Inject(ProductStore)
    private readonly productStore: ProductStore,
    private readonly inventoryReservationService: InventoryReservationService,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async sendPending(
    transferId: string,
    request: SendInventoryTransferRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<InventoryTransferSendResponse> {
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
    assertInventoryTransferSendPermission(context, isShopOwner);

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

      if (transfer.status !== INVENTORY_TRANSFER_STATUSES.PENDING) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Only pending inventory transfers can be sent.',
          [
            {
              field: 'status',
              code: 'transfer_not_pending',
              message: 'Only pending inventory transfers can be sent.',
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
      const sentLines: InventoryTransferSentLineResponse[] = [];
      const releasedReservations: InventoryTransferReservationReleaseResponse[] = [];

      for (const persistedLine of persistedLines) {
        const requestedLine = requestedLines.get(persistedLine.id);

        if (requestedLine === undefined) {
          throw GarageOsApiException.validationFailed([
            {
              field: 'lines',
              code: 'transfer_line_missing',
              message: 'Sent quantity is required for every transfer line.',
            },
          ]);
        }

        assertLineReservationReady(persistedLine);
        assertSentQuantityAllowed(persistedLine, requestedLine.sent_quantity);
        await this.inventoryReservationService.assertActiveReservationInTransaction(
          {
            tenantId: context.tenantId,
            reservationId: persistedLine.reservationId,
          },
          transaction,
        );

        const releaseQuantity = subtractQuantities(
          persistedLine.reservedQuantity,
          requestedLine.sent_quantity,
        );

        if (!isZeroQuantity(releaseQuantity)) {
          const releaseResult =
            await this.inventoryReservationService.releaseInventoryInTransaction(
              {
                tenantId: context.tenantId,
                reservationId: persistedLine.reservationId,
                releaseQuantity,
                transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_RESERVATION_RELEASE,
                releasedAt: now,
                releasedByUserId: context.actorUserId,
              },
              transaction,
            );

          releasedReservations.push({
            line_id: persistedLine.id,
            product_id: persistedLine.productId,
            reservation_id: releaseResult.reservation.id,
            released_quantity: releaseQuantity,
            ledger_entry_id: releaseResult.ledgerEntry.id,
          });
        }

        await this.inventoryTransferStore.updateTransferLineSentQuantity(
          {
            tenantId: context.tenantId,
            lineId: persistedLine.id,
            sentQuantity: requestedLine.sent_quantity,
          },
          transaction,
        );

        sentLines.push({
          line_id: persistedLine.id,
          product_id: persistedLine.productId,
          sent_quantity: requestedLine.sent_quantity,
        });
      }

      const sentTransfer = await this.inventoryTransferStore.updateTransferStatusToInTransit(
        {
          tenantId: context.tenantId,
          transferId: transfer.id,
          expectedStatus: INVENTORY_TRANSFER_STATUSES.PENDING,
          sentByUserId: context.actorUserId,
          sentAt: now,
        },
        transaction,
      );

      if (sentTransfer === null) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Inventory transfer status changed before send completed.',
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
          fromStatus: INVENTORY_TRANSFER_STATUSES.PENDING,
          toStatus: INVENTORY_TRANSFER_STATUSES.IN_TRANSIT,
          reason: null,
          createdByUserId: context.actorUserId,
          createdAt: now,
        },
        transaction,
      );

      return toSendInventoryTransferResponse(sentTransfer, sentLines, releasedReservations);
    });
  }
}

function assertInventoryTransferSendPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes('inventory.transfer.send')) {
    throw GarageOsApiException.forbidden('inventory.transfer.send');
  }
}

function matchRequestedLines(
  request: SendInventoryTransferRequest,
  persistedLines: readonly InventoryTransferLineRecord[],
): Map<string, SendInventoryTransferRequest['lines'][number]> {
  const persistedLineIds = new Set(persistedLines.map((line) => line.id));
  const requestedLines = new Map<string, SendInventoryTransferRequest['lines'][number]>();

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
        message: 'Sent quantity is required for every transfer line.',
      },
    ]);
  }

  return requestedLines;
}

function assertLineReservationReady(
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
          message: 'Every transfer line must have an active reservation before send.',
        },
      ],
    );
  }
}

function assertSentQuantityAllowed(
  line: InventoryTransferLineRecord & { readonly reservedQuantity: string },
  sentQuantity: string,
): void {
  if (compareQuantities(sentQuantity, line.reservedQuantity) > 0) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'lines.sent_quantity',
        code: 'sent_quantity_exceeds_reserved',
        message: 'Sent quantity cannot exceed reserved quantity.',
      },
    ]);
  }
}

function subtractQuantities(left: string, right: string): string {
  return formatQuantityUnits(parseQuantityUnits(left) - parseQuantityUnits(right));
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
