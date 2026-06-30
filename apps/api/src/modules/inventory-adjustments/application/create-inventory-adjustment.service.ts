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
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import { InventoryStockBalancesService } from '../../inventory/application/inventory-stock-balances.service';
import { ProductStore, type ProductRecord } from '../../products/application/product.store';
import type { CreateInventoryAdjustmentRequest } from '../api/inventory-adjustment.schemas';
import {
  INVENTORY_ADJUSTMENT_STATUSES,
  INVENTORY_ADJUSTMENT_TYPES,
  type InventoryAdjustmentType,
} from './inventory-adjustment.records';
import type { InventoryAdjustmentApprovalPolicy } from './inventory-adjustment-approval-policy';
import { InventoryAdjustmentNumberService } from './inventory-adjustment-number.service';
import { InventoryAdjustmentValueImpactService } from './inventory-adjustment-value-impact.service';
import {
  addMoney,
  compareQuantity,
  subtractQuantity,
} from './inventory-adjustment-value-impact.service';
import {
  type ApiInventoryAdjustmentType,
  type InventoryAdjustmentCreateResponse,
  type InventoryAdjustmentLineResponse,
  toCreateInventoryAdjustmentResponse,
} from './inventory-adjustment-response.mapper';
import { InventoryAdjustmentStore } from './inventory-adjustment.store';

const IDEMPOTENCY_RETENTION_HOURS = 24;
const ZERO_MONEY = '0.00';
const ZERO_QUANTITY = '0.000';

interface PreparedLine {
  readonly id: string;
  readonly productId: string;
  readonly apiAdjustmentType: ApiInventoryAdjustmentType;
  readonly persistenceAdjustmentType: InventoryAdjustmentType;
  readonly quantityDifference: string;
  readonly finalCountedQuantity: string | null;
  readonly unitCost: string | null;
  readonly estimatedFifoCost: string | null;
  readonly absoluteValueImpact: string;
  readonly stockSnapshot: StockSnapshot;
}

interface StockSnapshot {
  readonly onHandQuantity: string;
  readonly reservedQuantity: string;
  readonly availableQuantity: string;
}

