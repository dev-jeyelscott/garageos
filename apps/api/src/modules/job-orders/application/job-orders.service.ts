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
  AssignJobOrderMechanicsRequest,
  CreateJobOrderPartLineRequest,
  CreateJobOrderRequest,
  CreateJobOrderServiceLineRequest,
  ListJobOrdersQuery,
  TransitionJobOrderStatusRequest,
  UpdateJobOrderLineRequest,
  UpdateJobOrderRequest,
} from '../api/job-order.schemas';
import {
  JobOrderStore,
  type JobOrderLineRecord,
  type JobOrderLineSnapshotInput,
  type JobOrderLineStatus,
  type JobOrderLineType,
  type JobOrderMechanicAssignmentRecord,
  type JobOrderRecord,
  type JobOrderStatus,
  type JobOrderStatusEventRecord,
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

export interface JobOrderMechanicAssignmentResponse {
  readonly id: string;
  readonly user_id: string;
  readonly assignment_type: 'primary' | 'additional';
  readonly assigned_at: string;
}

export interface JobOrderStatusEventResponse {
  readonly id: string;
  readonly job_order_id: string;
  readonly from_status: JobOrderStatus | null;
  readonly to_status: JobOrderStatus;
  readonly reason: string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: string;
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
  readonly mechanics: readonly JobOrderMechanicAssignmentResponse[];
}

export interface JobOrderListResponse {
  readonly job_orders: readonly JobOrderResponse[];
}

export interface JobOrderDetailResponse {
  readonly job_order: JobOrderResponse;
}

export interface JobOrderStatusEventsResponse {
  readonly status_events: readonly JobOrderStatusEventResponse[];
}

export interface JobOrderMutationResponse {
  readonly job_order: JobOrderResponse;
}

export interface JobOrderStatusTransitionMutationResponse extends JobOrderMutationResponse {
  readonly status_event: JobOrderStatusEventResponse;
}

export interface JobOrderLineMutationResponse {
  readonly job_order: JobOrderResponse;
  readonly line: JobOrderLineResponse;
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

interface NormalizedJobOrderLineInput {
  readonly lineType: Exclude<JobOrderLineType, 'part'>;
  readonly serviceId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly authorizedAmount: string;
  readonly lineOrder: number | null;
}

interface NormalizedMechanicAssignmentInput {
  readonly primaryMechanicUserId: string;
  readonly additionalMechanicUserIds: readonly string[];
  readonly allMechanicUserIds: readonly string[];
}

interface NormalizedJobOrderStatusTransitionInput {
  readonly toStatus: JobOrderStatus;
  readonly reason: string | null;
  readonly expectedLockVersion: number;
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

  async listStatusEvents(
    jobOrderId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<JobOrderStatusEventsResponse> {
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

    const statusEvents = await this.jobOrderStore.listJobOrderStatusEvents(
      context.tenantId,
      jobOrder.id,
    );

    return {
      status_events: statusEvents.map(toJobOrderStatusEventResponse),
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

  async assignMechanics(
    jobOrderId: string,
    request: AssignJobOrderMechanicsRequest,
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

    const input = normalizeMechanicAssignmentInput(request);

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
      assertCanAssignJobOrderMechanics(existing);

      await assertAssignableMechanics({
        jobOrderStore: this.jobOrderStore,
        tenantId: context.tenantId,
        branchId: existing.branchId,
        mechanicUserIds: input.allMechanicUserIds,
        transaction,
      });

      const assignedAt = new Date();
      const updated = await this.jobOrderStore.replaceJobOrderMechanics(
        {
          tenantId: context.tenantId,
          jobOrderId: existing.id,
          primaryMechanicUserId: input.primaryMechanicUserId,
          additionalMechanicUserIds: input.additionalMechanicUserIds,
          assignedAt,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'job_order_mechanics.assigned',
        entityType: 'job_order',
        entityId: updated.id,
        branchId: updated.branchId,
        beforeJson: toJobOrderResponse(existing),
        afterJson: toJobOrderResponse(updated),
        reason: 'job_order_mechanics_assigned',
        client: transaction,
      });

      return {
        job_order: toJobOrderResponse(updated),
      };
    });
  }

  async transitionStatus(
    jobOrderId: string,
    request: TransitionJobOrderStatusRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<JobOrderStatusTransitionMutationResponse> {
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
    assertAnyJobOrderPermission(context, isShopOwner, [
      'job_orders.change_status',
      'job_orders.correct_status',
      'job_orders.cancel',
      'job_orders.release',
    ]);

    const input = normalizeJobOrderStatusTransitionInput(request);

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

      const requiredPermission = getRequiredJobOrderStatusTransitionPermission(
        existing,
        input.toStatus,
      );
      assertJobOrderPermission(context, isShopOwner, requiredPermission);
      assertCanTransitionJobOrderStatus(existing, {
        toStatus: input.toStatus,
        reason: input.reason,
      });

      const transitionedAt = new Date();
      const transitionResult = await this.jobOrderStore.transitionJobOrderStatus(
        {
          tenantId: context.tenantId,
          jobOrderId: existing.id,
          fromStatus: existing.status,
          toStatus: input.toStatus,
          reason: input.reason,
          expectedLockVersion: input.expectedLockVersion,
          transitionedByUserId: context.actorUserId,
          transitionedAt,
        },
        transaction,
      );

      if (transitionResult === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: getJobOrderStatusTransitionAuditAction(existing.status, input.toStatus),
        entityType: 'job_order',
        entityId: transitionResult.jobOrder.id,
        branchId: transitionResult.jobOrder.branchId,
        beforeJson: toJobOrderResponse(existing),
        afterJson: toJobOrderResponse(transitionResult.jobOrder),
        metadataJson: {
          from_status: existing.status,
          to_status: input.toStatus,
          status_event_id: transitionResult.statusEvent.id,
          required_permission: requiredPermission,
        },
        reason: input.reason ?? 'job_order_status_changed',
        client: transaction,
      });

      return {
        job_order: toJobOrderResponse(transitionResult.jobOrder),
        status_event: toJobOrderStatusEventResponse(transitionResult.statusEvent),
      };
    });
  }

  async addServiceLine(
    jobOrderId: string,
    request: CreateJobOrderServiceLineRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<JobOrderLineMutationResponse> {
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

    const input = normalizeJobOrderLineInput(request);

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
      assertCanEditJobOrderLines(existing);

      const snapshot = await buildJobOrderLineSnapshot({
        jobOrderStore: this.jobOrderStore,
        tenantId: context.tenantId,
        line: input,
        transaction,
      });
      const createdAt = new Date();

      const line = await this.jobOrderStore.createJobOrderLine(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          jobOrderId: existing.id,
          lineType: input.lineType,
          serviceId: input.serviceId,
          description: input.description,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          authorizedAmount: input.authorizedAmount,
          lineOrder: input.lineOrder,
          sourceName: snapshot.sourceName,
          sourcePrice: snapshot.sourcePrice,
          sourceDisclaimer: snapshot.sourceDisclaimer,
          createdAt,
        },
        transaction,
      );

      const updated = await this.reloadJobOrderOrThrow(context.tenantId, existing.id, transaction);

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'job_order_lines.created',
        entityType: 'job_order_line',
        entityId: line.id,
        branchId: updated.branchId,
        beforeJson: toJobOrderResponse(existing),
        afterJson: toJobOrderResponse(updated),
        reason: 'job_order_line_created',
        client: transaction,
      });

      return {
        job_order: toJobOrderResponse(updated),
        line: toJobOrderLineResponse(line),
      };
    });
  }

  async updateJobOrderLine(
    jobOrderId: string,
    lineId: string,
    request: UpdateJobOrderLineRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<JobOrderLineMutationResponse> {
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

    const input = normalizeJobOrderLineInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existingJobOrder = await this.jobOrderStore.findJobOrderByIdForUpdate(
        context.tenantId,
        jobOrderId.trim(),
        transaction,
      );

      if (existingJobOrder === null) {
        throw GarageOsApiException.resourceNotFound('Job order was not found.');
      }

      assertJobOrderBranchAccess(context, existingJobOrder.branchId);
      assertCanEditJobOrderLines(existingJobOrder);

      const existingLine = await this.jobOrderStore.findJobOrderLineByIdForUpdate(
        context.tenantId,
        existingJobOrder.id,
        lineId.trim(),
        transaction,
      );

      if (existingLine === null) {
        throw GarageOsApiException.resourceNotFound('Job order line was not found.');
      }

      assertEditableServiceOrLaborLine(existingLine);

      const snapshot = await buildJobOrderLineSnapshot({
        jobOrderStore: this.jobOrderStore,
        tenantId: context.tenantId,
        line: input,
        transaction,
      });
      const updatedAt = new Date();

      const line = await this.jobOrderStore.updateJobOrderLine(
        {
          tenantId: context.tenantId,
          jobOrderId: existingJobOrder.id,
          lineId: existingLine.id,
          lineType: input.lineType,
          serviceId: input.serviceId,
          description: input.description,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          authorizedAmount: input.authorizedAmount,
          lineOrder: input.lineOrder,
          sourceName: snapshot.sourceName,
          sourcePrice: snapshot.sourcePrice,
          sourceDisclaimer: snapshot.sourceDisclaimer,
          updatedAt,
        },
        transaction,
      );

      if (line === null) {
        throw GarageOsApiException.resourceNotFound('Job order line was not found.');
      }

      const updatedJobOrder = await this.reloadJobOrderOrThrow(
        context.tenantId,
        existingJobOrder.id,
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'job_order_lines.updated',
        entityType: 'job_order_line',
        entityId: line.id,
        branchId: updatedJobOrder.branchId,
        beforeJson: {
          job_order: toJobOrderResponse(existingJobOrder),
          line: toJobOrderLineResponse(existingLine),
        },
        afterJson: {
          job_order: toJobOrderResponse(updatedJobOrder),
          line: toJobOrderLineResponse(line),
        },
        reason: 'job_order_line_updated',
        client: transaction,
      });

      return {
        job_order: toJobOrderResponse(updatedJobOrder),
        line: toJobOrderLineResponse(line),
      };
    });
  }

  async removeJobOrderLine(
    jobOrderId: string,
    lineId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<JobOrderLineMutationResponse> {
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
      const existingJobOrder = await this.jobOrderStore.findJobOrderByIdForUpdate(
        context.tenantId,
        jobOrderId.trim(),
        transaction,
      );

      if (existingJobOrder === null) {
        throw GarageOsApiException.resourceNotFound('Job order was not found.');
      }

      assertJobOrderBranchAccess(context, existingJobOrder.branchId);
      assertCanEditJobOrderLines(existingJobOrder);

      const existingLine = await this.jobOrderStore.findJobOrderLineByIdForUpdate(
        context.tenantId,
        existingJobOrder.id,
        lineId.trim(),
        transaction,
      );

      if (existingLine === null) {
        throw GarageOsApiException.resourceNotFound('Job order line was not found.');
      }

      assertEditableServiceOrLaborLine(existingLine);

      const updatedAt = new Date();
      const line = await this.jobOrderStore.cancelJobOrderLine(
        {
          tenantId: context.tenantId,
          jobOrderId: existingJobOrder.id,
          lineId: existingLine.id,
          updatedAt,
        },
        transaction,
      );

      if (line === null) {
        throw GarageOsApiException.resourceNotFound('Job order line was not found.');
      }

      const updatedJobOrder = await this.reloadJobOrderOrThrow(
        context.tenantId,
        existingJobOrder.id,
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'job_order_lines.removed',
        entityType: 'job_order_line',
        entityId: line.id,
        branchId: updatedJobOrder.branchId,
        beforeJson: {
          job_order: toJobOrderResponse(existingJobOrder),
          line: toJobOrderLineResponse(existingLine),
        },
        afterJson: {
          job_order: toJobOrderResponse(updatedJobOrder),
          line: toJobOrderLineResponse(line),
        },
        reason: 'job_order_line_removed',
        client: transaction,
      });

      return {
        job_order: toJobOrderResponse(updatedJobOrder),
        line: toJobOrderLineResponse(line),
      };
    });
  }

  async createPartLine(
    jobOrderId: string,
    _request: CreateJobOrderPartLineRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<never> {
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
      assertCanEditJobOrderLines(existing);
      assertBaselinePartLinesBlocked();
    });
  }

  private async reloadJobOrderOrThrow(
    tenantId: string,
    jobOrderId: string,
    transaction: DatabaseQueryClient,
  ): Promise<JobOrderRecord> {
    const jobOrder = await this.jobOrderStore.findJobOrderById(tenantId, jobOrderId, transaction);

    if (jobOrder === null) {
      throw GarageOsApiException.resourceNotFound('Job order was not found.');
    }

    return jobOrder;
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

export function assertCanEditJobOrderLines(jobOrder: Pick<JobOrderRecord, 'status'>): void {
  if (
    jobOrder.status !== 'pending' &&
    jobOrder.status !== 'in_progress' &&
    jobOrder.status !== 'waiting_for_parts'
  ) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'status',
        code: 'job_order_line_edit_blocked_by_status',
        message:
          'Job order lines can only be changed while the job order is pending, in progress, or waiting for parts.',
      },
    ]);
  }
}

