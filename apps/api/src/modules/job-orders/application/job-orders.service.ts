import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { evaluateBranchAccess } from '../../../shared/authorization/branch-access';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import { normalizeLockVersion } from '../../../shared/locking/optimistic-locking';
import {
  buildNextJobOrderNumber,
  formatTenantBusinessDate,
} from '../../../shared/numbering/document-numbering';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type {
  CreateJobOrderRequest,
  ListJobOrdersQuery,
  UpdateJobOrderRequest,
} from '../api/job-order.schemas';
import {
  JobOrderStore,
  type JobOrderLineRecord,
  type JobOrderLineStatus,
  type JobOrderLineType,
  type JobOrderRecord,
  type JobOrderStatus,
} from './job-order.store';

const IDEMPOTENCY_RETENTION_HOURS = 24;
const DEFAULT_TENANT_TIMEZONE = 'Asia/Manila';

export interface JobOrderLineResponse {
  readonly id: string;
  readonly line_type: JobOrderLineType;
  readonly service_id: string | null;
  readonly product_id: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unit_price: string;
  readonly authorized_amount: string;
  readonly status: JobOrderLineStatus;
  readonly inventory_reservation_id: string | null;
  readonly completed_at: string | null;
  readonly line_order: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface JobOrderResponse {
  readonly id: string;
  readonly branch_id: string;
  readonly customer_id: string;
  readonly motorcycle_id: string;
  readonly job_order_number: string;
  readonly status: JobOrderStatus;
  readonly service_advisor_user_id: string;
  readonly primary_mechanic_user_id: string | null;
  readonly mileage_at_intake: number;
  readonly customer_concern: string;
  readonly internal_notes: string | null;
  readonly completed_at: string | null;
  readonly released_at: string | null;
  readonly no_charge_reason: string | null;
  readonly release_with_balance_reason: string | null;
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly lines: readonly JobOrderLineResponse[];
}

export interface JobOrderListResponse {
  readonly job_orders: readonly JobOrderResponse[];
}

export interface JobOrderDetailResponse {
  readonly job_order: JobOrderResponse;
}

export interface JobOrderMutationResponse {
  readonly job_order: JobOrderResponse;
}

interface NormalizedCreateJobOrderInput {
  readonly branchId: string;
  readonly customerId: string;
  readonly motorcycleId: string;
  readonly mileageAtIntake: number;
  readonly customerConcern: string;
  readonly internalNotes: string | null;
}

interface NormalizedUpdateJobOrderInput {
  readonly mileageAtIntake: number;
  readonly customerConcern: string;
  readonly internalNotes: string | null;
}

@Injectable()
export class JobOrdersService {
  constructor(
    @Inject(JobOrderStore)
    private readonly jobOrderStore: JobOrderStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async listJobOrders(
    query: ListJobOrdersQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<JobOrderListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.jobOrderStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertJobOrderPermission(context, isShopOwner, 'job_orders.read');
    assertJobOrderBranchAccess(context, query.branch_id);

    const jobOrders = await this.jobOrderStore.listJobOrders({
      tenantId: context.tenantId,
      branchId: query.branch_id,
      status: query.status,
      customerId: query.customer_id,
      motorcycleId: query.motorcycle_id,
      normalizedSearch: normalizeNullableText(query.q)?.toLowerCase() ?? null,
      limit: query.limit,
    });

    return {
      job_orders: jobOrders.map(toJobOrderResponse),
    };
  }

  async getJobOrder(
    jobOrderId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<JobOrderDetailResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.jobOrderStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertJobOrderPermission(context, isShopOwner, 'job_orders.read');

    const jobOrder = await this.jobOrderStore.findJobOrderById(context.tenantId, jobOrderId.trim());

    if (jobOrder === null) {
      throw GarageOsApiException.resourceNotFound('Job order was not found.');
    }

    assertJobOrderBranchAccess(context, jobOrder.branchId);

    return {
      job_order: toJobOrderResponse(jobOrder),
    };
  }

  async createJobOrder(
    request: CreateJobOrderRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<JobOrderMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.jobOrderStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertJobOrderPermission(context, isShopOwner, 'job_orders.create');

    const input = normalizeCreateJobOrderInput(request);
    assertJobOrderBranchAccess(context, input.branchId);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      await assertJobOrderReferences({
        jobOrderStore: this.jobOrderStore,
        tenantId: context.tenantId,
        branchId: input.branchId,
        customerId: input.customerId,
        motorcycleId: input.motorcycleId,
        transaction,
      });

      const createdAt = new Date();
      const timezone =
        (await this.jobOrderStore.getTenantTimezone(context.tenantId, transaction)) ??
        DEFAULT_TENANT_TIMEZONE;
      const datePart = formatTenantBusinessDate(createdAt, timezone);

      await this.jobOrderStore.lockJobOrderNumberSequence(
        {
          tenantId: context.tenantId,
          datePart,
        },
        transaction,
      );

      const latestJobOrderNumber = await this.jobOrderStore.findLatestJobOrderNumberForDate(
        {
          tenantId: context.tenantId,
          datePart,
        },
        transaction,
      );

      const jobOrderNumber = buildNextJobOrderNumber(datePart, latestJobOrderNumber);

      const jobOrder = await this.jobOrderStore.createJobOrder(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          branchId: input.branchId,
          customerId: input.customerId,
          motorcycleId: input.motorcycleId,
          jobOrderNumber,
          serviceAdvisorUserId: context.actorUserId,
          mileageAtIntake: input.mileageAtIntake,
          customerConcern: input.customerConcern,
          internalNotes: input.internalNotes,
          createdByUserId: context.actorUserId,
          createdAt,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'job_orders.created',
        entityType: 'job_order',
        entityId: jobOrder.id,
        branchId: jobOrder.branchId,
        afterJson: toJobOrderResponse(jobOrder),
        reason: 'job_order_created',
        client: transaction,
      });

      return {
        job_order: toJobOrderResponse(jobOrder),
      };
    });
  }

  async updateJobOrder(
    jobOrderId: string,
    request: UpdateJobOrderRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<JobOrderMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.jobOrderStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertJobOrderPermission(context, isShopOwner, 'job_orders.update');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.jobOrderStore.findJobOrderByIdForUpdate(
        context.tenantId,
        jobOrderId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Job order was not found.');
      }

      assertJobOrderBranchAccess(context, existing.branchId);
      assertCanUpdateJobOrderBaseline(existing);

      await assertJobOrderReferences({
        jobOrderStore: this.jobOrderStore,
        tenantId: context.tenantId,
        branchId: existing.branchId,
        customerId: existing.customerId,
        motorcycleId: existing.motorcycleId,
        transaction,
      });

      const input = normalizeUpdateJobOrderInput(existing, request);
      const updatedAt = new Date();

      const updated = await this.jobOrderStore.updatePendingJobOrder(
        {
          tenantId: context.tenantId,
          jobOrderId: existing.id,
          mileageAtIntake: input.mileageAtIntake,
          customerConcern: input.customerConcern,
          internalNotes: input.internalNotes,
          expectedLockVersion: normalizeLockVersion(request.lock_version),
          updatedAt,
        },
        transaction,
      );

      if (updated === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'job_orders.updated',
        entityType: 'job_order',
        entityId: updated.id,
        branchId: updated.branchId,
        beforeJson: toJobOrderResponse(existing),
        afterJson: toJobOrderResponse(updated),
        reason: 'job_order_updated',
        client: transaction,
      });

      return {
        job_order: toJobOrderResponse(updated),
      };
    });
  }
}

