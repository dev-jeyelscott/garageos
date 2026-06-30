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
import { BranchStore, type BranchSummaryRecord } from '../../branches/application/branch.store';
import { ProductStore, type ProductRecord } from '../../products/application/product.store';
import type { CreateInventoryTransferRequest } from '../api/inventory-transfer.schemas';
import { INVENTORY_TRANSFER_STATUSES } from './inventory-transfer.records';
import {
  toCreateInventoryTransferResponse,
  type InventoryTransferCreateResponse,
} from './inventory-transfer-response.mapper';
import { InventoryTransferNumberService } from './inventory-transfer-number.service';
import { InventoryTransferStore } from './inventory-transfer.store';

const IDEMPOTENCY_RETENTION_HOURS = 24;

interface PreparedLine {
  readonly id: string;
  readonly productId: string;
  readonly requestedQuantity: string;
}

@Injectable()
export class CreateInventoryTransferService {
  constructor(
    @Inject(InventoryTransferStore)
    private readonly inventoryTransferStore: InventoryTransferStore,
    @Inject(ProductStore)
    private readonly productStore: ProductStore,
    @Inject(BranchStore)
    private readonly branchStore: BranchStore,
    private readonly numberService: InventoryTransferNumberService,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async createDraft(
    request: CreateInventoryTransferRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<InventoryTransferCreateResponse> {
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
    assertBranchAccessAllowed({ context, branchId: request.source_branch_id });
    assertBranchAccessAllowed({ context, branchId: request.destination_branch_id });
    assertDifferentBranches(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const now = new Date();
      const transferId = randomUUID();
      const transferNumber = await this.numberService.allocateNumber(
        context.tenantId,
        now,
        transaction,
      );
      await assertActiveTransferBranch(
        this.branchStore,
        context.tenantId,
        request.source_branch_id,
        'source_branch_id',
        transaction,
      );
      await assertActiveTransferBranch(
        this.branchStore,
        context.tenantId,
        request.destination_branch_id,
        'destination_branch_id',
        transaction,
      );
      const preparedLines = await this.prepareLines(context, request, transaction);

      const transfer = await this.inventoryTransferStore.createDraftTransfer(
        {
          id: transferId,
          tenantId: context.tenantId,
          transferNumber,
          sourceBranchId: request.source_branch_id,
          destinationBranchId: request.destination_branch_id,
          remarks: request.remarks?.trim() || null,
          createdByUserId: context.actorUserId,
          createdAt: now,
        },
        transaction,
      );
      const lines = await this.inventoryTransferStore.createDraftTransferLines(
        {
          tenantId: context.tenantId,
          transferId,
          lines: preparedLines,
        },
        transaction,
      );

      await this.inventoryTransferStore.insertStatusEvent(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          transferId,
          fromStatus: null,
          toStatus: INVENTORY_TRANSFER_STATUSES.DRAFT,
          reason: null,
          createdByUserId: context.actorUserId,
          createdAt: now,
        },
        transaction,
      );

      return toCreateInventoryTransferResponse(transfer, lines);
    });
  }

  private async prepareLines(
    context: ResolvedTenantContext,
    request: CreateInventoryTransferRequest,
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

      preparedLines.push({
        id: randomUUID(),
        productId: line.product_id,
        requestedQuantity: line.requested_quantity,
      });
    }

    return preparedLines;
  }
}

async function assertActiveTransferBranch(
  branchStore: BranchStore,
  tenantId: string,
  branchId: string,
  field: 'source_branch_id' | 'destination_branch_id',
  client: DatabaseQueryClient,
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

function assertDifferentBranches(request: CreateInventoryTransferRequest): void {
  if (request.source_branch_id === request.destination_branch_id) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'destination_branch_id',
        code: 'same_branch_transfer',
        message: 'Destination branch must be different from source branch.',
      },
    ]);
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
        message: 'Only active products can be transferred.',
      },
    ]);
  }
}