export function assertCanAssignJobOrderMechanics(jobOrder: Pick<JobOrderRecord, 'status'>): void {
  if (
    jobOrder.status !== 'pending' &&
    jobOrder.status !== 'in_progress' &&
    jobOrder.status !== 'waiting_for_parts'
  ) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'status',
        code: 'job_order_mechanic_assignment_blocked_by_status',
        message:
          'Mechanics can only be assigned while the job order is pending, in progress, or waiting for parts.',
      },
    ]);
  }
}

export function getRequiredJobOrderStatusTransitionPermission(
  jobOrder: Pick<JobOrderRecord, 'status'>,
  toStatus: JobOrderStatus,
): string {
  if (jobOrder.status === 'completed' && toStatus === 'in_progress') {
    return 'job_orders.correct_status';
  }

  if (toStatus === 'cancelled') {
    return 'job_orders.cancel';
  }

  if (toStatus === 'released') {
    return 'job_orders.release';
  }

  return 'job_orders.change_status';
}

export function assertCanTransitionJobOrderStatus(
  jobOrder: Pick<JobOrderRecord, 'status' | 'primaryMechanicUserId' | 'lines'>,
  input: {
    readonly toStatus: JobOrderStatus;
    readonly reason: string | null;
  },
): void {
  if (jobOrder.status === input.toStatus) {
    throw GarageOsApiException.workflowTransitionBlocked('Job order is already in that status.', [
      {
        field: 'to_status',
        code: 'job_order_status_unchanged',
        message: 'Job order is already in that status.',
      },
    ]);
  }

  if (jobOrder.status === 'released') {
    throw GarageOsApiException.workflowTransitionBlocked('Released job orders are final.', [
      {
        field: 'status',
        code: 'job_order_released_final',
        message: 'Released job orders are final and cannot transition to another status.',
      },
    ]);
  }

  if (jobOrder.status === 'cancelled') {
    throw GarageOsApiException.workflowTransitionBlocked('Cancelled job orders are final.', [
      {
        field: 'status',
        code: 'job_order_cancelled_final',
        message: 'Cancelled job orders are final and cannot transition to another status.',
      },
    ]);
  }

  if (input.toStatus === 'released' || input.toStatus === 'cancelled') {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Release and cancellation require dedicated workflows and are not available through the generic status transition endpoint.',
      [
        {
          field: 'to_status',
          code: 'job_order_status_transition_requires_dedicated_workflow',
          message:
            'Use the dedicated release or cancellation workflow when that slice is implemented.',
        },
      ],
    );
  }

  if (jobOrder.status === 'pending' && input.toStatus === 'in_progress') {
    if (jobOrder.primaryMechanicUserId === null) {
      throw GarageOsApiException.workflowTransitionBlocked(
        'A primary mechanic is required before moving a job order to in progress.',
        [
          {
            field: 'primary_mechanic_user_id',
            code: 'primary_mechanic_required',
            message: 'Assign a primary mechanic before moving the job order to in progress.',
          },
        ],
      );
    }

    return;
  }

  if (jobOrder.status === 'pending' && input.toStatus === 'waiting_for_parts') {
    assertStatusTransitionReason(input.reason, {
      code: 'waiting_for_parts_reason_required',
      message: 'A reason is required when moving a job order to waiting for parts.',
    });

    return;
  }

  if (jobOrder.status === 'in_progress' && input.toStatus === 'waiting_for_parts') {
    assertStatusTransitionReason(input.reason, {
      code: 'waiting_for_parts_reason_required',
      message: 'A reason is required when moving a job order to waiting for parts.',
    });

    return;
  }

  if (jobOrder.status === 'in_progress' && input.toStatus === 'completed') {
    assertRequiredServiceAndLaborLinesComplete(jobOrder);

    return;
  }

  if (jobOrder.status === 'waiting_for_parts' && input.toStatus === 'in_progress') {
    assertStatusTransitionReason(input.reason, {
      code: 'resume_from_waiting_for_parts_reason_required',
      message:
        'A manual reason is required to resume from waiting for parts until inventory availability checks are implemented.',
    });

    return;
  }

  if (jobOrder.status === 'completed' && input.toStatus === 'in_progress') {
    assertStatusTransitionReason(input.reason, {
      code: 'status_correction_reason_required',
      message:
        'A correction reason is required when moving a completed job order back to in progress.',
    });

    return;
  }

  throw GarageOsApiException.workflowTransitionBlocked(
    'The requested job order status transition is not allowed.',
    [
      {
        field: 'to_status',
        code: 'job_order_status_transition_not_allowed',
        message: `Cannot transition job order from ${jobOrder.status} to ${input.toStatus}.`,
      },
    ],
  );
}

