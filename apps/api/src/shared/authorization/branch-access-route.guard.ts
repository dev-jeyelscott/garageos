import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { GarageOsApiException } from '../api/api-exception';
import { AUDIT_ACTOR_TYPES, AuditService } from '../audit/audit.service';
import { evaluateBranchAccess } from './branch-access';
import {
  getRequestIpAddressFromRequest,
  getRequiredTenantContextFromRequest,
  getRouteValueFromRequest,
  getUserAgentFromRequest,
  type GarageOsRouteAccessRequest,
} from './route-access-context';
import {
  GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS,
  type BranchAccessRouteRequirement,
} from './route-access.decorators';

@Injectable()
export class BranchAccessRouteGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<BranchAccessRouteRequirement>(
      GARAGE_OS_ROUTE_ACCESS_METADATA_KEYS.BRANCH_ACCESS,
      [context.getHandler(), context.getClass()],
    );

    if (requirement === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GarageOsRouteAccessRequest>();
    const tenantContext = getRequiredTenantContextFromRequest(request);
    const branchId = getRouteValueFromRequest(request, requirement.source, requirement.key);

    if (branchId === null) {
      await this.auditService.record({
        tenantId: tenantContext.tenantId,
        actorUserId: tenantContext.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: tenantContext.platformSupportAccessSessionId,
        action: 'access.branch_denied',
        entityType: 'branch',
        metadataJson: {
          branch_id_source: requirement.source,
          branch_id_key: requirement.key,
          reason: 'branch_id_missing',
        },
        reason: 'branch_id_missing',
        ipAddress: getRequestIpAddressFromRequest(request),
        userAgent: getUserAgentFromRequest(request),
      });

      throw GarageOsApiException.branchAccessDenied();
    }

    const decision = evaluateBranchAccess({
      context: tenantContext,
      branchId,
    });

    if (!decision.allowed) {
      await this.auditService.record({
        tenantId: tenantContext.tenantId,
        actorUserId: tenantContext.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        supportAccessSessionId: tenantContext.platformSupportAccessSessionId,
        action: 'access.branch_denied',
        entityType: 'branch',
        branchId: decision.branchId,
        metadataJson: {
          branch_id: decision.branchId,
          assigned_branch_ids: decision.assignedBranchIds,
          tenant_wide_branch_access: decision.tenantWideBranchAccess,
          reason: decision.reason,
        },
        reason: decision.reason,
        ipAddress: getRequestIpAddressFromRequest(request),
        userAgent: getUserAgentFromRequest(request),
      });

      throw GarageOsApiException.branchAccessDenied();
    }

    return true;
  }
}
