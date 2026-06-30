import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import type { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import type { AuthService } from '../../auth/application/auth.service';
import type { RoleService } from '../application/role.service';
import {
  createRoleRequestSchema,
  type CreateRoleRequest,
  deactivateRoleRequestSchema,
  type DeactivateRoleRequest,
  updateRoleRequestSchema,
  type UpdateRoleRequest,
} from './role.schemas';

@Controller('roles')
@UseGuards(AccessTokenAuthGuard)
export class RoleController {
  constructor(
    private readonly authService: AuthService,
    private readonly roleService: RoleService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listRoles(
    @Headers('authorization') authorizationHeader: string | undefined,
  ): ReturnType<RoleService['listRoles']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.roleService.listRoles(session.tenantContextSession);
  }

  @Get('permissions')
  async listPermissions(
    @Headers('authorization') authorizationHeader: string | undefined,
  ): ReturnType<RoleService['listPermissions']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.roleService.listPermissions(session.tenantContextSession);
  }

  @Post()
  async createRole(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createRoleRequestSchema))
    request: CreateRoleRequest,
  ): ReturnType<RoleService['createRole']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    const now = new Date();
    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/roles',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.roleService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<ReturnType<RoleService['createRole']>>;
    }

    try {
      const response = await this.roleService.createRole(request, session.tenantContextSession);

      await this.idempotencyService.completeSucceeded({
        id: idempotency.record.id,
        responseStatusCode: 201,
        responseBodyJson: response,
        now: new Date(),
      });

      return response;
    } catch (error) {
      await this.idempotencyService.completeFailed({
        id: idempotency.record.id,
        now: new Date(),
      });

      throw error;
    }
  }

  @Get(':role_id')
  async getRole(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('role_id') roleId: string,
  ): ReturnType<RoleService['getRole']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.roleService.getRole(roleId, session.tenantContextSession);
  }

  @Patch(':role_id')
  async updateRole(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('role_id') roleId: string,
    @Body(new ZodValidationPipe(updateRoleRequestSchema))
    request: UpdateRoleRequest,
  ): ReturnType<RoleService['updateRole']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.roleService.updateRole(roleId, request, session.tenantContextSession);
  }

  @Post(':role_id/deactivate')
  @HttpCode(200)
  async deactivateRole(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('role_id') roleId: string,
    @Body(new ZodValidationPipe(deactivateRoleRequestSchema))
    request: DeactivateRoleRequest,
  ): ReturnType<RoleService['deactivateRole']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    const now = new Date();
    const requestIntent = {
      role_id: roleId,
      ...request,
    };
    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/roles/{role_id}/deactivate',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.roleService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<ReturnType<RoleService['deactivateRole']>>;
    }

    try {
      const response = await this.roleService.deactivateRole(
        roleId,
        request,
        session.tenantContextSession,
      );

      await this.idempotencyService.completeSucceeded({
        id: idempotency.record.id,
        responseStatusCode: 200,
        responseBodyJson: response,
        now: new Date(),
      });

      return response;
    } catch (error) {
      await this.idempotencyService.completeFailed({
        id: idempotency.record.id,
        now: new Date(),
      });

      throw error;
    }
  }
}