function assertRequiredServiceAndLaborLinesComplete(jobOrder: Pick<JobOrderRecord, 'lines'>): void {
  const hasActiveRequiredLine = jobOrder.lines.some(
    (line) =>
      (line.lineType === 'service' || line.lineType === 'labor') && line.status === 'active',
  );

  if (hasActiveRequiredLine) {
    throw GarageOsApiException.workflowTransitionBlocked(
      'All required service and labor lines must be completed before completing the job order.',
      [
        {
          field: 'lines',
          code: 'job_order_required_lines_not_completed',
          message:
            'Complete or cancel all required active service and labor lines before completing the job order.',
        },
      ],
    );
  }
}

function assertStatusTransitionReason(
  reason: string | null,
  detail: {
    readonly code: string;
    readonly message: string;
  },
): void {
  if (reason === null) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'reason',
        code: detail.code,
        message: detail.message,
      },
    ]);
  }
}

export function assertBaselinePartLinesBlocked(): never {
  throw GarageOsApiException.validationFailed([
    {
      field: 'part_lines',
      code: 'job_order_part_lines_not_supported_until_inventory_reservation',
      message:
        'Job order part lines are blocked until inventory reservation and FIFO allocation support is implemented.',
    },
  ]);
}

function assertEditableServiceOrLaborLine(line: JobOrderLineRecord): void {
  if (line.status !== 'active') {
    throw GarageOsApiException.validationFailed([
      {
        field: 'line_id',
        code: 'job_order_line_not_active',
        message: 'Only active job order lines can be edited or removed.',
      },
    ]);
  }

  if (line.lineType === 'part' || line.inventoryReservationId !== null) {
    assertBaselinePartLinesBlocked();
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

async function assertAssignableMechanics(input: {
  readonly jobOrderStore: JobOrderStore;
  readonly tenantId: string;
  readonly branchId: string;
  readonly mechanicUserIds: readonly string[];
  readonly transaction: DatabaseQueryClient;
}): Promise<void> {
  const mechanics = await input.jobOrderStore.findAssignableMechanics(
    {
      tenantId: input.tenantId,
      branchId: input.branchId,
      userIds: input.mechanicUserIds,
    },
    input.transaction,
  );

  const mechanicsByUserId = new Map(mechanics.map((mechanic) => [mechanic.userId, mechanic]));

  const inactiveOrMissingMechanicIds = input.mechanicUserIds.filter(
    (mechanicUserId) => !mechanicsByUserId.has(mechanicUserId),
  );

  if (inactiveOrMissingMechanicIds.length > 0) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'mechanic_user_ids',
        code: 'mechanic_not_active_employee',
        message:
          'Assigned mechanics must be active tenant users with active employee profiles in the current tenant.',
      },
    ]);
  }

  const branchDeniedMechanicIds = input.mechanicUserIds.filter((mechanicUserId) => {
    const mechanic = mechanicsByUserId.get(mechanicUserId);

    return mechanic !== undefined && !mechanic.branchAccessAllowed;
  });

  if (branchDeniedMechanicIds.length > 0) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'mechanic_user_ids',
        code: 'mechanic_branch_access_denied',
        message:
          'Assigned mechanics must have access to the job order branch or tenant-wide branch access.',
      },
    ]);
  }
}