@Injectable()
export class CreateInventoryAdjustmentService {
  constructor(
    @Inject(InventoryAdjustmentStore)
    private readonly inventoryAdjustmentStore: InventoryAdjustmentStore,
    @Inject(ProductStore)
    private readonly productStore: ProductStore,
    private readonly stockBalancesService: InventoryStockBalancesService,
    private readonly valueImpactService: InventoryAdjustmentValueImpactService,
    private readonly approvalPolicy: InventoryAdjustmentApprovalPolicy,
    private readonly numberService: InventoryAdjustmentNumberService,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async createDraft(
    request: CreateInventoryAdjustmentRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<InventoryAdjustmentCreateResponse> {
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
    assertInventoryAdjustPermission(context, isShopOwner);
    assertBranchAccessAllowed({ context, branchId: request.branch_id });

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const now = new Date();
      const preparedLines = await this.prepareLines(context, request, transaction);
      const valueImpact = preparedLines.reduce(
        (total, line) => addMoney(total, line.absoluteValueImpact),
        ZERO_MONEY,
      );
      const approvalRequired = await this.approvalPolicy.isApprovalRequired(
        context.tenantId,
        valueImpact,
        transaction,
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
          approvalRequired,
          requestedByUserId: context.actorUserId,
          createdAt: now,
        },
        transaction,
      );
      const createdLines = await this.inventoryAdjustmentStore.createDraftAdjustmentLines(
        {
          tenantId: context.tenantId,
          adjustmentId,
          lines: preparedLines.map((line) => ({
            id: line.id,
            productId: line.productId,
            adjustmentType: line.persistenceAdjustmentType,
            quantityDifference: line.quantityDifference,
            finalCountedQuantity: line.finalCountedQuantity,
            unitCost: line.unitCost,
            estimatedFifoCost: line.estimatedFifoCost,
          })),
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
          reason: null,
          createdByUserId: context.actorUserId,
          createdAt: now,
        },
        transaction,
      );

      return toCreateInventoryAdjustmentResponse(
        adjustment,
        createdLines.map((line) => {
          const preparedLine = preparedLines.find((prepared) => prepared.id === line.id);

          if (preparedLine === undefined) {
            throw new Error('Created inventory adjustment line was not prepared.');
          }

          return toLineResponse(preparedLine);
        }),
      );
    });
  }

  private async prepareLines(
    context: ResolvedTenantContext,
    request: CreateInventoryAdjustmentRequest,
    transaction: DatabaseQueryClient,
  ): Promise<readonly PreparedLine[]> {
    const preparedLines: PreparedLine[] = [];

    for (const [index, line] of request.lines.entries()) {
      const product = await this.productStore.findProductById(
        context.tenantId,
        line.product_id,
        transaction,
      );

      assertProductEligible(product, index);

      const stockSnapshot = await this.getStockSnapshot(
        context.tenantId,
        request.branch_id,
        line.product_id,
        transaction,
      );
      const quantityDifference =
        line.adjustment_type === 'final_counted_quantity'
          ? subtractQuantity(
              line.final_counted_quantity ?? ZERO_QUANTITY,
              stockSnapshot.onHandQuantity,
            )
          : (line.quantity_difference ?? ZERO_QUANTITY);

      if (compareQuantity(quantityDifference, ZERO_QUANTITY) === 0) {
        throw GarageOsApiException.validationFailed([
          {
            field: `lines.${index}.quantity_difference`,
            code: 'zero_quantity_difference',
            message: 'Quantity difference cannot be zero.',
          },
        ]);
      }

      if (
        compareQuantity(quantityDifference, ZERO_QUANTITY) < 0 &&
        compareQuantity(stockSnapshot.availableQuantity, quantityDifference.slice(1)) < 0
      ) {
        throw GarageOsApiException.inventoryInsufficientAvailableStock([
          {
            field: `lines.${index}.quantity_difference`,
            code: 'insufficient_available_stock',
            message: 'Negative adjustment exceeds available stock at request time.',
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
        apiAdjustmentType: line.adjustment_type,
        persistenceAdjustmentType: toPersistenceAdjustmentType(line.adjustment_type),
        quantityDifference,
        finalCountedQuantity: line.final_counted_quantity ?? null,
        unitCost: line.unit_cost ?? null,
        estimatedFifoCost: impact.estimatedFifoCost,
        absoluteValueImpact: impact.valueImpact.replace(/^-/, ''),
        stockSnapshot,
      });
    }

    return preparedLines;
  }

  private async getStockSnapshot(
    tenantId: string,
    branchId: string,
    productId: string,
    transaction: DatabaseQueryClient,
  ): Promise<StockSnapshot> {
    const snapshot = await this.stockBalancesService.getAvailableStock(
      {
        tenantId,
        branchId,
        productId,
      },
      transaction,
    );

    return snapshot === null
      ? {
          onHandQuantity: ZERO_QUANTITY,
          reservedQuantity: ZERO_QUANTITY,
          availableQuantity: ZERO_QUANTITY,
        }
      : {
          onHandQuantity: snapshot.on_hand_qty,
          reservedQuantity: snapshot.reserved_qty,
          availableQuantity: snapshot.available_qty,
        };
  }
}

function assertInventoryAdjustPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes('inventory.adjust')) {
    throw GarageOsApiException.forbidden('inventory.adjust');
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
        message: 'Only active products can be adjusted.',
      },
    ]);
  }
}

function toPersistenceAdjustmentType(
  adjustmentType: ApiInventoryAdjustmentType,
): InventoryAdjustmentType {
  if (adjustmentType === 'positive_adjustment') {
    return INVENTORY_ADJUSTMENT_TYPES.INCREASE;
  }

  if (adjustmentType === 'negative_adjustment') {
    return INVENTORY_ADJUSTMENT_TYPES.DECREASE;
  }

  return INVENTORY_ADJUSTMENT_TYPES.FINAL_COUNT;
}

function toLineResponse(line: PreparedLine): InventoryAdjustmentLineResponse {
  return {
    id: line.id,
    product_id: line.productId,
    adjustment_type: line.apiAdjustmentType,
    quantity_difference: line.quantityDifference,
    final_counted_quantity: line.finalCountedQuantity,
    unit_cost: line.unitCost,
    estimated_fifo_cost: line.estimatedFifoCost,
    stock_snapshot: {
      on_hand_quantity: line.stockSnapshot.onHandQuantity,
      reserved_quantity: line.stockSnapshot.reservedQuantity,
      available_quantity: line.stockSnapshot.availableQuantity,
    },
  };
}
