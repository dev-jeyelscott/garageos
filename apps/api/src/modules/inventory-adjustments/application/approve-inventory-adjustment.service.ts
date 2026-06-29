import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { assertBranchAccessAllowed } from '../../../shared/authorization/branch-access';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import { ProductStore } from '../../products/application/product.store';
import type { ApproveInventoryAdjustmentRequest } from '../api/inventory-adjustment-action.schemas';
import { INVENTORY_ADJUSTMENT_STATUSES } from './inventory-adjustment.records';
import {
  type InventoryAdjustmentStatusResponse,
  toInventoryAdjustmentStatusResponse,
} from './inventory-adjustment-status-response.mapper';
import { assertCanApprove } from './inventory-adjustment-state-machine';
import { InventoryAdjustmentStore } from './inventory-adjustment.store';
import { resolveInventoryAdjustmentActionAccess } from './inventory-adjustment-action-access';

const IDEMPOTENCY_RETENTION_HOURS = 24;

@Injectable()
export class ApproveInventoryAdjustmentService {
  constructor(
    @Inject(InventoryAdjustmentStore)
    private readonly inventoryAdjustmentStore: InventoryAdjustmentStore,
    @Inject(ProductStore)
    private readonly productStore: ProductStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async approve(
    adjustmentId: string,
    request: ApproveInventoryAdjustmentRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<InventoryAdjustmentStatusResponse> {
    const { context } = await resolveInventoryAdjustmentActionAccess(
      session,
      this.productStore,
      'inventory.adjust.approve',
    );

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const locked = await this.inventoryAdjustmentStore.lockAdjustmentWithLinesForUpdate(
        { tenantId: context.tenantId, adjustmentId },
        transaction,
      );

      if (locked === null) {
        throw GarageOsApiException.resourceNotFound('Inventory adjustment was not found.');
      }

      assertBranchAccessAllowed({ context, branchId: locked.adjustment.branchId });
      assertCanApprove(locked.adjustment);

      const now = new Date();
      const updated = await this.inventoryAdjustmentStore.markAdjustmentApproved(
        {
          tenantId: context.tenantId,
          adjustmentId,
          approvedByUserId: context.actorUserId,
          updatedAt: now,
        },
        transaction,
      );

      if (updated === null) {
        throw GarageOsApiException.workflowTransitionBlocked();
      }

      await this.inventoryAdjustmentStore.insertStatusEvent(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          adjustmentId,
          fromStatus: INVENTORY_ADJUSTMENT_STATUSES.PENDING_APPROVAL,
          toStatus: INVENTORY_ADJUSTMENT_STATUSES.APPROVED,
          reason: request.reason?.trim() || null,
          createdByUserId: context.actorUserId,
          createdAt: now,
        },
        transaction,
      );

      return toInventoryAdjustmentStatusResponse(updated, locked.lines);
    });
  }
}
