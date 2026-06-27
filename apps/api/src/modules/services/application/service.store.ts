import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type ServiceStatus = 'active' | 'inactive';

export type ServiceListStatusFilter = ServiceStatus | 'all';

export type ServiceDeactivationBlocker = 'open_job_orders' | 'active_estimates';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface ServiceRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly startingPrice: string;
  readonly variablePrice: boolean;
  readonly priceDisclaimer: string | null;
  readonly description: string | null;
  readonly status: ServiceStatus;
  readonly deactivatedAt: Date | null;
  readonly reactivatedAt: Date | null;
  readonly createdAt: Date;
  readonly createdByUserId: string | null;
  readonly updatedAt: Date;
  readonly updatedByUserId: string | null;
  readonly lockVersion: number;
}

export interface ListServicesInput {
  readonly tenantId: string;
  readonly normalizedSearch: string | null;
  readonly status: ServiceListStatusFilter;
  readonly limit: number;
}

export interface CreateServiceInput {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly startingPrice: string;
  readonly variablePrice: boolean;
  readonly priceDisclaimer: string | null;
  readonly description: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface UpdateServiceInput {
  readonly tenantId: string;
  readonly serviceId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly startingPrice: string;
  readonly variablePrice: boolean;
  readonly priceDisclaimer: string | null;
  readonly description: string | null;
  readonly expectedLockVersion: number;
  readonly updatedByUserId: string;
  readonly updatedAt: Date;
}

export interface ChangeServiceStatusInput {
  readonly tenantId: string;
  readonly serviceId: string;
  readonly fromStatus: ServiceStatus;
  readonly toStatus: ServiceStatus;
  readonly expectedLockVersion: number;
  readonly changedByUserId: string;
  readonly changedAt: Date;
}

export abstract class ServiceStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract listServices(
    input: ListServicesInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly ServiceRecord[]>;

  abstract findServiceById(
    tenantId: string,
    serviceId: string,
    client?: DatabaseQueryClient,
  ): Promise<ServiceRecord | null>;

  abstract createService(
    input: CreateServiceInput,
    client: DatabaseQueryClient,
  ): Promise<ServiceRecord>;

  abstract updateService(
    input: UpdateServiceInput,
    client: DatabaseQueryClient,
  ): Promise<ServiceRecord | null>;

  abstract changeServiceStatus(
    input: ChangeServiceStatusInput,
    client: DatabaseQueryClient,
  ): Promise<ServiceRecord | null>;

  abstract findServiceDeactivationBlockers(
    tenantId: string,
    serviceId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly ServiceDeactivationBlocker[]>;
}
