import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ZodValidationPipe } from '../../../shared/api/zod-validation.pipe';
import { AccessTokenAuthGuard } from '../../auth/api/access-token-auth.guard';
import { AuthService } from '../../auth/application/auth.service';
import { MasterDataService } from '../application/master-data.service';
import {
  actionReasonRequestSchema,
  createBranchRequestSchema,
  createCustomerRequestSchema,
  createMotorcycleRequestSchema,
  createRoleRequestSchema,
  createServiceRequestSchema,
  listQuerySchema,
  mergeCustomersRequestSchema,
  mileageCorrectionRequestSchema,
  updateBranchRequestSchema,
  updateCustomerRequestSchema,
  updateEmployeeRequestSchema,
  updateMotorcycleRequestSchema,
  updateRoleRequestSchema,
  updateServiceRequestSchema,
  type ActionReasonRequest,
  type CreateBranchRequest,
  type CreateCustomerRequest,
  type CreateMotorcycleRequest,
  type CreateRoleRequest,
  type CreateServiceRequest,
  type ListQuery,
  type MergeCustomersRequest,
  type MileageCorrectionRequest,
  type UpdateBranchRequest,
  type UpdateCustomerRequest,
  type UpdateEmployeeRequest,
  type UpdateMotorcycleRequest,
  type UpdateRoleRequest,
  type UpdateServiceRequest,
} from './master-data.schemas';

@Controller('branches')
@UseGuards(AccessTokenAuthGuard)
export class BranchesController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: MasterDataService,
  ) {}

  @Get()
  async list(
    @Headers('authorization') authorization: string | undefined,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    return this.service.listBranches(query, await this.session(authorization));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(createBranchRequestSchema)) request: CreateBranchRequest,
  ) {
    return this.service.createBranch(request, await this.session(authorization));
  }

  @Get(':branchId')
  async get(
    @Headers('authorization') authorization: string | undefined,
    @Param('branchId') branchId: string,
  ) {
    return this.service.getBranch(branchId, await this.session(authorization));
  }

  @Patch(':branchId')
  async update(
    @Headers('authorization') authorization: string | undefined,
    @Param('branchId') branchId: string,
    @Body(new ZodValidationPipe(updateBranchRequestSchema)) request: UpdateBranchRequest,
  ) {
    return this.service.updateBranch(branchId, request, await this.session(authorization));
  }

  @Post(':branchId/deactivate')
  async deactivate(
    @Headers('authorization') authorization: string | undefined,
    @Param('branchId') branchId: string,
    @Body(new ZodValidationPipe(actionReasonRequestSchema)) request: ActionReasonRequest,
  ) {
    return this.service.deactivateBranch(branchId, request, await this.session(authorization));
  }

  @Post(':branchId/reactivate')
  async reactivate(
    @Headers('authorization') authorization: string | undefined,
    @Param('branchId') branchId: string,
    @Body(new ZodValidationPipe(actionReasonRequestSchema)) request: ActionReasonRequest,
  ) {
    return this.service.reactivateBranch(branchId, request, await this.session(authorization));
  }

  private async session(authorization: string | undefined) {
    return (await this.auth.getAuthenticatedRouteSession(authorization)).tenantContextSession;
  }
}

@Controller('roles')
@UseGuards(AccessTokenAuthGuard)
export class RolesController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: MasterDataService,
  ) {}

  @Get('permissions')
  async permissions(@Headers('authorization') authorization: string | undefined) {
    return this.service.listPermissions(await this.session(authorization));
  }

  @Get()
  async list(
    @Headers('authorization') authorization: string | undefined,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    return this.service.listRoles(query, await this.session(authorization));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(createRoleRequestSchema)) request: CreateRoleRequest,
  ) {
    return this.service.createRole(request, await this.session(authorization));
  }

  @Get(':roleId')
  async get(
    @Headers('authorization') authorization: string | undefined,
    @Param('roleId') roleId: string,
  ) {
    return this.service.getRole(roleId, await this.session(authorization));
  }

  @Patch(':roleId')
  async update(
    @Headers('authorization') authorization: string | undefined,
    @Param('roleId') roleId: string,
    @Body(new ZodValidationPipe(updateRoleRequestSchema)) request: UpdateRoleRequest,
  ) {
    return this.service.updateRole(roleId, request, await this.session(authorization));
  }

  @Post(':roleId/deactivate')
  async deactivate(
    @Headers('authorization') authorization: string | undefined,
    @Param('roleId') roleId: string,
  ) {
    return this.service.deactivateRole(roleId, await this.session(authorization));
  }

  private async session(authorization: string | undefined) {
    return (await this.auth.getAuthenticatedRouteSession(authorization)).tenantContextSession;
  }
}

