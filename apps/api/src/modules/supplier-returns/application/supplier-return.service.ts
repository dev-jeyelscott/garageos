import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
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
import type {
  CancelSupplierReturnRequest,
  CreateSupplierReturnRequest,
  ListSupplierReturnsQuery,
} from '../api/supplier-return.schemas';
import { FifoConsumptionService } from '../../inventory/application/fifo-consumption.service';
import { FifoLayerService } from '../../inventory/application/fifo-layer.service';
import type { FifoLayerAllocationCandidateRecord } from '../../inventory/application/fifo-layer.store';
import { InventoryLedgerService } from '../../inventory/application/inventory-ledger.service';
import { INVENTORY_TRANSACTION_TYPES } from '../../inventory/application/inventory-ledger.store';
import { InventoryStockBalancesService } from '../../inventory/application/inventory-stock-balances.service';
import {
  SupplierReturnStore,
  type CreateSupplierReturnLineInput,
  type ReceivingTraceRecord,
  type SupplierReturnLineRecord,
  type SupplierReturnListCursor,
  type SupplierReturnRecord,
  type SupplierReturnStatus,
} from './supplier-return.store';

const IDEMPOTENCY_RETENTION_HOURS = 24;
const SUPPLIER_RETURN_SOURCE_TYPE = 'supplier_return';
const SUPPLIER_RETURN_LINE_SOURCE_TYPE = 'supplier_return_line';

export interface SupplierReturnLineResponse {
  readonly id: string;
  readonly product_id: string;
  readonly product_name: string | null;
  readonly returned_quantity: string;
  readonly unit_cost: string;
  readonly total_cost: string;
}

export interface SupplierReturnResponse {
  readonly id: string;
  readonly branch_id: string;
  readonly branch_name: string | null;
  readonly supplier_id: string;
  readonly supplier_name: string | null;
  readonly original_receiving_id: string | null;
  readonly status: SupplierReturnStatus;
  readonly reason: string;
  readonly financial_value: string;
  readonly supplier_credit_id: string | null;
  readonly posted_at: string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: string;
  readonly lines: readonly SupplierReturnLineResponse[];
}

