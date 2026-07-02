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
  CreateSupplierRequest,
  ListSuppliersQuery,
  SupplierPaymentRequest,
  SupplierStatusChangeRequest,
  UpdateSupplierRequest,
} from '../api/supplier.schemas';
import {
  SupplierStore,
  type SupplierDeactivationBlocker,
  type SupplierListCursor,
  type SupplierPaymentMethod,
  type SupplierPaymentRecord,
  type SupplierRecord,
  type SupplierStatus,
} from './supplier.store';

export interface SupplierResponse {
  readonly id: string;
  readonly name: string;
  readonly status: SupplierStatus;
  readonly contact_person: string | null;
  readonly mobile_number: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly notes: string | null;
  readonly lock_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deactivated_at: string | null;
  readonly reactivated_at: string | null;
}

export interface SupplierPaymentResponse {
  readonly id: string;
  readonly supplier_id: string;
  readonly amount: string;
  readonly payment_date: string;
  readonly payment_method: SupplierPaymentMethod;
  readonly reference_number: string | null;
  readonly notes: string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: string;
}

export interface SupplierPaginationResponse {
  readonly limit: number;
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

export interface SupplierListResponse {
  readonly suppliers: readonly SupplierResponse[];
  readonly pagination: SupplierPaginationResponse;
}

export interface SupplierDetailResponse {
  readonly supplier: SupplierResponse;
}

export interface SupplierMutationResponse {
  readonly supplier: SupplierResponse;
}

export interface SupplierPaymentMutationResponse {
  readonly payment: SupplierPaymentResponse;
  readonly balance: {
    readonly before_payment: string;
    readonly payment_amount: string;
    readonly after_payment: string;
  };
}

interface NormalizedSupplierInput {
  readonly name: string;
  readonly normalizedName: string;
  readonly contactPerson: string | null;
  readonly mobileNumber: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly notes: string | null;
}

interface NormalizedSupplierPaymentInput {
  readonly amount: string;
  readonly paymentDate: string;
  readonly paymentMethod: SupplierPaymentMethod;
  readonly referenceNumber: string | null;
  readonly notes: string | null;
}

const IDEMPOTENCY_RETENTION_HOURS = 24;

@Injectable()
export class SupplierService {
  constructor(
    @Inject(SupplierStore)
    private readonly supplierStore: SupplierStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async listSuppliers(
    query: ListSuppliersQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<SupplierListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.supplierStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertSupplierPermission(context, isShopOwner, 'suppliers.read');

    const limit = query.limit;
    const suppliers = await this.supplierStore.listSuppliers({
      tenantId: context.tenantId,
      normalizedSearch: normalizeSearchQuery(query.q),
      status: query.status,
      limit: limit + 1,
      cursor: decodeSupplierListCursor(query.cursor),
    });
    const visibleSuppliers = suppliers.slice(0, limit);
    const hasMore = suppliers.length > limit;

    return {
      suppliers: visibleSuppliers.map(toSupplierResponse),
      pagination: {
        limit,
        has_more: hasMore,
        next_cursor: hasMore ? encodeSupplierListCursor(visibleSuppliers.at(-1) ?? null) : null,
      },
    };
  }

  async getSupplier(
    supplierId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<SupplierDetailResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.supplierStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertSupplierPermission(context, isShopOwner, 'suppliers.read');

    const supplier = await this.supplierStore.findSupplierById(context.tenantId, supplierId.trim());

    if (supplier === null) {
      throw GarageOsApiException.resourceNotFound('Supplier was not found.');
    }

    return {
      supplier: toSupplierResponse(supplier),
    };
  }

  async createSupplier(
    request: CreateSupplierRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<SupplierMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.supplierStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertSupplierPermission(context, isShopOwner, 'suppliers.create');

    const input = normalizeSupplierInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const createdAt = new Date();
      const supplier = await translateDuplicateSupplierName(async () =>
        this.supplierStore.createSupplier(
          {
            id: randomUUID(),
            tenantId: context.tenantId,
            name: input.name,
            normalizedName: input.normalizedName,
            contactPerson: input.contactPerson,
            mobileNumber: input.mobileNumber,
            email: input.email,
            address: input.address,
            notes: input.notes,
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
        action: 'suppliers.created',
        entityType: 'supplier',
        entityId: supplier.id,
        afterJson: toSupplierResponse(supplier),
        reason: 'supplier_created',
        client: transaction,
      });

      return {
        supplier: toSupplierResponse(supplier),
      };
    });
  }

  async updateSupplier(
    supplierId: string,
    request: UpdateSupplierRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<SupplierMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.supplierStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertSupplierPermission(context, isShopOwner, 'suppliers.update');

    const input = normalizeSupplierInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.supplierStore.findSupplierById(
        context.tenantId,
        supplierId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Supplier was not found.');
      }

      const updatedAt = new Date();
      const updated = await translateDuplicateSupplierName(async () =>
        this.supplierStore.updateSupplier(
          {
            tenantId: context.tenantId,
            supplierId: existing.id,
            name: input.name,
            normalizedName: input.normalizedName,
            contactPerson: input.contactPerson,
            mobileNumber: input.mobileNumber,
            email: input.email,
            address: input.address,
            notes: input.notes,
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
        action: 'suppliers.updated',
        entityType: 'supplier',
        entityId: updated.id,
        beforeJson: toSupplierResponse(existing),
        afterJson: toSupplierResponse(updated),
        reason: 'supplier_updated',
        client: transaction,
      });

      return {
        supplier: toSupplierResponse(updated),
      };
    });
  }

