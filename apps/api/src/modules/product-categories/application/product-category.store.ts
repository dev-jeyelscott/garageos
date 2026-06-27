import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type ProductCategoryStatus = 'active' | 'inactive';

export type ProductCategoryListStatusFilter = ProductCategoryStatus | 'all';

export type ProductCategoryDeactivationBlocker = 'active_products';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface ProductCategoryRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly status: ProductCategoryStatus;
  readonly createdAt: Date;
  readonly createdByUserId: string | null;
  readonly updatedAt: Date;
  readonly updatedByUserId: string | null;
  readonly deactivatedAt: Date | null;
  readonly reactivatedAt: Date | null;
  readonly lockVersion: number;
}

export interface ListProductCategoriesInput {
  readonly tenantId: string;
  readonly normalizedSearch: string | null;
  readonly status: ProductCategoryListStatusFilter;
  readonly limit: number;
}

export interface CreateProductCategoryInput {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface UpdateProductCategoryInput {
  readonly tenantId: string;
  readonly categoryId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly expectedLockVersion: number;
  readonly updatedByUserId: string;
  readonly updatedAt: Date;
}

export interface ChangeProductCategoryStatusInput {
  readonly tenantId: string;
  readonly categoryId: string;
  readonly fromStatus: ProductCategoryStatus;
  readonly toStatus: ProductCategoryStatus;
  readonly expectedLockVersion: number;
  readonly changedByUserId: string;
  readonly changedAt: Date;
}

export abstract class ProductCategoryStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract listProductCategories(
    input: ListProductCategoriesInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly ProductCategoryRecord[]>;

  abstract findProductCategoryById(
    tenantId: string,
    categoryId: string,
    client?: DatabaseQueryClient,
  ): Promise<ProductCategoryRecord | null>;

  abstract createProductCategory(
    input: CreateProductCategoryInput,
    client: DatabaseQueryClient,
  ): Promise<ProductCategoryRecord>;

  abstract updateProductCategory(
    input: UpdateProductCategoryInput,
    client: DatabaseQueryClient,
  ): Promise<ProductCategoryRecord | null>;

  abstract changeProductCategoryStatus(
    input: ChangeProductCategoryStatusInput,
    client: DatabaseQueryClient,
  ): Promise<ProductCategoryRecord | null>;

  abstract findProductCategoryDeactivationBlockers(
    tenantId: string,
    categoryId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly ProductCategoryDeactivationBlocker[]>;
}
