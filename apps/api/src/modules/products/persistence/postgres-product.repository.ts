import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  ProductStore,
  type ChangeProductStatusInput,
  type CreateProductInput,
  type ListProductsInput,
  type ProductCategorySnapshot,
  type ProductDeactivationBlocker,
  type ProductRecord,
  type UpdateProductInput,
} from '../application/product.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface RegclassRow extends DatabaseRow {
  readonly value: string | null;
}

interface ProductCategoryRow extends DatabaseRow {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'inactive';
}

interface ProductRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly category_id: string;
  readonly category_name: string;
  readonly category_status: 'active' | 'inactive';
  readonly name: string;
  readonly normalized_name: string;
  readonly sku: string;
  readonly normalized_sku: string;
  readonly barcode: string | null;
  readonly normalized_barcode: string | null;
  readonly supplier_code: string | null;
  readonly brand: string | null;
  readonly unit_of_measure: string;
  readonly default_cost: string;
  readonly selling_price: string;
  readonly reorder_level: string;
  readonly description: string | null;
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
export class PostgresProductRepository extends ProductStore {
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

  async listProducts(
    input: ListProductsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly ProductRecord[]> {
    const result = await client.query<ProductRow>(
      `
        select
          p.id,
          p.tenant_id,
          p.category_id,
          pc.name as category_name,
          pc.status as category_status,
          p.name,
          p.normalized_name,
          p.sku,
          p.normalized_sku,
          p.barcode,
          p.normalized_barcode,
          p.supplier_code,
          p.brand,
          p.unit_of_measure,
          p.default_cost,
          p.selling_price,
          p.reorder_level,
          p.description,
          p.status,
          p.created_at,
          p.created_by_user_id,
          p.updated_at,
          p.updated_by_user_id,
          p.deactivated_at,
          p.reactivated_at,
          p.lock_version
        from products p
        inner join product_categories pc
          on pc.tenant_id = p.tenant_id
         and pc.id = p.category_id
        where p.tenant_id = $1
          and ($2::text = 'all' or p.status = $2::text)
          and ($3::uuid is null or p.category_id = $3::uuid)
          and (
            $4::text is null
            or p.normalized_name like '%' || $4::text || '%'
            or p.normalized_sku like '%' || $4::text || '%'
            or p.normalized_barcode like '%' || $4::text || '%'
          )
        order by p.updated_at desc, p.created_at desc, p.id asc
        limit $5
      `,
      [input.tenantId, input.status, input.categoryId, input.normalizedSearch, input.limit],
    );

    return result.rows.map(toProductRecord);
  }

  async findProductById(
    tenantId: string,
    productId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<ProductRecord | null> {
    const result = await client.query<ProductRow>(
      `
        select
          p.id,
          p.tenant_id,
          p.category_id,
          pc.name as category_name,
          pc.status as category_status,
          p.name,
          p.normalized_name,
          p.sku,
          p.normalized_sku,
          p.barcode,
          p.normalized_barcode,
          p.supplier_code,
          p.brand,
          p.unit_of_measure,
          p.default_cost,
          p.selling_price,
          p.reorder_level,
          p.description,
          p.status,
          p.created_at,
          p.created_by_user_id,
          p.updated_at,
          p.updated_by_user_id,
          p.deactivated_at,
          p.reactivated_at,
          p.lock_version
        from products p
        inner join product_categories pc
          on pc.tenant_id = p.tenant_id
         and pc.id = p.category_id
        where p.tenant_id = $1
          and p.id = $2
        limit 1
      `,
      [tenantId, productId],
    );

    const row = result.rows[0];

    return row === undefined ? null : toProductRecord(row);
  }

  async findActiveProductCategoryById(
    tenantId: string,
    categoryId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<ProductCategorySnapshot | null> {
    const result = await client.query<ProductCategoryRow>(
      `
        select id, name, status
        from product_categories
        where tenant_id = $1
          and id = $2
          and status = 'active'
        limit 1
      `,
      [tenantId, categoryId],
    );

    const row = result.rows[0];

    return row === undefined
      ? null
      : {
          id: row.id,
          name: row.name,
          status: row.status,
        };
  }

  async createProduct(
    input: CreateProductInput,
    client: DatabaseQueryClient,
  ): Promise<ProductRecord> {
    const result = await client.query<ProductRow>(
      `
        insert into products (
          id,
          tenant_id,
          category_id,
          name,
          normalized_name,
          sku,
          normalized_sku,
          barcode,
          normalized_barcode,
          supplier_code,
          brand,
          unit_of_measure,
          default_cost,
          selling_price,
          reorder_level,
          description,
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
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          'active',
          $17,
          $18,
          $17,
          $18
        )
        returning
          id,
          tenant_id,
          category_id,
          (select name from product_categories pc where pc.tenant_id = products.tenant_id and pc.id = products.category_id) as category_name,
          (select status from product_categories pc where pc.tenant_id = products.tenant_id and pc.id = products.category_id) as category_status,
          name,
          normalized_name,
          sku,
          normalized_sku,
          barcode,
          normalized_barcode,
          supplier_code,
          brand,
          unit_of_measure,
          default_cost,
          selling_price,
          reorder_level,
          description,
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
        input.categoryId,
        input.name,
        input.normalizedName,
        input.sku,
        input.normalizedSku,
        input.barcode,
        input.normalizedBarcode,
        input.supplierCode,
        input.brand,
        input.unitOfMeasure,
        input.defaultCost,
        input.sellingPrice,
        input.reorderLevel,
        input.description,
        input.createdAt,
        input.createdByUserId,
      ],
    );

    const row = result.rows[0];

    if (row === undefined) {
      throw new Error('Product create did not return a row.');
    }

    return toProductRecord(row);
  }

  async updateProduct(
    input: UpdateProductInput,
    client: DatabaseQueryClient,
  ): Promise<ProductRecord | null> {
    const result = await client.query<ProductRow>(
      `
        update products
        set
          category_id = $3,
          name = $4,
          normalized_name = $5,
          sku = $6,
          normalized_sku = $7,
          barcode = $8,
          normalized_barcode = $9,
          supplier_code = $10,
          brand = $11,
          unit_of_measure = $12,
          default_cost = $13,
          selling_price = $14,
          reorder_level = $15,
          description = $16,
          updated_at = $17,
          updated_by_user_id = $18,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = 'active'
          and lock_version = $19
        returning
          id,
          tenant_id,
          category_id,
          (select name from product_categories pc where pc.tenant_id = products.tenant_id and pc.id = products.category_id) as category_name,
          (select status from product_categories pc where pc.tenant_id = products.tenant_id and pc.id = products.category_id) as category_status,
          name,
          normalized_name,
          sku,
          normalized_sku,
          barcode,
          normalized_barcode,
          supplier_code,
          brand,
          unit_of_measure,
          default_cost,
          selling_price,
          reorder_level,
          description,
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
        input.productId,
        input.categoryId,
        input.name,
        input.normalizedName,
        input.sku,
        input.normalizedSku,
        input.barcode,
        input.normalizedBarcode,
        input.supplierCode,
        input.brand,
        input.unitOfMeasure,
        input.defaultCost,
        input.sellingPrice,
        input.reorderLevel,
        input.description,
        input.updatedAt,
        input.updatedByUserId,
        input.expectedLockVersion,
      ],
    );

    const row = result.rows[0];

    return row === undefined ? null : toProductRecord(row);
  }

  async changeProductStatus(
    input: ChangeProductStatusInput,
    client: DatabaseQueryClient,
  ): Promise<ProductRecord | null> {
    const result = await client.query<ProductRow>(
      `
        update products
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
          category_id,
          (select name from product_categories pc where pc.tenant_id = products.tenant_id and pc.id = products.category_id) as category_name,
          (select status from product_categories pc where pc.tenant_id = products.tenant_id and pc.id = products.category_id) as category_status,
          name,
          normalized_name,
          sku,
          normalized_sku,
          barcode,
          normalized_barcode,
          supplier_code,
          brand,
          unit_of_measure,
          default_cost,
          selling_price,
          reorder_level,
          description,
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
        input.productId,
        input.fromStatus,
        input.toStatus,
        input.expectedLockVersion,
        input.changedAt,
        input.changedByUserId,
      ],
    );

    const row = result.rows[0];

    return row === undefined ? null : toProductRecord(row);
  }

  async findProductDeactivationBlockers(
    tenantId: string,
    productId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly ProductDeactivationBlocker[]> {
    const blockers = new Set<ProductDeactivationBlocker>();

    if (await this.tableExists('stock_balances', client)) {
      const result = await client.query<BooleanRow>(
        `
          select exists (
            select 1
            from stock_balances
            where tenant_id = $1
              and product_id = $2
              and (on_hand_qty <> 0 or reserved_qty <> 0)
          ) as value
        `,
        [tenantId, productId],
      );

      if (result.rows[0]?.value === true) {
        blockers.add('non_zero_stock');
      }
    }

    if (await this.tableExists('inventory_reservations', client)) {
      const result = await client.query<BooleanRow>(
        `
          select exists (
            select 1
            from inventory_reservations
            where tenant_id = $1
              and product_id = $2
              and status = 'active'
          ) as value
        `,
        [tenantId, productId],
      );

      if (result.rows[0]?.value === true) {
        blockers.add('active_reservations');
      }
    }

    if (await this.tableExists('job_order_lines', client)) {
      const result = await client.query<BooleanRow>(
        `
          select exists (
            select 1
            from job_order_lines jol
            inner join job_orders jo
              on jo.tenant_id = jol.tenant_id
             and jo.id = jol.job_order_id
            where jol.tenant_id = $1
              and jol.product_id = $2
              and jol.line_type = 'part'
              and jol.status = 'active'
              and jo.status in ('pending', 'in_progress', 'waiting_for_parts')
          ) as value
        `,
        [tenantId, productId],
      );

      if (result.rows[0]?.value === true) {
        blockers.add('open_job_orders');
      }
    }

    if (
      (await this.tableExists('purchase_order_lines', client)) &&
      (await this.tableExists('purchase_orders', client))
    ) {
      const result = await client.query<BooleanRow>(
        `
          select exists (
            select 1
            from purchase_order_lines pol
            inner join purchase_orders po
              on po.tenant_id = pol.tenant_id
             and po.id = pol.purchase_order_id
            where pol.tenant_id = $1
              and pol.product_id = $2
              and po.status in ('draft', 'ordered', 'partially_received')
          ) as value
        `,
        [tenantId, productId],
      );

      if (result.rows[0]?.value === true) {
        blockers.add('open_purchase_orders');
      }
    }

    if (
      (await this.tableExists('inventory_transfer_lines', client)) &&
      (await this.tableExists('inventory_transfers', client))
    ) {
      const result = await client.query<BooleanRow>(
        `
          select exists (
            select 1
            from inventory_transfer_lines itl
            inner join inventory_transfers it
              on it.tenant_id = itl.tenant_id
             and it.id = itl.inventory_transfer_id
            where itl.tenant_id = $1
              and itl.product_id = $2
              and it.status in ('draft', 'pending', 'in_transit')
          ) as value
        `,
        [tenantId, productId],
      );

      if (result.rows[0]?.value === true) {
        blockers.add('open_inventory_transfers');
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

function toProductRecord(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    categoryId: row.category_id,
    category: {
      id: row.category_id,
      name: row.category_name,
      status: row.category_status,
    },
    name: row.name,
    normalizedName: row.normalized_name,
    sku: row.sku,
    normalizedSku: row.normalized_sku,
    barcode: row.barcode,
    normalizedBarcode: row.normalized_barcode,
    supplierCode: row.supplier_code,
    brand: row.brand,
    unitOfMeasure: row.unit_of_measure,
    defaultCost: row.default_cost,
    sellingPrice: row.selling_price,
    reorderLevel: row.reorder_level,
    description: row.description,
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
