import { describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '../api/api-error-code';
import { GarageOsApiException } from '../api/api-exception';
import {
  SUBSCRIPTION_STATUS_SOURCES,
  TENANT_STATUSES,
  type ResolvedTenantContext,
} from '../tenant-context/tenant-context';
import {
  API_BRANCH_ACCESS_GUARD,
  assertBranchAccessAllowed,
  evaluateBranchAccess,
  type BranchAccessInput,
} from './branch-access';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const ASSIGNED_BRANCH_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_BRANCH_ID = '55555555-5555-4555-8555-555555555555';

describe('branch access contract', () => {
  it('exposes a stable dependency-injection token for the future branch guard implementation', () => {
    expect(API_BRANCH_ACCESS_GUARD.description).toBe('API_BRANCH_ACCESS_GUARD');
  });

  it('allows access when tenant-wide branch access is enabled', () => {
    expectAllowed({
      context: createTenantContext({
        assignedBranchIds: [],
        tenantWideBranchAccess: true,
      }),
      branchId: OTHER_BRANCH_ID,
    });
  });

  it('allows access when the requested branch is assigned to the resolved tenant context', () => {
    expectAllowed({
      context: createTenantContext({
        assignedBranchIds: [ASSIGNED_BRANCH_ID],
        tenantWideBranchAccess: false,
      }),
      branchId: ASSIGNED_BRANCH_ID,
    });
  });

  it('blocks access when the requested branch is not assigned and tenant-wide access is disabled', () => {
    expectBranchAccessDenied(() =>
      assertBranchAccessAllowed({
        context: createTenantContext({
          assignedBranchIds: [ASSIGNED_BRANCH_ID],
          tenantWideBranchAccess: false,
        }),
        branchId: OTHER_BRANCH_ID,
      }),
    );
  });

  it('blocks access when no branch is assigned and tenant-wide access is disabled', () => {
    expectBranchAccessDenied(() =>
      assertBranchAccessAllowed({
        context: createTenantContext({
          assignedBranchIds: [],
          tenantWideBranchAccess: false,
        }),
        branchId: ASSIGNED_BRANCH_ID,
      }),
    );
  });

  it('normalizes padded branch IDs and duplicate assigned branches before evaluating access', () => {
    const decision = evaluateBranchAccess({
      context: createTenantContext({
        assignedBranchIds: [` ${ASSIGNED_BRANCH_ID} `, ASSIGNED_BRANCH_ID, ''],
        tenantWideBranchAccess: false,
      }),
      branchId: ` ${ASSIGNED_BRANCH_ID} `,
    });

    expect(decision).toMatchObject({
      allowed: true,
      branchId: ASSIGNED_BRANCH_ID,
      assignedBranchIds: [ASSIGNED_BRANCH_ID],
      tenantWideBranchAccess: false,
      reason: 'assigned_branch_access_is_granted',
    });
  });

  it('rejects an empty branch access check because branch-scoped resources must include branch_id', () => {
    expect(() =>
      evaluateBranchAccess({
        context: createTenantContext({
          assignedBranchIds: [ASSIGNED_BRANCH_ID],
          tenantWideBranchAccess: false,
        }),
        branchId: ' ',
      }),
    ).toThrow('Branch access check must include a branch ID.');
  });
});

interface CreateTenantContextOptions {
  readonly assignedBranchIds: readonly string[];
  readonly tenantWideBranchAccess: boolean;
}

function createTenantContext(options: CreateTenantContextOptions): ResolvedTenantContext {
  return {
    actorUserId: USER_ID,
    sessionId: SESSION_ID,
    tenantId: TENANT_ID,
    tenantStatus: TENANT_STATUSES.ACTIVE,
    subscriptionStatusSource: SUBSCRIPTION_STATUS_SOURCES.SYSTEM_COMPUTED,
    assignedBranchIds: options.assignedBranchIds,
    tenantWideBranchAccess: options.tenantWideBranchAccess,
    effectivePermissions: ['job_orders.read'],
    emailVerified: true,
    platformSupportAccessSessionId: null,
  };
}

function expectAllowed(input: BranchAccessInput): void {
  const decision = evaluateBranchAccess(input);

  expect(decision.allowed).toBe(true);
  expect(() => assertBranchAccessAllowed(input)).not.toThrow();
}

function expectBranchAccessDenied(action: () => unknown): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(GarageOsApiException);
    expect((error as GarageOsApiException).code).toBe(API_ERROR_CODES.BRANCH_ACCESS_DENIED);
    return;
  }

  throw new Error('Expected branch_access_denied error.');
}