export function assertCanUpdateJobOrderBaseline(jobOrder: Pick<JobOrderRecord, 'status'>): void {
  if (jobOrder.status !== 'pending') {
    throw GarageOsApiException.validationFailed([
      {
        field: 'status',
        code: 'job_order_not_pending',
        message: 'Only pending job orders can be updated in this baseline slice.',
      },
    ]);
  }
}

async function assertJobOrderReferences(input: {
  readonly jobOrderStore: JobOrderStore;
  readonly tenantId: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly motorcycleId: string;
  readonly transaction: DatabaseQueryClient;
}): Promise<void> {
  const branchExists = await input.jobOrderStore.activeBranchExists(
    input.tenantId,
    input.branchId,
    input.transaction,
  );

  if (!branchExists) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'branch_id',
        code: 'branch_not_active',
        message: 'Job order branch must be active and belong to the current tenant.',
      },
    ]);
  }

  const customerExists = await input.jobOrderStore.activeCustomerExists(
    input.tenantId,
    input.customerId,
    input.transaction,
  );

  if (!customerExists) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'customer_id',
        code: 'customer_not_active',
        message: 'Job order customer must be active and belong to the current tenant.',
      },
    ]);
  }

  const motorcycleBelongsToCustomer = await input.jobOrderStore.activeMotorcycleBelongsToCustomer(
    {
      tenantId: input.tenantId,
      motorcycleId: input.motorcycleId,
      customerId: input.customerId,
    },
    input.transaction,
  );

  if (!motorcycleBelongsToCustomer) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'motorcycle_id',
        code: 'motorcycle_not_active_for_customer',
        message: 'Job order motorcycle must be active and linked to the selected customer.',
      },
    ]);
  }
}

