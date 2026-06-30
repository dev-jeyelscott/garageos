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
import { BranchStore, type BranchSummaryRecord } from '../../branches/application/branch.store';
import { INVENTORY_TRANSACTION_TYPES } from '../../inventory/application/inventory-ledger.store';
import { InventoryReservationService } from '../../inventory/application/inventory-reservation.service';
import { ProductStore, type ProductRecord } from '../../products/application/product.store';
import {
  INVENTORY_TRANSFER_STATUSES,
  type InventoryTransferLineRecord,
} from './inventory-transfer.records';
import {
  toSubmitInventoryTransferResponse,
  type InventoryTransferReservationResponse,
  type InventoryTransferSubmitResponse,
} from './inventory-transfer-response.mapper';
import { InventoryTransferStore } from './inventory-transfer.store';

const IDEMPOTENCY_RETENTION_HOURS = 24;

@Injectable()
export class SubmitInventoryTransferService {
  constructor(
    @Inject(InventoryTransferStore)
    private readonly inventoryTransferStore: InventoryTransferStore,
    @Inject(ProductStore)
    private readonly productStore: ProductStore,
    @Inject(BranchStore)
    private readonly branchStore: BranchStore,
    private readonly inventoryReservationService: InventoryReservationService,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async submitDraft(
    transferId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<InventoryTransferSubmitResponse> {
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
    assertInventoryTransferCreatePermission(context, isShopOwner);

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

      if (transfer.status !== INVENTORY_TRANSFER_STATUSES.DRAFT) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Only draft inventory transfers can be submitted.',
          [
            {
              field: 'status',
              code: 'transfer_not_draft',
              message: 'Only draft inventory transfers can be submitted.',
            },
          ],
        );
      }

      assertDifferentBranches(transfer.sourceBranchId, transfer.destinationBranchId);
      await assertActiveTransferBranch(
        this.branchStore,
        context.tenantId,
        transfer.sourceBranchId,
        'source_branch_id',
        transaction,
      );
      await assertActiveTransferBranch(
        this.branchStore,
        context.tenantId,
        transfer.destinationBranchId,
        'destination_branch_id',
        transaction,
      );

      const lines = await this.inventoryTransferStore.listTransferLinesForUpdate(
        context.tenantId,
        transfer.id,
        transaction,
      );

      if (lines.length === 0) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Inventory transfer must have at least one line before submission.',
          [
            {
              field: 'lines',
              code: 'transfer_lines_required',
              message: 'Transfer lines are required.',
            },
          ],
        );
      }

      const reservations: InventoryTransferReservationResponse[] = [];

      for (const [index, line] of lines.entries()) {
        await assertProductEligible(this.productStore, context, line, index, transaction);

        const result = await this.inventoryReservationService.reserveInventoryInTransaction(
          {
            tenantId: context.tenantId,
            branchId: transfer.sourceBranchId,
            productId: line.productId,
            sourceType: 'inventory_transfer_line',
            sourceId: line.id,
            requestedQuantity: line.requestedQuantity,
            transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_TRANSFER_RESERVATION,
            reservedAt: now,
            createdByUserId: context.actorUserId,
          },
          transaction,
        );

        await this.inventoryTransferStore.updateTransferLineReservation(
          {
            tenantId: context.tenantId,
            lineId: line.id,
            reservedQuantity: line.requestedQuantity,
            reservationId: result.reservation.id,
          },
          transaction,
        );

        reservations.push({
          line_id: line.id,
          product_id: line.productId,
          reservation_id: result.reservation.id,
          reserved_quantity: result.reservation.reservedQuantity,
          ledger_entry_id: result.ledgerEntry.id,
        });
      }

      const submittedTransfer = await this.inventoryTransferStore.updateTransferStatus(
        {
          tenantId: context.tenantId,
          transferId: transfer.id,
          expectedStatus: INVENTORY_TRANSFER_STATUSES.DRAFT,
          nextStatus: INVENTORY_TRANSFER_STATUSES.PENDING,
          updatedAt: now,
        },
        transaction,
      );

      if (submittedTransfer === null) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Inventory transfer status changed before submission completed.',
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
          fromStatus: INVENTORY_TRANSFER_STATUSES.DRAFT,
          toStatus: INVENTORY_TRANSFER_STATUSES.PENDING,
          reason: null,
          createdByUserId: context.actorUserId,
          createdAt: now,
        },
        transaction,
      );

      return toSubmitInventoryTransferResponse(submittedTransfer, reservations);
    });
  }
}

async function assertActiveTransferBranch(
  branchStore: BranchStore,
  tenantId: string,
  branchId: string,
  field: 'source_branch_id' | 'destination_branch_id',
  client: Parameters<BranchStore['findBranchById']>[2],
): Promise<void> {
  const branch: BranchSummaryRecord | null = await branchStore.findBranchById(
    tenantId,
    branchId,
    client,
  );

  if (branch === null) {
    throw GarageOsApiException.resourceNotFound('Branch was not found.');
  }

  if (branch.status !== 'active') {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'branch_not_active',
        message:
          field === 'source_branch_id'
            ? 'Source branch must be active.'
            : 'Destination branch must be active.',
      },
    ]);
  }
}

function assertInventoryTransferCreatePermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes('inventory.transfer.create')) {
    throw GarageOsApiException.forbidden('inventory.transfer.create');
  }
}

function assertDifferentBranches(sourceBranchId: string, destinationBranchId: string): void {
  if (sourceBranchId === destinationBranchId) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'destination_branch_id',
        code: 'same_branch_transfer',
        message: 'Destination branch must be different from source branch.',
      },
    ]);
  }
}

async function assertProductEligible(
  productStore: ProductStore,
  context: ResolvedTenantContext,
  line: InventoryTransferLineRecord,
  index: number,
  client: Parameters<ProductStore['findProductById']>[2],
): Promise<void> {
  const product: ProductRecord | null = await productStore.findProductById(
    context.tenantId,
    line.productId,
    client,
  );

  if (product === null) {
    throw GarageOsApiException.validationFailed([
      {
        field: `lines.${index}.product_id`,
        code: 'product_not_found',
        message: 'Product was not found for this tenant.',
      },
    ]);
  }

  if (product.status !== 'active') {
    throw GarageOsApiException.validationFailed([
      {
        field: `lines.${index}.product_id`,
        code: 'product_not_active',
        message: 'Only active products can be transferred.',
      },
    ]);
  }
}
