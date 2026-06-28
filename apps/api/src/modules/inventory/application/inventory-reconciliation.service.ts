import { Inject, Injectable } from '@nestjs/common';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  InventoryReconciliationStore,
  type CheckInventoryReconciliationInput,
  type InventoryReconciliationIssueCode,
  type InventoryReconciliationIssueRecord,
  type InventoryReconciliationIssueSeverity,
  type InventoryReconciliationReferenceType,
} from './inventory-reconciliation.store';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CheckInventoryReconciliationCommand {
  readonly tenantId: string;
  readonly branchId?: string | null;
  readonly productId?: string | null;
}

export interface InventoryReconciliationIssueResponse {
  readonly code: InventoryReconciliationIssueCode;
  readonly severity: InventoryReconciliationIssueSeverity;
  readonly reference_type: InventoryReconciliationReferenceType;
  readonly reference_id: string | null;
  readonly tenant_id: string;
  readonly branch_id: string | null;
  readonly product_id: string | null;
  readonly expected_quantity: string | null;
  readonly actual_quantity: string | null;
  readonly difference_quantity: string | null;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface InventoryReconciliationReport {
  readonly is_consistent: boolean;
  readonly issue_count: number;
  readonly issues: readonly InventoryReconciliationIssueResponse[];
}

@Injectable()
export class InventoryReconciliationService {
  constructor(
    @Inject(InventoryReconciliationStore)
    private readonly inventoryReconciliationStore: InventoryReconciliationStore,
  ) {}

  async checkInventoryReconciliation(
    command: CheckInventoryReconciliationCommand,
  ): Promise<InventoryReconciliationReport> {
    const input = normalizeCheckInventoryReconciliationCommand(command);
    const issues = await this.inventoryReconciliationStore.listReconciliationIssues(input);

    return toInventoryReconciliationReport(issues);
  }

  async checkInventoryReconciliationInTransaction(
    command: CheckInventoryReconciliationCommand,
    client: DatabaseQueryClient,
  ): Promise<InventoryReconciliationReport> {
    const input = normalizeCheckInventoryReconciliationCommand(command);
    const issues = await this.inventoryReconciliationStore.listReconciliationIssues(input, client);

    return toInventoryReconciliationReport(issues);
  }
}

function normalizeCheckInventoryReconciliationCommand(
  command: CheckInventoryReconciliationCommand,
): CheckInventoryReconciliationInput {
  return {
    tenantId: normalizeUuid(command.tenantId, 'tenant_id'),
    branchId: normalizeNullableUuid(command.branchId, 'branch_id'),
    productId: normalizeNullableUuid(command.productId, 'product_id'),
  };
}

function normalizeNullableUuid(value: string | null | undefined, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeUuid(value, field);
}

function normalizeUuid(value: string, field: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'required',
        message: `${field} is required.`,
      },
    ]);
  }

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'invalid_uuid',
        message: `${field} must be a valid UUID.`,
      },
    ]);
  }

  return normalizedValue;
}

function toInventoryReconciliationReport(
  issues: readonly InventoryReconciliationIssueRecord[],
): InventoryReconciliationReport {
  return {
    is_consistent: issues.length === 0,
    issue_count: issues.length,
    issues: issues.map(toInventoryReconciliationIssueResponse),
  };
}

function toInventoryReconciliationIssueResponse(
  issue: InventoryReconciliationIssueRecord,
): InventoryReconciliationIssueResponse {
  return {
    code: issue.issueCode,
    severity: issue.severity,
    reference_type: issue.referenceType,
    reference_id: issue.referenceId,
    tenant_id: issue.tenantId,
    branch_id: issue.branchId,
    product_id: issue.productId,
    expected_quantity: issue.expectedQuantity,
    actual_quantity: issue.actualQuantity,
    difference_quantity: issue.differenceQuantity,
    details: issue.details,
  };
}
