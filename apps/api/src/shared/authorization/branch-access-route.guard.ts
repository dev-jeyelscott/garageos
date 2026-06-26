import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { GarageOsApiException } from '../api/api-exception';
import { assertBranchAccessAllowed } from './branch-access';
import {
  getRequiredTenantContextFromRequest,
  getRouteValueFromRequest,
  type GarageOsRouteAccessRequest,
} from './route-access-context';
import {
  GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS,
  type BranchAccessRouteRequirement,
} from './route-access.decorators';

@Injectable()
export class BranchAccessRouteGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<BranchAccessRouteRequirement>(
      GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS.BRANCH_ACCESS,
      [context.getHandler(), context.getClass()],
    );

    if (requirement === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GarageOsRouteAccessRequest>();
    const branchId = getRouteValueFromRequest(request, requirement.source, requirement.key);

    if (branchId === null) {
      throw GarageOsApiException.branchAccessDenied();
    }

    assertBranchAccessAllowed({
      context: getRequiredTenantContextFromRequest(request),
      branchId,
    });

    return true;
  }
}
