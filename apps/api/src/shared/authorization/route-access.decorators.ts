import { SetMetadata } from '@nestjs/common';

import type { PermissionAccessRequirement } from './permission-access';
import type { TenantAccessOperationType } from '../tenant-context/tenant-status-access';

export const GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS = {
  TENANT_STATUS_ACCESS: 'garageos:tenant_status_access',
  PERMISSION_ACCESS: 'garageos:permission_access',
  BRANCH_ACCESS: 'garageos:branch_access',
} as const;

export type BranchAccessRouteSource = 'param' | 'query' | 'body';

export interface TenantStatusAccessRouteRequirement {
  readonly operationType: TenantAccessOperationType;
  readonly actorIsShopOwner?: boolean;
}

export interface BranchAccessRouteRequirement {
  readonly source: BranchAccessRouteSource;
  readonly key: string;
}

export function RequireTenantStatusAccess(
  operationType: TenantAccessOperationType,
  options: { readonly actorIsShopOwner?: boolean } = {},
): MethodDecorator & ClassDecorator {
  const requirement: TenantStatusAccessRouteRequirement =
    options.actorIsShopOwner === undefined
      ? { operationType }
      : { operationType, actorIsShopOwner: options.actorIsShopOwner };

  return SetMetadata(GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS.TENANT_STATUS_ACCESS, requirement);
}

export function RequirePermissions(
  requirementOrFirstPermission: PermissionAccessRequirement | string,
  ...additionalPermissions: readonly string[]
): MethodDecorator & ClassDecorator {
  const requirement: PermissionAccessRequirement =
    typeof requirementOrFirstPermission === 'string'
      ? {
          permissions: [requirementOrFirstPermission, ...additionalPermissions],
        }
      : requirementOrFirstPermission;

  return SetMetadata(GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS.PERMISSION_ACCESS, requirement);
}

export function RequireBranchAccess(
  key = 'branch_id',
  source: BranchAccessRouteSource = 'param',
): MethodDecorator & ClassDecorator {
  return SetMetadata(GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS.BRANCH_ACCESS, {
    key,
    source,
  } satisfies BranchAccessRouteRequirement);
}
