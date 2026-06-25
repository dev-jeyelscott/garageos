import { GarageOsApiException } from '../api/api-exception';

export const API_PLATFORM_SUPPORT_ACCESS_GUARD = Symbol('API_PLATFORM_SUPPORT_ACCESS_GUARD');

export const PLATFORM_SUPPORT_ACCESS_PERMISSION = 'platform.support_access';

export const PLATFORM_SUPPORT_ACCESS_MODES = {
  READ_ONLY: 'read_only',
  WRITE_ALLOWED: 'write_allowed',
} as const;

export type PlatformSupportAccessMode =
  (typeof PLATFORM_SUPPORT_ACCESS_MODES)[keyof typeof PLATFORM_SUPPORT_ACCESS_MODES];

export const PLATFORM_SUPPORT_OPERATION_TYPES = {
  TENANT_READ: 'tenant_read',
  TENANT_WRITE: 'tenant_write',
} as const;

export type PlatformSupportOperationType =
  (typeof PLATFORM_SUPPORT_OPERATION_TYPES)[keyof typeof PLATFORM_SUPPORT_OPERATION_TYPES];

export interface ResolvedPlatformSupportAccessContext {
  readonly platformAdminUserId: string;
  readonly tenantId: string;
  readonly supportAccessSessionId: string;
  readonly accessMode: PlatformSupportAccessMode;
  readonly effectivePermissions: readonly string[];
}

export interface PlatformSupportAccessRequirement {
  readonly operationType: PlatformSupportOperationType;
  readonly requiredPlatformPermissions?: readonly string[];
}

export interface PlatformSupportAccessInput {
  readonly context: ResolvedPlatformSupportAccessContext;
  readonly requirement: PlatformSupportAccessRequirement;
}

export interface PlatformSupportAccessDecision {
  readonly allowed: boolean;
  readonly operationType: PlatformSupportOperationType;
  readonly accessMode: PlatformSupportAccessMode;
  readonly requiredPlatformPermissions: readonly string[];
  readonly grantedPlatformPermissions: readonly string[];
  readonly missingPlatformPermissions: readonly string[];
  readonly reason: string;
}

export abstract class PlatformSupportAccessGuard {
  abstract assertAllowed(input: PlatformSupportAccessInput): void;
}

export function evaluatePlatformSupportAccess(
  input: PlatformSupportAccessInput,
): PlatformSupportAccessDecision {
  validateSupportAccessContext(input.context);

  const operationType = normalizeSupportOperationType(input.requirement.operationType);
  const accessMode = normalizeSupportAccessMode(input.context.accessMode);
  const requiredPlatformPermissions = normalizeRequiredPlatformPermissions([
    PLATFORM_SUPPORT_ACCESS_PERMISSION,
    ...(input.requirement.requiredPlatformPermissions ?? []),
  ]);

  const effectivePermissions = new Set(
    input.context.effectivePermissions
      .map((permission) => permission.trim())
      .filter((permission) => permission.length > 0),
  );

  const grantedPlatformPermissions = requiredPlatformPermissions.filter((permission) =>
    effectivePermissions.has(permission),
  );

  const missingPlatformPermissions = requiredPlatformPermissions.filter(
    (permission) => !effectivePermissions.has(permission),
  );

  if (missingPlatformPermissions.length > 0) {
    return block(
      operationType,
      accessMode,
      requiredPlatformPermissions,
      grantedPlatformPermissions,
      missingPlatformPermissions,
      'required_platform_support_permission_is_missing',
    );
  }

  if (
    operationType === PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_WRITE &&
    accessMode !== PLATFORM_SUPPORT_ACCESS_MODES.WRITE_ALLOWED
  ) {
    return block(
      operationType,
      accessMode,
      requiredPlatformPermissions,
      grantedPlatformPermissions,
      missingPlatformPermissions,
      'support_access_mode_blocks_tenant_write',
    );
  }

  return allow(
    operationType,
    accessMode,
    requiredPlatformPermissions,
    grantedPlatformPermissions,
    operationType === PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_WRITE
      ? 'write_allowed_support_access_is_granted'
      : 'read_only_support_access_is_granted',
  );
}

