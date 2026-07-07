import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { assertBranchAccessAllowed } from '../../../shared/authorization/branch-access';
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
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type {
  CreateExpenseRequest,
  ListExpensesQuery,
  UpdateExpenseRequest,
  VoidExpenseRequest,
} from '../api/expense.schemas';
import {
  ExpenseStore,
  type ExpensePaymentMethod,
  type ExpenseRecord,
  type ExpenseStatus,
} from './expense.store';

const IDEMPOTENCY_RETENTION_HOURS = 24;

export interface ExpenseResponse {
  readonly id: string;
  readonly branch_id: string;
  readonly branch_name: string | null;
  readonly category_id: string;
  readonly category_name: string | null;
  readonly expense_date: string;
  readonly amount: string;
  readonly payment_method: ExpensePaymentMethod;
  readonly reference_number: string | null;
  readonly description: string;
  readonly status: ExpenseStatus;
  readonly void_reason: string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly updated_by_user_id: string | null;
  readonly lock_version: number;
}

export interface ExpensePaginationResponse {
  readonly limit: number;
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

export interface ExpenseListResponse {
  readonly expenses: readonly ExpenseResponse[];
  readonly pagination: ExpensePaginationResponse;
}

export interface ExpenseDetailResponse {
  readonly expense: ExpenseResponse;
}

export interface ExpenseMutationResponse {
  readonly expense: ExpenseResponse;
}

interface NormalizedExpenseInput {
  readonly branchId: string;
  readonly categoryId: string;
  readonly expenseDate: string;
  readonly amount: string;
  readonly paymentMethod: ExpensePaymentMethod;
  readonly referenceNumber: string | null;
  readonly description: string;
}

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(ExpenseStore)
    private readonly expenseStore: ExpenseStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async listExpenses(
    query: ListExpensesQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<ExpenseListResponse> {
    const { context } = await this.resolveAccess(session, 'expenses.read', 'read');
    const branchIds = resolveBranchIdsForList(context, query.branch_id ?? null);

    if (branchIds !== null && branchIds.length === 0) {
      return emptyExpenseList(query.limit);
    }

    const expenses = await this.expenseStore.listExpenses({
      tenantId: context.tenantId,
      branchIds,
      categoryId: normalizeNullableText(query.category_id),
      status: query.status,
      fromDate: normalizeNullableText(query.from_date),
      toDate: normalizeNullableText(query.to_date),
      limit: query.limit + 1,
      cursor: decodeExpenseListCursor(query.cursor),
    });
    const visibleExpenses = expenses.slice(0, query.limit);
    const hasMore = expenses.length > query.limit;

    return {
      expenses: visibleExpenses.map(toExpenseResponse),
      pagination: {
        limit: query.limit,
        has_more: hasMore,
        next_cursor: hasMore ? encodeExpenseListCursor(visibleExpenses.at(-1) ?? null) : null,
      },
    };
  }

  async getExpense(
    expenseId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<ExpenseDetailResponse> {
    const { context } = await this.resolveAccess(session, 'expenses.read', 'read');
    const expense = await this.expenseStore.findExpenseById(context.tenantId, expenseId.trim());

    if (expense === null) {
      throw GarageOsApiException.resourceNotFound('Expense was not found.');
    }

    assertBranchAccessAllowed({ context, branchId: expense.branchId });

    return {
      expense: toExpenseResponse(expense),
    };
  }

  async createExpense(
    request: CreateExpenseRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ExpenseMutationResponse> {
    const { context } = await this.resolveAccess(session, 'expenses.create', 'write');
    const input = normalizeExpenseInput(request);

    assertBranchAccessAllowed({ context, branchId: input.branchId });

    return this.transactionRunner.runInTransaction(async (transaction) => {
      await this.assertActiveReferences(context.tenantId, input, transaction);

      const createdAt = new Date();
      const expense = await this.expenseStore.createExpense(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          branchId: input.branchId,
          categoryId: input.categoryId,
          expenseDate: input.expenseDate,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber,
          description: input.description,
          createdByUserId: context.actorUserId,
          createdAt,
        },
        transaction,
      );
      const response = toExpenseResponse(expense);

      await this.expenseStore.createExpenseStatusEvent(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          expenseId: expense.id,
          fromStatus: null,
          toStatus: 'active',
          reason: 'expense_created',
          beforeJson: null,
          afterJson: response,
          createdByUserId: context.actorUserId,
          createdAt,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        branchId: expense.branchId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'expenses.created',
        entityType: 'expense',
        entityId: expense.id,
        afterJson: response,
        reason: 'expense_created',
        createdAt,
        client: transaction,
      });

      return {
        expense: response,
      };
    });
  }

  async updateExpense(
    expenseId: string,
    request: UpdateExpenseRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ExpenseMutationResponse> {
    const { context } = await this.resolveAccess(session, 'expenses.update', 'write');
    const input = normalizeExpenseInput(request);

    assertBranchAccessAllowed({ context, branchId: input.branchId });

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.expenseStore.lockExpenseById(
        context.tenantId,
        expenseId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Expense was not found.');
      }

      assertBranchAccessAllowed({ context, branchId: existing.branchId });

      if (existing.status !== 'active') {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Only active expenses can be updated.',
          [
            {
              field: 'status',
              code: 'expense_not_active',
              message: 'Expense must be active before it can be updated.',
            },
          ],
        );
      }

      await this.assertActiveReferences(context.tenantId, input, transaction);
      const reason = normalizeNullableText(request.reason);

      if (isReportAffectingChange(existing, input) && reason === null) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'reason',
            code: 'expense_edit_reason_required',
            message: 'An edit reason is required for report-affecting expense changes.',
          },
        ]);
      }

      const updatedAt = new Date();
      const updated = await this.expenseStore.updateExpense(
        {
          tenantId: context.tenantId,
          expenseId: existing.id,
          branchId: input.branchId,
          categoryId: input.categoryId,
          expenseDate: input.expenseDate,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber,
          description: input.description,
          expectedLockVersion: normalizeLockVersion(request.lock_version),
          updatedByUserId: context.actorUserId,
          updatedAt,
        },
        transaction,
      );

      if (updated === null) {
        throw GarageOsApiException.versionConflict();
      }

      const beforeResponse = toExpenseResponse(existing);
      const afterResponse = toExpenseResponse(updated);

      await this.expenseStore.createExpenseStatusEvent(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          expenseId: updated.id,
          fromStatus: existing.status,
          toStatus: updated.status,
          reason: reason ?? 'expense_updated',
          beforeJson: beforeResponse,
          afterJson: afterResponse,
          createdByUserId: context.actorUserId,
          createdAt: updatedAt,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        branchId: updated.branchId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'expenses.updated',
        entityType: 'expense',
        entityId: updated.id,
        beforeJson: beforeResponse,
        afterJson: afterResponse,
        reason: reason ?? 'expense_updated',
        client: transaction,
      });

      return {
        expense: afterResponse,
      };
    });
  }

  async voidExpense(
    expenseId: string,
    request: VoidExpenseRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<ExpenseMutationResponse> {
    const { context } = await this.resolveAccess(session, 'expenses.void', 'write');
    const reason = normalizeRequiredText(request.reason, 'reason');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.expenseStore.lockExpenseById(
        context.tenantId,
        expenseId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Expense was not found.');
      }

      assertBranchAccessAllowed({ context, branchId: existing.branchId });

      if (existing.status !== 'active') {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Only active expenses can be voided.',
          [
            {
              field: 'status',
              code: 'expense_not_active',
              message: 'Expense must be active before it can be voided.',
            },
          ],
        );
      }

      const voidedAt = new Date();
      const voided = await this.expenseStore.voidExpense(
        {
          tenantId: context.tenantId,
          expenseId: existing.id,
          expectedLockVersion: normalizeLockVersion(request.lock_version),
          voidReason: reason,
          voidedByUserId: context.actorUserId,
          voidedAt,
        },
        transaction,
      );

      if (voided === null) {
        throw GarageOsApiException.versionConflict();
      }

      const beforeResponse = toExpenseResponse(existing);
      const afterResponse = toExpenseResponse(voided);

      await this.expenseStore.createExpenseStatusEvent(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          expenseId: voided.id,
          fromStatus: existing.status,
          toStatus: 'voided',
          reason,
          beforeJson: beforeResponse,
          afterJson: afterResponse,
          createdByUserId: context.actorUserId,
          createdAt: voidedAt,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        branchId: voided.branchId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: context.platformSupportAccessSessionId,
        action: 'expenses.voided',
        entityType: 'expense',
        entityId: voided.id,
        beforeJson: beforeResponse,
        afterJson: afterResponse,
        reason,
        createdAt: voidedAt,
        client: transaction,
      });

      return {
        expense: afterResponse,
      };
    });
  }

  private async resolveAccess(
    session: TenantContextAuthenticatedSession,
    permission: string,
    accessType: 'read' | 'write',
  ): Promise<{ readonly context: ResolvedTenantContext; readonly isShopOwner: boolean }> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.expenseStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action:
        accessType === 'read'
          ? TENANT_ACCESS_ACTIONS.OPERATIONAL_READ
          : TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertExpensePermission(context, isShopOwner, permission);

    return { context, isShopOwner };
  }

  private async assertActiveReferences(
    tenantId: string,
    input: NormalizedExpenseInput,
    transaction: DatabaseQueryClient,
  ): Promise<void> {
    const references = await this.expenseStore.findExpenseReference(
      tenantId,
      input.branchId,
      input.categoryId,
      transaction,
    );

    if (references === null) {
      throw GarageOsApiException.validationFailed([
        {
          field: 'branch_id',
          code: 'expense_reference_not_found',
          message: 'Expense branch and category must exist for this tenant.',
        },
      ]);
    }

    if (references.branchStatus !== 'active') {
      throw GarageOsApiException.workflowTransitionBlocked('Expenses require an active branch.', [
        {
          field: 'branch_id',
          code: 'branch_inactive',
          message: 'Expense branch must be active.',
        },
      ]);
    }

    if (references.categoryStatus !== 'active') {
      throw GarageOsApiException.workflowTransitionBlocked(
        'Expenses require an active expense category.',
        [
          {
            field: 'category_id',
            code: 'expense_category_inactive',
            message: 'Expense category must be active.',
          },
        ],
      );
    }
  }
}