export interface SupplierReturnPaginationResponse {
  readonly limit: number;
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

export interface SupplierReturnListResponse {
  readonly supplier_returns: readonly SupplierReturnResponse[];
  readonly pagination: SupplierReturnPaginationResponse;
}

export interface SupplierReturnDetailResponse {
  readonly supplier_return: SupplierReturnResponse;
}

export interface SupplierReturnMutationResponse {
  readonly supplier_return: SupplierReturnResponse;
}

export interface SupplierReturnPostLineEffect {
  readonly supplier_return_line_id: string;
  readonly product_id: string;
  readonly returned_quantity: string;
  readonly inventory_value: string;
  readonly financial_value: string;
  readonly fifo_consumption_ids: readonly string[];
  readonly inventory_ledger_entry_ids: readonly string[];
}

export interface SupplierReturnPostResponse {
  readonly supplier_return: SupplierReturnResponse;
  readonly inventory_effect: {
    readonly fifo_consumption_ids: readonly string[];
    readonly inventory_ledger_entry_ids: readonly string[];
    readonly lines: readonly SupplierReturnPostLineEffect[];
  };
  readonly ap_effect: {
    readonly supplier_balance_before: string;
    readonly return_value: string;
    readonly ap_reduction_amount: string;
    readonly supplier_credit_amount: string;
    readonly supplier_credit_id: string | null;
    readonly supplier_balance_after: string;
  };
}

interface NormalizedSupplierReturnInput {
  readonly branchId: string;
  readonly supplierId: string;
  readonly originalReceivingId: string | null;
  readonly reason: string;
  readonly lines: readonly NormalizedSupplierReturnLineInput[];
}

interface NormalizedSupplierReturnLineInput {
  readonly productId: string;
  readonly returnedQuantity: string;
}

interface ReceivingTraceSummary {
  readonly branchId: string;
  readonly supplierId: string;
  readonly paymentTerms: 'cash' | 'credit';
  readonly receivingLineIdsByProduct: ReadonlyMap<string, readonly string[]>;
  readonly receivedQuantityByProduct: ReadonlyMap<string, string>;
  readonly alreadyReturnedQuantityByProduct: ReadonlyMap<string, string>;
  readonly unitCostByProduct: ReadonlyMap<string, string>;
}

interface FifoAllocationEffect {
  readonly fifoLayerId: string;
  readonly quantity: string;
  readonly unitCost: string;
  readonly totalCost: string;
}

interface PostLineEffectCalculation {
  readonly allocations: readonly FifoAllocationEffect[];
  readonly inventoryValue: string;
  readonly financialUnitCost: string;
  readonly financialValue: string;
}

@Injectable()
export class SupplierReturnService {
  constructor(
    @Inject(SupplierReturnStore)
    private readonly supplierReturnStore: SupplierReturnStore,
    @Inject(InventoryStockBalancesService)
    private readonly inventoryStockBalancesService: InventoryStockBalancesService,
    @Inject(FifoLayerService)
    private readonly fifoLayerService: FifoLayerService,
    @Inject(FifoConsumptionService)
    private readonly fifoConsumptionService: FifoConsumptionService,
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

  async listSupplierReturns(
    query: ListSupplierReturnsQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<SupplierReturnListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.supplierReturnStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertSupplierReturnPermission(context, isShopOwner, 'supplier_returns.read');

    const branchIds = resolveBranchIdsForList(context, query.branch_id ?? null);

    if (branchIds !== null && branchIds.length === 0) {
      return {
        supplier_returns: [],
        pagination: {
          limit: query.limit,
          next_cursor: null,
          has_more: false,
        },
      };
    }

    const supplierReturns = await this.supplierReturnStore.listSupplierReturns({
      tenantId: context.tenantId,
      branchIds,
      supplierId: query.supplier_id ?? null,
      status: query.status,
      limit: query.limit + 1,
      cursor: decodeSupplierReturnListCursor(query.cursor),
    });
    const visibleReturns = supplierReturns.slice(0, query.limit);
    const hasMore = supplierReturns.length > query.limit;

    return {
      supplier_returns: visibleReturns.map(toSupplierReturnResponse),
      pagination: {
        limit: query.limit,
        has_more: hasMore,
        next_cursor: hasMore ? encodeSupplierReturnListCursor(visibleReturns.at(-1) ?? null) : null,
      },
    };
  }

  async getSupplierReturn(
    supplierReturnId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<SupplierReturnDetailResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.supplierReturnStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertSupplierReturnPermission(context, isShopOwner, 'supplier_returns.read');

    const supplierReturn = await this.supplierReturnStore.findSupplierReturnById(
      context.tenantId,
      supplierReturnId.trim(),
    );

    if (supplierReturn === null) {
      throw GarageOsApiException.resourceNotFound('Supplier return was not found.');
    }

    assertBranchAccessAllowed({ context, branchId: supplierReturn.branchId });

    return {
      supplier_return: toSupplierReturnResponse(supplierReturn),
    };
  }

  async createSupplierReturn(
    request: CreateSupplierReturnRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<SupplierReturnMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.supplierReturnStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertSupplierReturnPermission(context, isShopOwner, 'supplier_returns.create');

    const input = normalizeSupplierReturnInput(request);
    assertImmediateCashRefundNotEnabled(request);
    assertBranchAccessAllowed({ context, branchId: input.branchId });

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const trace = await resolveAndValidateReceivingTrace(
        this.supplierReturnStore,
        context.tenantId,
        input,
        transaction,
      );
      const createdAt = new Date();
      const supplierReturnId = randomUUID();
      const lines = buildDraftLines({
        tenantId: context.tenantId,
        supplierReturnId,
        input,
        trace,
      });
      const supplierReturn = await this.supplierReturnStore.createSupplierReturn(
        {
          id: supplierReturnId,
          tenantId: context.tenantId,
          branchId: input.branchId,
          supplierId: input.supplierId,
          originalReceivingId: input.originalReceivingId,
          reason: input.reason,
          createdByUserId: context.actorUserId,
          createdAt,
          lines,
        },
        transaction,
      );

      assertBranchAndSupplierAreActive(supplierReturn);

      await this.auditService.record({
        tenantId: context.tenantId,
        branchId: supplierReturn.branchId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'supplier_returns.created',
        entityType: 'supplier_return',
        entityId: supplierReturn.id,
        afterJson: toSupplierReturnResponse(supplierReturn),
        reason: input.reason,
        createdAt,
        client: transaction,
      });

      return {
        supplier_return: toSupplierReturnResponse(supplierReturn),
      };
    });
  }

  async updateSupplierReturn(
    supplierReturnId: string,
    request: CreateSupplierReturnRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<SupplierReturnMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.supplierReturnStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertSupplierReturnPermission(context, isShopOwner, 'supplier_returns.create');

    const input = normalizeSupplierReturnInput(request);
    assertImmediateCashRefundNotEnabled(request);
    assertBranchAccessAllowed({ context, branchId: input.branchId });

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.supplierReturnStore.lockSupplierReturnById(
        context.tenantId,
        supplierReturnId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Supplier return was not found.');
      }

      if (existing.status !== 'draft') {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Only draft supplier returns can be updated.',
          [
            {
              field: 'status',
              code: 'supplier_return_not_draft',
              message: 'Supplier return must be draft before it can be updated.',
            },
          ],
        );
      }

      assertBranchAccessAllowed({ context, branchId: existing.branchId });

