import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { evaluateBranchAccess } from '../../../shared/authorization/branch-access';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import {
  buildNextEstimateNumber,
  buildNextJobOrderNumber,
  formatTenantBusinessDate,
} from '../../../shared/numbering/document-numbering';
import { normalizeLockVersion } from '../../../shared/locking/optimistic-locking';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type {
  ApproveEstimateRequest,
  ConvertEstimateRequest,
  CreateEstimateRequest,
  EstimateLineRequest,
  ListEstimatesQuery,
  PresentEstimateRequest,
  UpdateEstimateRequest,
} from '../api/estimate.schemas';
import {
  EstimateStore,
  type EstimateApprovalMethod,
  type EstimateLineRecord,
  type EstimateLineType,
  type EstimateRecord,
  type EstimateStatus,
  type JobOrderSummaryRecord,
} from './estimate.store';

export {
  buildNextEstimateNumber,
  buildNextJobOrderNumber,
  formatTenantBusinessDate,
} from '../../../shared/numbering/document-numbering';

const IDEMPOTENCY_RETENTION_HOURS = 24;
const DEFAULT_TENANT_TIMEZONE = 'Asia/Manila';

export interface EstimateLineResponse {
  readonly id: string;
  readonly line_type: EstimateLineType;
  readonly service_id: string | null;
  readonly product_id: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unit_price: string;
  readonly line_total: string;
  readonly line_order: number;
}

export interface EstimateResponse {
  readonly id: string;
  readonly branch_id: string;
  readonly customer_id: string;
  readonly motorcycle_id: string | null;
  readonly estimate_number: string;
  readonly status: EstimateStatus;
  readonly valid_until_date: string | null;
  readonly approval_method: EstimateApprovalMethod | null;
  readonly approved_by_customer_name: string | null;
  readonly approved_at: string | null;
  readonly converted_job_order_id: string | null;
  readonly subtotal_amount: string;
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly lines: readonly EstimateLineResponse[];
}

export interface EstimateListResponse {
  readonly estimates: readonly EstimateResponse[];
}

export interface EstimateDetailResponse {
  readonly estimate: EstimateResponse;
}

export interface EstimateMutationResponse {
  readonly estimate: EstimateResponse;
}

