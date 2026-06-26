import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AUDIT_ACTOR_TYPES, AuditService } from '../audit/audit.service';
import {
  assertPermissionAccessAllowed,
  evaluatePermissionAccess,
  type PermissionAccessRequirement,
} from './permission-access';
import {
  getRequestIpAddressFromRequest,
  getRequiredTenantContextFromRequest,
  getUserAgentFromRequest,
  type GarageOsRouteAccessRequest,
} from './route-access-context';
import { GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS } from './route-access.decorators';

@Injectable()
export class PermissionAccessRouteGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PermissionAccessRequirement>(
      GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS.PERMISSION_ACCESS,
      [context.getHandler(), context.getClass()],
    );

    if (requirement === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GarageOsRouteAccessRequest>();
    const tenantContext = getRequiredTenantContextFromRequest(request);

    const decision = evaluatePermissionAccess({
      context: tenantContext,
      requirement,
    });

    if (!decision.allowed) {
      await this.auditService.record({
        tenantId: tenantContext.tenantId,
        actorUserId: tenantContext.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: tenantContext.platformSupportAccessSessionId,
        action: 'access.permission_denied',
        entityType: 'permission',
        metadataJson: {
          mode: decision.mode,
          required_permissions: decision.requiredPermissions,
          granted_permissions: decision.grantedPermissions,
          missing_permissions: decision.missingPermissions,
          reason: decision.reason,
        },
        reason: decision.reason,
        ipAddress: getRequestIpAddressFromRequest(request),
        userAgent: getUserAgentFromRequest(request),
      });
    }

    assertPermissionAccessAllowed({
      context: tenantContext,
      requirement,
    });

    return true;
  }
}