      const trace = await resolveAndValidateReceivingTrace(
        this.supplierReturnStore,
        context.tenantId,
        input,
        transaction,
      );
      const lines = buildDraftLines({
        tenantId: context.tenantId,
        supplierReturnId: existing.id,
        input,
        trace,
      });
      const updated = await this.supplierReturnStore.updateDraftSupplierReturn(
        {
          tenantId: context.tenantId,
          supplierReturnId: existing.id,
          branchId: input.branchId,
          supplierId: input.supplierId,
          originalReceivingId: input.originalReceivingId,
          reason: input.reason,
          lines,
        },
        transaction,
      );

      if (updated === null) {
        throw GarageOsApiException.versionConflict();
      }

      assertBranchAndSupplierAreActive(updated);

      await this.auditService.record({
        tenantId: context.tenantId,
        branchId: updated.branchId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'supplier_returns.updated',
        entityType: 'supplier_return',
        entityId: updated.id,
        beforeJson: toSupplierReturnResponse(existing),
        afterJson: toSupplierReturnResponse(updated),
        reason: input.reason,
        client: transaction,
      });

      return {
        supplier_return: toSupplierReturnResponse(updated),
      };
    });
  }

  async cancelSupplierReturn(
    supplierReturnId: string,
    request: CancelSupplierReturnRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<SupplierReturnMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.supplierReturnStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertSupplierReturnPermission(context, isShopOwner, 'supplier_returns.create');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.supplierReturnStore.lockSupplierReturnById(
        context.tenantId,
        supplierReturnId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Supplier return was not found.');
      }

      assertBranchAccessAllowed({ context, branchId: existing.branchId });

      if (existing.status !== 'draft') {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Only draft supplier returns can be cancelled.',
          [
            {
              field: 'status',
              code: 'supplier_return_not_draft',
              message: 'Supplier return must be draft before it can be cancelled.',
            },
          ],
        );
      }

      const cancelledAt = new Date();
      const cancelled = await this.supplierReturnStore.cancelDraftSupplierReturn(
        {
          tenantId: context.tenantId,
          supplierReturnId: existing.id,
          cancelledAt,
        },
        transaction,
      );

      if (cancelled === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        branchId: cancelled.branchId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'supplier_returns.cancelled',
        entityType: 'supplier_return',
        entityId: cancelled.id,
        beforeJson: toSupplierReturnResponse(existing),
        afterJson: toSupplierReturnResponse(cancelled),
        reason: normalizeNullableText(request.reason) ?? 'supplier_return_cancelled',
        createdAt: cancelledAt,
        client: transaction,
      });

      return {
        supplier_return: toSupplierReturnResponse(cancelled),
      };
    });
  }

  async postSupplierReturn(
    supplierReturnId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<SupplierReturnPostResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.supplierReturnStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertSupplierReturnPermission(context, isShopOwner, 'supplier_returns.create');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const supplierReturn = await this.supplierReturnStore.lockSupplierReturnById(
        context.tenantId,
        supplierReturnId.trim(),
        transaction,
      );

      if (supplierReturn === null) {
        throw GarageOsApiException.resourceNotFound('Supplier return was not found.');
      }

      assertBranchAccessAllowed({ context, branchId: supplierReturn.branchId });
      assertBranchAndSupplierAreActive(supplierReturn);

      if (supplierReturn.status !== 'draft') {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Only draft supplier returns can be posted.',
          [
            {
              field: 'status',
              code: 'supplier_return_not_draft',
              message: 'Supplier return must be draft before it can be posted.',
            },
          ],
        );
      }

      if (supplierReturn.lines.length === 0) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'lines',
            code: 'supplier_return_lines_required',
            message: 'Supplier return must include at least one product line.',
          },
        ]);
      }

      const trace =
        supplierReturn.originalReceivingId === null
          ? null
          : summarizeReceivingTrace(
              await resolveSupplierReturnReceivingTrace(
                this.supplierReturnStore,
                context.tenantId,
                supplierReturn.originalReceivingId,
                transaction,
              ),
            );

      if (trace !== null) {
        assertTraceMatchesSupplierReturn(supplierReturn, trace);
      }

      const postedAt = new Date();
      const lineEffects: SupplierReturnPostLineEffect[] = [];
      const allFifoConsumptionIds: string[] = [];
      const allInventoryLedgerEntryIds: string[] = [];
      let financialValue = '0.00';

      for (const line of supplierReturn.lines) {
        const calculation = await this.calculateAndApplyLineEffects({
          context,
          supplierReturn,
          line,
          trace,
          transaction,
        });

        const fifoConsumptions = await this.fifoConsumptionService.createConsumptions(
          calculation.allocations.map((allocation) => ({
            tenantId: context.tenantId,
            branchId: supplierReturn.branchId,
            productId: line.productId,
            fifoLayerId: allocation.fifoLayerId,
            quantityConsumed: allocation.quantity,
            unitCost: allocation.unitCost,
            totalCost: allocation.totalCost,
            sourceType: SUPPLIER_RETURN_LINE_SOURCE_TYPE,
            sourceId: line.id,
            consumedAt: postedAt,
          })),
          transaction,
        );

        const ledgerEntries = [];

        for (const allocation of calculation.allocations) {
          const ledgerEntry = await this.inventoryLedgerService.recordLedgerEntry(
            {
              tenantId: context.tenantId,
              branchId: supplierReturn.branchId,
              productId: line.productId,
              transactionType: INVENTORY_TRANSACTION_TYPES.SUPPLIER_RETURN,
              quantityDeltaOnHand: negateQuantity(allocation.quantity),
              quantityDeltaReserved: '0.000',
              unitCost: allocation.unitCost,
              totalCost: allocation.totalCost,
              sourceType: SUPPLIER_RETURN_LINE_SOURCE_TYPE,
              sourceId: line.id,
              occurredAt: postedAt,
              createdByUserId: context.actorUserId,
            },
            transaction,
          );

          ledgerEntries.push(ledgerEntry);
        }

        await this.supplierReturnStore.updatePostedSupplierReturnLine(
          {
            tenantId: context.tenantId,
            supplierReturnLineId: line.id,
            unitCost: calculation.financialUnitCost,
            totalCost: calculation.financialValue,
          },
          transaction,
        );

        const fifoConsumptionIds = fifoConsumptions.map((consumption) => consumption.id);
        const inventoryLedgerEntryIds = ledgerEntries.map((entry) => entry.id);

        allFifoConsumptionIds.push(...fifoConsumptionIds);
        allInventoryLedgerEntryIds.push(...inventoryLedgerEntryIds);
        financialValue = addMoney(financialValue, calculation.financialValue);
        lineEffects.push({
          supplier_return_line_id: line.id,
          product_id: line.productId,
          returned_quantity: line.returnedQuantity,
          inventory_value: calculation.inventoryValue,
          financial_value: calculation.financialValue,
          fifo_consumption_ids: fifoConsumptionIds,
          inventory_ledger_entry_ids: inventoryLedgerEntryIds,
        });
      }

      const supplierBalanceBefore = formatMoneyCents(
        parseMoneyCents(
          await this.supplierReturnStore.getSupplierPayableBalanceForUpdate(
            context.tenantId,
            supplierReturn.supplierId,
            transaction,
          ),
        ),
      );
      const apReductionAmount = minMoney(supplierBalanceBefore, financialValue);
      const supplierCreditAmount = financialValue;
      const supplierCredit =
        compareMoney(financialValue, '0.00') > 0
          ? await this.supplierReturnStore.createSupplierCredit(
              {
                id: randomUUID(),
                tenantId: context.tenantId,
                supplierId: supplierReturn.supplierId,
                branchId: supplierReturn.branchId,
                amount: supplierCreditAmount,
                reason: supplierReturn.reason,
                sourceType: SUPPLIER_RETURN_SOURCE_TYPE,
                sourceId: supplierReturn.id,
                createdByUserId: context.actorUserId,
                createdAt: postedAt,
              },
              transaction,
            )
          : null;

      const posted = await this.supplierReturnStore.markSupplierReturnPosted(
        {
          tenantId: context.tenantId,
          supplierReturnId: supplierReturn.id,
          financialValue,
          supplierCreditId: supplierCredit?.id ?? null,
          postedAt,
        },
        transaction,
      );

      if (posted === null) {
        throw GarageOsApiException.versionConflict();
      }

      const supplierBalanceAfter = subtractMoney(supplierBalanceBefore, financialValue);
      const postResponse: SupplierReturnPostResponse = {
        supplier_return: toSupplierReturnResponse(posted),
        inventory_effect: {
          fifo_consumption_ids: allFifoConsumptionIds,
          inventory_ledger_entry_ids: allInventoryLedgerEntryIds,
          lines: lineEffects,
        },
        ap_effect: {
          supplier_balance_before: supplierBalanceBefore,
          return_value: financialValue,
          ap_reduction_amount: apReductionAmount,
          supplier_credit_amount: supplierCreditAmount,
          supplier_credit_id: supplierCredit?.id ?? null,
          supplier_balance_after: supplierBalanceAfter,
        },
      };

      await this.auditService.record({
        tenantId: context.tenantId,
        branchId: supplierReturn.branchId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'supplier_returns.posted',
        entityType: 'supplier_return',
        entityId: supplierReturn.id,
        beforeJson: toSupplierReturnResponse(supplierReturn),
        afterJson: postResponse,
        reason: supplierReturn.reason,
        createdAt: postedAt,
        client: transaction,
      });

      return postResponse;
    });
  }

  private async calculateAndApplyLineEffects(input: {
    readonly context: ResolvedTenantContext;
    readonly supplierReturn: SupplierReturnRecord;
    readonly line: SupplierReturnLineRecord;
    readonly trace: ReceivingTraceSummary | null;
    readonly transaction: DatabaseQueryClient;
  }): Promise<PostLineEffectCalculation> {
    await this.inventoryStockBalancesService.assertSufficientAvailableStock(
      {
        tenantId: input.context.tenantId,
        branchId: input.supplierReturn.branchId,
        productId: input.line.productId,
        requestedQuantity: input.line.returnedQuantity,
      },
      input.transaction,
    );

    assertTraceableQuantityAvailable(input.line, input.trace);

    const layers = await this.fifoLayerService.lockOpenLayersForAllocation(
      {
        tenantId: input.context.tenantId,
        branchId: input.supplierReturn.branchId,
        productId: input.line.productId,
      },
      input.transaction,
    );
    const orderedLayers = orderLayersForSupplierReturn(input.line.productId, layers, input.trace);
    const allocations = allocateSupplierReturnQuantity(input.line.returnedQuantity, orderedLayers);

    const allocatedQuantity = sumQuantities(allocations.map((allocation) => allocation.quantity));

    if (compareQuantity(allocatedQuantity, input.line.returnedQuantity) < 0) {
      throw GarageOsApiException.fifoAllocationConflict([
        {
          field: 'lines.returned_quantity',
          code: 'insufficient_fifo_layers',
          message: 'FIFO layers cannot satisfy the supplier return quantity.',
        },
      ]);
    }

    for (const allocation of allocations) {
      const decremented = await this.fifoLayerService.decrementRemainingQuantity(
        {
          tenantId: input.context.tenantId,
          fifoLayerId: allocation.fifoLayerId,
          quantityConsumed: allocation.quantity,
        },
        input.transaction,
      );

      if (decremented === null) {
        throw GarageOsApiException.fifoAllocationConflict([
          {
            field: 'lines.returned_quantity',
            code: 'fifo_layer_decrement_conflict',
            message: 'FIFO layer quantity changed before supplier return posting completed.',
          },
        ]);
      }
    }

    await this.inventoryStockBalancesService.decrementOnHandStock(
      {
        tenantId: input.context.tenantId,
        branchId: input.supplierReturn.branchId,
        productId: input.line.productId,
        quantityConsumed: input.line.returnedQuantity,
      },
      input.transaction,
    );

    const inventoryValue = sumMoneyAmounts(allocations.map((allocation) => allocation.totalCost));
    const financialUnitCost = resolveFinancialUnitCost(input.line, input.trace, inventoryValue);
    const financialValue = calculateLineTotal(input.line.returnedQuantity, financialUnitCost);

    return {
      allocations,
      inventoryValue,
      financialUnitCost,
      financialValue,
    };
  }
}

function assertSupplierReturnPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

function resolveBranchIdsForList(
  context: ResolvedTenantContext,
  requestedBranchId: string | null,
): readonly string[] | null {
  const normalizedRequestedBranchId = normalizeNullableText(requestedBranchId);

  if (normalizedRequestedBranchId !== null) {
    assertBranchAccessAllowed({ context, branchId: normalizedRequestedBranchId });

    return [normalizedRequestedBranchId];
  }

  if (context.tenantWideBranchAccess) {
    return null;
  }

  return [
    ...new Set<string>(
      context.assignedBranchIds
        .map((branchId) => branchId.trim())
        .filter((branchId) => branchId.length > 0),
    ),
  ];
}

function normalizeSupplierReturnInput(
  request: CreateSupplierReturnRequest,
): NormalizedSupplierReturnInput {
  return {
    branchId: request.branch_id.trim(),
    supplierId: request.supplier_id.trim(),
    originalReceivingId: request.original_receiving_id?.trim() ?? null,
    reason: normalizeRequiredText(request.reason, 'reason'),
    lines: request.lines.map((line) => ({
      productId: line.product_id.trim(),
      returnedQuantity: line.returned_quantity,
    })),
  };
}

function assertImmediateCashRefundNotEnabled(request: CreateSupplierReturnRequest): void {
  if (request.immediate_cash_refund?.enabled === true) {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Immediate supplier cash refund recording is not available in this backend slice.',
      [
        {
          field: 'immediate_cash_refund.enabled',
          code: 'supplier_return_cash_refund_not_supported',
          message:
            'Create the supplier return as supplier credit/AP reduction; do not enable immediate cash refund for this workflow.',
        },
      ],
    );
  }
}

