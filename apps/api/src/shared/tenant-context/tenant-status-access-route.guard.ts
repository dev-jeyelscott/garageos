import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  getRequiredTenantContextFromRequest,
  type GarageOsRouteAccessRequest,
} from '../authorization/route-access-context';
import {
  GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS,
  type TenantStatusAccessRouteRequirement,
} from '../authorization/route-access.decorators';
import { assertTenantStatusAllowsOperation } from './tenant-status-access';

@Injectable()
export class TenantStatusAccessRouteGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<TenantStatusAccessRouteRequirement>(
      GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS.TENANT_STATUS_ACCESS,
      [context.getHandler(), context.getClass()],
    );

    if (requirement === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GarageOsRouteAccessRequest>();

    assertTenantStatusAllowsOperation({
      context: getRequiredTenantContextFromRequest(request),
      operationType: requirement.operationType,
      ...(requirement.actorIsShopOwner === undefined
        ? {}
        : { actorIsShopOwner: requirement.actorIsShopOwner }),
    });

    return true;
  }
}
