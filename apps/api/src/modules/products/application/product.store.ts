import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type ProductStatus = 'active' | 'inactive';

export type ProductListStatusFilter = ProductStatus | 'all';

export type ProductDeactivationBlocker =
  | 'non_zero_stock'
  | 'active_reservations'
  | 'open_job_orders'
  | 'open_purchase_orders'
  | 'open_inventory_transfers';

export interface ShopOwnerCheckInput {
  readonly tenantId: string;
  readonly userId: string;
}

export interface ProductCategorySnapshot {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'inactive';
}

export interface ProductRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly categoryId: string;
  readonly category: ProductCategorySnapshot;
  readonly name: string;
  readonly normalizedName: string;
  readonly sku: string;
  readonly normalizedSku: string;
  readonly barcode: string | null;
  readonly normalizedBarcode: string | null;
  readonly supplierCode: string | null;
  readonly brand: string | null;
  readonly unitOfMeasure: string;
  readonly defaultCost: string;
  readonly sellingPrice: string;
  readonly reorderLevel: string;
  readonly description: string | null;
  readonly status: ProductStatus;
  readonly createdAt: Date;
  readonly createdByUserId: string | null;
  readonly updatedAt: Date;
  readonly updatedByUserId: string | null;
  readonly deactivatedAt: Date | null;
  readonly reactivatedAt: Date | null;
  readonly lockVersion: number;
}

export interface ListProductsInput {
  readonly tenantId: string;
  readonly normalizedSearch: string | null;
  readonly categoryId: string | null;
  readonly status: ProductListStatusFilter;
  readonly limit: number;
}

export interface CreateProductInput {
  readonly id: string;
  readonly tenantId: string;
  readonly categoryId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly sku: string;
  readonly normalizedSku: string;
  readonly barcode: string | null;
  readonly normalizedBarcode: string | null;
  readonly supplierCode: string | null;
  readonly brand: string | null;
  readonly unitOfMeasure: string;
  readonly defaultCost: string;
  readonly sellingPrice: string;
  readonly reorderLevel: string;
  readonly description: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface UpdateProductInput {
  readonly tenantId: string;
  readonly productId: string;
  readonly categoryId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly sku: string;
  readonly normalizedSku: string;
  readonly barcode: string | null;
  readonly normalizedBarcode: string | null;
  readonly supplierCode: string | null;
  readonly brand: string | null;
  readonly unitOfMeasure: string;
  readonly defaultCost: string;
  readonly sellingPrice: string;
  readonly reorderLevel: string;
  readonly description: string | null;
  readonly expectedLockVersion: number;
  readonly updatedByUserId: string;
  readonly updatedAt: Date;
}

export interface ChangeProductStatusInput {
  readonly tenantId: string;
  readonly productId: string;
  readonly fromStatus: ProductStatus;
  readonly toStatus: ProductStatus;
  readonly expectedLockVersion: number;
  readonly changedByUserId: string;
  readonly changedAt: Date;
}

export abstract class ProductStore {
  abstract isActiveShopOwner(input: ShopOwnerCheckInput): Promise<boolean>;

  abstract listProducts(
    input: ListProductsInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly ProductRecord[]>;

  abstract findProductById(
    tenantId: string,
    productId: string,
    client?: DatabaseQueryClient,
  ): Promise<ProductRecord | null>;

  abstract findActiveProductCategoryById(
    tenantId: string,
    categoryId: string,
    client?: DatabaseQueryClient,
  ): Promise<ProductCategorySnapshot | null>;

  abstract createProduct(
    input: CreateProductInput,
    client: DatabaseQueryClient,
  ): Promise<ProductRecord>;

  abstract updateProduct(
    input: UpdateProductInput,
    client: DatabaseQueryClient,
  ): Promise<ProductRecord | null>;

  abstract changeProductStatus(
    input: ChangeProductStatusInput,
    client: DatabaseQueryClient,
  ): Promise<ProductRecord | null>;

  abstract findProductDeactivationBlockers(
    tenantId: string,
    productId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly ProductDeactivationBlocker[]>;
}
