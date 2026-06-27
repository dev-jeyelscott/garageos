import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  ProductCategoryStore,
  type ChangeProductCategoryStatusInput,
  type CreateProductCategoryInput,
  type ListProductCategoriesInput,
  type ProductCategoryDeactivationBlocker,
  type ProductCategoryRecord,
  type UpdateProductCategoryInput,
} from '../application/product-category.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface RegclassRow extends DatabaseRow {
  readonly value: string | null;
}

interface ProductCategoryRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly name: string;
  readonly normalized_name: string;
  readonly status: 'active' | 'inactive';
  readonly created_at: Date | string;
  readonly created_by_user_id: string | null;
  readonly updated_at: Date | string;
  readonly updated_by_user_id: string | null;
  readonly deactivated_at: Date | string | null;
  readonly reactivated_at: Date | string | null;
  readonly lock_version: number;
}

@Injectable()
export class PostgresProductCategoryRepository extends ProductCategoryStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async isActiveShopOwner(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<boolean> {
    const result = await this.database.query<BooleanRow>(
      `
        select exists (
          select 1
          from user_roles ur
          inner join roles r
            on r.tenant_id = ur.tenant_id
           and r.id = ur.role_id
           and r.status = 'active'
           and r.role_type = 'shop_owner'
          where ur.tenant_id = $1
            and ur.user_id = $2
            and ur.removed_at is null
        ) as value
      `,
      [input.tenantId, input.userId],
    );

    return result.rows[0]?.value ?? false;
  }

  async listProductCategories(
    input: ListProductCategoriesInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly ProductCategoryRecord[]> {
    const result = await client.query<ProductCategoryRow>(
      `
        select
          id,
          tenant_id,
          name,
          normalized_name,
          status,
          created_at,
          created_by_user_id,
          updated_at,
          updated_by_user_id,
          deactivated_at,
          reactivated_at,
          lock_version
        from product_categories
        where tenant_id = $1
          and ($2::text = 'all' or status = $2::text)
          and (
            $3::text is null
            or normalized_name like '%' || $3::text || '%'
          )
        order by updated_at desc, created_at desc, id asc
        limit $4
      `,
      [input.tenantId, input.status, input.normalizedSearch, input.limit],
    );

    return result.rows.map(toProductCategoryRecord);
  }

  async findProductCategoryById(
    tenantId: string,
    categoryId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<ProductCategoryRecord | null> {
    const result = await client.query<ProductCategoryRow>(
      `
        select
          id,
          tenant_id,
          name,
          normalized_name,
          status,
          created_at,
          created_by_user_id,
          updated_at,
          updated_by_user_id,
          deactivated_at,
          reactivated_at,
          lock_version
        from product_categories
        where tenant_id = $1
          and id = $2
        limit 1
      `,
      [tenantId, categoryId],
    );

    const row = result.rows[0];

    return row === undefined ? null : toProductCategoryRecord(row);
  }

  async createProductCategory(
    input: CreateProductCategoryInput,
    client: DatabaseQueryClient,
  ): Promise<ProductCategoryRecord> {
    const result = await client.query<ProductCategoryRow>(
      `
        insert into product_categories (
          id,
          tenant_id,
          name,
          normalized_name,
          status,
          created_at,
          created_by_user_id,
          updated_at,
          updated_by_user_id
        )
        values (
          $1,
          $2,
          $3,
          $4,
          'active',
          $5,
          $6,
          $5,
          $6
        )
        returning
          id,
          tenant_id,
          name,
          normalized_name,
          status,
          created_at,
          created_by_user_id,
          updated_at,
          updated_by_user_id,
          deactivated_at,
          reactivated_at,
          lock_version
      `,
      [
        input.id,
        input.tenantId,
        input.name,
        input.normalizedName,
        input.createdAt,
        input.createdByUserId,
      ],
    );

    const row = result.rows[0];

    if (row === undefined) {
      throw new Error('Product category create did not return a row.');
    }

    return toProductCategoryRecord(row);
  }

  async updateProductCategory(
    input: UpdateProductCategoryInput,
    client: DatabaseQueryClient,
  ): Promise<ProductCategoryRecord | null> {
    const result = await client.query<ProductCategoryRow>(
      `
        update product_categories
        set
          name = $3,
          normalized_name = $4,
          updated_at = $5,
          updated_by_user_id = $6,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = 'active'
          and lock_version = $7
        returning
          id,
          tenant_id,
          name,
          normalized_name,
          status,
          created_at,
          created_by_user_id,
          updated_at,
          updated_by_user_id,
          deactivated_at,
          reactivated_at,
          lock_version
      `,
      [
        input.tenantId,
        input.categoryId,
        input.name,
        input.normalizedName,
        input.updatedAt,
        input.updatedByUserId,
        input.expectedLockVersion,
      ],
    );

    const row = result.rows[0];

    return row === undefined ? null : toProductCategoryRecord(row);
  }

  async changeProductCategoryStatus(
    input: ChangeProductCategoryStatusInput,
    client: DatabaseQueryClient,
  ): Promise<ProductCategoryRecord | null> {
    const result = await client.query<ProductCategoryRow>(
      `
        update product_categories
        set
          status = $4,
          deactivated_at = case when $4::text = 'inactive' then $6 else deactivated_at end,
          reactivated_at = case when $4::text = 'active' then $6 else reactivated_at end,
          updated_at = $6,
          updated_by_user_id = $7,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = $3
          and lock_version = $5
        returning
          id,
          tenant_id,
          name,
          normalized_name,
          status,
          created_at,
          created_by_user_id,
          updated_at,
          updated_by_user_id,
          deactivated_at,
          reactivated_at,
          lock_version
      `,
      [
        input.tenantId,
        input.categoryId,
        input.fromStatus,
        input.toStatus,
        input.expectedLockVersion,
        input.changedAt,
        input.changedByUserId,
      ],
    );

    const row = result.rows[0];

    return row === undefined ? null : toProductCategoryRecord(row);
  }

  async findProductCategoryDeactivationBlockers(
    tenantId: string,
    categoryId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly ProductCategoryDeactivationBlocker[]> {
    const blockers = new Set<ProductCategoryDeactivationBlocker>();

    if (await this.tableExists('products', client)) {
      const result = await client.query<BooleanRow>(
        `
          select exists (
            select 1
            from products p
            where p.tenant_id = $1
              and p.category_id = $2
              and p.status = 'active'
          ) as value
        `,
        [tenantId, categoryId],
      );

      if (result.rows[0]?.value === true) {
        blockers.add('active_products');
      }
    }

    return [...blockers];
  }

  private async tableExists(
    tableName: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<boolean> {
    const result = await client.query<RegclassRow>(
      `
        select to_regclass($1) as value
      `,
      [`public.${tableName}`],
    );

    return result.rows[0]?.value !== null && result.rows[0]?.value !== undefined;
  }
}

function toProductCategoryRecord(row: ProductCategoryRow): ProductCategoryRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    normalizedName: row.normalized_name,
    status: row.status,
    createdAt: toDate(row.created_at),
    createdByUserId: row.created_by_user_id,
    updatedAt: toDate(row.updated_at),
    updatedByUserId: row.updated_by_user_id,
    deactivatedAt: toNullableDate(row.deactivated_at),
    reactivatedAt: toNullableDate(row.reactivated_at),
    lockVersion: row.lock_version,
  };
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }

  return toDate(value);
}