async function buildJobOrderLineSnapshot(input: {
  readonly jobOrderStore: JobOrderStore;
  readonly tenantId: string;
  readonly line: NormalizedJobOrderLineInput;
  readonly transaction: DatabaseQueryClient;
}): Promise<JobOrderLineSnapshotInput> {
  if (input.line.serviceId === null) {
    return {
      sourceName: input.line.description,
      sourcePrice: input.line.unitPrice,
      sourceDisclaimer: null,
    };
  }

  const service = await input.jobOrderStore.findActiveServiceSnapshot(
    input.tenantId,
    input.line.serviceId,
    input.transaction,
  );

  if (service === null) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'service_id',
        code: 'service_not_active',
        message: 'Referenced job order service must be active and belong to the current tenant.',
      },
    ]);
  }

  return {
    sourceName: service.name,
    sourcePrice: service.startingPrice,
    sourceDisclaimer: service.priceDisclaimer,
  };
}

function normalizeJobOrderLineInput(
  request: CreateJobOrderServiceLineRequest | UpdateJobOrderLineRequest,
): NormalizedJobOrderLineInput {
  const quantity = normalizeQuantityString(request.quantity);
  const unitPrice = normalizeMoneyString(request.unit_price);

  return {
    lineType: request.line_type,
    serviceId: normalizeNullableText(request.service_id),
    description: normalizeWhitespace(request.description),
    quantity,
    unitPrice,
    authorizedAmount: calculateJobOrderLineAuthorizedAmount(quantity, unitPrice),
    lineOrder: request.line_order ?? null,
  };
}