export interface JobOrderConversionSummaryResponse {
  readonly id: string;
  readonly branch_id: string;
  readonly customer_id: string;
  readonly motorcycle_id: string;
  readonly job_order_number: string;
  readonly status: JobOrderSummaryRecord['status'];
  readonly service_advisor_user_id: string;
  readonly mileage_at_intake: number;
  readonly customer_concern: string;
  readonly internal_notes: string | null;
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface EstimateConversionResponse {
  readonly estimate: EstimateResponse;
  readonly job_order: JobOrderConversionSummaryResponse;
}

interface NormalizedEstimateLineInput {
  readonly id: string;
  readonly lineType: Exclude<EstimateLineType, 'part'>;
  readonly serviceId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly lineTotal: string;
  readonly lineOrder: number;
}

interface NormalizedEstimateInput {
  readonly branchId: string;
  readonly customerId: string;
  readonly motorcycleId: string | null;
  readonly validUntilDate: string | null;
  readonly lines: readonly NormalizedEstimateLineInput[];
}

interface NormalizedConvertEstimateInput {
  readonly mileageAtIntake: number;
  readonly customerConcern: string;
  readonly internalNotes: string | null;
}

@Injectable()
export class EstimatesService {
  constructor(
    @Inject(EstimateStore)
    private readonly estimateStore: EstimateStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async listEstimates(
    query: ListEstimatesQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<EstimateListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.estimateStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertEstimatePermission(context, isShopOwner, 'estimates.read');
    assertEstimateBranchAccess(context, query.branch_id);

    const estimates = await this.estimateStore.listEstimates({
      tenantId: context.tenantId,
      branchId: query.branch_id,
      status: query.status,
      customerId: query.customer_id,
      motorcycleId: query.motorcycle_id,
      normalizedSearch: normalizeNullableText(query.q),
      limit: query.limit,
    });

    return {
      estimates: estimates.map(toEstimateResponse),
    };
  }

  async getEstimate(
    estimateId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<EstimateDetailResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.estimateStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertEstimatePermission(context, isShopOwner, 'estimates.read');

    const estimate = await this.estimateStore.findEstimateById(context.tenantId, estimateId.trim());

    if (estimate === null) {
      throw GarageOsApiException.resourceNotFound('Estimate was not found.');
    }

    assertEstimateBranchAccess(context, estimate.branchId);

    return {
      estimate: toEstimateResponse(estimate),
    };
  }

  async createEstimate(
    request: CreateEstimateRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<EstimateMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.estimateStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertEstimatePermission(context, isShopOwner, 'estimates.create');

    const input = normalizeEstimateInput(request);
    assertEstimateBranchAccess(context, input.branchId);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      await assertEstimateReferences({
        estimateStore: this.estimateStore,
        tenantId: context.tenantId,
        input,
        transaction,
      });

      await assertReferencedServices({
        estimateStore: this.estimateStore,
        tenantId: context.tenantId,
        lines: input.lines,
        transaction,
      });

      const createdAt = new Date();
      const timezone =
        (await this.estimateStore.getTenantTimezone(context.tenantId, transaction)) ??
        DEFAULT_TENANT_TIMEZONE;
      const datePart = formatTenantBusinessDate(createdAt, timezone);

      await this.estimateStore.lockEstimateNumberSequence(
        {
          tenantId: context.tenantId,
          datePart,
        },
        transaction,
      );

      const latestEstimateNumber = await this.estimateStore.findLatestEstimateNumberForDate(
        {
          tenantId: context.tenantId,
          datePart,
        },
        transaction,
      );

      const estimateNumber = buildNextEstimateNumber(datePart, latestEstimateNumber);

      const estimate = await this.estimateStore.createEstimate(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          branchId: input.branchId,
          customerId: input.customerId,
          motorcycleId: input.motorcycleId,
          estimateNumber,
          validUntilDate: input.validUntilDate,
          createdByUserId: context.actorUserId,
          createdAt,
          lines: input.lines,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'estimates.created',
        entityType: 'estimate',
        entityId: estimate.id,
        branchId: estimate.branchId,
        afterJson: toEstimateResponse(estimate),
        reason: 'estimate_created',
        client: transaction,
      });

      return {
        estimate: toEstimateResponse(estimate),
      };
    });
  }

  async updateEstimate(
    estimateId: string,
    request: UpdateEstimateRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<EstimateMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.estimateStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertEstimatePermission(context, isShopOwner, 'estimates.update');

    const normalizedLines = normalizeEstimateLines(request.lines);
    const updatedAt = new Date();

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.estimateStore.findEstimateByIdForUpdate(
        context.tenantId,
        estimateId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Estimate was not found.');
      }

      assertEstimateBranchAccess(context, existing.branchId);

      if (existing.status !== 'draft') {
        throw GarageOsApiException.validationFailed([
          {
            field: 'status',
            code: 'estimate_not_draft',
            message: 'Only draft estimates can be updated in this slice.',
          },
        ]);
      }

      await assertReferencedServices({
        estimateStore: this.estimateStore,
        tenantId: context.tenantId,
        lines: normalizedLines,
        transaction,
      });

      const updated = await this.estimateStore.updateDraftEstimate(
        {
          tenantId: context.tenantId,
          estimateId: existing.id,
          validUntilDate: normalizeNullableText(request.valid_until_date),
          expectedLockVersion: normalizeLockVersion(request.lock_version),
          updatedByUserId: context.actorUserId,
          updatedAt,
          lines: normalizedLines,
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
        action: 'estimates.updated',
        entityType: 'estimate',
        entityId: updated.id,
        branchId: updated.branchId,
        beforeJson: toEstimateResponse(existing),
        afterJson: toEstimateResponse(updated),
        reason: 'estimate_updated',
        client: transaction,
      });

      return {
        estimate: toEstimateResponse(updated),
      };
    });
  }
  async presentEstimate(
    estimateId: string,
    request: PresentEstimateRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<EstimateMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.estimateStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertEstimatePermission(context, isShopOwner, 'estimates.present');

    const updatedAt = new Date();

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.estimateStore.findEstimateByIdForUpdate(
        context.tenantId,
        estimateId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Estimate was not found.');
      }

      assertEstimateBranchAccess(context, existing.branchId);
      assertCanPresentEstimate(existing);

      const presented = await this.estimateStore.presentEstimate(
        {
          tenantId: context.tenantId,
          estimateId: existing.id,
          expectedLockVersion: normalizeLockVersion(request.lock_version),
          updatedByUserId: context.actorUserId,
          updatedAt,
        },
        transaction,
      );

      if (presented === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'estimates.presented',
        entityType: 'estimate',
        entityId: presented.id,
        branchId: presented.branchId,
        beforeJson: toEstimateResponse(existing),
        afterJson: toEstimateResponse(presented),
        reason: 'estimate_presented',
        client: transaction,
      });

      return {
        estimate: toEstimateResponse(presented),
      };
    });
  }

  async approveEstimate(
    estimateId: string,
    request: ApproveEstimateRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<EstimateMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.estimateStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertEstimatePermission(context, isShopOwner, 'estimates.approve');

    const approvedAt = new Date();
    const approvedByCustomerName = normalizeWhitespace(request.approved_by_customer_name);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.estimateStore.findEstimateByIdForUpdate(
        context.tenantId,
        estimateId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Estimate was not found.');
      }

      assertEstimateBranchAccess(context, existing.branchId);
      assertCanApproveEstimate(existing);

      const approved = await this.estimateStore.approveEstimate(
        {
          tenantId: context.tenantId,
          estimateId: existing.id,
          expectedLockVersion: normalizeLockVersion(request.lock_version),
          approvalMethod: request.approval_method,
          approvedByCustomerName,
          approvedAt,
          updatedByUserId: context.actorUserId,
          updatedAt: approvedAt,
        },
        transaction,
      );

      if (approved === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'estimates.approved',
        entityType: 'estimate',
        entityId: approved.id,
        branchId: approved.branchId,
        beforeJson: toEstimateResponse(existing),
        afterJson: toEstimateResponse(approved),
        reason: 'estimate_approved',
        client: transaction,
      });

      return {
        estimate: toEstimateResponse(approved),
      };
    });
  }

  async convertEstimate(
    estimateId: string,
    request: ConvertEstimateRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<EstimateConversionResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.estimateStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertEstimatePermission(context, isShopOwner, 'estimates.convert');

    const input = normalizeConvertEstimateInput(request);
    const convertedAt = new Date();

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.estimateStore.findEstimateByIdForUpdate(
        context.tenantId,
        estimateId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Estimate was not found.');
      }

      assertEstimateBranchAccess(context, existing.branchId);
      assertCanConvertEstimate(existing);

      await assertJobOrderConversionReferences({
        estimateStore: this.estimateStore,
        tenantId: context.tenantId,
        branchId: existing.branchId,
        customerId: existing.customerId,
        motorcycleId: existing.motorcycleId,
        transaction,
      });

      const timezone =
        (await this.estimateStore.getTenantTimezone(context.tenantId, transaction)) ??
        DEFAULT_TENANT_TIMEZONE;
      const datePart = formatTenantBusinessDate(convertedAt, timezone);

      await this.estimateStore.lockJobOrderNumberSequence(
        {
          tenantId: context.tenantId,
          datePart,
        },
        transaction,
      );

      const latestJobOrderNumber = await this.estimateStore.findLatestJobOrderNumberForDate(
        {
          tenantId: context.tenantId,
          datePart,
        },
        transaction,
      );

      const jobOrderNumber = buildNextJobOrderNumber(datePart, latestJobOrderNumber);

      const converted = await this.estimateStore.convertApprovedEstimateToJobOrder(
        {
          tenantId: context.tenantId,
          estimateId: existing.id,
          expectedLockVersion: normalizeLockVersion(request.lock_version),
          jobOrderId: randomUUID(),
          jobOrderNumber,
          serviceAdvisorUserId: context.actorUserId,
          createdByUserId: context.actorUserId,
          convertedAt,
          mileageAtIntake: input.mileageAtIntake,
          customerConcern: input.customerConcern,
          internalNotes: input.internalNotes,
          lines: existing.lines.map((line) => {
            if (line.lineType === 'part') {
              throw GarageOsApiException.validationFailed([
                {
                  field: 'lines',
                  code: 'estimate_part_lines_not_supported_for_conversion_boundary',
                  message:
                    'Estimate part lines cannot be converted until inventory reservation support is implemented.',
                },
              ]);
            }

            return {
              id: randomUUID(),
              lineType: line.lineType,
              serviceId: line.serviceId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              authorizedAmount: line.lineTotal,
              lineOrder: line.lineOrder,
            };
          }),
        },
        transaction,
      );

      if (converted === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'estimates.converted',
        entityType: 'estimate',
        entityId: converted.estimate.id,
        branchId: converted.estimate.branchId,
        beforeJson: toEstimateResponse(existing),
        afterJson: {
          estimate: toEstimateResponse(converted.estimate),
          job_order: toJobOrderConversionSummaryResponse(converted.jobOrder),
        },
        reason: 'estimate_converted_to_job_order',
        client: transaction,
      });

      return {
        estimate: toEstimateResponse(converted.estimate),
        job_order: toJobOrderConversionSummaryResponse(converted.jobOrder),
      };
    });
  }
}

