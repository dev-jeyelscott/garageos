import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { assertBranchAccessAllowed } from '../../../shared/authorization/branch-access';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import type { TenantContextAuthenticatedSession } from '../../../shared/tenant-context/tenant-context';
import { FifoConsumptionService } from '../../inventory/application/fifo-consumption.service';
import { type CreateFifoConsumptionCommand } from '../../inventory/application/fifo-consumption.service';
import type { FifoConsumptionRecord } from '../../inventory/application/fifo-consumption.store';
import { FifoLayerService } from '../../inventory/application/fifo-layer.service';
import type { FifoLayerAllocationCandidateRecord } from '../../inventory/application/fifo-layer.store';
import { InventoryStockBalancesService } from '../../inventory/application/inventory-stock-balances.service';
import { type StockAvailabilitySnapshot } from '../../inventory/application/inventory-stock-balances.service';
import { InventoryLedgerService } from '../../inventory/application/inventory-ledger.service';
import {
  INVENTORY_TRANSACTION_TYPES,
  type InventoryLedgerEntryRecord,
} from '../../inventory/application/inventory-ledger.store';
import { ProductStore, type ProductRecord } from '../../products/application/product.store';
import {
  absQuantity,
  compareQuantity,
  subtractQuantity,
} from './inventory-adjustment-value-impact.service';
import {
  INVENTORY_ADJUSTMENT_STATUSES,
  INVENTORY_ADJUSTMENT_TYPES,
  type InventoryAdjustmentLineRecord,
  type InventoryAdjustmentRecord,
} from './inventory-adjustment.records';
import {
  type InventoryAdjustmentStatusResponse,
  toInventoryAdjustmentStatusResponse,
} from './inventory-adjustment-status-response.mapper';
import { assertCanPost } from './inventory-adjustment-state-machine';
import { InventoryAdjustmentStore } from './inventory-adjustment.store';
import { resolveInventoryAdjustmentActionAccess } from './inventory-adjustment-action-access';

const IDEMPOTENCY_RETENTION_HOURS = 24;
const SOURCE_TYPE = 'inventory_adjustment';
const ZERO_QUANTITY = '0.000';

export interface InventoryAdjustmentPostLineResult {
  readonly line_id: string;
  readonly product_id: string;
  readonly adjustment_type: 'positive_adjustment' | 'negative_adjustment';
  readonly quantity_delta: string;
  readonly unit_cost: string | null;
  readonly total_cost: string;
  readonly stock_availability: StockAvailabilitySnapshot;
  readonly ledger_entry_id: string;
  readonly fifo_layer_id: string | null;
  readonly fifo_consumptions: readonly {
    readonly fifo_layer_id: string;
    readonly quantity_consumed: string;
    readonly unit_cost: string;
    readonly total_cost: string;
  }[];
}

export interface InventoryAdjustmentPostResponse extends InventoryAdjustmentStatusResponse {
  readonly line_results: readonly InventoryAdjustmentPostLineResult[];
}

interface PostLockedAdjustmentInput {
  readonly context: Awaited<ReturnType<typeof resolveInventoryAdjustmentActionAccess>>['context'];
  readonly adjustment: InventoryAdjustmentRecord;
  readonly lines: readonly InventoryAdjustmentLineRecord[];
  readonly auditAction?: string;
  readonly auditReason?: string;
  readonly auditMetadata?: Record<string, unknown>;
  readonly transaction: DatabaseQueryClient;
}

@Injectable()
export class PostInventoryAdjustmentService {
  constructor(
    @Inject(InventoryAdjustmentStore)
    private readonly inventoryAdjustmentStore: InventoryAdjustmentStore,
    @Inject(ProductStore)
    private readonly productStore: ProductStore,
    @Inject(InventoryStockBalancesService)
    private readonly stockBalancesService: InventoryStockBalancesService,
    @Inject(FifoLayerService)
    private readonly fifoLayerService: FifoLayerService,
    @Inject(FifoConsumptionService)
    private readonly fifoConsumptionService: FifoConsumptionService,
    @Inject(InventoryLedgerService)
    private readonly inventoryLedgerService: InventoryLedgerService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async post(
    adjustmentId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<InventoryAdjustmentPostResponse> {
    const { context } = await resolveInventoryAdjustmentActionAccess(
      session,
      this.productStore,
      'inventory.adjust',
    );

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const locked = await this.inventoryAdjustmentStore.lockAdjustmentWithLinesForPosting(
        { tenantId: context.tenantId, adjustmentId },
        transaction,
      );

      if (locked === null) {
        const existing = await this.inventoryAdjustmentStore.findAdjustmentWithLines(
          { tenantId: context.tenantId, adjustmentId },
          transaction,
        );

        if (existing !== null) {
          assertBranchAccessAllowed({ context, branchId: existing.adjustment.branchId });
          assertCanPost(existing.adjustment);
        }

        throw GarageOsApiException.resourceNotFound('Inventory adjustment was not found.');
      }

      return this.postLockedAdjustment({
        context,
        adjustment: locked.adjustment,
        lines: locked.lines,
        transaction,
      });
    });
  }

