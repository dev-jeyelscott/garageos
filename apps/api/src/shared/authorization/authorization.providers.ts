import { Injectable } from '@nestjs/common';

import {
  API_TENANT_STATUS_ACCESS_GUARD,
  assertTenantStatusAllowsOperation,
  type TenantStatusAccessGuard,
  type TenantStatusAccessInput,
} from '../tenant-context/tenant-status-access';
import {
  API_AUTHORIZATION_POLICY,
  assertPlatformSupportAuthorizationAllowed,
  assertTenantAuthorizationAllowed,
  type AuthorizationPolicy,
  type TenantAuthorizationInput,
} from './authorization-policy';
import {
  API_BRANCH_ACCESS_GUARD,
  assertBranchAccessAllowed,
  type BranchAccessGuard,
  type BranchAccessInput,
} from './branch-access';
import {
  API_PERMISSION_ACCESS_GUARD,
  assertPermissionAccessAllowed,
  type PermissionAccessGuard,
  type PermissionAccessInput,
} from './permission-access';
import {
  API_PLATFORM_SUPPORT_ACCESS_GUARD,
  assertPlatformSupportAccessAllowed,
  type PlatformSupportAccessGuard,
  type PlatformSupportAccessInput,
} from './platform-support-access';

@Injectable()
export class TenantStatusAccessPolicy implements TenantStatusAccessGuard {
  assertAllowed(input: TenantStatusAccessInput): void {
    assertTenantStatusAllowsOperation(input);
  }
}

@Injectable()
export class PermissionAccessPolicy implements PermissionAccessGuard {
  assertAllowed(input: PermissionAccessInput): void {
    assertPermissionAccessAllowed(input);
  }
}

@Injectable()
export class BranchAccessPolicy implements BranchAccessGuard {
  assertAllowed(input: BranchAccessInput): void {
    assertBranchAccessAllowed(input);
  }
}

@Injectable()
export class PlatformSupportAccessPolicy implements PlatformSupportAccessGuard {
  assertAllowed(input: PlatformSupportAccessInput): void {
    assertPlatformSupportAccessAllowed(input);
  }
}

@Injectable()
export class ComposedAuthorizationPolicy implements AuthorizationPolicy {
  assertTenantAuthorizationAllowed(input: TenantAuthorizationInput): void {
    assertTenantAuthorizationAllowed(input);
  }

  assertPlatformSupportAuthorizationAllowed(input: PlatformSupportAccessInput): void {
    assertPlatformSupportAuthorizationAllowed(input);
  }
}

export const AUTHORIZATION_POLICY_PROVIDERS = [
  TenantStatusAccessPolicy,
  PermissionAccessPolicy,
  BranchAccessPolicy,
  PlatformSupportAccessPolicy,
  ComposedAuthorizationPolicy,
  {
    provide: API_TENANT_STATUS_ACCESS_GUARD,
    useExisting: TenantStatusAccessPolicy,
  },
  {
    provide: API_PERMISSION_ACCESS_GUARD,
    useExisting: PermissionAccessPolicy,
  },
  {
    provide: API_BRANCH_ACCESS_GUARD,
    useExisting: BranchAccessPolicy,
  },
  {
    provide: API_PLATFORM_SUPPORT_ACCESS_GUARD,
    useExisting: PlatformSupportAccessPolicy,
  },
  {
    provide: API_AUTHORIZATION_POLICY,
    useExisting: ComposedAuthorizationPolicy,
  },
] as const;

export const AUTHORIZATION_POLICY_EXPORTS = [
  API_TENANT_STATUS_ACCESS_GUARD,
  API_PERMISSION_ACCESS_GUARD,
  API_BRANCH_ACCESS_GUARD,
  API_PLATFORM_SUPPORT_ACCESS_GUARD,
  API_AUTHORIZATION_POLICY,
] as const;