async function assertEstimateReferences(input: {
  readonly estimateStore: EstimateStore;
  readonly tenantId: string;
  readonly input: NormalizedEstimateInput;
  readonly transaction: Parameters<EstimateStore['createEstimate']>[1];
}): Promise<void> {
  const branchExists = await input.estimateStore.activeBranchExists(
    input.tenantId,
    input.input.branchId,
    input.transaction,
  );

  if (!branchExists) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'branch_id',
        code: 'branch_not_active',
        message: 'Estimate branch must be active and belong to the current tenant.',
      },
    ]);
  }

  const customerExists = await input.estimateStore.activeCustomerExists(
    input.tenantId,
    input.input.customerId,
    input.transaction,
  );

  if (!customerExists) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'customer_id',
        code: 'customer_not_active',
        message: 'Estimate customer must be active and belong to the current tenant.',
      },
    ]);
  }

  if (input.input.motorcycleId !== null) {
    const motorcycleBelongsToCustomer = await input.estimateStore.activeMotorcycleBelongsToCustomer(
      {
        tenantId: input.tenantId,
        motorcycleId: input.input.motorcycleId,
        customerId: input.input.customerId,
      },
      input.transaction,
    );

    if (!motorcycleBelongsToCustomer) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'motorcycle_id',
          code: 'motorcycle_not_active_for_customer',
          message: 'Estimate motorcycle must be active and linked to the selected customer.',
        },
      ]);
    }
  }
}