  async postLockedAdjustment(
    input: PostLockedAdjustmentInput,
  ): Promise<InventoryAdjustmentPostResponse> {
    assertBranchAccessAllowed({ context: input.context, branchId: input.adjustment.branchId });
    assertCanPost(input.adjustment);
    assertHasLines(input.lines);

    const postedAt = new Date();
    const lineResults: InventoryAdjustmentPostLineResult[] = [];
    const productCache = new Map<string, ProductRecord>();

    for (const line of input.lines) {
      const product = await this.getProduct(
        input.context.tenantId,
        line.productId,
        productCache,
        input.transaction,
      );
      const quantityDelta = await this.resolvePostingQuantityDelta(
        input.adjustment,
        line,
        input.transaction,
      );

      if (compareQuantity(quantityDelta, ZERO_QUANTITY) === 0) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Inventory adjustment line has no stock effect at posting time.',
          [
            {
              field: 'lines.quantity_difference',
              code: 'zero_posting_quantity_delta',
              message: 'Posting a zero-quantity adjustment is not allowed.',
            },
          ],
        );
      }

      if (compareQuantity(quantityDelta, ZERO_QUANTITY) > 0) {
        lineResults.push(
          await this.postPositiveLine({
            adjustment: input.adjustment,
            line,
            quantityDelta,
            unitCost: line.unitCost ?? product.defaultCost,
            postedAt,
            actorUserId: input.context.actorUserId,
            transaction: input.transaction,
          }),
        );
      } else {
        lineResults.push(
          await this.postNegativeLine({
            adjustment: input.adjustment,
            line,
            quantity: absQuantity(quantityDelta),
            postedAt,
            actorUserId: input.context.actorUserId,
            transaction: input.transaction,
          }),
        );
      }
    }

    const posted = await this.inventoryAdjustmentStore.markAdjustmentPosted(
      {
        tenantId: input.context.tenantId,
        adjustmentId: input.adjustment.id,
        postedAt,
      },
      input.transaction,
    );

    if (posted === null) {
      throw GarageOsApiException.workflowTransitionBlocked();
    }

    await this.inventoryAdjustmentStore.insertStatusEvent(
      {
        id: randomUUID(),
        tenantId: input.context.tenantId,
        adjustmentId: input.adjustment.id,
        fromStatus: input.adjustment.status,
        toStatus: INVENTORY_ADJUSTMENT_STATUSES.POSTED,
        reason: null,
        createdByUserId: input.context.actorUserId,
        createdAt: postedAt,
      },
      input.transaction,
    );

    await this.auditService.record({
      tenantId: input.context.tenantId,
      actorUserId: input.context.actorUserId,
      actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
      supportAccessSessionId: input.context.platformSupportAccessSessionId,
      action: input.auditAction ?? 'inventory_adjustments.posted',
      entityType: 'inventory_adjustment',
      entityId: posted.id,
      branchId: posted.branchId,
      beforeJson: toAuditAdjustmentSnapshot(input.adjustment),
      afterJson: toAuditAdjustmentSnapshot(posted),
      metadataJson: {
        ...(input.auditMetadata ?? {}),
        line_results: lineResults,
      },
      reason: input.auditReason ?? 'inventory_adjustment_posted',
      client: input.transaction,
    });

    return {
      ...toInventoryAdjustmentStatusResponse(posted, input.lines),
      line_results: lineResults,
    };
  }

  private async getProduct(
    tenantId: string,
    productId: string,
    cache: Map<string, ProductRecord>,
    transaction: DatabaseQueryClient,
  ): Promise<ProductRecord> {
    const cached = cache.get(productId);

    if (cached !== undefined) {
      return cached;
    }

    const product = await this.productStore.findProductById(tenantId, productId, transaction);

    if (product === null) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'lines.product_id',
          code: 'product_not_found',
          message: 'Product was not found for this tenant.',
        },
      ]);
    }

    cache.set(productId, product);
    return product;
  }

  private async resolvePostingQuantityDelta(
    adjustment: InventoryAdjustmentRecord,
    line: InventoryAdjustmentLineRecord,
    transaction: DatabaseQueryClient,
  ): Promise<string> {
    if (line.adjustmentType === INVENTORY_ADJUSTMENT_TYPES.INCREASE) {
      return requireQuantityDifference(line);
    }

    if (line.adjustmentType === INVENTORY_ADJUSTMENT_TYPES.DECREASE) {
      return requireQuantityDifference(line);
    }

    const finalCountedQuantity = line.finalCountedQuantity;

    if (finalCountedQuantity === null) {
      throw invalidPersistedAdjustmentLine('final_counted_quantity');
    }

    const stockSnapshot = await this.stockBalancesService.lockAvailableStockForUpdate(
      {
        tenantId: adjustment.tenantId,
        branchId: adjustment.branchId,
        productId: line.productId,
      },
      transaction,
    );

    return subtractQuantity(finalCountedQuantity, stockSnapshot?.on_hand_qty ?? ZERO_QUANTITY);
  }

  private async postPositiveLine(input: {
    readonly adjustment: InventoryAdjustmentRecord;
    readonly line: InventoryAdjustmentLineRecord;
    readonly quantityDelta: string;
    readonly unitCost: string;
    readonly postedAt: Date;
    readonly actorUserId: string;
    readonly transaction: DatabaseQueryClient;
  }): Promise<InventoryAdjustmentPostLineResult> {
    const stockAvailability = await this.stockBalancesService.incrementOnHandStock(
      {
        tenantId: input.adjustment.tenantId,
        branchId: input.adjustment.branchId,
        productId: input.line.productId,
        quantityReceived: input.quantityDelta,
      },
      input.transaction,
    );
    const fifoLayer = await this.fifoLayerService.createLayer(
      {
        tenantId: input.adjustment.tenantId,
        branchId: input.adjustment.branchId,
        productId: input.line.productId,
        quantityReceived: input.quantityDelta,
        unitCost: input.unitCost,
        sourceTransactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_ADJUSTMENT_INCREASE,
        sourceTransactionId: input.adjustment.id,
        receivedAt: input.postedAt,
        originalSourceLayerId: null,
      },
      input.transaction,
    );
    const totalCost = multiplyQuantityByMoney(input.quantityDelta, input.unitCost);
    const ledgerEntry = await this.inventoryLedgerService.recordLedgerEntry(
      {
        tenantId: input.adjustment.tenantId,
        branchId: input.adjustment.branchId,
        productId: input.line.productId,
        transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_ADJUSTMENT_INCREASE,
        quantityDeltaOnHand: input.quantityDelta,
        quantityDeltaReserved: ZERO_QUANTITY,
        unitCost: input.unitCost,
        totalCost,
        sourceType: SOURCE_TYPE,
        sourceId: input.adjustment.id,
        occurredAt: input.postedAt,
        createdByUserId: input.actorUserId,
      },
      input.transaction,
    );

    return toLineResult({
      line: input.line,
      adjustmentType: 'positive_adjustment',
      quantityDelta: input.quantityDelta,
      unitCost: input.unitCost,
      totalCost,
      stockAvailability,
      ledgerEntry,
      fifoLayerId: fifoLayer.id,
      fifoConsumptions: [],
    });
  }

  private async postNegativeLine(input: {
    readonly adjustment: InventoryAdjustmentRecord;
    readonly line: InventoryAdjustmentLineRecord;
    readonly quantity: string;
    readonly postedAt: Date;
    readonly actorUserId: string;
    readonly transaction: DatabaseQueryClient;
  }): Promise<InventoryAdjustmentPostLineResult> {
    await this.stockBalancesService.assertSufficientAvailableStock(
      {
        tenantId: input.adjustment.tenantId,
        branchId: input.adjustment.branchId,
        productId: input.line.productId,
        requestedQuantity: input.quantity,
      },
      input.transaction,
    );

    const candidates = await this.fifoLayerService.lockOpenLayersForAllocation(
      {
        tenantId: input.adjustment.tenantId,
        branchId: input.adjustment.branchId,
        productId: input.line.productId,
      },
      input.transaction,
    );
    const consumptionCommands = buildFifoConsumptionCommands({
      tenantId: input.adjustment.tenantId,
      branchId: input.adjustment.branchId,
      productId: input.line.productId,
      adjustmentId: input.adjustment.id,
      quantity: input.quantity,
      consumedAt: input.postedAt,
      candidates,
    });

    for (const consumption of consumptionCommands) {
      const decrementedLayer = await this.fifoLayerService.decrementRemainingQuantity(
        {
          tenantId: input.adjustment.tenantId,
          fifoLayerId: consumption.fifoLayerId,
          quantityConsumed: consumption.quantityConsumed,
        },
        input.transaction,
      );

      if (decrementedLayer === null) {
        throw GarageOsApiException.fifoAllocationConflict([
          {
            field: 'lines.product_id',
            code: 'fifo_layer_consumption_conflict',
            message: 'FIFO layer quantity could not be decremented for adjustment posting.',
          },
        ]);
      }
    }

    const fifoConsumptions = await this.fifoConsumptionService.createConsumptions(
      consumptionCommands,
      input.transaction,
    );
    const stockAvailability = await this.stockBalancesService.decrementOnHandStock(
      {
        tenantId: input.adjustment.tenantId,
        branchId: input.adjustment.branchId,
        productId: input.line.productId,
        quantityConsumed: input.quantity,
      },
      input.transaction,
    );
    const totalCost = sumMoneyAmounts(
      consumptionCommands.map((consumption) => consumption.totalCost),
    );
    const ledgerEntry = await this.inventoryLedgerService.recordLedgerEntry(
      {
        tenantId: input.adjustment.tenantId,
        branchId: input.adjustment.branchId,
        productId: input.line.productId,
        transactionType: INVENTORY_TRANSACTION_TYPES.INVENTORY_ADJUSTMENT_DECREASE,
        quantityDeltaOnHand: `-${input.quantity}`,
        quantityDeltaReserved: ZERO_QUANTITY,
        unitCost: null,
        totalCost,
        sourceType: SOURCE_TYPE,
        sourceId: input.adjustment.id,
        occurredAt: input.postedAt,
        createdByUserId: input.actorUserId,
      },
      input.transaction,
    );

    return toLineResult({
      line: input.line,
      adjustmentType: 'negative_adjustment',
      quantityDelta: `-${input.quantity}`,
      unitCost: null,
      totalCost,
      stockAvailability,
      ledgerEntry,
      fifoLayerId: null,
      fifoConsumptions,
    });
  }
}

