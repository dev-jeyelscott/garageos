import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { assertBranchAccessAllowed } from '../../../shared/authorization/branch-access';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import type {
  ResolvedTenantContext,
  TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import { InventoryStockBalancesService } from '../../inventory/application/inventory-stock-balances.service';
import { ProductStore, type ProductRecord } from '../../products/application/product.store';
import type { ForceInventoryAdjustmentRequest } from '../api/inventory-adjustment.schemas';
import { InventoryAdjustmentValueImpactService } from './inventory-adjustment-value-impact.service';
import {
  addMoney,
  compareQuantity,
  subtractQuantity,
} from './inventory-adjustment-value-impact.service';
import { InventoryAdjustmentNumberService } from './inventory-adjustment-number.service';
import {
  INVENTORY_ADJUSTMENT_STATUSES,
  INVENTORY_ADJUSTMENT_TYPES,
  type InventoryAdjustmentType,
} from './inventory-adjustment.records';
import {
  InventoryAdjustmentStore,
  type CreateDraftAdjustmentLineInput,
} from './inventory-adjustment.store';
import { resolveInventoryAdjustmentActionAccess } from './inventory-adjustment-action-access';
import { PostInventoryAdjustmentService } from './post-inventory-adjustment.service';
import { type InventoryAdjustmentPostResponse } from './post-inventory-adjustment.service';

const IDEMPOTENCY_RETENTION_HOURS = 24;
const ZERO_MONEY = '0.00';
const ZERO_QUANTITY = '0.000';

interface PreparedForceLine {
  readonly id: string;
  readonly productId: string;
  readonly adjustmentType: InventoryAdjustmentType;
  readonly quantityDifference: string;
  readonly finalCountedQuantity: string | null;
  readonly unitCost: string | null;
  readonly estimatedFifoCost: string | null;
  readonly absoluteValueImpact: string;
}

@Injectable()
export class ForceInventoryAdjustmentService {
  constructor(
    @Inject(InventoryAdjustmentStore)
    private readonly inventoryAdjustmentStore: InventoryAdjustmentStore,
    @Inject(ProductStore)
    private readonly productStore: ProductStore,
    @Inject(InventoryStockBalancesService)
    private readonly stockBalancesService: InventoryStockBalancesService,
    @Inject(InventoryAdjustmentValueImpactService)
    private readonly valueImpactService: InventoryAdjustmentValueImpactService,
    @Inject(InventoryAdjustmentNumberService)
    private readonly numberService: InventoryAdjustmentNumberService,
    @Inject(PostInventoryAdjustmentService)
    private readonly postInventoryAdjustmentService: PostInventoryAdjustmentService,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async forceAdjust(
    request: ForceInventoryAdjustmentRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<InventoryAdjustmentPostResponse> {
    const { context } = await resolveInventoryAdjustmentActionAccess(
      session,
      this.productStore,
      'inventory.force_adjust',
    );

    assertBranchAccessAllowed({ context, branchId: request.branch_id });

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const now = new Date();
      const preparedLines = await this.prepareLines(context, request, transaction);
      const valueImpact = preparedLines.reduce(
        (total, line) => addMoney(total, line.absoluteValueImpact),
        ZERO_MONEY,
      );
      const adjustmentId = randomUUID();
      const adjustmentNumber = await this.numberService.allocateNumber(
        context.tenantId,
        now,
        transaction,
      );
      const adjustment = await this.inventoryAdjustmentStore.createDraftAdjustment(
        {
          id: adjustmentId,
          tenantId: context.tenantId,
          branchId: request.branch_id,
          adjustmentNumber,
          reason: request.reason.trim(),
          valueImpact,
          approvalRequired: false,
          requestedByUserId: context.actorUserId,
          createdAt: now,
        },
        transaction,
      );
      const lines = await this.inventoryAdjustmentStore.createDraftAdjustmentLines(
        {
          tenantId: context.tenantId,
          adjustmentId,
          lines: preparedLines.map(toCreateDraftAdjustmentLineInput),
        },
        transaction,
      );

      await this.inventoryAdjustmentStore.insertStatusEvent(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          adjustmentId,
          fromStatus: null,
          toStatus: INVENTORY_ADJUSTMENT_STATUSES.DRAFT,
          reason: request.reason.trim(),
          createdByUserId: context.actorUserId,
          createdAt: now,
        },
        transaction,
      );

      return this.postInventoryAdjustmentService.postLockedAdjustment({
        context,
        adjustment,
        lines,
        auditAction: 'inventory_adjustments.force_adjusted',
        auditReason: request.reason.trim(),
        auditMetadata: {
          force_adjustment: true,
          reason: request.reason.trim(),
        },
        transaction,
      });
    });
  }

  private async prepareLines(
    context: ResolvedTenantContext,
    request: ForceInventoryAdjustmentRequest,
    transaction: DatabaseQueryClient,
  ): Promise<readonly PreparedForceLine[]> {
    const preparedLines: PreparedForceLine[] = [];

    for (const [index, line] of request.lines.entries()) {
      const product = await this.productStore.findProductById(
        context.tenantId,
        line.product_id,
        transaction,
      );

      assertProductEligible(product, index);

      const stockSnapshot = await this.stockBalancesService.getAvailableStock(
        {
          tenantId: context.tenantId,
          branchId: request.branch_id,
          productId: line.product_id,
        },
        transaction,
      );
      const quantityDifference =
        line.final_counted_quantity === undefined
          ? (line.quantity_difference ?? ZERO_QUANTITY)
          : subtractQuantity(
              line.final_counted_quantity,
              stockSnapshot?.on_hand_qty ?? ZERO_QUANTITY,
            );

      if (compareQuantity(quantityDifference, ZERO_QUANTITY) === 0) {
        throw GarageOsApiException.validationFailed([
          {
            field: `lines.${index}.quantity_difference`,
            code: 'zero_quantity_difference',
            message: 'Force adjustment lines must change stock quantity.',
          },
        ]);
      }

      const impact = await this.valueImpactService.calculateLineImpact(
        {
          tenantId: context.tenantId,
          branchId: request.branch_id,
          productId: line.product_id,
          quantityDifference,
          unitCost: line.unit_cost ?? null,
          productDefaultCost: product.defaultCost,
        },
        transaction,
      );

      preparedLines.push({
        id: randomUUID(),
        productId: line.product_id,
        adjustmentType:
          line.final_counted_quantity === undefined
            ? toAdjustmentType(quantityDifference)
            : INVENTORY_ADJUSTMENT_TYPES.FINAL_COUNT,
        quantityDifference,
        finalCountedQuantity: line.final_counted_quantity ?? null,
        unitCost: line.unit_cost ?? null,
        estimatedFifoCost: impact.estimatedFifoCost,
        absoluteValueImpact: impact.valueImpact.replace(/^-/, ''),
      });
    }

    return preparedLines;
  }
}

function assertProductEligible(
  product: ProductRecord | null,
  index: number,
): asserts product is ProductRecord {
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
        message: 'Only active products can be force adjusted.',
      },
    ]);
  }
}

function toAdjustmentType(quantityDifference: string): InventoryAdjustmentType {
  return quantityDifference.startsWith('-')
    ? INVENTORY_ADJUSTMENT_TYPES.DECREASE
    : INVENTORY_ADJUSTMENT_TYPES.INCREASE;
}

function toCreateDraftAdjustmentLineInput(line: PreparedForceLine): CreateDraftAdjustmentLineInput {
  return {
    id: line.id,
    productId: line.productId,
    adjustmentType: line.adjustmentType,
    quantityDifference: line.quantityDifference,
    finalCountedQuantity: line.finalCountedQuantity,
    unitCost: line.unitCost,
    estimatedFifoCost: line.estimatedFifoCost,
  };
}
