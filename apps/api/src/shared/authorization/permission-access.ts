import { GarageOsApiException } from '../api/api-exception';
import type { ResolvedTenantContext } from '../tenant-context/tenant-context';

export const API_PERMISSION_ACCESS_GUARD = Symbol('API_PERMISSION_ACCESS_GUARD');

export const PERMISSION_REQUIREMENT_MODES = {
  ALL: 'all',
  ANY: 'any',
} as const;

export type PermissionRequirementMode =
  (typeof PERMISSION_REQUIREMENT_MODES)[keyof typeof PERMISSION_REQUIREMENT_MODES];

export interface PermissionAccessRequirement {
  readonly permissions: readonly string[];
  readonly mode?: PermissionRequirementMode;
}

export interface PermissionAccessInput {
  readonly context: ResolvedTenantContext;
  readonly requirement: PermissionAccessRequirement;
}

export interface PermissionAccessDecision {
  readonly allowed: boolean;
  readonly mode: PermissionRequirementMode;
  readonly requiredPermissions: readonly string[];
  readonly grantedPermissions: readonly string[];
  readonly missingPermissions: readonly string[];
  readonly reason: string;
}

export abstract class PermissionAccessGuard {
  abstract assertAllowed(input: PermissionAccessInput): void;
}

export function evaluatePermissionAccess(input: PermissionAccessInput): PermissionAccessDecision {
  const requiredPermissions = normalizeRequiredPermissions(input.requirement.permissions);
  const mode = input.requirement.mode ?? PERMISSION_REQUIREMENT_MODES.ALL;
  const effectivePermissions = new Set(input.context.effectivePermissions);

  const grantedPermissions = requiredPermissions.filter((permission) =>
    effectivePermissions.has(permission),
  );
  const missingPermissions = requiredPermissions.filter(
    (permission) => !effectivePermissions.has(permission),
  );

  const allowed =
    mode === PERMISSION_REQUIREMENT_MODES.ALL
      ? missingPermissions.length === 0
      : grantedPermissions.length > 0;

  return {
    allowed,
    mode,
    requiredPermissions,
    grantedPermissions,
    missingPermissions,
    reason: allowed
      ? 'required_permission_access_is_granted'
      : 'required_permission_access_is_missing',
  };
}

export function assertPermissionAccessAllowed(input: PermissionAccessInput): void {
  const decision = evaluatePermissionAccess(input);

  if (!decision.allowed) {
    throw GarageOsApiException.forbidden(formatRequiredPermissionForError(decision));
  }
}

function normalizeRequiredPermissions(requiredPermissions: readonly string[]): readonly string[] {
  if (requiredPermissions.length === 0) {
    throw new Error('Permission requirement must include at least one permission.');
  }

  const normalizedPermissions = [
    ...new Set(requiredPermissions.map((permission) => permission.trim())),
  ];

  for (const permission of normalizedPermissions) {
    if (!permission) {
      throw new Error('Permission requirement must not include an empty permission.');
    }

    if (permission.startsWith('platform.')) {
      throw new Error(
        'Tenant permission access guard cannot enforce platform permissions. Use a platform/support authorization boundary instead.',
      );
    }
  }

  return normalizedPermissions;
}

function formatRequiredPermissionForError(decision: PermissionAccessDecision): string {
  if (decision.mode === PERMISSION_REQUIREMENT_MODES.ANY) {
    return decision.requiredPermissions.join(' or ');
  }

  return decision.missingPermissions.at(0) ?? decision.requiredPermissions.join(' and ');
}