function normalizeExpenseInput(request: CreateExpenseRequest): NormalizedExpenseInput {
  return {
    branchId: request.branch_id.trim(),
    categoryId: request.category_id.trim(),
    expenseDate: request.expense_date.trim(),
    amount: request.amount.trim(),
    paymentMethod: request.payment_method,
    referenceNumber: normalizeNullableText(request.reference_number),
    description: normalizeRequiredText(request.description, 'description'),
  };
}

function isReportAffectingChange(existing: ExpenseRecord, input: NormalizedExpenseInput): boolean {
  return (
    existing.amount !== input.amount ||
    existing.expenseDate !== input.expenseDate ||
    existing.branchId !== input.branchId ||
    existing.categoryId !== input.categoryId ||
    existing.description !== input.description
  );
}

function toExpenseResponse(expense: ExpenseRecord): ExpenseResponse {
  return {
    id: expense.id,
    branch_id: expense.branchId,
    branch_name: expense.branchName,
    category_id: expense.categoryId,
    category_name: expense.categoryName,
    expense_date: expense.expenseDate,
    amount: expense.amount,
    payment_method: expense.paymentMethod,
    reference_number: expense.referenceNumber,
    description: expense.description,
    status: expense.status,
    void_reason: expense.voidReason,
    created_by_user_id: expense.createdByUserId,
    created_at: expense.createdAt.toISOString(),
    updated_at: expense.updatedAt.toISOString(),
    updated_by_user_id: expense.updatedByUserId,
    lock_version: expense.lockVersion,
  };
}

function assertExpensePermission(
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

function encodeExpenseListCursor(expense: ExpenseRecord | null): string | null {
  if (expense === null) {
    return null;
  }

  return Buffer.from(
    JSON.stringify({
      expense_date: expense.expenseDate,
      id: expense.id,
    }),
  ).toString('base64url');
}

function decodeExpenseListCursor(
  value: string | undefined,
): { readonly expenseDate: string; readonly id: string } | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;

    if (!isCursorPayload(decoded)) {
      return null;
    }

    return {
      expenseDate: decoded.expense_date,
      id: decoded.id,
    };
  } catch {
    return null;
  }
}

function isCursorPayload(
  value: unknown,
): value is { readonly expense_date: string; readonly id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'expense_date' in value &&
    typeof (value as { expense_date?: unknown }).expense_date === 'string' &&
    'id' in value &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

function emptyExpenseList(limit: number): ExpenseListResponse {
  return {
    expenses: [],
    pagination: {
      limit,
      next_cursor: null,
      has_more: false,
    },
  };
}