export function assertCanPresentEstimate(
  estimate: Pick<EstimateRecord, 'status' | 'validUntilDate' | 'lines'>,
): void {
  if (estimate.status !== 'draft') {
    throw GarageOsApiException.workflowTransitionBlocked('Only draft estimates can be presented.', [
      {
        field: 'status',
        code: 'estimate_must_be_draft',
        message: 'Only draft estimates can be presented.',
      },
    ]);
  }

  if (estimate.lines.length < 1) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'lines',
        code: 'estimate_lines_required',
        message: 'Estimate line items are required before presentation.',
      },
    ]);
  }

  if (estimate.validUntilDate === null) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'valid_until_date',
        code: 'estimate_valid_until_required',
        message: 'Valid until date is required before presentation.',
      },
    ]);
  }
}

export function assertCanApproveEstimate(estimate: Pick<EstimateRecord, 'status'>): void {
  if (estimate.status !== 'presented') {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Only presented estimates can be approved.',
      [
        {
          field: 'status',
          code: 'estimate_must_be_presented',
          message: 'Only presented estimates can be approved.',
        },
      ],
    );
  }
}

export function assertCanConvertEstimate(
  estimate: Pick<EstimateRecord, 'status' | 'motorcycleId' | 'convertedJobOrderId' | 'lines'>,
): asserts estimate is Pick<
  EstimateRecord,
  'status' | 'motorcycleId' | 'convertedJobOrderId' | 'lines'