async function resolveAndValidateReceivingTrace(
  store: SupplierReturnStore,
  tenantId: string,
  input: NormalizedSupplierReturnInput,
  client: DatabaseQueryClient,
): Promise<ReceivingTraceSummary | null> {
  if (input.originalReceivingId === null) {
    return null;
  }

  const trace = summarizeReceivingTrace(
    await resolveSupplierReturnReceivingTrace(store, tenantId, input.originalReceivingId, client),
  );

  if (trace.branchId !== input.branchId || trace.supplierId !== input.supplierId) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'original_receiving_id',
        code: 'original_receiving_scope_mismatch',
        message:
          'Original receiving must belong to the same supplier and branch as the supplier return.',
      },
    ]);
  }

  return trace;
}

async function resolveSupplierReturnReceivingTrace(
  store: SupplierReturnStore,
  tenantId: string,
  receivingId: string,
  client: DatabaseQueryClient,
): Promise<ReceivingTraceRecord> {
  const trace = await store.getReceivingTrace(tenantId, receivingId, client);

  if (trace === null) {
    throw GarageOsApiException.resourceNotFound(
      'Original purchase receiving record was not found.',
    );
  }

  return trace;
}

function summarizeReceivingTrace(trace: ReceivingTraceRecord): ReceivingTraceSummary {
  const receivingLineIdsByProduct = new Map<string, string[]>();
  const receivedQuantityByProduct = new Map<string, string>();
  const alreadyReturnedQuantityByProduct = new Map<string, string>();
  const totalCostByProduct = new Map<string, string>();

  for (const line of trace.lines) {
    const ids = receivingLineIdsByProduct.get(line.productId) ?? [];

    ids.push(line.receivingLineId);
    receivingLineIdsByProduct.set(line.productId, ids);
    receivedQuantityByProduct.set(
      line.productId,
      addQuantity(receivedQuantityByProduct.get(line.productId) ?? '0.000', line.receivedQuantity),
    );
    alreadyReturnedQuantityByProduct.set(
      line.productId,
      maxQuantity(
        alreadyReturnedQuantityByProduct.get(line.productId) ?? '0.000',
        line.alreadyReturnedQuantity,
      ),
    );
    totalCostByProduct.set(
      line.productId,
      addMoney(
        totalCostByProduct.get(line.productId) ?? '0.00',
        calculateLineTotal(line.receivedQuantity, line.receivedUnitCost),
      ),
    );
  }

  const unitCostByProduct = new Map<string, string>();

  for (const [productId, quantity] of receivedQuantityByProduct.entries()) {
    unitCostByProduct.set(
      productId,
      calculateWeightedUnitCost(quantity, totalCostByProduct.get(productId) ?? '0.00'),
    );
  }

  return {
    branchId: trace.branchId,
    supplierId: trace.supplierId,
    paymentTerms: trace.paymentTerms,
    receivingLineIdsByProduct,
    receivedQuantityByProduct,
    alreadyReturnedQuantityByProduct,
    unitCostByProduct,
  };
}

