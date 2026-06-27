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
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import {
  createEmployeeInvitationRequestSchema,
  type CreateEmployeeInvitationRequest,
  createEmployeeRequestSchema,
  type CreateEmployeeRequest,
  employeeStatusChangeRequestSchema,
  type EmployeeStatusChangeRequest,
  updateEmployeeRequestSchema,
  type UpdateEmployeeRequest,
} from './employee.schemas';
import { EmployeesService } from '../application/employees.service';

@Controller('employees')
@UseGuards(AccessTokenAuthGuard)
export class EmployeesController {
  constructor(
    private readonly authService: AuthService,
    private readonly employeesService: EmployeesService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async listEmployees(
    @Headers('authorization') authorizationHeader: string | undefined,
  ): ReturnType<EmployeesService['listEmployees']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.employeesService.listEmployees(session.tenantContextSession);
  }

  @Post()
  async createEmployee(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createEmployeeRequestSchema))
    request: CreateEmployeeRequest,
  ): ReturnType<EmployeesService['createEmployee']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/employees',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.employeesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<EmployeesService['createEmployee']>
      >;
    }

    try {
      const response = await this.employeesService.createEmployee(
        request,
        session.tenantContextSession,
      );

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

  @Post('invitations')
  async createInvitation(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createEmployeeInvitationRequestSchema))
    request: CreateEmployeeInvitationRequest,
  ): ReturnType<EmployeesService['createInvitation']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/employees/invitations',
      idempotencyKey,
      requestIntent: request,
      now,
      expiresAt: this.employeesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<EmployeesService['createInvitation']>
      >;
    }

    try {
      const response = await this.employeesService.createInvitation(
        request,
        session.tenantContextSession,
      );

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

  @Get(':employee_id')
  async getEmployee(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('employee_id') employeeId: string,
  ): ReturnType<EmployeesService['getEmployee']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.employeesService.getEmployee(employeeId, session.tenantContextSession);
  }

  @Patch(':employee_id')
  async updateEmployee(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('employee_id') employeeId: string,
    @Body(new ZodValidationPipe(updateEmployeeRequestSchema))
    request: UpdateEmployeeRequest,
  ): ReturnType<EmployeesService['updateEmployee']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);

    return this.employeesService.updateEmployee(employeeId, request, session.tenantContextSession);
  }

  @Post(':employee_id/deactivate')
  @HttpCode(200)
  async deactivateEmployee(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('employee_id') employeeId: string,
    @Body(new ZodValidationPipe(employeeStatusChangeRequestSchema))
    request: EmployeeStatusChangeRequest,
  ): ReturnType<EmployeesService['deactivateEmployee']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      employee_id: employeeId,
      ...request,
    };
    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/employees/{employee_id}/deactivate',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.employeesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<EmployeesService['deactivateEmployee']>
      >;
    }

    try {
      const response = await this.employeesService.deactivateEmployee(
        employeeId,
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

  @Post(':employee_id/reactivate')
  @HttpCode(200)
  async reactivateEmployee(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('employee_id') employeeId: string,
    @Body(new ZodValidationPipe(employeeStatusChangeRequestSchema))
    request: EmployeeStatusChangeRequest,
  ): ReturnType<EmployeesService['reactivateEmployee']> {
    const session = await this.authService.getAuthenticatedRouteSession(authorizationHeader);
    const now = new Date();
    const requestIntent = {
      employee_id: employeeId,
      ...request,
    };
    const idempotency = await this.idempotencyService.begin({
      tenantId: session.tenantContextSession.actor.tenant_id,
      userId: session.tenantContextSession.actor.user_id,
      endpoint: 'POST /api/v1/employees/{employee_id}/reactivate',
      idempotencyKey,
      requestIntent,
      now,
      expiresAt: this.employeesService.getIdempotencyExpiresAt(now),
    });

    if (idempotency.type === 'replayed') {
      return idempotency.responseBodyJson as Awaited<
        ReturnType<EmployeesService['reactivateEmployee']>
      >;
    }

    try {
      const response = await this.employeesService.reactivateEmployee(
        employeeId,
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