export function assertPlatformSupportAccessAllowed(input: PlatformSupportAccessInput): void {
  const decision = evaluatePlatformSupportAccess(input);

  if (decision.allowed) {
    return;
  }

  if (decision.reason === 'support_access_mode_blocks_tenant_write') {
    throw GarageOsApiException.forbidden(
      undefined,
      'Platform support access mode does not allow tenant write actions.',
    );
  }

  throw GarageOsApiException.forbidden(formatRequiredPlatformPermissionForError(decision));
}

function validateSupportAccessContext(context: ResolvedPlatformSupportAccessContext): void {
  normalizeRequiredText(
    context.platformAdminUserId,
    'Platform support access requires a platform admin user ID.',
  );
  normalizeRequiredText(context.tenantId, 'Platform support access requires a tenant ID.');
  normalizeRequiredText(
    context.supportAccessSessionId,
    'Platform support access requires a support access session ID.',
  );
}

function normalizeRequiredText(value: string, message: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(message);
  }

  return normalizedValue;
}

function normalizeSupportAccessMode(
  accessMode: PlatformSupportAccessMode,
): PlatformSupportAccessMode {
  if (
    accessMode === PLATFORM_SUPPORT_ACCESS_MODES.READ_ONLY ||
    accessMode === PLATFORM_SUPPORT_ACCESS_MODES.WRITE_ALLOWED
  ) {
    return accessMode;
  }

  throw new Error('Platform support access mode must be read_only or write_allowed.');
}

function normalizeSupportOperationType(
  operationType: PlatformSupportOperationType,
): PlatformSupportOperationType {
  if (
    operationType === PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_READ ||
    operationType === PLATFORM_SUPPORT_OPERATION_TYPES.TENANT_WRITE
  ) {
    return operationType;
  }

  throw new Error('Platform support operation type must be tenant_read or tenant_write.');
}

function normalizeRequiredPlatformPermissions(
  requiredPlatformPermissions: readonly string[],
): readonly string[] {
  const normalizedPermissions = [
    ...new Set(requiredPlatformPermissions.map((permission) => permission.trim())),
  ];

  for (const permission of normalizedPermissions) {
    if (!permission) {
      throw new Error(
        'Platform support permission requirement must not include an empty permission.',
      );
    }

    if (!permission.startsWith('platform.')) {
      throw new Error('Platform support access guard can enforce only platform permissions.');
    }
  }

  return normalizedPermissions;
}

function allow(
  operationType: PlatformSupportOperationType,
  accessMode: PlatformSupportAccessMode,
  requiredPlatformPermissions: readonly string[],
  grantedPlatformPermissions: readonly string[],
  reason: string,
): PlatformSupportAccessDecision {
  return {
    allowed: true,
    operationType,
    accessMode,
    requiredPlatformPermissions,
    grantedPlatformPermissions,
    missingPlatformPermissions: [],
    reason,
  };
}

function block(
  operationType: PlatformSupportOperationType,
  accessMode: PlatformSupportAccessMode,
  requiredPlatformPermissions: readonly string[],
  grantedPlatformPermissions: readonly string[],
  missingPlatformPermissions: readonly string[],
  reason: string,
): PlatformSupportAccessDecision {
  return {
    allowed: false,
    operationType,
    accessMode,
    requiredPlatformPermissions,
    grantedPlatformPermissions,
    missingPlatformPermissions,
    reason,
  };
}

function formatRequiredPlatformPermissionForError(decision: PlatformSupportAccessDecision): string {
  return (
    decision.missingPlatformPermissions.at(0) ?? decision.requiredPlatformPermissions.join(' and ')
  );
}