  async recordSupplierPayment(
    supplierId: string,
    request: SupplierPaymentRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<SupplierPaymentMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.supplierStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertSupplierPermission(context, isShopOwner, 'supplier_payments.create');

    const input = normalizeSupplierPaymentInput(request);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const supplier = await this.supplierStore.lockSupplierById(
        context.tenantId,
        supplierId.trim(),
        transaction,
      );

      if (supplier === null) {
        throw GarageOsApiException.resourceNotFound('Supplier was not found.');
      }

      if (supplier.status !== 'active') {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Supplier payments require an active supplier.',
          [
            {
              field: 'supplier_id',
              code: 'supplier_inactive',
              message: 'Supplier must be active before recording a supplier payment.',
            },
          ],
        );
      }

      const balanceBeforePayment = formatMoneyCents(
        parseMoneyCents(
          await this.supplierStore.getSupplierPayableBalanceForUpdate(
            context.tenantId,
            supplier.id,
            transaction,
          ),
        ),
      );

      if (compareMoney(input.amount, balanceBeforePayment) > 0) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'amount',
            code: 'supplier_payment_exceeds_payable_balance',
            message: 'Supplier payment amount cannot exceed the current supplier payable balance.',
          },
        ]);
      }

      const createdAt = new Date();
      const payment = await this.supplierStore.createSupplierPayment(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          supplierId: supplier.id,
          amount: input.amount,
          paymentDate: input.paymentDate,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber,
          notes: input.notes,
          createdByUserId: context.actorUserId,
          createdAt,
        },
        transaction,
      );
      const balanceAfterPayment = subtractMoney(balanceBeforePayment, payment.amount);
      const paymentResponse = toSupplierPaymentResponse(payment);

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'supplier_payments.created',
        entityType: 'supplier_payment',
        entityId: payment.id,
        beforeJson: {
          supplier_id: supplier.id,
          supplier_balance: balanceBeforePayment,
        },
        afterJson: {
          supplier_id: supplier.id,
          payment: paymentResponse,
          supplier_balance: balanceAfterPayment,
        },
        reason: 'supplier_payment_recorded',
        createdAt,
        client: transaction,
      });

      return {
        payment: paymentResponse,
        balance: {
          before_payment: balanceBeforePayment,
          payment_amount: payment.amount,
          after_payment: balanceAfterPayment,
        },
      };
    });
  }

  async deactivateSupplier(
    supplierId: string,
    request: SupplierStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<SupplierMutationResponse> {
    return this.changeSupplierStatus(supplierId, request, session, {
      fromStatus: 'active',
      toStatus: 'inactive',
      requiredPermission: 'suppliers.deactivate',
      action: 'suppliers.deactivated',
      fallbackReason: 'supplier_deactivated',
    });
  }

  async reactivateSupplier(
    supplierId: string,
    request: SupplierStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<SupplierMutationResponse> {
    return this.changeSupplierStatus(supplierId, request, session, {
      fromStatus: 'inactive',
      toStatus: 'active',
      requiredPermission: 'suppliers.update',
      action: 'suppliers.reactivated',
      fallbackReason: 'supplier_reactivated',
    });
  }

  private async changeSupplierStatus(
    supplierId: string,
    request: SupplierStatusChangeRequest,
    session: TenantContextAuthenticatedSession,
    options: {
      readonly fromStatus: SupplierStatus;
      readonly toStatus: SupplierStatus;
      readonly requiredPermission: string;
      readonly action: string;
      readonly fallbackReason: string;
    },
  ): Promise<SupplierMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.supplierStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertSupplierPermission(context, isShopOwner, options.requiredPermission);

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.supplierStore.findSupplierById(
        context.tenantId,
        supplierId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Supplier was not found.');
      }

      if (existing.status !== options.fromStatus) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'status',
            code: 'invalid_supplier_status',
            message: `Supplier must be ${options.fromStatus} before this action.`,
          },
        ]);
      }

      if (options.toStatus === 'inactive') {
        const blockers = await this.supplierStore.findSupplierDeactivationBlockers(
          context.tenantId,
          existing.id,
          transaction,
        );

        if (blockers.length > 0) {
          throw GarageOsApiException.validationFailed(
            blockers.map((blocker) => ({
              field: 'supplier_id',
              code: `supplier_deactivation_blocked_${blocker}`,
              message: `Supplier deactivation is blocked by ${formatBlocker(blocker)}.`,
            })),
          );
        }
      }

      const changedAt = new Date();
      const changed = await translateDuplicateSupplierName(async () =>
        this.supplierStore.changeSupplierStatus(
          {
            tenantId: context.tenantId,
            supplierId: existing.id,
            fromStatus: options.fromStatus,
            toStatus: options.toStatus,
            expectedLockVersion:
              request.lock_version === undefined
                ? null
                : normalizeLockVersion(request.lock_version),
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
        entityType: 'supplier',
        entityId: changed.id,
        beforeJson: toSupplierResponse(existing),
        afterJson: toSupplierResponse(changed),
        reason: normalizeNullableText(request.reason) ?? options.fallbackReason,
        client: transaction,
      });

      return {
        supplier: toSupplierResponse(changed),
      };
    });
  }
}

