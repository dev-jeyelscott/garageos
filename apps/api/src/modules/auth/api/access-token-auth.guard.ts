import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';

import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import {
  getAuthorizationHeaderFromRequest,
  getRequestIpAddressFromRequest,
  getUserAgentFromRequest,
  setAuthenticatedSessionOnRequest,
  type GarageOsRouteAccessRequest,
} from '../../../shared/authorization/route-access-context';
import { AuthService } from '../application/auth.service';
import type { AuthSessionResponseData } from '../contracts';

export interface GarageOsAuthenticatedRequest extends GarageOsRouteAccessRequest {
  garageOsAuthSessionResponse?: AuthSessionResponseData;
}

@Injectable()
export class AccessTokenAuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GarageOsAuthenticatedRequest>();
    const authorizationHeader = getAuthorizationHeaderFromRequest(request);

    try {
      const routeSession = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

      request.garageOsAuthSessionResponse = routeSession.sessionResponse;
      setAuthenticatedSessionOnRequest(request, routeSession.tenantContextSession);

      return true;
    } catch (error) {
      await this.auditService.record({
        actorType: AUDIT_ACTOR_TYPES.SYSTEM,
        action: 'auth.access_token_denied',
        entityType: 'auth_session',
        metadataJson: {
          error_code: getErrorCode(error),
        },
        reason: 'access_token_invalid_or_expired',
        ipAddress: getRequestIpAddressFromRequest(request),
        userAgent: getUserAgentFromRequest(request),
      });

      throw error;
    }
  }
}

function getErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { readonly code?: unknown }).code;

    if (typeof code === 'string' && code.length > 0) {
      return code;
    }
  }

  return 'unexpected_error';
}
