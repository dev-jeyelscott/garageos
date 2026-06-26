import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { GarageOsApiException } from '../api/api-exception';
import { AUDIT_ACTOR_TYPES, AuditService } from '../audit/audit.service';
import {
  getRequestIpAddressFromRequest,
  getRequiredTenantContextFromRequest,
  getUserAgentFromRequest,
  type GarageOsRouteAccessRequest,
} from '../authorization/route-access-context';
import {
  GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS,
  type TenantStatusAccessRouteRequirement,
} from '../authorization/route-access.decorators';
import { evaluateTenantStatusAccess } from './tenant-status-access';

@Injectable()
export class TenantStatusAccessRouteGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<TenantStatusAccessRouteRequirement>(
      GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS.TENANT_STATUS_ACCESS,
      [context.getHandler(), context.getClass()],
    );

    if (requirement === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GarageOsRouteAccessRequest>();
    const tenantContext = getRequiredTenantContextFromRequest(request);

    const decision = evaluateTenantStatusAccess({
      context: tenantContext,
      operationType: requirement.operationType,
      ...(requirement.actorIsShopOwner === undefined
        ? {}
        : { actorIsShopOwner: requirement.actorIsShopOwner }),
    });

    if (!decision.allowed) {
      await this.auditService.record({
        tenantId: tenantContext.tenantId,
        actorUserId: tenantContext.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: tenantContext.platformSupportAccessSessionId,
        action: 'access.tenant_status_denied',
        entityType: 'tenant',
        entityId: tenantContext.tenantId,
        metadataJson: {
          tenant_status: decision.tenantStatus,
          operation_type: decision.operationType,
          subscription_status_source: tenantContext.subscriptionStatusSource,
          reason: decision.reason,
        },
        reason: decision.reason,
        ipAddress: getRequestIpAddressFromRequest(request),
        userAgent: getUserAgentFromRequest(request),
      });

      throw GarageOsApiException.subscriptionAccessBlocked();
    }

    return true;
  }
}