function assertTraceMatchesSupplierReturn(
  supplierReturn: SupplierReturnRecord,
  trace: ReceivingTraceSummary,
): void {
  if (
    trace.branchId !== supplierReturn.branchId ||
    trace.supplierId !== supplierReturn.supplierId
  ) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'original_receiving_id',
        code: 'original_receiving_scope_mismatch',
        message:
          'Original receiving must belong to the same supplier and branch as the supplier return.',
      },
    ]);
  }
}

function buildDraftLines(input: {
  readonly tenantId: string;
  readonly supplierReturnId: string;
  readonly input: NormalizedSupplierReturnInput;
  readonly trace: ReceivingTraceSummary | null;
}): readonly CreateSupplierReturnLineInput[] {
  assertNoDuplicateProducts(input.input.lines);

  return input.input.lines.map((line) => {
    const unitCost = input.trace?.unitCostByProduct.get(line.productId) ?? '0.00';

    return {
      id: randomUUID(),
      tenantId: input.tenantId,
      supplierReturnId: input.supplierReturnId,
      productId: line.productId,
      returnedQuantity: line.returnedQuantity,
      unitCost,
      totalCost: calculateLineTotal(line.returnedQuantity, unitCost),
    };
  });
}

function assertNoDuplicateProducts(lines: readonly NormalizedSupplierReturnLineInput[]): void {
  const productIds = new Set<string>();

  for (const [index, line] of lines.entries()) {
    if (productIds.has(line.productId)) {
      throw GarageOsApiException.validationFailed([
        {
          field: `lines.${index}.product_id`,
          code: 'duplicate_supplier_return_product',
          message: 'Supplier return lines cannot contain duplicate products.',
        },
      ]);
    }

    productIds.add(line.productId);
  }
}

