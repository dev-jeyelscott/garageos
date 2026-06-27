import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
  type TenantAccessAction,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import {
  resolveTenantContextFromAuthenticatedSession,
  TENANT_STATUSES,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type {
  ActionReasonRequest,
  CreateBranchRequest,
  CreateCustomerRequest,
  CreateMotorcycleRequest,
  CreateRoleRequest,
  CreateServiceRequest,
  ListQuery,
  MergeCustomersRequest,
  MileageCorrectionRequest,
  UpdateBranchRequest,
  UpdateCustomerRequest,
  UpdateEmployeeRequest,
  UpdateMotorcycleRequest,
  UpdateRoleRequest,
  UpdateServiceRequest,
} from '../api/master-data.schemas';
import { MasterDataStore, type MasterDataRecord } from './master-data.store';

@Injectable()
export class MasterDataService {
  constructor(
    @Inject(MasterDataStore) private readonly store: MasterDataStore,
    @Inject(API_TRANSACTION_RUNNER) private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async listBranches(query: ListQuery, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'branches.read',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    );
    return { items: await this.store.listBranches(context.tenantId, query) };
  }

  async getBranch(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'branches.read',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    );
    return this.required(
      await this.store.getBranch({ tenantId: context.tenantId, id }),
      'Branch not found.',
    );
  }

  async createBranch(request: CreateBranchRequest, session: TenantContextAuthenticatedSession) {
    const context = await this.authorizeBranchCreate(session);
    return this.transactionRunner.runInTransaction(async (client) => {
      await this.assertBranchPlanLimit(context, client);
      const branch = await this.store.createBranch(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          actorUserId: context.actorUserId,
          request,
          now: new Date(),
        },
        client,
      );
      await this.audit(context, 'branches.create', 'branch', String(branch.id), branch, client);
      return branch;
    });
  }

  async updateBranch(
    id: string,
    request: UpdateBranchRequest,
    session: TenantContextAuthenticatedSession,
  ) {
    const context = await this.authorize(
      session,
      'branches.update',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      const before = await this.store.getBranch({ tenantId: context.tenantId, id }, client);
      const branch = this.required(
        await this.store.updateBranch(
          { tenantId: context.tenantId, id, request, now: new Date() },
          client,
        ),
        'Branch not found.',
      );
      await this.audit(context, 'branches.update', 'branch', id, branch, client, before);
      return branch;
    });
  }

  async deactivateBranch(
    id: string,
    request: ActionReasonRequest,
    session: TenantContextAuthenticatedSession,
  ) {
    const context = await this.authorize(
      session,
      'branches.deactivate',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      const before = await this.store.getBranch({ tenantId: context.tenantId, id }, client);
      if (!before) throw GarageOsApiException.resourceNotFound('Branch not found.');
      if ((await this.store.countActiveBranches(context.tenantId, client)) <= 1) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'branch_id',
            code: 'last_active_branch',
            message: 'Cannot deactivate the last active branch.',
          },
        ]);
      }
      if (
        await this.store.hasBranchDeactivationBlockers({ tenantId: context.tenantId, id }, client)
      ) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'branch_id',
            code: 'branch_has_open_references',
            message: 'Branch has open operational references.',
          },
        ]);
      }
      const branch = this.required(
        await this.store.setBranchStatus(
          {
            tenantId: context.tenantId,
            id,
            status: 'inactive',
            actorUserId: context.actorUserId,
            reason: request.reason ?? null,
            now: new Date(),
          },
          client,
        ),
        'Branch not found.',
      );
      await this.audit(
        context,
        'branches.deactivate',
        'branch',
        id,
        branch,
        client,
        before,
        request.reason,
      );
      return branch;
    });
  }

  async reactivateBranch(
    id: string,
    request: ActionReasonRequest,
    session: TenantContextAuthenticatedSession,
  ) {
    const context = await this.authorize(
      session,
      'branches.reactivate',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      await this.assertBranchPlanLimit(context, client);
      const before = await this.store.getBranch({ tenantId: context.tenantId, id }, client);
      const branch = this.required(
        await this.store.setBranchStatus(
          {
            tenantId: context.tenantId,
            id,
            status: 'active',
            actorUserId: context.actorUserId,
            reason: request.reason ?? null,
            now: new Date(),
          },
          client,
        ),
        'Branch not found.',
      );
      await this.audit(
        context,
        'branches.reactivate',
        'branch',
        id,
        branch,
        client,
        before,
        request.reason,
      );
      return branch;
    });
  }

  async listPermissions(session: TenantContextAuthenticatedSession) {
    await this.authorize(session, 'permissions.read', TENANT_ACCESS_ACTIONS.OPERATIONAL_READ);
    return { items: await this.store.listPermissions() };
  }

  async listRoles(query: ListQuery, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'roles.read',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    );
    return { items: await this.store.listRoles(context.tenantId, query) };
  }

  async getRole(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'roles.read',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    );
    return this.required(
      await this.store.getRole({ tenantId: context.tenantId, id }),
      'Role not found.',
    );
  }

  async createRole(request: CreateRoleRequest, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'roles.create',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      const role = await this.store.createRole(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          actorUserId: context.actorUserId,
          request,
          now: new Date(),
        },
        client,
      );
      await this.audit(context, 'roles.create', 'role', String(role.id), role, client);
      return role;
    });
  }

  async updateRole(
    id: string,
    request: UpdateRoleRequest,
    session: TenantContextAuthenticatedSession,
  ) {
    const context = await this.authorize(
      session,
      'roles.update',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      const before = await this.store.getRole({ tenantId: context.tenantId, id }, client);
      const role = this.required(
        await this.store.updateRole(
          { tenantId: context.tenantId, id, request, now: new Date() },
          client,
        ),
        'Role not found.',
      );
      await this.audit(context, 'roles.update', 'role', id, role, client, before);
      return role;
    });
  }

  async deactivateRole(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'roles.deactivate',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      if (
        (await this.store.activeUsersDependingOnlyOnRole(
          { tenantId: context.tenantId, id },
          client,
        )) > 0
      ) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'role_id',
            code: 'active_users_depend_on_role',
            message: 'Role is the only active role for one or more users.',
          },
        ]);
      }
      const before = await this.store.getRole({ tenantId: context.tenantId, id }, client);
      const role = this.required(
        await this.store.deactivateRole(
          { tenantId: context.tenantId, id, now: new Date() },
          client,
        ),
        'Role not found.',
      );
      await this.audit(context, 'roles.deactivate', 'role', id, role, client, before);
      return role;
    });
  }

  async listEmployees(query: ListQuery, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'users.read',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    );
    return { items: await this.store.listEmployees(context.tenantId, query) };
  }

  async getEmployee(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'users.read',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    );
    return this.required(
      await this.store.getEmployee({ tenantId: context.tenantId, id }),
      'Employee not found.',
    );
  }

  async updateEmployee(
    id: string,
    request: UpdateEmployeeRequest,
    session: TenantContextAuthenticatedSession,
  ) {
    const context = await this.authorize(
      session,
      'users.update',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      const before = await this.store.getEmployee({ tenantId: context.tenantId, id }, client);
      const employee = this.required(
        await this.store.updateEmployee(
          {
            tenantId: context.tenantId,
            id,
            request,
            actorUserId: context.actorUserId,
            now: new Date(),
          },
          client,
        ),
        'Employee not found.',
      );
      await this.audit(context, 'users.update', 'employee', id, employee, client, before);
      return employee;
    });
  }

  async deactivateEmployee(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'users.deactivate',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      if (
        (await this.store.isShopOwnerEmployee({ tenantId: context.tenantId, id }, client)) &&
        (await this.store.countActiveShopOwners(context.tenantId, client)) <= 1
      ) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'employee_id',
            code: 'last_active_shop_owner',
            message: 'Cannot deactivate the last active Shop Owner.',
          },
        ]);
      }
      const before = await this.store.getEmployee({ tenantId: context.tenantId, id }, client);
      const employee = this.required(
        await this.store.setEmployeeStatus(
          { tenantId: context.tenantId, id, status: 'inactive', now: new Date() },
          client,
        ),
        'Employee not found.',
      );
      await this.store.revokeEmployeeSessions(
        { tenantId: context.tenantId, id, now: new Date() },
        client,
      );
      await this.audit(context, 'users.deactivate', 'employee', id, employee, client, before);
      return employee;
    });
  }

  async reactivateEmployee(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'users.update',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      const before = await this.store.getEmployee({ tenantId: context.tenantId, id }, client);
      const employee = this.required(
        await this.store.setEmployeeStatus(
          { tenantId: context.tenantId, id, status: 'active', now: new Date() },
          client,
        ),
        'Employee not found.',
      );
      await this.audit(context, 'users.reactivate', 'employee', id, employee, client, before);
      return employee;
    });
  }

  async listCustomers(query: ListQuery, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'customers.read',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    );
    return { items: await this.store.listCustomers(context.tenantId, query) };
  }

  async getCustomer(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'customers.read',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    );
    return this.required(
      await this.store.getCustomer({ tenantId: context.tenantId, id }),
      'Customer not found.',
    );
  }

  async createCustomer(request: CreateCustomerRequest, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'customers.create',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      const customer = await this.store.createCustomer(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          actorUserId: context.actorUserId,
          request,
          now: new Date(),
        },
        client,
      );
      await this.audit(
        context,
        'customers.create',
        'customer',
        String(customer.id),
        customer,
        client,
      );
      return customer;
    });
  }

  async updateCustomer(
    id: string,
    request: UpdateCustomerRequest,
    session: TenantContextAuthenticatedSession,
  ) {
    const context = await this.authorize(
      session,
      'customers.update',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      const before = await this.store.getCustomer({ tenantId: context.tenantId, id }, client);
      const customer = this.required(
        await this.store.updateCustomer(
          {
            tenantId: context.tenantId,
            id,
            request,
            actorUserId: context.actorUserId,
            now: new Date(),
          },
          client,
        ),
        'Customer not found.',
      );
      await this.audit(context, 'customers.update', 'customer', id, customer, client, before);
      return customer;
    });
  }

  async softDeleteCustomer(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'customers.soft_delete',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.setCustomerStatus(id, 'soft_deleted', context, 'customers.soft_delete');
  }

  async restoreCustomer(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'customers.restore',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.setCustomerStatus(id, 'active', context, 'customers.restore');
  }

  async mergeCustomers(request: MergeCustomersRequest, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'customers.merge',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      const merged = this.required(
        await this.store.mergeCustomers(
          {
            tenantId: context.tenantId,
            sourceCustomerId: request.source_customer_id,
            survivingCustomerId: request.surviving_customer_id,
            actorUserId: context.actorUserId,
            reason: request.reason,
            now: new Date(),
          },
          client,
        ),
        'Customer not found.',
      );
      await this.audit(
        context,
        'customers.merge',
        'customer',
        request.source_customer_id,
        merged,
        client,
        null,
        request.reason,
      );
      return merged;
    });
  }

  async listCustomerMotorcycles(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'motorcycles.read',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    );
    return { items: await this.store.listCustomerMotorcycles({ tenantId: context.tenantId, id }) };
  }

  async listMotorcycles(query: ListQuery, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'motorcycles.read',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    );
    return { items: await this.store.listMotorcycles(context.tenantId, query) };
  }

  async getMotorcycle(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'motorcycles.read',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    );
    return this.required(
      await this.store.getMotorcycle({ tenantId: context.tenantId, id }),
      'Motorcycle not found.',
    );
  }

  async createMotorcycle(
    request: CreateMotorcycleRequest,
    session: TenantContextAuthenticatedSession,
  ) {
    const context = await this.authorize(
      session,
      'motorcycles.create',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      const customer = await this.store.getCustomer(
        { tenantId: context.tenantId, id: request.customer_id },
        client,
      );
      if (!customer || customer.status !== 'active')
        throw GarageOsApiException.validationFailed([
          {
            field: 'customer_id',
            code: 'customer_not_active',
            message: 'Motorcycle requires an active customer.',
          },
        ]);
      const motorcycle = await this.store.createMotorcycle(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          actorUserId: context.actorUserId,
          request,
          now: new Date(),
        },
        client,
      );
      await this.audit(
        context,
        'motorcycles.create',
        'motorcycle',
        String(motorcycle.id),
        motorcycle,
        client,
      );
      return motorcycle;
    });
  }

  async updateMotorcycle(
    id: string,
    request: UpdateMotorcycleRequest,
    session: TenantContextAuthenticatedSession,
  ) {
    const context = await this.authorize(
      session,
      'motorcycles.update',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      if (request.customer_id) {
        const customer = await this.store.getCustomer(
          { tenantId: context.tenantId, id: request.customer_id },
          client,
        );
        if (!customer || customer.status !== 'active')
          throw GarageOsApiException.validationFailed([
            {
              field: 'customer_id',
              code: 'customer_not_active',
              message: 'Motorcycle requires an active customer.',
            },
          ]);
      }
      const before = await this.store.getMotorcycle({ tenantId: context.tenantId, id }, client);
      const motorcycle = this.required(
        await this.store.updateMotorcycle(
          { tenantId: context.tenantId, id, request, now: new Date() },
          client,
        ),
        'Motorcycle not found.',
      );
      await this.audit(context, 'motorcycles.update', 'motorcycle', id, motorcycle, client, before);
      return motorcycle;
    });
  }

  async softDeleteMotorcycle(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'motorcycles.soft_delete',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.setMotorcycleStatus(id, 'soft_deleted', context, 'motorcycles.soft_delete');
  }

  async restoreMotorcycle(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'motorcycles.restore',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.setMotorcycleStatus(id, 'active', context, 'motorcycles.restore');
  }

  async correctMileage(
    id: string,
    request: MileageCorrectionRequest,
    session: TenantContextAuthenticatedSession,
  ) {
    const context = await this.authorize(
      session,
      'motorcycles.update',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      const before = await this.store.getMotorcycle({ tenantId: context.tenantId, id }, client);
      const motorcycle = this.required(
        await this.store.correctMotorcycleMileage(
          {
            tenantId: context.tenantId,
            id,
            newMileage: request.new_mileage,
            reason: request.reason,
            actorUserId: context.actorUserId,
            now: new Date(),
          },
          client,
        ),
        'Motorcycle not found.',
      );
      await this.audit(
        context,
        'motorcycles.mileage_corrected',
        'motorcycle',
        id,
        motorcycle,
        client,
        before,
        request.reason,
      );
      return motorcycle;
    });
  }

  async listServices(query: ListQuery, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'services.read',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    );
    return { items: await this.store.listServices(context.tenantId, query) };
  }

  async getService(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'services.read',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    );
    return this.required(
      await this.store.getService({ tenantId: context.tenantId, id }),
      'Service not found.',
    );
  }

  async createService(request: CreateServiceRequest, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'services.create',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      const service = await this.store.createService(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          actorUserId: context.actorUserId,
          request,
          now: new Date(),
        },
        client,
      );
      await this.audit(context, 'services.create', 'service', String(service.id), service, client);
      return service;
    });
  }

  async updateService(
    id: string,
    request: UpdateServiceRequest,
    session: TenantContextAuthenticatedSession,
  ) {
    const context = await this.authorize(
      session,
      'services.update',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.transactionRunner.runInTransaction(async (client) => {
      const before = await this.store.getService({ tenantId: context.tenantId, id }, client);
      const service = this.required(
        await this.store.updateService(
          { tenantId: context.tenantId, id, request, now: new Date() },
          client,
        ),
        'Service not found.',
      );
      await this.audit(context, 'services.update', 'service', id, service, client, before);
      return service;
    });
  }

  async deactivateService(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'services.deactivate',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.setServiceStatus(id, 'inactive', context, 'services.deactivate');
  }

  async reactivateService(id: string, session: TenantContextAuthenticatedSession) {
    const context = await this.authorize(
      session,
      'services.update',
      TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    );
    return this.setServiceStatus(id, 'active', context, 'services.reactivate');
  }

  async emptyHistory(session: TenantContextAuthenticatedSession, permission: string) {
    await this.authorize(session, permission, TENANT_ACCESS_ACTIONS.OPERATIONAL_READ);
    return { items: [] };
  }

  private async setCustomerStatus(
    id: string,
    status: 'active' | 'soft_deleted',
    context: ResolvedTenantContext,
    action: string,
  ) {
    return this.transactionRunner.runInTransaction(async (client) => {
      const before = await this.store.getCustomer({ tenantId: context.tenantId, id }, client);
      const customer = this.required(
        await this.store.setCustomerStatus(
          {
            tenantId: context.tenantId,
            id,
            status,
            actorUserId: context.actorUserId,
            now: new Date(),
          },
          client,
        ),
        'Customer not found.',
      );
      await this.audit(context, action, 'customer', id, customer, client, before);
      return customer;
    });
  }

  private async setMotorcycleStatus(
    id: string,
    status: 'active' | 'soft_deleted',
    context: ResolvedTenantContext,
    action: string,
  ) {
    return this.transactionRunner.runInTransaction(async (client) => {
      const before = await this.store.getMotorcycle({ tenantId: context.tenantId, id }, client);
      const motorcycle = this.required(
        await this.store.setMotorcycleStatus(
          { tenantId: context.tenantId, id, status, now: new Date() },
          client,
        ),
        'Motorcycle not found.',
      );
      await this.audit(context, action, 'motorcycle', id, motorcycle, client, before);
      return motorcycle;
    });
  }

  private async setServiceStatus(
    id: string,
    status: 'active' | 'inactive',
    context: ResolvedTenantContext,
    action: string,
  ) {
    return this.transactionRunner.runInTransaction(async (client) => {
      const before = await this.store.getService({ tenantId: context.tenantId, id }, client);
      const service = this.required(
        await this.store.setServiceStatus(
          { tenantId: context.tenantId, id, status, now: new Date() },
          client,
        ),
        'Service not found.',
      );
      await this.audit(context, action, 'service', id, service, client, before);
      return service;
    });
  }

  private async authorize(
    session: TenantContextAuthenticatedSession,
    permission: string,
    action: TenantAccessAction,
  ): Promise<ResolvedTenantContext> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.store.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });
    assertTenantLifecycleAccess({ context, isShopOwner, action });
    if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
      throw GarageOsApiException.forbidden(permission);
    }
    return context;
  }

  private async authorizeBranchCreate(
    session: TenantContextAuthenticatedSession,
  ): Promise<ResolvedTenantContext> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.store.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });
    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action:
        context.tenantStatus === TENANT_STATUSES.PENDING_SETUP
          ? TENANT_ACCESS_ACTIONS.ONBOARDING_SETUP
          : TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    if (!isShopOwner && !context.effectivePermissions.includes('branches.create')) {
      throw GarageOsApiException.forbidden('branches.create');
    }
    return context;
  }

  private async assertBranchPlanLimit(
    context: ResolvedTenantContext,
    client: Parameters<Parameters<DatabaseTransactionRunner['runInTransaction']>[0]>[0],
  ): Promise<void> {
    const [activeBranches, limit] = await Promise.all([
      this.store.countActiveBranches(context.tenantId, client),
      this.store.getEffectiveMaxActiveBranches(context.tenantId, client),
    ]);
    if (activeBranches >= limit) {
      throw GarageOsApiException.forbidden(
        'branches.create',
        'Your current plan does not allow another active branch.',
      );
    }
  }

  private async audit(
    context: ResolvedTenantContext,
    action: string,
    entityType: string,
    entityId: string,
    afterJson: unknown,
    client: Parameters<Parameters<DatabaseTransactionRunner['runInTransaction']>[0]>[0],
    beforeJson: unknown = null,
    reason?: string | null,
  ): Promise<void> {
    await this.auditService.record({
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
      action,
      entityType,
      entityId,
      beforeJson,
      afterJson,
      reason: reason ?? null,
      client,
    });
  }

  private required(record: MasterDataRecord | null, message: string): MasterDataRecord {
    if (!record) throw GarageOsApiException.resourceNotFound(message);
    return record;
  }
}