function normalizeMechanicAssignmentInput(
  request: AssignJobOrderMechanicsRequest,
): NormalizedMechanicAssignmentInput {
  const primaryMechanicUserId = request.primary_mechanic_user_id.trim();
  const additionalMechanicUserIds = [
    ...new Set(
      request.additional_mechanic_user_ids
        .map((mechanicUserId) => mechanicUserId.trim())
        .filter((mechanicUserId) => mechanicUserId !== primaryMechanicUserId),
    ),
  ];

  return {
    primaryMechanicUserId,
    additionalMechanicUserIds,
    allMechanicUserIds: [primaryMechanicUserId, ...additionalMechanicUserIds],
  };
}

function normalizeJobOrderStatusTransitionInput(
  request: TransitionJobOrderStatusRequest,
): NormalizedJobOrderStatusTransitionInput {
  return {
    toStatus: request.to_status,
    reason: normalizeNullableText(request.reason),
    expectedLockVersion: normalizeLockVersion(request.lock_version),
  };
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
    mechanics: jobOrder.mechanics.map(toJobOrderMechanicAssignmentResponse),
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

function toJobOrderMechanicAssignmentResponse(
  mechanic: JobOrderMechanicAssignmentRecord,
): JobOrderMechanicAssignmentResponse {
  return {
    id: mechanic.id,
    user_id: mechanic.userId,
    assignment_type: mechanic.assignmentType,
    assigned_at: mechanic.assignedAt.toISOString(),
  };
}

function toJobOrderStatusEventResponse(
  statusEvent: JobOrderStatusEventRecord,
): JobOrderStatusEventResponse {
  return {
    id: statusEvent.id,
    job_order_id: statusEvent.jobOrderId,
    from_status: statusEvent.fromStatus,
    to_status: statusEvent.toStatus,
    reason: statusEvent.reason,
    created_by_user_id: statusEvent.createdByUserId,
    created_at: statusEvent.createdAt.toISOString(),
  };
}

export function calculateJobOrderLineAuthorizedAmount(quantity: string, unitPrice: string): string {
  const total = Number(quantity) * Number(unitPrice);

  if (!Number.isFinite(total)) {
    return '0.00';
  }

  return (Math.round(total * 100) / 100).toFixed(2);
}

function assertAnyJobOrderPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permissions: readonly string[],
): void {
  if (isShopOwner) {
    return;
  }

  const hasAnyPermission = permissions.some((permission) =>
    context.effectivePermissions.includes(permission),
  );

  if (!hasAnyPermission) {
    throw GarageOsApiException.forbidden(permissions.join('|'));
  }
}

export function getJobOrderStatusTransitionAuditAction(
  fromStatus: JobOrderStatus,
  toStatus: JobOrderStatus,
): string {
  if (fromStatus === 'completed' && toStatus === 'in_progress') {
    return 'job_orders.status_corrected';
  }

  return 'job_orders.status_changed';
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
