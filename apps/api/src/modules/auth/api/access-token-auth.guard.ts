import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';

import { AuthService } from '../application/auth.service';
import {
  getAuthorizationHeaderFromRequest,
  setAuthenticatedSessionOnRequest,
  type GarageOsRouteAccessRequest,
} from '../../../shared/authorization/route-access-context';
import type { AuthSessionResponseData } from '../contracts';

export interface GarageOsAuthenticatedRequest extends GarageOsRouteAccessRequest {
  garageOsAuthSessionResponse?: AuthSessionResponseData;
}

@Injectable()
export class AccessTokenAuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GarageOsAuthenticatedRequest>();
    const authorizationHeader = getAuthorizationHeaderFromRequest(request);

    const routeSession = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    request.garageOsAuthSessionResponse = routeSession.sessionResponse;
    setAuthenticatedSessionOnRequest(request, routeSession.tenantContextSession);

    return true;
  }
}