function assertHasLines(lines: readonly InventoryAdjustmentLineRecord[]): void {
  if (lines.length > 0) {
    return;
  }

  throw GarageOsApiException.validationFailed([
    {
      field: 'lines',
      code: 'at_least_one_line_required',
      message: 'At least one adjustment line is required for posting.',
    },
  ]);
}

function requireQuantityDifference(line: InventoryAdjustmentLineRecord): string {
  if (line.quantityDifference !== null) {
    return line.quantityDifference;
  }

  throw invalidPersistedAdjustmentLine('quantity_difference');
}

function invalidPersistedAdjustmentLine(field: string): GarageOsApiException {
  return GarageOsApiException.validationFailed([
    {
      field: `lines.${field}`,
      code: 'invalid_persisted_adjustment_line',
      message: 'Inventory adjustment line is missing required persisted posting data.',
    },
  ]);
}

function buildFifoConsumptionCommands(input: {
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly adjustmentId: string;
  readonly quantity: string;
  readonly consumedAt: Date;
  readonly candidates: readonly FifoLayerAllocationCandidateRecord[];
}): readonly CreateFifoConsumptionCommand[] {
  let remainingQuantityUnits = parseQuantityUnits(input.quantity);
  const consumptions: CreateFifoConsumptionCommand[] = [];

  for (const candidate of input.candidates) {
    if (remainingQuantityUnits === 0n) {
      break;
    }

    const allocatableQuantityUnits = parseQuantityUnits(candidate.allocatableQuantity);
    const consumedQuantityUnits =
      allocatableQuantityUnits < remainingQuantityUnits
        ? allocatableQuantityUnits
        : remainingQuantityUnits;

    if (consumedQuantityUnits <= 0n) {
      continue;
    }

    const quantityConsumed = formatQuantityUnits(consumedQuantityUnits);

    consumptions.push({
      tenantId: input.tenantId,
      branchId: input.branchId,
      productId: input.productId,
      fifoLayerId: candidate.id,
      quantityConsumed,
      unitCost: candidate.unitCost,
      totalCost: multiplyQuantityByMoney(quantityConsumed, candidate.unitCost),
      sourceType: SOURCE_TYPE,
      sourceId: input.adjustmentId,
      consumedAt: input.consumedAt,
    });

    remainingQuantityUnits -= consumedQuantityUnits;
  }

  if (remainingQuantityUnits > 0n) {
    throw GarageOsApiException.fifoAllocationConflict([
      {
        field: 'lines.product_id',
        code: 'insufficient_fifo_allocatable_quantity',
        message: 'Requested adjustment quantity exceeds FIFO allocatable quantity.',
      },
    ]);
  }

  return consumptions;
}

