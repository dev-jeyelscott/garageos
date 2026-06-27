import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import { normalizeLockVersion } from '../../../shared/locking/optimistic-locking';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type {
  CreateMotorcycleRequest,
  ListMotorcyclesQuery,
  UpdateMotorcycleRequest,
} from '../api/motorcycle.schemas';
import {
  MotorcycleStore,
  type MotorcycleDuplicateWarningRecord,
  type MotorcycleIdentifierConflictRecord,
  type MotorcycleRecord,
} from './motorcycle.store';

export interface MotorcycleResponse {
  readonly id: string;
  readonly customer_id: string;
  readonly brand: string;
  readonly model: string;
  readonly year: number | null;
  readonly color: string | null;
  readonly plate_number: string | null;
  readonly engine_number: string | null;
  readonly chassis_number: string | null;
  readonly mileage: number;
  readonly status: 'active' | 'soft_deleted';
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface MotorcycleDuplicateWarningResponse {
  readonly type:
    | 'similar_plate_number'
    | 'similar_engine_number'
    | 'similar_chassis_number'
    | 'similar_model';
  readonly motorcycle_id: string;
  readonly brand: string;
  readonly model: string;
  readonly plate_number: string | null;
  readonly engine_number: string | null;
  readonly chassis_number: string | null;
}

export interface MotorcycleListResponse {
  readonly motorcycles: readonly MotorcycleResponse[];
}

export interface MotorcycleDetailResponse {
  readonly motorcycle: MotorcycleResponse;
}

export interface MotorcycleMutationResponse {
  readonly motorcycle: MotorcycleResponse;
  readonly duplicate_warnings: readonly MotorcycleDuplicateWarningResponse[];
}

interface NormalizedMotorcycleInput {
  readonly customerId: string;
  readonly brand: string;
  readonly model: string;
  readonly normalizedBrandModel: string;
  readonly year: number | null;
  readonly color: string | null;
  readonly plateNumber: string | null;
  readonly normalizedPlateNumber: string | null;
  readonly engineNumber: string | null;
  readonly normalizedEngineNumber: string | null;
  readonly chassisNumber: string | null;
  readonly normalizedChassisNumber: string | null;
  readonly mileage: number;
  readonly mileageCorrectionReason: string | null;
}

interface NormalizedIdentifierInput {
  readonly value: string | null;
  readonly normalizedValue: string | null;
}

const IDEMPOTENCY_RETENTION_HOURS = 24;

@Injectable()
export class MotorcyclesService {
  constructor(
    @Inject(MotorcycleStore)
    private readonly motorcycleStore: MotorcycleStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async listMotorcycles(
    query: ListMotorcyclesQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<MotorcycleListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.motorcycleStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertMotorcyclePermission(context, isShopOwner, 'motorcycles.read');

    const normalizedSearch = normalizeNullableText(query.q);

    const motorcycles = await this.motorcycleStore.listMotorcycles({
      tenantId: context.tenantId,
      customerId: normalizeNullableText(query.customer_id),
      normalizedSearch: normalizedSearch === null ? null : normalizeSearchText(normalizedSearch),
      normalizedIdentifierSearch:
        normalizedSearch === null ? null : normalizeIdentifierSearch(normalizedSearch),
      limit: query.limit,
    });

    return {
      motorcycles: motorcycles.map(toMotorcycleResponse),
    };
  }

  async getMotorcycle(
    motorcycleId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<MotorcycleDetailResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.motorcycleStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertMotorcyclePermission(context, isShopOwner, 'motorcycles.read');

    const motorcycle = await this.motorcycleStore.findMotorcycleById(
      context.tenantId,
      motorcycleId.trim(),
    );

    if (motorcycle === null) {
      throw GarageOsApiException.resourceNotFound('Motorcycle was not found.');
    }

    return {
      motorcycle: toMotorcycleResponse(motorcycle),
    };
  }

  async createMotorcycle(
    request: CreateMotorcycleRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<MotorcycleMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.motorcycleStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertMotorcyclePermission(context, isShopOwner, 'motorcycles.create');

    const input = normalizeMotorcycleInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const customer = await this.motorcycleStore.findActiveCustomerById(
        context.tenantId,
        input.customerId,
        transaction,
      );

      if (customer === null) {
        throwInactiveCustomerError();
      }

      const conflicts = await this.motorcycleStore.findIdentifierConflicts(
        {
          tenantId: context.tenantId,
          normalizedPlateNumber: input.normalizedPlateNumber,
          normalizedEngineNumber: input.normalizedEngineNumber,
          normalizedChassisNumber: input.normalizedChassisNumber,
          excludeMotorcycleId: null,
        },
        transaction,
      );

      assertNoIdentifierConflicts(conflicts);

      const duplicateWarnings = await this.motorcycleStore.findDuplicateWarnings(
        {
          tenantId: context.tenantId,
          normalizedPlateNumber: input.normalizedPlateNumber,
          normalizedEngineNumber: input.normalizedEngineNumber,
          normalizedChassisNumber: input.normalizedChassisNumber,
          normalizedBrandModel: input.normalizedBrandModel,
          excludeMotorcycleId: null,
        },
        transaction,
      );

      const createdAt = new Date();
      const motorcycle = await this.motorcycleStore.createMotorcycle(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          customerId: customer.id,
          brand: input.brand,
          model: input.model,
          year: input.year,
          color: input.color,
          plateNumber: input.plateNumber,
          normalizedPlateNumber: input.normalizedPlateNumber,
          engineNumber: input.engineNumber,
          normalizedEngineNumber: input.normalizedEngineNumber,
          chassisNumber: input.chassisNumber,
          normalizedChassisNumber: input.normalizedChassisNumber,
          latestMileage: input.mileage,
          createdAt,
        },
        transaction,
      );

      await this.motorcycleStore.createMotorcycleMileageEvent(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          motorcycleId: motorcycle.id,
          sourceType: 'manual_create',
          sourceId: null,
          previousMileage: null,
          newMileage: motorcycle.latestMileage,
          reason: 'motorcycle_created',
          createdByUserId: context.actorUserId,
          createdAt,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'motorcycles.created',
        entityType: 'motorcycle',
        entityId: motorcycle.id,
        afterJson: toMotorcycleResponse(motorcycle),
        metadataJson: {
          customer_id: customer.id,
          duplicate_warning_count: duplicateWarnings.length,
        },
        reason: 'motorcycle_created',
        client: transaction,
      });