function assertBranchAndSupplierAreActive(supplierReturn: SupplierReturnRecord): void {
  if (supplierReturn.branchStatus !== 'active') {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Supplier returns require an active branch.',
      [
        {
          field: 'branch_id',
          code: 'branch_inactive',
          message: 'Supplier return branch must be active.',
        },
      ],
    );
  }

  if (supplierReturn.supplierStatus !== 'active') {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Supplier returns require an active supplier.',
      [
        {
          field: 'supplier_id',
          code: 'supplier_inactive',
          message: 'Supplier must be active before recording a supplier return.',
        },
      ],
    );
  }
}

function assertTraceableQuantityAvailable(
  line: SupplierReturnLineRecord,
  trace: ReceivingTraceSummary | null,
): void {
  if (trace === null) {
    return;
  }

  const receivedQuantity = trace.receivedQuantityByProduct.get(line.productId) ?? '0.000';
  const alreadyReturnedQuantity =
    trace.alreadyReturnedQuantityByProduct.get(line.productId) ?? '0.000';
  const remainingTraceableQuantity = subtractQuantities(receivedQuantity, alreadyReturnedQuantity);

  if (compareQuantity(line.returnedQuantity, remainingTraceableQuantity) > 0) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'lines.returned_quantity',
        code: 'supplier_return_exceeds_traceable_receiving_quantity',
        message: 'Returned quantity exceeds quantity remaining from the original receiving record.',
      },
    ]);
  }
}

function orderLayersForSupplierReturn(
  productId: string,
  layers: readonly FifoLayerAllocationCandidateRecord[],
  trace: ReceivingTraceSummary | null,
): readonly FifoLayerAllocationCandidateRecord[] {
  if (trace === null) {
    return layers;
  }

  const traceLineIds = new Set(trace.receivingLineIdsByProduct.get(productId) ?? []);
  const preferred = layers.filter(
    (layer) =>
      layer.sourceTransactionType === INVENTORY_TRANSACTION_TYPES.PURCHASE_RECEIVE &&
      traceLineIds.has(layer.sourceTransactionId),
  );
  const fallback = layers.filter(
    (layer) => !preferred.some((candidate) => candidate.id === layer.id),
  );

  return [...preferred, ...fallback];
}

function allocateSupplierReturnQuantity(
  requestedQuantity: string,
  layers: readonly FifoLayerAllocationCandidateRecord[],
): readonly FifoAllocationEffect[] {
  let remainingQuantity = requestedQuantity;
  const allocations: FifoAllocationEffect[] = [];

  for (const layer of layers) {
    if (compareQuantity(remainingQuantity, '0.000') <= 0) {
      break;
    }

    const allocatableQuantity = minQuantity(remainingQuantity, layer.allocatableQuantity);

    if (compareQuantity(allocatableQuantity, '0.000') <= 0) {
      continue;
    }

    allocations.push({
      fifoLayerId: layer.id,
      quantity: allocatableQuantity,
      unitCost: layer.unitCost,
      totalCost: calculateLineTotal(allocatableQuantity, layer.unitCost),
    });
    remainingQuantity = subtractQuantities(remainingQuantity, allocatableQuantity);
  }

  return allocations;
}

function resolveFinancialUnitCost(
  line: SupplierReturnLineRecord,
  trace: ReceivingTraceSummary | null,
  inventoryValue: string,
): string {
  if (trace !== null) {
    const traceUnitCost = trace.unitCostByProduct.get(line.productId);

    if (traceUnitCost !== undefined) {
      return traceUnitCost;
    }
  }

  return calculateWeightedUnitCost(line.returnedQuantity, inventoryValue);
}

function toSupplierReturnResponse(supplierReturn: SupplierReturnRecord): SupplierReturnResponse {
  return {
    id: supplierReturn.id,
    branch_id: supplierReturn.branchId,
    branch_name: supplierReturn.branchName,
    supplier_id: supplierReturn.supplierId,
    supplier_name: supplierReturn.supplierName,
    original_receiving_id: supplierReturn.originalReceivingId,
    status: supplierReturn.status,
    reason: supplierReturn.reason,
    financial_value: supplierReturn.financialValue,
    supplier_credit_id: supplierReturn.supplierCreditId,
    posted_at: supplierReturn.postedAt?.toISOString() ?? null,
    created_by_user_id: supplierReturn.createdByUserId,
    created_at: supplierReturn.createdAt.toISOString(),
    lines: supplierReturn.lines.map(toSupplierReturnLineResponse),
  };
}

function toSupplierReturnLineResponse(line: SupplierReturnLineRecord): SupplierReturnLineResponse {
  return {
    id: line.id,
    product_id: line.productId,
    product_name: line.productName,
    returned_quantity: line.returnedQuantity,
    unit_cost: line.unitCost,
    total_cost: line.totalCost,
  };
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim().replace(/\s+/g, ' ');

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeRequiredText(value: string, field: string): string {
  const normalizedValue = normalizeNullableText(value);

  if (normalizedValue === null) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'required',
        message: `${field} is required.`,
      },
    ]);
  }

  return normalizedValue;
}

