import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  LowStockAlertStore,
  type ListLowStockAlertsInput,
  type LowStockAlertRecord,
  type LowStockAlertRefreshRecord,
  type RefreshLowStockAlertInput,
} from '../application/low-stock-alert.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface LowStockAlertRow extends DatabaseRow {
  readonly id: string;
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
  readonly available_qty: string;
  readonly reorder_level: string;
  readonly status: 'active' | 'resolved';
  readonly triggered_at: Date | string;
  readonly resolved_at: Date | string | null;
  readonly updated_at: Date | string;
}

interface LowStockAlertRefreshRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly product_id: string;
  readonly available_qty: string;
  readonly reorder_level: string;
  readonly status: 'active' | 'resolved';
  readonly triggered_at: Date | string;
  readonly resolved_at: Date | string | null;
  readonly updated_at: Date | string;
}

@Injectable()
export class PostgresLowStockAlertRepository extends LowStockAlertStore {
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

  async listActiveAlerts(
    input: ListLowStockAlertsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly LowStockAlertRecord[]> {
    const result = await client.query<LowStockAlertRow>(
      `
        select
          alert.id,
          alert.tenant_id,
          alert.branch_id,
          branch.name as branch_name,
          branch.status as branch_status,
          alert.product_id,
          product.name as product_name,
          product.sku,
          product.barcode,
          product.brand,
          product.unit_of_measure,
          product.status as product_status,
          product.category_id,
          category.name as category_name,
          category.status as category_status,
          (stock.on_hand_qty - stock.reserved_qty)::text as available_qty,
          product.reorder_level::text as reorder_level,
          alert.status,
          alert.triggered_at,
          alert.resolved_at,
          alert.updated_at
        from inventory_low_stock_alerts alert
        inner join stock_balances stock
          on stock.tenant_id = alert.tenant_id
         and stock.branch_id = alert.branch_id
         and stock.product_id = alert.product_id
        inner join branches branch
          on branch.tenant_id = alert.tenant_id
         and branch.id = alert.branch_id
        inner join products product
          on product.tenant_id = alert.tenant_id
         and product.id = alert.product_id
        inner join product_categories category
          on category.tenant_id = product.tenant_id
         and category.id = product.category_id
        where alert.tenant_id = $1
          and alert.status = 'active'
          and ($2::uuid[] is null or alert.branch_id = any($2::uuid[]))
          and ($3::uuid is null or alert.product_id = $3::uuid)
          and ($4::uuid is null or product.category_id = $4::uuid)
          and (
            $5::text is null
            or product.normalized_name like '%' || $5::text || '%'
            or product.normalized_sku like '%' || $5::text || '%'
            or product.normalized_barcode like '%' || $5::text || '%'
          )
        order by alert.triggered_at desc, branch.name asc, product.normalized_name asc, alert.id asc
        limit $6
      `,
      [
        input.tenantId,
        input.branchIds,
        input.productId,
        input.categoryId,
        input.normalizedSearch,
        input.limit,
      ],
    );

    return result.rows.map(toLowStockAlertRecord);
  }

  async refreshForStockBalance(
    input: RefreshLowStockAlertInput,
    client: DatabaseQueryClient,
  ): Promise<LowStockAlertRefreshRecord | null> {
    const result = await client.query<LowStockAlertRefreshRow>(
      `
        with stock as (
          select
            sb.tenant_id,
            sb.branch_id,
            sb.product_id,
            (sb.on_hand_qty - sb.reserved_qty) as available_qty,
            p.reorder_level
          from stock_balances sb
          inner join products p
            on p.tenant_id = sb.tenant_id
           and p.id = sb.product_id
          where sb.tenant_id = $2::uuid
            and sb.branch_id = $3::uuid
            and sb.product_id = $4::uuid
          limit 1
        ),
        upserted as (
          insert into inventory_low_stock_alerts (
            id,
            tenant_id,
            branch_id,
            product_id,
            status,
            available_qty,
            reorder_level,
            triggered_at,
            updated_at
          )
          select
            $1::uuid,
            stock.tenant_id,
            stock.branch_id,
            stock.product_id,
            'active',
            stock.available_qty,
            stock.reorder_level,
            $5::timestamptz,
            $5::timestamptz
          from stock
          where stock.available_qty <= stock.reorder_level
          on conflict (tenant_id, branch_id, product_id)
          where status = 'active'
          do update set
            available_qty = excluded.available_qty,
            reorder_level = excluded.reorder_level,
            updated_at = $5::timestamptz
          returning
            id,
            tenant_id,
            branch_id,
            product_id,
            available_qty::text,
            reorder_level::text,
            status,
            triggered_at,
            resolved_at,
            updated_at
        ),
        resolved as (
          update inventory_low_stock_alerts alert
          set
            status = 'resolved',
            available_qty = stock.available_qty,
            reorder_level = stock.reorder_level,
            resolved_at = $5::timestamptz,
            updated_at = $5::timestamptz
          from stock
          where alert.tenant_id = stock.tenant_id
            and alert.branch_id = stock.branch_id
            and alert.product_id = stock.product_id
            and alert.status = 'active'
            and stock.available_qty > stock.reorder_level
          returning
            alert.id,
            alert.tenant_id,
            alert.branch_id,
            alert.product_id,
            alert.available_qty::text,
            alert.reorder_level::text,
            alert.status,
            alert.triggered_at,
            alert.resolved_at,
            alert.updated_at
        )
        select *
        from upserted

        union all

        select *
        from resolved

        limit 1
      `,
      [input.id, input.tenantId, input.branchId, input.productId, input.evaluatedAt],
    );

    const row = result.rows[0];

    return row === undefined ? null : toLowStockAlertRefreshRecord(row);
  }
}

function toLowStockAlertRecord(row: LowStockAlertRow): LowStockAlertRecord {
  return {
    id: row.id,
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
    availableQty: row.available_qty,
    reorderLevel: row.reorder_level,
    status: row.status,
    triggeredAt: toDate(row.triggered_at),
    resolvedAt: row.resolved_at === null ? null : toDate(row.resolved_at),
    updatedAt: toDate(row.updated_at),
  };
}

function toLowStockAlertRefreshRecord(row: LowStockAlertRefreshRow): LowStockAlertRefreshRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    productId: row.product_id,
    availableQty: row.available_qty,
    reorderLevel: row.reorder_level,
    status: row.status,
    triggeredAt: toDate(row.triggered_at),
    resolvedAt: row.resolved_at === null ? null : toDate(row.resolved_at),
    updatedAt: toDate(row.updated_at),
  };
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
