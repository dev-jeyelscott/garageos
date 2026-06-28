import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  StockBalanceStore,
  type DecrementReservedQuantityInput,
  type GetStockAvailabilityInput,
  type IncrementReservedQuantityInput,
  type ListStockBalancesInput,
  type StockAvailabilityRecord,
  type StockBalanceRecord,
} from '../application/stock-balance.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface StockBalanceRow extends DatabaseRow {
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly branch_name: string;
  readonly branch_status: 'active' | 'inactive';
  readonly product_id: string;
  readonly product_name: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly brand: string | null;
  readonly unit_of_measure: string;
  readonly product_status: 'active' | 'inactive';
  readonly category_id: string;
  readonly category_name: string;
  readonly category_status: 'active' | 'inactive';
  readonly reorder_level: string;
  readonly on_hand_qty: string;
  readonly reserved_qty: string;
  readonly available_qty: string;
  readonly is_low_stock: boolean;
  readonly updated_at: Date | string;
  readonly lock_version: number;
}

interface StockAvailabilityRow extends DatabaseRow {
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly product_id: string;
  readonly on_hand_qty: string;
  readonly reserved_qty: string;
  readonly available_qty: string;
  readonly lock_version: number;
}

@Injectable()
export class PostgresStockBalanceRepository extends StockBalanceStore {
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

