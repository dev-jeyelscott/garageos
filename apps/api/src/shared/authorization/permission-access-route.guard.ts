import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  assertPermissionAccessAllowed,
  type PermissionAccessRequirement,
} from './permission-access';
import {
  getRequiredTenantContextFromRequest,
  type GarageOsRouteAccessRequest,
} from './route-access-context';
import { GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS } from './route-access.decorators';

@Injectable()
export class PermissionAccessRouteGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<PermissionAccessRequirement>(
      GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS.PERMISSION_ACCESS,
      [context.getHandler(), context.getClass()],
    );

    if (requirement === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GarageOsRouteAccessRequest>();

    assertPermissionAccessAllowed({
      context: getRequiredTenantContextFromRequest(request),
      requirement,
    });

    return true;
  }
}
