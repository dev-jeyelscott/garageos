import { GarageOsApiException } from '../../../shared/api/api-exception';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type { ProductStore } from '../../products/application/product.store';

export interface InventoryAdjustmentActionAccess {
  readonly context: ResolvedTenantContext;
  readonly isShopOwner: boolean;
}

export async function resolveInventoryAdjustmentActionAccess(
  session: TenantContextAuthenticatedSession,
  productStore: ProductStore,
  requiredPermission:
    | 'inventory.adjust'
    | 'inventory.adjust.approve'
    | 'inventory.force_adjust'
    | readonly ['inventory.adjust', 'inventory.adjust.approve'],
): Promise<InventoryAdjustmentActionAccess> {
  const context = resolveTenantContextFromAuthenticatedSession(session);
  const isShopOwner = await productStore.isActiveShopOwner({
    tenantId: context.tenantId,
    userId: context.actorUserId,
  });

  assertTenantLifecycleAccess({
    context,
    isShopOwner,
    action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
  });

  const requiredPermissions = Array.isArray(requiredPermission)
    ? requiredPermission
    : [requiredPermission];

  if (
    !isShopOwner &&
    !requiredPermissions.some((permission) => context.effectivePermissions.includes(permission))
  ) {
    throw GarageOsApiException.forbidden(requiredPermissions.join(' or '));
  }

  return { context, isShopOwner };
}
