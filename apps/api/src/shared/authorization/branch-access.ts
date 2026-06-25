import { GarageOsApiException } from '../api/api-exception';
import type { ResolvedTenantContext } from '../tenant-context/tenant-context';

export const API_BRANCH_ACCESS_GUARD = Symbol('API_BRANCH_ACCESS_GUARD');

export interface BranchAccessInput {
  readonly context: ResolvedTenantContext;
  readonly branchId: string;
}

export interface BranchAccessDecision {
  readonly allowed: boolean;
  readonly branchId: string;
  readonly assignedBranchIds: readonly string[];
  readonly tenantWideBranchAccess: boolean;
  readonly reason: string;
}

export abstract class BranchAccessGuard {
  abstract assertAllowed(input: BranchAccessInput): void;
}

export function evaluateBranchAccess(input: BranchAccessInput): BranchAccessDecision {
  const branchId = normalizeBranchId(input.branchId);
  const assignedBranchIds = normalizeAssignedBranchIds(input.context.assignedBranchIds);

  if (input.context.tenantWideBranchAccess) {
    return allow(input, branchId, assignedBranchIds, 'tenant_wide_branch_access_is_granted');
  }

  if (assignedBranchIds.includes(branchId)) {
    return allow(input, branchId, assignedBranchIds, 'assigned_branch_access_is_granted');
  }

  return block(input, branchId, assignedBranchIds, 'assigned_branch_access_is_missing');
}

export function assertBranchAccessAllowed(input: BranchAccessInput): void {
  const decision = evaluateBranchAccess(input);

  if (!decision.allowed) {
    throw GarageOsApiException.branchAccessDenied();
  }
}

function normalizeBranchId(branchId: string): string {
  const normalizedBranchId = branchId.trim();

  if (!normalizedBranchId) {
    throw new Error('Branch access check must include a branch ID.');
  }

  return normalizedBranchId;
}

function normalizeAssignedBranchIds(assignedBranchIds: readonly string[]): readonly string[] {
  return [
    ...new Set(
      assignedBranchIds
        .map((branchId) => branchId.trim())
        .filter((branchId) => branchId.length > 0),
    ),
  ];
}

function allow(
  input: BranchAccessInput,
  branchId: string,
  assignedBranchIds: readonly string[],
  reason: string,
): BranchAccessDecision {
  return {
    allowed: true,
    branchId,
    assignedBranchIds,
    tenantWideBranchAccess: input.context.tenantWideBranchAccess,
    reason,
  };
}

function block(
  input: BranchAccessInput,
  branchId: string,
  assignedBranchIds: readonly string[],
  reason: string,
): BranchAccessDecision {
  return {
    allowed: false,
    branchId,
    assignedBranchIds,
    tenantWideBranchAccess: input.context.tenantWideBranchAccess,
    reason,
  };
}