function toLineResult(input: {
  readonly line: InventoryAdjustmentLineRecord;
  readonly adjustmentType: 'positive_adjustment' | 'negative_adjustment';
  readonly quantityDelta: string;
  readonly unitCost: string | null;
  readonly totalCost: string;
  readonly stockAvailability: StockAvailabilitySnapshot;
  readonly ledgerEntry: InventoryLedgerEntryRecord;
  readonly fifoLayerId: string | null;
  readonly fifoConsumptions: readonly FifoConsumptionRecord[];
}): InventoryAdjustmentPostLineResult {
  return {
    line_id: input.line.id,
    product_id: input.line.productId,
    adjustment_type: input.adjustmentType,
    quantity_delta: input.quantityDelta,
    unit_cost: input.unitCost,
    total_cost: input.totalCost,
    stock_availability: input.stockAvailability,
    ledger_entry_id: input.ledgerEntry.id,
    fifo_layer_id: input.fifoLayerId,
    fifo_consumptions: input.fifoConsumptions.map((consumption) => ({
      fifo_layer_id: consumption.fifoLayerId,
      quantity_consumed: consumption.quantityConsumed,
      unit_cost: consumption.unitCost,
      total_cost: consumption.totalCost,
    })),
  };
}

function toAuditAdjustmentSnapshot(adjustment: InventoryAdjustmentRecord): Record<string, unknown> {
  return {
    id: adjustment.id,
    branch_id: adjustment.branchId,
    adjustment_number: adjustment.adjustmentNumber,
    status: adjustment.status,
    value_impact: adjustment.valueImpact,
    approval_required: adjustment.approvalRequired,
    posted_at: adjustment.postedAt?.toISOString() ?? null,
    lock_version: adjustment.lockVersion,
  };
}

