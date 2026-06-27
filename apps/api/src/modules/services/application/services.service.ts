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
  CreateServiceRequest,
  ListServicesQuery,
  ServiceStatusChangeRequest,
  UpdateServiceRequest,
} from '../api/service.schemas';
import {
  ServiceStore,
  type ServiceDeactivationBlocker,
  type ServiceRecord,
  type ServiceStatus,
} from './service.store';

export interface ServiceResponse {
  readonly id: string;
  readonly name: string;
  readonly starting_price: string;
  readonly variable_price: boolean;
  readonly price_disclaimer: string | null;
  readonly description: string | null;
  readonly status: ServiceStatus;
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deactivated_at: string | null;
  readonly reactivated_at: string | null;
}

export interface ServiceListResponse {
  readonly services: readonly ServiceResponse[];
}

export interface ServiceDetailResponse {
  readonly service: ServiceResponse;
}

export interface ServiceMutationResponse {
  readonly service: ServiceResponse;
}

interface NormalizedServiceInput {
  readonly name: string;
  readonly normalizedName: string;
  readonly startingPrice: string;
  readonly variablePrice: boolean;
  readonly priceDisclaimer: string | null;
  readonly description: string | null;
}

const IDEMPOTENCY_RETENTION_HOURS = 24;

@Injectable()
export class ServicesService {
  constructor(
    @Inject(ServiceStore)
    private readonly serviceStore: ServiceStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async listServices(
    query: ListServicesQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<ServiceListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.serviceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertServicePermission(context, isShopOwner, 'services.read');

    const normalizedSearch = normalizeNullableText(query.q);
    const services = await this.serviceStore.listServices({
      tenantId: context.tenantId,
      normalizedSearch: normalizedSearch === null ? null : normalizeSearchText(normalizedSearch),
      status: query.status,
      limit: query.limit,
    });

    return {
      services: services.map(toServiceResponse),
    };
  }

  async getService(
    serviceId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<ServiceDetailResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.serviceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertServicePermission(context, isShopOwner, 'services.read');

    const service = await this.serviceStore.findServiceById(context.tenantId, serviceId.trim());

    if (service === null) {
      throw GarageOsApiException.resourceNotFound('Service was not found.');
    }

    return {
      service: toServiceResponse(service),
    };
  }

  async createService(
    request: CreateServiceRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ServiceMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.serviceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertServicePermission(context, isShopOwner, 'services.create');

    const input = normalizeServiceInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const createdAt = new Date();

      const service = await translateDuplicateServiceName(async () =>
        this.serviceStore.createService(
          {
            id: randomUUID(),
            tenantId: context.tenantId,
            name: input.name,
            normalizedName: input.normalizedName,
            startingPrice: input.startingPrice,
            variablePrice: input.variablePrice,
            priceDisclaimer: input.priceDisclaimer,
            description: input.description,
            createdByUserId: context.actorUserId,
            createdAt,
          },
          transaction,
        ),
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'services.created',
        entityType: 'service',
        entityId: service.id,
        afterJson: toServiceResponse(service),
        reason: 'service_created',
        client: transaction,
      });

      return {
        service: toServiceResponse(service),
      };
    });
  }

  async updateService(
    serviceId: string,
    request: UpdateServiceRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ServiceMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.serviceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertServicePermission(context, isShopOwner, 'services.update');

    const input = normalizeServiceInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.serviceStore.findServiceById(
        context.tenantId,
        serviceId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Service was not found.');
      }

      if (existing.status !== 'active') {
        throw GarageOsApiException.validationFailed([
          {
            field: 'status',
            code: 'service_not_active',
            message: 'Only active services can be updated.',
          },
        ]);
      }

      const updatedAt = new Date();
      const updated = await translateDuplicateServiceName(async () =>
        this.serviceStore.updateService(
          {
            tenantId: context.tenantId,
            serviceId: existing.id,
            name: input.name,
            normalizedName: input.normalizedName,
            startingPrice: input.startingPrice,
            variablePrice: input.variablePrice,
            priceDisclaimer: input.priceDisclaimer,
            description: input.description,
            expectedLockVersion: normalizeLockVersion(request.lock_version),
            updatedByUserId: context.actorUserId,
            updatedAt,
          },
          transaction,
        ),
      );

      if (updated === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'services.updated',
        entityType: 'service',
        entityId: updated.id,
        beforeJson: toServiceResponse(existing),
        afterJson: toServiceResponse(updated),
        reason: 'service_updated',
        client: transaction,
      });

      return {
        service: toServiceResponse(updated),
      };
    });
  }

  async deactivateService(
    serviceId: string,
    request: ServiceStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ServiceMutationResponse> {
    return this.changeServiceStatus(serviceId, request, session, {
      fromStatus: 'active',
      toStatus: 'inactive',
      permission: 'services.deactivate',
      action: 'services.deactivated',
      fallbackReason: 'service_deactivated',
    });
  }

  async reactivateService(
    serviceId: string,
    request: ServiceStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ServiceMutationResponse> {
    return this.changeServiceStatus(serviceId, request, session, {
      fromStatus: 'inactive',
      toStatus: 'active',
      permission: 'services.update',
      action: 'services.reactivated',
      fallbackReason: 'service_reactivated',
    });
  }

  private async changeServiceStatus(
    serviceId: string,
    request: ServiceStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
    options: {
      readonly fromStatus: ServiceStatus;
      readonly toStatus: ServiceStatus;
      readonly permission: string;
      readonly action: string;
      readonly fallbackReason: string;
    },
  ): Promise<ServiceMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.serviceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertServicePermission(context, isShopOwner, options.permission);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.serviceStore.findServiceById(
        context.tenantId,
        serviceId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Service was not found.');
      }

      if (existing.status !== options.fromStatus) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'status',
            code: 'invalid_service_status',
            message: `Service must be ${options.fromStatus} before this action.`,
          },
        ]);
      }

      if (options.toStatus === 'inactive') {
        const blockers = await this.serviceStore.findServiceDeactivationBlockers(
          context.tenantId,
          existing.id,
          transaction,
        );

        if (blockers.length > 0) {
          throw GarageOsApiException.validationFailed(
            blockers.map((blocker) => ({
              field: 'service_id',
              code: `service_deactivation_blocked_${blocker}`,
              message: `Service deactivation is blocked by ${formatBlocker(blocker)}.`,
            })),
          );
        }
      }

      const changedAt = new Date();
      const changed = await translateDuplicateServiceName(async () =>
        this.serviceStore.changeServiceStatus(
          {
            tenantId: context.tenantId,
            serviceId: existing.id,
            fromStatus: options.fromStatus,
            toStatus: options.toStatus,
            expectedLockVersion: normalizeLockVersion(request.lock_version),
            changedByUserId: context.actorUserId,
            changedAt,
          },
          transaction,
        ),
      );

      if (changed === null) {
        throw GarageOsApiException.versionConflict();
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: options.action,
        entityType: 'service',
        entityId: changed.id,
        beforeJson: toServiceResponse(existing),
        afterJson: toServiceResponse(changed),
        reason: normalizeNullableText(request.reason) ?? options.fallbackReason,
        client: transaction,
      });

      return {
        service: toServiceResponse(changed),
      };
    });
  }
}

