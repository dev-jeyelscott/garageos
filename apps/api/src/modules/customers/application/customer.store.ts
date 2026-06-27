import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type CustomerStatus = 'active' | 'merged' | 'soft_deleted';

export type CustomerDuplicateWarningType = 'exact_mobile' | 'exact_email' | 'similar_name';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface CustomerRecord {
  readonly id: string;
  readonly name: string;
  readonly mobileNumber: string | null;
  readonly normalizedMobile: string | null;
  readonly email: string | null;
  readonly normalizedEmail: string | null;
  readonly address: string | null;
  readonly birthday: string | null;
  readonly notes: string | null;
  readonly status: CustomerStatus;
  readonly mergedIntoCustomerId: string | null;
  readonly tags: readonly string[];
  readonly lockVersion: number;
  readonly createdAt: Date;
  readonly createdByUserId: string | null;
  readonly updatedAt: Date;
  readonly updatedByUserId: string | null;
  readonly deletedAt: Date | null;
}

export interface CustomerDuplicateWarningRecord {
  readonly type: CustomerDuplicateWarningType;
  readonly customerId: string;
  readonly name: string;
  readonly mobileNumber: string | null;
  readonly email: string | null;
}

export interface ListCustomersInput {
  readonly tenantId: string;
  readonly normalizedSearch: string | null;
  readonly normalizedMobileSearch: string | null;
  readonly normalizedTagNames: readonly string[];
  readonly limit: number;
}

export interface FindDuplicateWarningsInput {
  readonly tenantId: string;
  readonly normalizedMobile: string | null;
  readonly normalizedEmail: string | null;
  readonly normalizedName: string;
  readonly excludeCustomerId: string | null;
}

export interface CreateCustomerInput {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly mobileNumber: string | null;
  readonly normalizedMobile: string | null;
  readonly email: string | null;
  readonly normalizedEmail: string | null;
  readonly address: string | null;
  readonly birthday: string | null;
  readonly notes: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface UpdateCustomerInput {
  readonly tenantId: string;
  readonly customerId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly mobileNumber: string | null;
  readonly normalizedMobile: string | null;
  readonly email: string | null;
  readonly normalizedEmail: string | null;
  readonly address: string | null;
  readonly birthday: string | null;
  readonly notes: string | null;
  readonly expectedLockVersion: number;
  readonly updatedByUserId: string;
  readonly updatedAt: Date;
}

export interface CustomerTagRecord {
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
}

export interface UpsertCustomerTagInput {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly createdAt: Date;
}

export interface ReplaceCustomerTagAssignmentsInput {
  readonly tenantId: string;
  readonly customerId: string;
  readonly tagIds: readonly string[];
  readonly createdAt: Date;
}

export abstract class CustomerStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract listCustomers(
    input: ListCustomersInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly CustomerRecord[]>;

  abstract findCustomerById(
    tenantId: string,
    customerId: string,
    client?: DatabaseQueryClient,
  ): Promise<CustomerRecord | null>;

  abstract createCustomer(
    input: CreateCustomerInput,
    client: DatabaseQueryClient,
  ): Promise<CustomerRecord>;

  abstract updateCustomer(
    input: UpdateCustomerInput,
    client: DatabaseQueryClient,
  ): Promise<CustomerRecord | null>;

  abstract upsertCustomerTag(
    input: UpsertCustomerTagInput,
    client: DatabaseQueryClient,
  ): Promise<CustomerTagRecord>;

  abstract replaceCustomerTagAssignments(
    input: ReplaceCustomerTagAssignmentsInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract findDuplicateWarnings(
    input: FindDuplicateWarningsInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly CustomerDuplicateWarningRecord[]>;
}