> & {
  readonly motorcycleId: string;
} {
  if (estimate.status !== 'approved') {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Only approved estimates can be converted to job orders.',
      [
        {
          field: 'status',
          code: 'estimate_must_be_approved',
          message: 'Only approved estimates can be converted to job orders.',
        },
      ],
    );
  }

  if (estimate.convertedJobOrderId !== null) {
    throw GarageOsApiException.workflowTransitionBlocked('Estimate has already been converted.', [
      {
        field: 'converted_job_order_id',
        code: 'estimate_already_converted',
        message: 'Estimate has already been converted.',
      },
    ]);
  }

  if (estimate.motorcycleId === null) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'motorcycle_id',
        code: 'estimate_motorcycle_required_for_job_order_conversion',
        message:
          'Approved estimate must be linked to a motorcycle before conversion to a job order.',
      },
    ]);
  }

  if (estimate.lines.length < 1) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'lines',
        code: 'estimate_lines_required_for_conversion',
        message: 'Estimate line items are required before conversion.',
      },
    ]);
  }

  if (estimate.lines.some((line) => line.lineType === 'part')) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'lines',
        code: 'estimate_part_lines_not_supported_for_conversion_boundary',
        message:
          'Estimate part lines cannot be converted until inventory reservation support is implemented.',
      },
    ]);
  }
}

async function assertJobOrderConversionReferences(input: {
  readonly estimateStore: EstimateStore;
  readonly tenantId: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly motorcycleId: string;
  readonly transaction: Parameters<EstimateStore['convertApprovedEstimateToJobOrder']>[1];
}): Promise<void> {
  const branchExists = await input.estimateStore.activeBranchExists(
    input.tenantId,
    input.branchId,
    input.transaction,
  );

  if (!branchExists) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'branch_id',
        code: 'branch_not_active',
        message: 'Estimate branch must still be active before conversion.',
      },
    ]);
  }

  const customerExists = await input.estimateStore.activeCustomerExists(
    input.tenantId,
    input.customerId,
    input.transaction,
  );

  if (!customerExists) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'customer_id',
        code: 'customer_not_active',
        message: 'Estimate customer must still be active before conversion.',
      },
    ]);
  }

  const motorcycleBelongsToCustomer = await input.estimateStore.activeMotorcycleBelongsToCustomer(
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
        message: 'Estimate motorcycle must still be active and linked to the selected customer.',
      },
    ]);
  }
}

async function assertReferencedServices(input: {
  readonly estimateStore: EstimateStore;
  readonly tenantId: string;
  readonly lines: readonly NormalizedEstimateLineInput[];
  readonly transaction: Parameters<EstimateStore['createEstimate']>[1];
}): Promise<void> {
  const serviceIds = Array.from(
    new Set(
      input.lines
        .map((line) => line.serviceId)
        .filter((serviceId): serviceId is string => serviceId !== null),
    ),
  );

  for (const serviceId of serviceIds) {
    const serviceExists = await input.estimateStore.activeServiceExists(
      input.tenantId,
      serviceId,
      input.transaction,
    );

    if (!serviceExists) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'lines.service_id',
          code: 'service_not_active',
          message: 'Referenced estimate service must be active and belong to the current tenant.',
        },
      ]);
    }
  }
}

