import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import {
  getRequiredAuthenticatedSessionFromRequest,
  setTenantContextOnRequest,
  type GarageOsRouteAccessRequest,
} from '../authorization/route-access-context';
import { resolveTenantContextFromAuthenticatedSession } from './tenant-context';

@Injectable()
export class TenantContextRouteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<GarageOsRouteAccessRequest>();
    const authenticatedSession = getRequiredAuthenticatedSessionFromRequest(request);
    const tenantContext = resolveTenantContextFromAuthenticatedSession(authenticatedSession);

    setTenantContextOnRequest(request, tenantContext);

    return true;
  }
}