function normalizeServiceInput(
  request: CreateServiceRequest | UpdateServiceRequest,
): NormalizedServiceInput {
  return {
    name: normalizeWhitespace(request.name),
    normalizedName: normalizeSearchText(request.name),
    startingPrice: request.starting_price,
    variablePrice: request.variable_price,
    priceDisclaimer: normalizeNullableText(request.price_disclaimer),
    description: normalizeNullableText(request.description),
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

function toServiceResponse(service: ServiceRecord): ServiceResponse {
  return {
    id: service.id,
    name: service.name,
    starting_price: normalizeMoneyString(service.startingPrice),
    variable_price: service.variablePrice,
    price_disclaimer: service.priceDisclaimer,
    description: service.description,
    status: service.status,
    lock_version: service.lockVersion,
    created_at: service.createdAt.toISOString(),
    updated_at: service.updatedAt.toISOString(),
    deactivated_at: service.deactivatedAt?.toISOString() ?? null,
    reactivated_at: service.reactivatedAt?.toISOString() ?? null,
  };
}

function normalizeMoneyString(value: string | number): string {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return '0.00';
  }

  return numericValue.toFixed(2);
}

function assertServicePermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

async function translateDuplicateServiceName<Result>(work: () => Promise<Result>): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    if (isActiveServiceNameUniqueViolation(error)) {
      throw GarageOsApiException.duplicateResource(
        'An active service with this name already exists for this tenant.',
      );
    }

    throw error;
  }
}

function isActiveServiceNameUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'constraint' in error &&
    (error as { code?: unknown; constraint?: unknown }).code === '23505' &&
    (error as { code?: unknown; constraint?: unknown }).constraint === 'ux_services_active_name'
  );
}

function formatBlocker(blocker: ServiceDeactivationBlocker): string {
  return blocker.replaceAll('_', ' ');
}
