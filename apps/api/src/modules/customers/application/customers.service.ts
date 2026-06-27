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
  CreateCustomerRequest,
  ListCustomersQuery,
  UpdateCustomerRequest,
} from '../api/customer.schemas';
import {
  CustomerStore,
  type CustomerDuplicateWarningRecord,
  type CustomerRecord,
  type CustomerTagRecord,
} from './customer.store';

export interface CustomerResponse {
  readonly id: string;
  readonly name: string;
  readonly mobile_number: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly birthday: string | null;
  readonly notes: string | null;
  readonly tags: readonly string[];
  readonly status: 'active' | 'merged' | 'soft_deleted';
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CustomerDuplicateWarningResponse {
  readonly type: 'exact_mobile' | 'exact_email' | 'similar_name';
  readonly customer_id: string;
  readonly name: string;
  readonly mobile_number: string | null;
  readonly email: string | null;
}

export interface CustomerListResponse {
  readonly customers: readonly CustomerResponse[];
}

export interface CustomerDetailResponse {
  readonly customer: CustomerResponse;
}

export interface CustomerMutationResponse {
  readonly customer: CustomerResponse;
  readonly duplicate_warnings: readonly CustomerDuplicateWarningResponse[];
}

interface NormalizedCustomerInput {
  readonly name: string;
  readonly normalizedName: string;
  readonly mobileNumber: string | null;
  readonly normalizedMobile: string | null;
  readonly email: string | null;
  readonly normalizedEmail: string | null;
  readonly address: string | null;
  readonly birthday: string | null;
  readonly notes: string | null;
  readonly tags: readonly NormalizedTagInput[];
}

interface NormalizedTagInput {
  readonly name: string;
  readonly normalizedName: string;
}

const IDEMPOTENCY_RETENTION_HOURS = 24;

@Injectable()
export class CustomersService {
  constructor(
    @Inject(CustomerStore)
    private readonly customerStore: CustomerStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async listCustomers(
    query: ListCustomersQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<CustomerListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.customerStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertCustomerPermission(context, isShopOwner, 'customers.read');

    const normalizedSearch = normalizeNullableText(query.q);
    const customers = await this.customerStore.listCustomers({
      tenantId: context.tenantId,
      normalizedSearch: normalizedSearch === null ? null : normalizeSearchText(normalizedSearch),
      normalizedMobileSearch:
        normalizedSearch === null ? null : normalizeMobileNumber(normalizedSearch),
      normalizedTagNames: normalizeListQueryTags(query.tag),
      limit: query.limit,
    });

    return {
      customers: customers.map(toCustomerResponse),
    };
  }

  async getCustomer(
    customerId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<CustomerDetailResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.customerStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertCustomerPermission(context, isShopOwner, 'customers.read');

    const customer = await this.customerStore.findCustomerById(context.tenantId, customerId.trim());

    if (customer === null) {
      throw GarageOsApiException.resourceNotFound('Customer was not found.');
    }

    return {
      customer: toCustomerResponse(customer),
    };
  }

  async createCustomer(
    request: CreateCustomerRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<CustomerMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.customerStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertCustomerPermission(context, isShopOwner, 'customers.create');

    const input = normalizeCustomerInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const createdAt = new Date();
      const duplicateWarnings = await this.customerStore.findDuplicateWarnings(
        {
          tenantId: context.tenantId,
          normalizedMobile: input.normalizedMobile,
          normalizedEmail: input.normalizedEmail,
          normalizedName: input.normalizedName,
          excludeCustomerId: null,
        },
        transaction,
      );

      const customer = await this.customerStore.createCustomer(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          name: input.name,
          normalizedName: input.normalizedName,
          mobileNumber: input.mobileNumber,
          normalizedMobile: input.normalizedMobile,
          email: input.email,
          normalizedEmail: input.normalizedEmail,
          address: input.address,
          birthday: input.birthday,
          notes: input.notes,
          createdByUserId: context.actorUserId,
          createdAt,
        },
        transaction,
      );

      const tagRecords = await this.upsertAndAssignTags(
        context.tenantId,
        customer.id,
        input.tags,
        createdAt,
        transaction,
      );
      const customerWithTags = withTags(
        customer,
        tagRecords.map((tag) => tag.name),
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'customers.created',
        entityType: 'customer',
        entityId: customer.id,
        afterJson: toCustomerResponse(customerWithTags),
        metadataJson: {
          duplicate_warning_count: duplicateWarnings.length,
        },
        reason: 'customer_created',
        client: transaction,
      });

