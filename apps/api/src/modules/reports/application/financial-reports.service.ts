import { Inject, Injectable } from '@nestjs/common';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { assertBranchAccessAllowed } from '../../../shared/authorization/branch-access';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type { FinancialReportQuery } from '../api/financial-report.schemas';
import {
  FinancialReportStore,
  type FinancialReportExpenseBasisRecord,
  type FinancialReportScope,
} from './financial-report.store';

const BASIC_REPORT_PERMISSION = 'reports.view_basic';

export interface FinancialReportPeriodResponse {
  readonly from_date: string | null;
  readonly to_date: string | null;
}

export interface FinancialReportExpenseTotalsResponse {
  readonly active_expense_count: number;
  readonly active_expense_total: string;
}

export interface FinancialReportExpenseCategoryResponse {
  readonly category_id: string;
  readonly category_name: string | null;
  readonly active_expense_count: number;
  readonly active_expense_total: string;
}

export interface FinancialReportExpenseBranchResponse {
  readonly branch_id: string;
  readonly branch_name: string | null;
  readonly active_expense_count: number;
  readonly active_expense_total: string;
}

export interface FinancialReportExpensePaymentMethodResponse {
  readonly payment_method: string;
  readonly active_expense_count: number;
  readonly active_expense_total: string;
}

export interface FinancialReportExpenseBasisResponse extends FinancialReportExpenseTotalsResponse {
  readonly calculation_basis: 'active_expenses_excluding_voided';
  readonly by_category: readonly FinancialReportExpenseCategoryResponse[];
  readonly by_branch: readonly FinancialReportExpenseBranchResponse[];
  readonly by_payment_method: readonly FinancialReportExpensePaymentMethodResponse[];
}

export interface FinancialReportResponse {
  readonly scope: FinancialReportScope;
  readonly branch_ids: readonly string[] | null;
  readonly period: FinancialReportPeriodResponse;
  readonly operating_expenses: FinancialReportExpenseBasisResponse;
}

interface ResolvedFinancialReportScope {
  readonly scope: FinancialReportScope;
  readonly branchIds: readonly string[] | null;
}

@Injectable()
export class FinancialReportsService {
  constructor(
    @Inject(FinancialReportStore)
    private readonly financialReportStore: FinancialReportStore,
  ) {}

  async getFinancialReport(
    query: FinancialReportQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<FinancialReportResponse> {
    const context = await this.resolveReadContext(session);
    const reportScope = resolveFinancialReportScope(context, query.branch_id ?? null);

    if (reportScope.branchIds !== null && reportScope.branchIds.length === 0) {
      return {
        scope: reportScope.scope,
        branch_ids: reportScope.branchIds,
        period: toPeriodResponse(query),
        operating_expenses: toExpenseBasisResponse(emptyExpenseBasis()),
      };
    }

    const expenseBasis = await this.financialReportStore.getExpenseBasis({
      tenantId: context.tenantId,
      branchIds: reportScope.branchIds,
      fromDate: query.from_date ?? null,
      toDate: query.to_date ?? null,
    });

    return {
      scope: reportScope.scope,
      branch_ids: reportScope.branchIds,
      period: toPeriodResponse(query),
      operating_expenses: toExpenseBasisResponse(expenseBasis),
    };
  }

  private async resolveReadContext(
    session: TenantContextAuthenticatedSession,
  ): Promise<ResolvedTenantContext> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.financialReportStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertFinancialReportPermission(context, isShopOwner);

    return context;
  }
}

function resolveFinancialReportScope(
  context: ResolvedTenantContext,
  requestedBranchId: string | null,
): ResolvedFinancialReportScope {
  if (requestedBranchId !== null) {
    assertBranchAccessAllowed({ context, branchId: requestedBranchId });

    return {
      scope: 'branch',
      branchIds: [requestedBranchId],
    };
  }

  if (context.tenantWideBranchAccess) {
    return {
      scope: 'tenant',
      branchIds: null,
    };
  }

  return {
    scope: 'branch',
    branchIds: [...new Set(context.assignedBranchIds)],
  };
}

function assertFinancialReportPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
): void {
  if (isShopOwner || context.effectivePermissions.includes(BASIC_REPORT_PERMISSION)) {
    return;
  }

  throw GarageOsApiException.forbidden(BASIC_REPORT_PERMISSION);
}

function toPeriodResponse(query: FinancialReportQuery): FinancialReportPeriodResponse {
  return {
    from_date: query.from_date ?? null,
    to_date: query.to_date ?? null,
  };
}

function toExpenseBasisResponse(
  basis: FinancialReportExpenseBasisRecord,
): FinancialReportExpenseBasisResponse {
  return {
    calculation_basis: 'active_expenses_excluding_voided',
    active_expense_count: basis.totals.expenseCount,
    active_expense_total: basis.totals.totalAmount,
    by_category: basis.byCategory.map((category) => ({
      category_id: category.categoryId,
      category_name: category.categoryName,
      active_expense_count: category.expenseCount,
      active_expense_total: category.totalAmount,
    })),
    by_branch: basis.byBranch.map((branch) => ({
      branch_id: branch.branchId,
      branch_name: branch.branchName,
      active_expense_count: branch.expenseCount,
      active_expense_total: branch.totalAmount,
    })),
    by_payment_method: basis.byPaymentMethod.map((paymentMethod) => ({
      payment_method: paymentMethod.paymentMethod,
      active_expense_count: paymentMethod.expenseCount,
      active_expense_total: paymentMethod.totalAmount,
    })),
  };
}

function emptyExpenseBasis(): FinancialReportExpenseBasisRecord {
  return {
    totals: {
      expenseCount: 0,
      totalAmount: '0.00',
    },
    byCategory: [],
    byBranch: [],
    byPaymentMethod: [],
  };
}