function parseQuantityUnits(value: string): bigint {
  const isNegative = value.startsWith('-');
  const unsignedValue = isNegative ? value.slice(1) : value;
  const [wholePart = '0', decimalPart = ''] = unsignedValue.split('.');
  const units = BigInt(wholePart) * 1000n + BigInt(decimalPart.padEnd(3, '0'));

  return isNegative ? -units : units;
}

function parseMoneyCents(value: string): bigint {
  const [wholePart = '0', decimalPart = ''] = value.split('.');
  return BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, '0'));
}

function multiplyQuantityByMoney(quantity: string, money: string): string {
  const quantityUnits = parseQuantityUnits(quantity);
  const moneyCents = parseMoneyCents(money);
  const totalCents = (quantityUnits * moneyCents + 500n) / 1000n;

  return formatMoneyCents(totalCents);
}

function sumMoneyAmounts(amounts: readonly string[]): string {
  return formatMoneyCents(amounts.reduce((total, amount) => total + parseMoneyCents(amount), 0n));
}

function formatQuantityUnits(value: bigint): string {
  const wholePart = value / 1000n;
  const decimalPart = value % 1000n;

  return `${wholePart.toString()}.${decimalPart.toString().padStart(3, '0')}`;
}

function formatMoneyCents(value: bigint): string {
  const wholePart = value / 100n;
  const decimalPart = value % 100n;

  return `${wholePart.toString()}.${decimalPart.toString().padStart(2, '0')}`;
}
