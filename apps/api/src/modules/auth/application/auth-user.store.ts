import type {
  AuthBranchSummary,
  AuthTenantStatus,
  AuthTenantSummary,
  AuthUserStatus,
  AuthUserType,
} from '../contracts';

export interface AuthLoginUserRecord {
  readonly id: string;
  readonly tenantId: string | null;
  readonly userType: AuthUserType;
  readonly email: string;
  readonly passwordHash: string;
  readonly emailVerifiedAt: Date | null;
  readonly status: AuthUserStatus;
  readonly fullName: string;
}

export interface AuthLoginContext {
  readonly user: AuthLoginUserRecord;
  readonly tenant: AuthTenantSummary | null;
  readonly permissions: readonly string[];
  readonly branches: readonly AuthBranchSummary[];
  readonly tenantWideBranchAccess: boolean;
}

export interface FindLoginContextByEmailInput {
  readonly normalizedEmail: string;
}

export abstract class AuthUserStore {
  abstract findActiveLoginContextByNormalizedEmail(
    input: FindLoginContextByEmailInput,
  ): Promise<AuthLoginContext | null>;
}

export function toAuthTenantStatus(value: string): AuthTenantStatus {
  switch (value) {
    case 'pending_setup':
    case 'active':
    case 'grace_period':
    case 'read_only':
    case 'suspended':
    case 'pending_deletion':
    case 'deleted':
      return value;
    default:
      throw new Error(`Unsupported tenant status: ${value}`);
  }
}

export function toAuthUserType(value: string): AuthUserType {
  switch (value) {
    case 'tenant_user':
    case 'platform_admin':
      return value;
    default:
      throw new Error(`Unsupported user type: ${value}`);
  }
}

export function toAuthUserStatus(value: string): AuthUserStatus {
  switch (value) {
    case 'active':
    case 'inactive':
      return value;
    default:
      throw new Error(`Unsupported user status: ${value}`);
  }
}
