import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type SupplierStatus = 'active' | 'inactive';
export type SupplierStatusFilter = SupplierStatus | 'all';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface SupplierRecord {
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly contactPerson: string | null;
  readonly mobileNumber: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly notes: string | null;
  readonly status: SupplierStatus;
  readonly lockVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deactivatedAt: Date | null;
  readonly reactivatedAt: Date | null;
}

export interface ListSuppliersInput {
  readonly tenantId: string;
  readonly normalizedSearch: string | null;
  readonly status: SupplierStatusFilter;
  readonly limit: number;
  readonly cursor: SupplierListCursor | null;
}

export interface SupplierListCursor {
  readonly updatedAt: Date;
  readonly id: string;
}

export interface CreateSupplierInput {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly contactPerson: string | null;
  readonly mobileNumber: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly notes: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface UpdateSupplierInput {
  readonly tenantId: string;
  readonly supplierId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly contactPerson: string | null;
  readonly mobileNumber: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly notes: string | null;
  readonly expectedLockVersion: number;
  readonly updatedByUserId: string;
  readonly updatedAt: Date;
}

export interface ChangeSupplierStatusInput {
  readonly tenantId: string;
  readonly supplierId: string;
  readonly fromStatus: SupplierStatus;
  readonly toStatus: SupplierStatus;
  readonly expectedLockVersion: number | null;
  readonly changedByUserId: string;
  readonly changedAt: Date;
}

export type SupplierDeactivationBlocker = 'open_purchase_orders' | 'unpaid_accounts_payable';

export abstract class SupplierStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract listSuppliers(
    input: ListSuppliersInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly SupplierRecord[]>;

  abstract findSupplierById(
    tenantId: string,
    supplierId: string,
    client?: DatabaseQueryClient,
  ): Promise<SupplierRecord | null>;

  abstract createSupplier(
    input: CreateSupplierInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierRecord>;

  abstract updateSupplier(
    input: UpdateSupplierInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierRecord | null>;

  abstract changeSupplierStatus(
    input: ChangeSupplierStatusInput,
    client: DatabaseQueryClient,
  ): Promise<SupplierRecord | null>;

  abstract findSupplierDeactivationBlockers(
    tenantId: string,
    supplierId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly SupplierDeactivationBlocker[]>;
}