@Controller('employees')
@UseGuards(AccessTokenAuthGuard)
export class EmployeesController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: MasterDataService,
  ) {}

  @Get()
  async list(
    @Headers('authorization') authorization: string | undefined,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    return this.service.listEmployees(query, await this.session(authorization));
  }

  @Get(':employeeId')
  async get(
    @Headers('authorization') authorization: string | undefined,
    @Param('employeeId') employeeId: string,
  ) {
    return this.service.getEmployee(employeeId, await this.session(authorization));
  }

  @Patch(':employeeId')
  async update(
    @Headers('authorization') authorization: string | undefined,
    @Param('employeeId') employeeId: string,
    @Body(new ZodValidationPipe(updateEmployeeRequestSchema)) request: UpdateEmployeeRequest,
  ) {
    return this.service.updateEmployee(employeeId, request, await this.session(authorization));
  }

  @Post(':employeeId/deactivate')
  async deactivate(
    @Headers('authorization') authorization: string | undefined,
    @Param('employeeId') employeeId: string,
  ) {
    return this.service.deactivateEmployee(employeeId, await this.session(authorization));
  }

  @Post(':employeeId/reactivate')
  async reactivate(
    @Headers('authorization') authorization: string | undefined,
    @Param('employeeId') employeeId: string,
  ) {
    return this.service.reactivateEmployee(employeeId, await this.session(authorization));
  }

  @Get(':employeeId/activity')
  async activity(@Headers('authorization') authorization: string | undefined) {
    return this.service.emptyHistory(await this.session(authorization), 'users.read');
  }

  private async session(authorization: string | undefined) {
    return (await this.auth.getAuthenticatedRouteSession(authorization)).tenantContextSession;
  }
}

@Controller('customers')
@UseGuards(AccessTokenAuthGuard)
export class CustomersController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: MasterDataService,
  ) {}

  @Get()
  async list(
    @Headers('authorization') authorization: string | undefined,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    return this.service.listCustomers(query, await this.session(authorization));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(createCustomerRequestSchema)) request: CreateCustomerRequest,
  ) {
    return this.service.createCustomer(request, await this.session(authorization));
  }

  @Post('merge')
  async merge(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(mergeCustomersRequestSchema)) request: MergeCustomersRequest,
  ) {
    return this.service.mergeCustomers(request, await this.session(authorization));
  }

  @Get(':customerId')
  async get(
    @Headers('authorization') authorization: string | undefined,
    @Param('customerId') customerId: string,
  ) {
    return this.service.getCustomer(customerId, await this.session(authorization));
  }

  @Patch(':customerId')
  async update(
    @Headers('authorization') authorization: string | undefined,
    @Param('customerId') customerId: string,
    @Body(new ZodValidationPipe(updateCustomerRequestSchema)) request: UpdateCustomerRequest,
  ) {
    return this.service.updateCustomer(customerId, request, await this.session(authorization));
  }

  @Post(':customerId/soft-delete')
  async softDelete(
    @Headers('authorization') authorization: string | undefined,
    @Param('customerId') customerId: string,
  ) {
    return this.service.softDeleteCustomer(customerId, await this.session(authorization));
  }

  @Post(':customerId/restore')
  async restore(
    @Headers('authorization') authorization: string | undefined,
    @Param('customerId') customerId: string,
  ) {
    return this.service.restoreCustomer(customerId, await this.session(authorization));
  }

  @Get(':customerId/history')
  async history(@Headers('authorization') authorization: string | undefined) {
    return this.service.emptyHistory(await this.session(authorization), 'customers.read');
  }

  @Get(':customerId/motorcycles')
  async motorcycles(
    @Headers('authorization') authorization: string | undefined,
    @Param('customerId') customerId: string,
  ) {
    return this.service.listCustomerMotorcycles(customerId, await this.session(authorization));
  }

  private async session(authorization: string | undefined) {
    return (await this.auth.getAuthenticatedRouteSession(authorization)).tenantContextSession;
  }
}