function normalizeCreateJobOrderInput(
  request: CreateJobOrderRequest,
): NormalizedCreateJobOrderInput {
  return {
    branchId: request.branch_id.trim(),
    customerId: request.customer_id.trim(),
    motorcycleId: request.motorcycle_id.trim(),
    mileageAtIntake: request.mileage_at_intake,
    customerConcern: normalizeWhitespace(request.customer_concern),
    internalNotes: normalizeNullableText(request.internal_notes),
  };
}

function normalizeUpdateJobOrderInput(
  existing: JobOrderRecord,
  request: UpdateJobOrderRequest,
): NormalizedUpdateJobOrderInput {
  return {
    mileageAtIntake: request.mileage_at_intake ?? existing.mileageAtIntake,
    customerConcern:
      request.customer_concern === undefined
        ? existing.customerConcern
        : normalizeWhitespace(request.customer_concern),
    internalNotes: Object.prototype.hasOwnProperty.call(request, 'internal_notes')
      ? normalizeNullableText(request.internal_notes)
      : existing.internalNotes,
  };
}

function toJobOrderResponse(jobOrder: JobOrderRecord): JobOrderResponse {
  return {
    id: jobOrder.id,
    branch_id: jobOrder.branchId,
    customer_id: jobOrder.customerId,
    motorcycle_id: jobOrder.motorcycleId,
    job_order_number: jobOrder.jobOrderNumber,
    status: jobOrder.status,
    service_advisor_user_id: jobOrder.serviceAdvisorUserId,
    primary_mechanic_user_id: jobOrder.primaryMechanicUserId,
    mileage_at_intake: jobOrder.mileageAtIntake,
    customer_concern: jobOrder.customerConcern,
    internal_notes: jobOrder.internalNotes,
    completed_at: jobOrder.completedAt?.toISOString() ?? null,
    released_at: jobOrder.releasedAt?.toISOString() ?? null,
    no_charge_reason: jobOrder.noChargeReason,
    release_with_balance_reason: jobOrder.releaseWithBalanceReason,
    lock_version: jobOrder.lockVersion,
    created_at: jobOrder.createdAt.toISOString(),
    updated_at: jobOrder.updatedAt.toISOString(),
    lines: jobOrder.lines.map(toJobOrderLineResponse),
  };
}

function toJobOrderLineResponse(line: JobOrderLineRecord): JobOrderLineResponse {
  return {
    id: line.id,
    line_type: line.lineType,
    service_id: line.serviceId,
    product_id: line.productId,
    description: line.description,
    quantity: normalizeQuantityString(line.quantity),
    unit_price: normalizeMoneyString(line.unitPrice),
    authorized_amount: normalizeMoneyString(line.authorizedAmount),
    status: line.status,
    inventory_reservation_id: line.inventoryReservationId,
    completed_at: line.completedAt?.toISOString() ?? null,
    line_order: line.lineOrder,
    created_at: line.createdAt.toISOString(),
    updated_at: line.updatedAt.toISOString(),
  };
}

function assertJobOrderPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

function assertJobOrderBranchAccess(context: ResolvedTenantContext, branchId: string): void {
  const decision = evaluateBranchAccess({
    context,
    branchId,
  });

  if (!decision.allowed) {
    throw GarageOsApiException.branchAccessDenied();
  }
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = normalizeWhitespace(value);

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeMoneyString(value: string | number): string {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return '0.00';
  }

  return numericValue.toFixed(2);
}

function normalizeQuantityString(value: string | number): string {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return '0.000';
  }

  return numericValue.toFixed(3);
}
