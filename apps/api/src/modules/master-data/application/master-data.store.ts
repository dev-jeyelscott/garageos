import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type {
  CreateBranchRequest,
  CreateCustomerRequest,
  CreateMotorcycleRequest,
  CreateRoleRequest,
  CreateServiceRequest,
  ListQuery,
  UpdateBranchRequest,
  UpdateCustomerRequest,
  UpdateEmployeeRequest,
  UpdateMotorcycleRequest,
  UpdateRoleRequest,
  UpdateServiceRequest,
} from '../api/master-data.schemas';

export interface MasterDataRecord {
  readonly [key: string]: unknown;
}

export interface CreateRecordInput<Request> {
  readonly id: string;
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly request: Request;
  readonly now: Date;
}

export interface TenantResourceInput {
  readonly tenantId: string;
  readonly id: string;
}

export abstract class MasterDataStore {
  abstract isActiveShopOwner(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<boolean>;
  abstract countActiveBranches(tenantId: string, client?: DatabaseQueryClient): Promise<number>;
  abstract getEffectiveMaxActiveBranches(
    tenantId: string,
    client?: DatabaseQueryClient,
  ): Promise<number>;

  abstract listBranches(tenantId: string, query: ListQuery): Promise<readonly MasterDataRecord[]>;
  abstract getBranch(
    input: TenantResourceInput,
    client?: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract createBranch(
    input: CreateRecordInput<CreateBranchRequest>,
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord>;
  abstract updateBranch(
    input: TenantResourceInput & { readonly request: UpdateBranchRequest; readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract setBranchStatus(
    input: TenantResourceInput & {
      readonly status: 'active' | 'inactive';
      readonly actorUserId: string;
      readonly reason: string | null;
      readonly now: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract hasBranchDeactivationBlockers(
    input: TenantResourceInput,
    client: DatabaseQueryClient,
  ): Promise<boolean>;

  abstract listPermissions(): Promise<readonly MasterDataRecord[]>;
  abstract listRoles(tenantId: string, query: ListQuery): Promise<readonly MasterDataRecord[]>;
  abstract getRole(
    input: TenantResourceInput,
    client?: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract createRole(
    input: CreateRecordInput<CreateRoleRequest>,
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord>;
  abstract updateRole(
    input: TenantResourceInput & { readonly request: UpdateRoleRequest; readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract deactivateRole(
    input: TenantResourceInput & { readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract activeUsersDependingOnlyOnRole(
    input: TenantResourceInput,
    client: DatabaseQueryClient,
  ): Promise<number>;

  abstract listEmployees(tenantId: string, query: ListQuery): Promise<readonly MasterDataRecord[]>;
  abstract getEmployee(
    input: TenantResourceInput,
    client?: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract updateEmployee(
    input: TenantResourceInput & {
      readonly request: UpdateEmployeeRequest;
      readonly actorUserId: string;
      readonly now: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract setEmployeeStatus(
    input: TenantResourceInput & { readonly status: 'active' | 'inactive'; readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract countActiveShopOwners(tenantId: string, client: DatabaseQueryClient): Promise<number>;
  abstract isShopOwnerEmployee(
    input: TenantResourceInput,
    client: DatabaseQueryClient,
  ): Promise<boolean>;
  abstract revokeEmployeeSessions(
    input: TenantResourceInput & { readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract listCustomers(tenantId: string, query: ListQuery): Promise<readonly MasterDataRecord[]>;
  abstract getCustomer(
    input: TenantResourceInput,
    client?: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract createCustomer(
    input: CreateRecordInput<CreateCustomerRequest>,
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord>;
  abstract updateCustomer(
    input: TenantResourceInput & {
      readonly request: UpdateCustomerRequest;
      readonly actorUserId: string;
      readonly now: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract setCustomerStatus(
    input: TenantResourceInput & {
      readonly status: 'active' | 'soft_deleted';
      readonly actorUserId: string;
      readonly now: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract mergeCustomers(
    input: {
      readonly tenantId: string;
      readonly sourceCustomerId: string;
      readonly survivingCustomerId: string;
      readonly actorUserId: string;
      readonly reason: string;
      readonly now: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract listCustomerMotorcycles(
    input: TenantResourceInput,
  ): Promise<readonly MasterDataRecord[]>;

  abstract listMotorcycles(
    tenantId: string,
    query: ListQuery,
  ): Promise<readonly MasterDataRecord[]>;
  abstract getMotorcycle(
    input: TenantResourceInput,
    client?: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract createMotorcycle(
    input: CreateRecordInput<CreateMotorcycleRequest>,
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord>;
  abstract updateMotorcycle(
    input: TenantResourceInput & { readonly request: UpdateMotorcycleRequest; readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract setMotorcycleStatus(
    input: TenantResourceInput & { readonly status: 'active' | 'soft_deleted'; readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract correctMotorcycleMileage(
    input: TenantResourceInput & {
      readonly newMileage: number;
      readonly reason: string;
      readonly actorUserId: string;
      readonly now: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;

  abstract listServices(tenantId: string, query: ListQuery): Promise<readonly MasterDataRecord[]>;
  abstract getService(
    input: TenantResourceInput,
    client?: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract createService(
    input: CreateRecordInput<CreateServiceRequest>,
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord>;
  abstract updateService(
    input: TenantResourceInput & { readonly request: UpdateServiceRequest; readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
  abstract setServiceStatus(
    input: TenantResourceInput & { readonly status: 'active' | 'inactive'; readonly now: Date },
    client: DatabaseQueryClient,
  ): Promise<MasterDataRecord | null>;
}