@Controller('motorcycles')
@UseGuards(AccessTokenAuthGuard)
export class MotorcyclesController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: MasterDataService,
  ) {}

  @Get()
  async list(
    @Headers('authorization') authorization: string | undefined,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    return this.service.listMotorcycles(query, await this.session(authorization));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(createMotorcycleRequestSchema)) request: CreateMotorcycleRequest,
  ) {
    return this.service.createMotorcycle(request, await this.session(authorization));
  }

  @Get(':motorcycleId')
  async get(
    @Headers('authorization') authorization: string | undefined,
    @Param('motorcycleId') motorcycleId: string,
  ) {
    return this.service.getMotorcycle(motorcycleId, await this.session(authorization));
  }

  @Patch(':motorcycleId')
  async update(
    @Headers('authorization') authorization: string | undefined,
    @Param('motorcycleId') motorcycleId: string,
    @Body(new ZodValidationPipe(updateMotorcycleRequestSchema)) request: UpdateMotorcycleRequest,
  ) {
    return this.service.updateMotorcycle(motorcycleId, request, await this.session(authorization));
  }

  @Post(':motorcycleId/soft-delete')
  async softDelete(
    @Headers('authorization') authorization: string | undefined,
    @Param('motorcycleId') motorcycleId: string,
  ) {
    return this.service.softDeleteMotorcycle(motorcycleId, await this.session(authorization));
  }

  @Post(':motorcycleId/restore')
  async restore(
    @Headers('authorization') authorization: string | undefined,
    @Param('motorcycleId') motorcycleId: string,
  ) {
    return this.service.restoreMotorcycle(motorcycleId, await this.session(authorization));
  }

  @Get(':motorcycleId/service-history')
  async history(@Headers('authorization') authorization: string | undefined) {
    return this.service.emptyHistory(await this.session(authorization), 'motorcycles.read');
  }

  @Post(':motorcycleId/mileage-corrections')
  async correctMileage(
    @Headers('authorization') authorization: string | undefined,
    @Param('motorcycleId') motorcycleId: string,
    @Body(new ZodValidationPipe(mileageCorrectionRequestSchema)) request: MileageCorrectionRequest,
  ) {
    return this.service.correctMileage(motorcycleId, request, await this.session(authorization));
  }

  private async session(authorization: string | undefined) {
    return (await this.auth.getAuthenticatedRouteSession(authorization)).tenantContextSession;
  }
}

@Controller('services')
@UseGuards(AccessTokenAuthGuard)
export class ServicesController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: MasterDataService,
  ) {}

  @Get()
  async list(
    @Headers('authorization') authorization: string | undefined,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    return this.service.listServices(query, await this.session(authorization));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(createServiceRequestSchema)) request: CreateServiceRequest,
  ) {
    return this.service.createService(request, await this.session(authorization));
  }

  @Get(':serviceId')
  async get(
    @Headers('authorization') authorization: string | undefined,
    @Param('serviceId') serviceId: string,
  ) {
    return this.service.getService(serviceId, await this.session(authorization));
  }

  @Patch(':serviceId')
  async update(
    @Headers('authorization') authorization: string | undefined,
    @Param('serviceId') serviceId: string,
    @Body(new ZodValidationPipe(updateServiceRequestSchema)) request: UpdateServiceRequest,
  ) {
    return this.service.updateService(serviceId, request, await this.session(authorization));
  }

  @Post(':serviceId/deactivate')
  async deactivate(
    @Headers('authorization') authorization: string | undefined,
    @Param('serviceId') serviceId: string,
  ) {
    return this.service.deactivateService(serviceId, await this.session(authorization));
  }

  @Post(':serviceId/reactivate')
  async reactivate(
    @Headers('authorization') authorization: string | undefined,
    @Param('serviceId') serviceId: string,
  ) {
    return this.service.reactivateService(serviceId, await this.session(authorization));
  }

  private async session(authorization: string | undefined) {
    return (await this.auth.getAuthenticatedRouteSession(authorization)).tenantContextSession;
  }
}

export const MASTER_DATA_CONTROLLERS = [
  BranchesController,
  EmployeesController,
  RolesController,
  CustomersController,
  MotorcyclesController,
  ServicesController,
] as const;