      return {
        customer: toCustomerResponse(customerWithTags),
        duplicate_warnings: duplicateWarnings.map(toDuplicateWarningResponse),
      };
    });
  }

  async updateCustomer(
    customerId: string,
    request: UpdateCustomerRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<CustomerMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.customerStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertCustomerPermission(context, isShopOwner, 'customers.update');

    const input = normalizeCustomerInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.customerStore.findCustomerById(
        context.tenantId,
        customerId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Customer was not found.');
      }

      if (existing.status !== 'active') {
        throw GarageOsApiException.validationFailed([
          {
            field: 'status',
            code: 'customer_not_active',
            message: 'Only active customers can be updated in this slice.',
          },
        ]);
      }

      const duplicateWarnings = await this.customerStore.findDuplicateWarnings(
        {
          tenantId: context.tenantId,
          normalizedMobile: input.normalizedMobile,
          normalizedEmail: input.normalizedEmail,
          normalizedName: input.normalizedName,
          excludeCustomerId: existing.id,
        },
        transaction,
      );

      const updatedAt = new Date();
      const updated = await this.customerStore.updateCustomer(
        {
          tenantId: context.tenantId,
          customerId: existing.id,
          name: input.name,
          normalizedName: input.normalizedName,
          mobileNumber: input.mobileNumber,
          normalizedMobile: input.normalizedMobile,
          email: input.email,
          normalizedEmail: input.normalizedEmail,
          address: input.address,
          birthday: input.birthday,
          notes: input.notes,
          expectedLockVersion: normalizeLockVersion(request.lock_version),
          updatedByUserId: context.actorUserId,
          updatedAt,
        },
        transaction,
      );

      if (updated === null) {
        throw GarageOsApiException.versionConflict();
      }

      const tagRecords = await this.upsertAndAssignTags(
        context.tenantId,
        updated.id,
        input.tags,
        updatedAt,
        transaction,
      );
      const updatedWithTags = withTags(
        updated,
        tagRecords.map((tag) => tag.name),
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'customers.updated',
        entityType: 'customer',
        entityId: updated.id,
        beforeJson: toCustomerResponse(existing),
        afterJson: toCustomerResponse(updatedWithTags),
        metadataJson: {
          duplicate_warning_count: duplicateWarnings.length,
        },
        reason: 'customer_updated',
        client: transaction,
      });

      return {
        customer: toCustomerResponse(updatedWithTags),
        duplicate_warnings: duplicateWarnings.map(toDuplicateWarningResponse),
      };
    });
  }

  private async upsertAndAssignTags(
    tenantId: string,
    customerId: string,
    tags: readonly NormalizedTagInput[],
    createdAt: Date,
    transaction: Parameters<CustomerStore['upsertCustomerTag']>[1],
  ): Promise<readonly CustomerTagRecord[]> {
    const tagRecords: CustomerTagRecord[] = [];

    for (const tag of tags) {
      const tagRecord = await this.customerStore.upsertCustomerTag(
        {
          id: randomUUID(),
          tenantId,
          name: tag.name,
          normalizedName: tag.normalizedName,
          createdAt,
        },
        transaction,
      );
      tagRecords.push(tagRecord);
    }

    await this.customerStore.replaceCustomerTagAssignments(
      {
        tenantId,
        customerId,
        tagIds: tagRecords.map((tag) => tag.id),
        createdAt,
      },
      transaction,
    );

    return tagRecords;
  }
}

function assertCustomerPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

function normalizeCustomerInput(
  request: CreateCustomerRequest | UpdateCustomerRequest,
): NormalizedCustomerInput {
  const mobileNumber = normalizeNullableText(request.mobile_number);
  const email = normalizeNullableText(request.email)?.toLowerCase() ?? null;

  if (mobileNumber === null && email === null) {
    throw GarageOsApiException.validationFailed([
      {
        field: 'mobile_number',
        code: 'contact_method_required',
        message: 'At least one contact method is required.',
      },
      {
        field: 'email',
        code: 'contact_method_required',
        message: 'At least one contact method is required.',
      },
    ]);
  }

  const name = normalizeWhitespace(request.name);

  return {
    name,
    normalizedName: normalizeSearchText(name),
    mobileNumber,
    normalizedMobile: mobileNumber === null ? null : normalizeMobileNumber(mobileNumber),
    email,
    normalizedEmail: email,
    address: normalizeNullableText(request.address),
    birthday: normalizeNullableText(request.birthday),
    notes: normalizeNullableText(request.notes),
    tags: normalizeTagInputs(request.tags ?? []),
  };
}

function normalizeTagInputs(tags: readonly string[]): readonly NormalizedTagInput[] {
  const seen = new Set<string>();
  const normalizedTags: NormalizedTagInput[] = [];

  for (const tag of tags) {
    const name = normalizeWhitespace(tag);
    const normalizedName = normalizeSearchText(name);

    if (seen.has(normalizedName)) {
      continue;
    }

    seen.add(normalizedName);
    normalizedTags.push({ name, normalizedName });
  }

  return normalizedTags;
}

function normalizeListQueryTags(value: string | readonly string[] | undefined): readonly string[] {
  const tags = Array.isArray(value) ? value : value === undefined ? [] : [value];

  return normalizeTagInputs(tags).map((tag) => tag.normalizedName);
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

function normalizeMobileNumber(value: string): string {
  return value.replace(/\D/g, '');
}

function withTags(customer: CustomerRecord, tags: readonly string[]): CustomerRecord {
  return {
    ...customer,
    tags,
  };
}

function toCustomerResponse(customer: CustomerRecord): CustomerResponse {
  return {
    id: customer.id,
    name: customer.name,
    mobile_number: customer.mobileNumber,
    email: customer.email,
    address: customer.address,
    birthday: customer.birthday,
    notes: customer.notes,
    tags: customer.tags,
    status: customer.status,
    lock_version: customer.lockVersion,
    created_at: customer.createdAt.toISOString(),
    updated_at: customer.updatedAt.toISOString(),
  };
}

function toDuplicateWarningResponse(
  warning: CustomerDuplicateWarningRecord,
): CustomerDuplicateWarningResponse {
  return {
    type: warning.type,
    customer_id: warning.customerId,
    name: warning.name,
    mobile_number: warning.mobileNumber,
    email: warning.email,
  };
}