function encodeSupplierReturnListCursor(
  supplierReturn: SupplierReturnRecord | null,
): string | null {
  if (supplierReturn === null) {
    return null;
  }

  return Buffer.from(
    JSON.stringify({
      created_at: supplierReturn.createdAt.toISOString(),
      id: supplierReturn.id,
    }),
  ).toString('base64url');
}

function decodeSupplierReturnListCursor(
  value: string | undefined,
): SupplierReturnListCursor | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;

    if (!isCursorPayload(decoded)) {
      return null;
    }

    const createdAt = new Date(decoded.created_at);

    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return {
      createdAt,
      id: decoded.id,
    };
  } catch {
    return null;
  }
}

function isCursorPayload(
  value: unknown,
): value is { readonly created_at: string; readonly id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'created_at' in value &&
    typeof (value as { created_at?: unknown }).created_at === 'string' &&
    'id' in value &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

function compareQuantity(left: string, right: string): number {
  const leftUnits = parseQuantityUnits(left);
  const rightUnits = parseQuantityUnits(right);

  if (leftUnits === rightUnits) {
    return 0;
  }

  return leftUnits > rightUnits ? 1 : -1;
}

function addQuantity(left: string, right: string): string {
  return formatQuantityUnits(parseQuantityUnits(left) + parseQuantityUnits(right));
}

function subtractQuantities(left: string, right: string): string {
  return formatQuantityUnits(parseQuantityUnits(left) - parseQuantityUnits(right));
}

function minQuantity(left: string, right: string): string {
  return compareQuantity(left, right) <= 0 ? left : right;
}

function maxQuantity(left: string, right: string): string {
  return compareQuantity(left, right) >= 0 ? left : right;
}

function sumQuantities(values: readonly string[]): string {
  return values.reduce((total, value) => addQuantity(total, value), '0.000');
}

function negateQuantity(value: string): string {
  const units = parseQuantityUnits(value);

  return units === 0n ? '0.000' : formatQuantityUnits(-units);
}

function parseQuantityUnits(value: string): bigint {
  const [wholePart = '0', decimalPart = ''] = value.split('.');

  return BigInt(wholePart) * 1000n + BigInt(decimalPart.padEnd(3, '0').slice(0, 3));
}

function formatQuantityUnits(value: bigint): string {
  const isNegative = value < 0n;
  const absoluteValue = isNegative ? -value : value;
  const wholePart = absoluteValue / 1000n;
  const decimalPart = absoluteValue % 1000n;

  return `${isNegative ? '-' : ''}${wholePart.toString()}.${decimalPart.toString().padStart(3, '0')}`;
}

function compareMoney(left: string, right: string): number {
  const leftCents = parseMoneyCents(left);
  const rightCents = parseMoneyCents(right);

  if (leftCents === rightCents) {
    return 0;
  }

  return leftCents > rightCents ? 1 : -1;
}

function addMoney(left: string, right: string): string {
  return formatMoneyCents(parseMoneyCents(left) + parseMoneyCents(right));
}

function subtractMoney(left: string, right: string): string {
  return formatMoneyCents(parseMoneyCents(left) - parseMoneyCents(right));
}

function minMoney(left: string, right: string): string {
  if (compareMoney(left, '0.00') <= 0) {
    return '0.00';
  }

  return compareMoney(left, right) <= 0 ? left : right;
}

function sumMoneyAmounts(amounts: readonly string[]): string {
  return amounts.reduce((total, amount) => addMoney(total, amount), '0.00');
}

function parseMoneyCents(value: string): bigint {
  const [wholePart = '0', decimalPart = ''] = value.split('.');

  return BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, '0').slice(0, 2));
}

function formatMoneyCents(value: bigint): string {
  const isNegative = value < 0n;
  const absoluteValue = isNegative ? -value : value;
  const wholePart = absoluteValue / 100n;
  const decimalPart = absoluteValue % 100n;

  return `${isNegative ? '-' : ''}${wholePart.toString()}.${decimalPart.toString().padStart(2, '0')}`;
}

function calculateLineTotal(quantity: string, unitCost: string): string {
  const quantityUnits = parseQuantityUnits(quantity);
  const unitCostCents = parseMoneyCents(unitCost);
  const totalCents = (quantityUnits * unitCostCents + 500n) / 1000n;

  return formatMoneyCents(totalCents);
}

function calculateWeightedUnitCost(quantity: string, totalCost: string): string {
  const quantityUnits = parseQuantityUnits(quantity);

  if (quantityUnits <= 0n) {
    return '0.00';
  }

  const totalCents = parseMoneyCents(totalCost);
  const unitCostCents = (totalCents * 1000n + quantityUnits / 2n) / quantityUnits;

  return formatMoneyCents(unitCostCents);
}