function normalizeEstimateInput(request: CreateEstimateRequest): NormalizedEstimateInput {
  return {
    branchId: request.branch_id.trim(),
    customerId: request.customer_id.trim(),
    motorcycleId: normalizeNullableText(request.motorcycle_id),
    validUntilDate: normalizeNullableText(request.valid_until_date),
    lines: normalizeEstimateLines(request.lines),
  };
}

function normalizeConvertEstimateInput(
  request: ConvertEstimateRequest,
): NormalizedConvertEstimateInput {
  return {
    mileageAtIntake: request.mileage_at_intake,
    customerConcern: normalizeWhitespace(request.customer_concern),
    internalNotes: normalizeNullableText(request.internal_notes),
  };
}

function normalizeEstimateLines(
  lines: readonly EstimateLineRequest[],
): readonly NormalizedEstimateLineInput[] {
  return lines.map((line, index) => {
    const quantity = normalizeQuantityString(line.quantity);
    const unitPrice = normalizeMoneyString(line.unit_price);

    return {
      id: randomUUID(),
      lineType: line.line_type,
      serviceId: normalizeNullableText(line.service_id),
      description: normalizeWhitespace(line.description),
      quantity,
      unitPrice,
      lineTotal: calculateEstimateLineTotal(quantity, unitPrice),
      lineOrder: line.line_order ?? index,
    };
  });
}

function toEstimateResponse(estimate: EstimateRecord): EstimateResponse {
  return {
    id: estimate.id,
    branch_id: estimate.branchId,
    customer_id: estimate.customerId,
    motorcycle_id: estimate.motorcycleId,
    estimate_number: estimate.estimateNumber,
    status: estimate.status,
    valid_until_date: estimate.validUntilDate,
    approval_method: estimate.approvalMethod,
    approved_by_customer_name: estimate.approvedByCustomerName,
    approved_at: estimate.approvedAt?.toISOString() ?? null,
    converted_job_order_id: estimate.convertedJobOrderId,
    subtotal_amount: calculateEstimateSubtotal(estimate.lines),
    lock_version: estimate.lockVersion,
    created_at: estimate.createdAt.toISOString(),
    updated_at: estimate.updatedAt.toISOString(),
    lines: estimate.lines.map(toEstimateLineResponse),
  };
}

function toEstimateLineResponse(line: EstimateLineRecord): EstimateLineResponse {
  return {
    id: line.id,
    line_type: line.lineType,
    service_id: line.serviceId,
    product_id: line.productId,
    description: line.description,
    quantity: normalizeQuantityString(line.quantity),
    unit_price: normalizeMoneyString(line.unitPrice),
    line_total: normalizeMoneyString(line.lineTotal),
    line_order: line.lineOrder,
  };
}

function toJobOrderConversionSummaryResponse(
  jobOrder: JobOrderSummaryRecord,
): JobOrderConversionSummaryResponse {
  return {
    id: jobOrder.id,
    branch_id: jobOrder.branchId,
    customer_id: jobOrder.customerId,
    motorcycle_id: jobOrder.motorcycleId,
    job_order_number: jobOrder.jobOrderNumber,
    status: jobOrder.status,
    service_advisor_user_id: jobOrder.serviceAdvisorUserId,
    mileage_at_intake: jobOrder.mileageAtIntake,
    customer_concern: jobOrder.customerConcern,
    internal_notes: jobOrder.internalNotes,
    lock_version: jobOrder.lockVersion,
    created_at: jobOrder.createdAt.toISOString(),
    updated_at: jobOrder.updatedAt.toISOString(),
  };
}

function calculateEstimateSubtotal(lines: readonly EstimateLineRecord[]): string {
  const subtotal = lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);

  return normalizeMoneyString(String(subtotal));
}

export function calculateEstimateLineTotal(quantity: string, unitPrice: string): string {
  const total = Number(quantity) * Number(unitPrice);

  if (!Number.isFinite(total)) {
    return '0.00';
  }

  return (Math.round(total * 100) / 100).toFixed(2);
}

function assertEstimatePermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

function assertEstimateBranchAccess(context: ResolvedTenantContext, branchId: string): void {
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