      return {
        motorcycle: toMotorcycleResponse(motorcycle),
        duplicate_warnings: duplicateWarnings.map(toDuplicateWarningResponse),
      };
    });
  }

  async updateMotorcycle(
    motorcycleId: string,
    request: UpdateMotorcycleRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<MotorcycleMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.motorcycleStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertMotorcyclePermission(context, isShopOwner, 'motorcycles.update');

    const input = normalizeMotorcycleInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.motorcycleStore.findMotorcycleById(
        context.tenantId,
        motorcycleId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Motorcycle was not found.');
      }

      if (existing.status !== 'active') {
        throw GarageOsApiException.validationFailed([
          {
            field: 'status',
            code: 'motorcycle_not_active',
            message: 'Only active motorcycles can be updated in this slice.',
          },
        ]);
      }

      const customer = await this.motorcycleStore.findActiveCustomerById(
        context.tenantId,
        input.customerId,
        transaction,
      );

      if (customer === null) {
        throwInactiveCustomerError();
      }

      if (input.mileage < existing.latestMileage && input.mileageCorrectionReason === null) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'mileage_correction_reason',
            code: 'required_for_lower_mileage',
            message: 'A mileage correction reason is required when mileage is lowered.',
          },
        ]);
      }

      const conflicts = await this.motorcycleStore.findIdentifierConflicts(
        {
          tenantId: context.tenantId,
          normalizedPlateNumber: input.normalizedPlateNumber,
          normalizedEngineNumber: input.normalizedEngineNumber,
          normalizedChassisNumber: input.normalizedChassisNumber,
          excludeMotorcycleId: existing.id,
        },
        transaction,
      );

      assertNoIdentifierConflicts(conflicts);

      const duplicateWarnings = await this.motorcycleStore.findDuplicateWarnings(
        {
          tenantId: context.tenantId,
          normalizedPlateNumber: input.normalizedPlateNumber,
          normalizedEngineNumber: input.normalizedEngineNumber,
          normalizedChassisNumber: input.normalizedChassisNumber,
          normalizedBrandModel: input.normalizedBrandModel,
          excludeMotorcycleId: existing.id,
        },
        transaction,
      );

      const updatedAt = new Date();
      const updated = await this.motorcycleStore.updateMotorcycle(
        {
          tenantId: context.tenantId,
          motorcycleId: existing.id,
          customerId: customer.id,
          brand: input.brand,
          model: input.model,
          year: input.year,
          color: input.color,
          plateNumber: input.plateNumber,
          normalizedPlateNumber: input.normalizedPlateNumber,
          engineNumber: input.engineNumber,
          normalizedEngineNumber: input.normalizedEngineNumber,
          chassisNumber: input.chassisNumber,
          normalizedChassisNumber: input.normalizedChassisNumber,
          latestMileage: input.mileage,
          expectedLockVersion: normalizeLockVersion(request.lock_version),
          updatedAt,
        },
        transaction,
      );

      if (updated === null) {
        throw GarageOsApiException.versionConflict();
      }

      if (updated.latestMileage !== existing.latestMileage) {
        await this.motorcycleStore.createMotorcycleMileageEvent(
          {
            id: randomUUID(),
            tenantId: context.tenantId,
            motorcycleId: updated.id,
            sourceType: 'manual_update',
            sourceId: null,
            previousMileage: existing.latestMileage,
            newMileage: updated.latestMileage,
            reason: input.mileageCorrectionReason ?? 'motorcycle_updated',
            createdByUserId: context.actorUserId,
            createdAt: updatedAt,
          },
          transaction,
        );
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'motorcycles.updated',
        entityType: 'motorcycle',
        entityId: updated.id,
        beforeJson: toMotorcycleResponse(existing),
        afterJson: toMotorcycleResponse(updated),
        metadataJson: {
          duplicate_warning_count: duplicateWarnings.length,
          mileage_changed: updated.latestMileage !== existing.latestMileage,
          customer_changed: updated.customerId !== existing.customerId,
        },
        reason: input.mileageCorrectionReason ?? 'motorcycle_updated',
        client: transaction,
      });

      return {
        motorcycle: toMotorcycleResponse(updated),
        duplicate_warnings: duplicateWarnings.map(toDuplicateWarningResponse),
      };
    });
  }
}

function assertMotorcyclePermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

function normalizeMotorcycleInput(
  request: CreateMotorcycleRequest | UpdateMotorcycleRequest,
): NormalizedMotorcycleInput {
  const brand = normalizeWhitespace(request.brand);
  const model = normalizeWhitespace(request.model);
  const plate = normalizeIdentifierInput(request.plate_number);
  const engine = normalizeIdentifierInput(request.engine_number);
  const chassis = normalizeIdentifierInput(request.chassis_number);
  const mileageCorrectionReason =
    'mileage_correction_reason' in request
      ? normalizeNullableText(request.mileage_correction_reason)
      : null;

  return {
    customerId: request.customer_id.trim(),
    brand,
    model,
    normalizedBrandModel: normalizeSearchText(`${brand} ${model}`),
    year: request.year ?? null,
    color: normalizeNullableText(request.color),
    plateNumber: plate.value,
    normalizedPlateNumber: plate.normalizedValue,
    engineNumber: engine.value,
    normalizedEngineNumber: engine.normalizedValue,
    chassisNumber: chassis.value,
    normalizedChassisNumber: chassis.normalizedValue,
    mileage: request.mileage,
    mileageCorrectionReason,
  };
}

function normalizeIdentifierInput(value: string | null | undefined): NormalizedIdentifierInput {
  const displayValue = normalizeNullableText(value);

  if (displayValue === null) {
    return {
      value: null,
      normalizedValue: null,
    };
  }

  const normalizedValue = displayValue.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (normalizedValue.length === 0) {
    return {
      value: null,
      normalizedValue: null,
    };
  }

  return {
    value: displayValue.toUpperCase(),
    normalizedValue,
  };
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

function normalizeSearchText(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeIdentifierSearch(value: string): string | null {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');

  return normalized.length > 0 ? normalized : null;
}

function assertNoIdentifierConflicts(
  conflicts: readonly MotorcycleIdentifierConflictRecord[],
): void {
  if (conflicts.length === 0) {
    return;
  }

  const fields = [...new Set(conflicts.map((conflict) => conflict.type))].join(', ');

  throw GarageOsApiException.duplicateResource(
    `An active motorcycle with the same ${fields} already exists.`,
  );
}

function throwInactiveCustomerError(): never {
  throw GarageOsApiException.validationFailed([
    {
      field: 'customer_id',
      code: 'customer_not_active',
      message: 'Motorcycle must reference an active customer in the same tenant.',
    },
  ]);
}

function toMotorcycleResponse(motorcycle: MotorcycleRecord): MotorcycleResponse {
  return {
    id: motorcycle.id,
    customer_id: motorcycle.customerId,
    brand: motorcycle.brand,
    model: motorcycle.model,
    year: motorcycle.year,
    color: motorcycle.color,
    plate_number: motorcycle.plateNumber,
    engine_number: motorcycle.engineNumber,
    chassis_number: motorcycle.chassisNumber,
    mileage: motorcycle.latestMileage,
    status: motorcycle.status,
    lock_version: motorcycle.lockVersion,
    created_at: motorcycle.createdAt.toISOString(),
    updated_at: motorcycle.updatedAt.toISOString(),
  };
}

function toDuplicateWarningResponse(
  warning: MotorcycleDuplicateWarningRecord,
): MotorcycleDuplicateWarningResponse {
  return {
    type: warning.type,
    motorcycle_id: warning.motorcycleId,
    brand: warning.brand,
    model: warning.model,
    plate_number: warning.plateNumber,
    engine_number: warning.engineNumber,
    chassis_number: warning.chassisNumber,
  };
}