  async listStockBalances(
    input: ListStockBalancesInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly StockBalanceRecord[]> {
    const result = await client.query<StockBalanceRow>(
      `
        select
          sb.tenant_id,
          sb.branch_id,
          b.name as branch_name,
          b.status as branch_status,
          sb.product_id,
          p.name as product_name,
          p.sku,
          p.barcode,
          p.brand,
          p.unit_of_measure,
          p.status as product_status,
          p.category_id,
          pc.name as category_name,
          pc.status as category_status,
          p.reorder_level::text as reorder_level,
          sb.on_hand_qty::text as on_hand_qty,
          sb.reserved_qty::text as reserved_qty,
          (sb.on_hand_qty - sb.reserved_qty)::text as available_qty,
          ((sb.on_hand_qty - sb.reserved_qty) <= p.reorder_level) as is_low_stock,
          sb.updated_at,
          sb.lock_version
        from stock_balances sb
        inner join branches b
          on b.tenant_id = sb.tenant_id
         and b.id = sb.branch_id
        inner join products p
          on p.tenant_id = sb.tenant_id
         and p.id = sb.product_id
        inner join product_categories pc
          on pc.tenant_id = p.tenant_id
         and pc.id = p.category_id
        where sb.tenant_id = $1
          and ($2::uuid[] is null or sb.branch_id = any($2::uuid[]))
          and ($3::uuid is null or sb.product_id = $3::uuid)
          and ($4::uuid is null or p.category_id = $4::uuid)
          and (
            $5::text is null
            or p.normalized_name like '%' || $5::text || '%'
            or p.normalized_sku like '%' || $5::text || '%'
            or p.normalized_barcode like '%' || $5::text || '%'
          )
          and (
            $6::boolean = false
            or (sb.on_hand_qty - sb.reserved_qty) <= p.reorder_level
          )
        order by b.name asc, p.normalized_name asc, p.id asc
        limit $7
      `,
      [
        input.tenantId,
        input.branchIds,
        input.productId,
        input.categoryId,
        input.normalizedSearch,
        input.lowStockOnly,
        input.limit,
      ],
    );

    return result.rows.map(toStockBalanceRecord);
  }

  async getStockAvailability(
    input: GetStockAvailabilityInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<StockAvailabilityRecord | null> {
    return this.findStockAvailability(input, client, false);
  }

  async lockStockAvailabilityForUpdate(
    input: GetStockAvailabilityInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<StockAvailabilityRecord | null> {
    return this.findStockAvailability(input, client, true);
  }

  async incrementReservedQuantity(
    input: IncrementReservedQuantityInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<StockAvailabilityRecord | null> {
    const result = await client.query<StockAvailabilityRow>(
      `
        update stock_balances sb
        set
          reserved_qty = sb.reserved_qty + $4::numeric(14,3),
          updated_at = now(),
          lock_version = sb.lock_version + 1
        where sb.tenant_id = $1::uuid
          and sb.branch_id = $2::uuid
          and sb.product_id = $3::uuid
          and (sb.on_hand_qty - sb.reserved_qty) >= $4::numeric(14,3)
        returning
          sb.tenant_id,
          sb.branch_id,
          sb.product_id,
          sb.on_hand_qty::text as on_hand_qty,
          sb.reserved_qty::text as reserved_qty,
          (sb.on_hand_qty - sb.reserved_qty)::text as available_qty,
          sb.lock_version
      `,
      [input.tenantId, input.branchId, input.productId, input.reservedQuantityDelta],
    );

    const [row] = result.rows;

    return row === undefined ? null : toStockAvailabilityRecord(row);
  }

  async decrementReservedQuantity(
    input: DecrementReservedQuantityInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<StockAvailabilityRecord | null> {
    const result = await client.query<StockAvailabilityRow>(
      `
        update stock_balances sb
        set
          reserved_qty = sb.reserved_qty - $4::numeric(14,3),
          updated_at = now(),
          lock_version = sb.lock_version + 1
        where sb.tenant_id = $1::uuid
          and sb.branch_id = $2::uuid
          and sb.product_id = $3::uuid
          and sb.reserved_qty >= $4::numeric(14,3)
          and sb.on_hand_qty >= (sb.reserved_qty - $4::numeric(14,3))
        returning
          sb.tenant_id,
          sb.branch_id,
          sb.product_id,
          sb.on_hand_qty::text as on_hand_qty,
          sb.reserved_qty::text as reserved_qty,
          (sb.on_hand_qty - sb.reserved_qty)::text as available_qty,
          sb.lock_version
      `,
      [input.tenantId, input.branchId, input.productId, input.reservedQuantityDelta],
    );

    const [row] = result.rows;

    return row === undefined ? null : toStockAvailabilityRecord(row);
  }

  private async findStockAvailability(
    input: GetStockAvailabilityInput,
    client: DatabaseQueryClient,
    lockForUpdate: boolean,
  ): Promise<StockAvailabilityRecord | null> {
    const result = await client.query<StockAvailabilityRow>(
      `
        select
          sb.tenant_id,
          sb.branch_id,
          sb.product_id,
          sb.on_hand_qty::text as on_hand_qty,
          sb.reserved_qty::text as reserved_qty,
          (sb.on_hand_qty - sb.reserved_qty)::text as available_qty,
          sb.lock_version
        from stock_balances sb
        where sb.tenant_id = $1
          and sb.branch_id = $2
          and sb.product_id = $3
        limit 1
        ${lockForUpdate ? 'for update' : ''}
      `,
      [input.tenantId, input.branchId, input.productId],
    );

    const [row] = result.rows;

    return row === undefined ? null : toStockAvailabilityRecord(row);
  }
}

function toStockBalanceRecord(row: StockBalanceRow): StockBalanceRecord {
  return {
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    branchStatus: row.branch_status,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    barcode: row.barcode,
    brand: row.brand,
    unitOfMeasure: row.unit_of_measure,
    productStatus: row.product_status,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryStatus: row.category_status,
    reorderLevel: row.reorder_level,
    onHandQty: row.on_hand_qty,
    reservedQty: row.reserved_qty,
    availableQty: row.available_qty,
    isLowStock: row.is_low_stock,
    updatedAt: toDate(row.updated_at),
    lockVersion: row.lock_version,
  };
}

function toStockAvailabilityRecord(row: StockAvailabilityRow): StockAvailabilityRecord {
  return {
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    productId: row.product_id,
    onHandQty: row.on_hand_qty,
    reservedQty: row.reserved_qty,
    availableQty: row.available_qty,
    lockVersion: row.lock_version,
  };
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