function normalizeSupplierInput(
  request: CreateSupplierRequest | UpdateSupplierRequest,
): NormalizedSupplierInput {
  const name = normalizeWhitespace(request.name);

  return {
    name,
    normalizedName: normalizeSearchText(name),
    contactPerson: normalizeNullableText(request.contact_person),
    mobileNumber: normalizeNullableText(request.mobile_number),
    email: normalizeNullableText(request.email),
    address: normalizeNullableText(request.address),
    notes: normalizeNullableText(request.notes),
  };
}

function normalizeSupplierPaymentInput(
  request: SupplierPaymentRequest,
): NormalizedSupplierPaymentInput {
  return {
    amount: request.amount,
    paymentDate: request.payment_date,
    paymentMethod: request.payment_method,
    referenceNumber: normalizeNullableText(request.reference_number),
    notes: normalizeNullableText(request.notes),
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

function normalizeSearchQuery(value: string | undefined): string | null {
  const normalizedValue = normalizeNullableText(value);

  return normalizedValue === null ? null : normalizeSearchText(normalizedValue);
}

function toSupplierResponse(supplier: SupplierRecord): SupplierResponse {
  return {
    id: supplier.id,
    name: supplier.name,
    status: supplier.status,
    contact_person: supplier.contactPerson,
    mobile_number: supplier.mobileNumber,
    email: supplier.email,
    address: supplier.address,
    notes: supplier.notes,
    lock_version: supplier.lockVersion,
    created_at: supplier.createdAt.toISOString(),
    updated_at: supplier.updatedAt.toISOString(),
    deactivated_at: supplier.deactivatedAt?.toISOString() ?? null,
    reactivated_at: supplier.reactivatedAt?.toISOString() ?? null,
  };
}

function toSupplierPaymentResponse(payment: SupplierPaymentRecord): SupplierPaymentResponse {
  return {
    id: payment.id,
    supplier_id: payment.supplierId,
    amount: payment.amount,
    payment_date: payment.paymentDate,
    payment_method: payment.paymentMethod,
    reference_number: payment.referenceNumber,
    notes: payment.notes,
    created_by_user_id: payment.createdByUserId,
    created_at: payment.createdAt.toISOString(),
  };
}

function assertSupplierPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

async function translateDuplicateSupplierName<Result>(
  work: () => Promise<Result>,
): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    if (isUniqueViolation(error, ['ux_suppliers_active_name'])) {
      throw GarageOsApiException.duplicateResource(
        'An active supplier with this name already exists for this tenant.',
      );
    }

    throw error;
  }
}

function isUniqueViolation(error: unknown, constraints: readonly string[]): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'constraint' in error &&
    (error as { code?: unknown; constraint?: unknown }).code === '23505' &&
    constraints.includes(String((error as { constraint?: unknown }).constraint))
  );
}

function encodeSupplierListCursor(supplier: SupplierRecord | null): string | null {
  if (supplier === null) {
    return null;
  }

  return Buffer.from(
    JSON.stringify({
      updated_at: supplier.updatedAt.toISOString(),
      id: supplier.id,
    }),
  ).toString('base64url');
}

function decodeSupplierListCursor(value: string | undefined): SupplierListCursor | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;

    if (!isCursorPayload(decoded)) {
      return null;
    }

    const updatedAt = new Date(decoded.updated_at);

    if (Number.isNaN(updatedAt.getTime())) {
      return null;
    }

    return {
      updatedAt,
      id: decoded.id,
    };
  } catch {
    return null;
  }
}

function isCursorPayload(
  value: unknown,
): value is { readonly updated_at: string; readonly id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'updated_at' in value &&
    typeof (value as { updated_at?: unknown }).updated_at === 'string' &&
    'id' in value &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

function formatBlocker(blocker: SupplierDeactivationBlocker): string {
  return blocker.replaceAll('_', ' ');
}

function compareMoney(left: string, right: string): number {
  const leftCents = parseMoneyCents(left);
  const rightCents = parseMoneyCents(right);

  if (leftCents === rightCents) {
    return 0;
  }

  return leftCents > rightCents ? 1 : -1;
}

function subtractMoney(left: string, right: string): string {
  return formatMoneyCents(parseMoneyCents(left) - parseMoneyCents(right));
}

function parseMoneyCents(value: string): bigint {
  const [wholePart = '0', decimalPart = ''] = value.split('.');

  return BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, '0').slice(0, 2));
}

function formatMoneyCents(value: bigint): string {
  const wholePart = value / 100n;
  const decimalPart = value % 100n;

  return `${wholePart.toString()}.${decimalPart.toString().padStart(2, '0')}`;
}
