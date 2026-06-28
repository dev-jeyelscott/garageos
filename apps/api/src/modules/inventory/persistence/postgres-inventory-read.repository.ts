import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  FIFO_LAYER_SOURCE_TRANSACTION_TYPE_VALUES,
  type FifoLayerSourceTransactionType,
} from '../application/fifo-layer.store';
import {
  InventoryReadStore,
  type InventoryReadFifoLayerRecord,
  type InventoryReadLedgerEntryRecord,
  type InventoryReadProductRecord,
  type InventoryReadStockBalanceRecord,
  type ListInventoryLedgerEntriesInput,
  type ListProductFifoLayersInput,
  type ListProductStockInput,
} from '../application/inventory-read.store';
import {
  INVENTORY_TRANSACTION_TYPE_VALUES,
  type InventoryTransactionType,
} from '../application/inventory-ledger.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface InventoryReadBaseRow extends DatabaseRow {
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
}

interface ProductStockRow extends InventoryReadBaseRow {
  readonly on_hand_qty: string;
  readonly reserved_qty: string;
  readonly available_qty: string;
  readonly is_low_stock: boolean;
  readonly updated_at: Date | string;
  readonly lock_version: number;
}

interface FifoLayerReadRow extends InventoryReadBaseRow {
  readonly id: string;
  readonly quantity_received: string;
  readonly remaining_quantity: string;
  readonly active_reserved_quantity: string;
  readonly allocatable_quantity: string;
  readonly unit_cost: string;
  readonly source_transaction_type: string;
  readonly source_transaction_id: string;
  readonly received_at: Date | string;
  readonly original_source_layer_id: string | null;
}

interface InventoryLedgerReadRow extends InventoryReadBaseRow {
  readonly id: string;
  readonly transaction_type: string;
  readonly quantity_delta_on_hand: string;
  readonly quantity_delta_reserved: string;
  readonly unit_cost: string | null;
  readonly total_cost: string | null;
  readonly source_type: string;
  readonly source_id: string;
  readonly occurred_at: Date | string;
  readonly created_by_user_id: string | null;
}

@Injectable()
export class PostgresInventoryReadRepository extends InventoryReadStore {
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

  async listProductStock(
    input: ListProductStockInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InventoryReadStockBalanceRecord[]> {
    const result = await client.query<ProductStockRow>(
      `
        select
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
        where sb.tenant_id = $1::uuid
          and ($2::uuid[] is null or sb.branch_id = any($2::uuid[]))
          and sb.product_id = $3::uuid
        order by b.name asc, sb.branch_id asc
        limit $4
      `,
      [input.tenantId, input.branchIds, input.productId, input.limit],
    );

    return result.rows.map(mapProductStockRow);
  }

  async listProductFifoLayers(
    input: ListProductFifoLayersInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InventoryReadFifoLayerRecord[]> {
    const result = await client.query<FifoLayerReadRow>(
      `
        with active_allocation_totals as (
          select
            allocation.fifo_layer_id,
            coalesce(sum(allocation.reserved_quantity), 0)::numeric(14,3) as active_reserved_quantity
          from fifo_reservation_allocations allocation
          where allocation.tenant_id = $1::uuid
            and allocation.status = 'active'
          group by allocation.fifo_layer_id
        )
        select
          fl.id,
          fl.branch_id,
          b.name as branch_name,
          b.status as branch_status,
          fl.product_id,
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
          fl.quantity_received::text as quantity_received,
          fl.remaining_quantity::text as remaining_quantity,
          coalesce(allocation.active_reserved_quantity, 0)::text as active_reserved_quantity,
          (
            fl.remaining_quantity - coalesce(allocation.active_reserved_quantity, 0)
          )::text as allocatable_quantity,
          fl.unit_cost::text as unit_cost,
          fl.source_transaction_type,
          fl.source_transaction_id,
          fl.received_at,
          fl.original_source_layer_id
        from fifo_layers fl
        inner join branches b
          on b.tenant_id = fl.tenant_id
         and b.id = fl.branch_id
        inner join products p
          on p.tenant_id = fl.tenant_id
         and p.id = fl.product_id
        inner join product_categories pc
          on pc.tenant_id = p.tenant_id
         and pc.id = p.category_id
        left join active_allocation_totals allocation
          on allocation.fifo_layer_id = fl.id
        where fl.tenant_id = $1::uuid
          and ($2::uuid[] is null or fl.branch_id = any($2::uuid[]))
          and fl.product_id = $3::uuid
          and ($4::boolean = false or fl.remaining_quantity > 0)
        order by fl.received_at asc, fl.id asc
        limit $5
      `,
      [input.tenantId, input.branchIds, input.productId, input.openOnly, input.limit],
    );

    return result.rows.map(mapFifoLayerReadRow);
  }

  async listInventoryLedgerEntries(
    input: ListInventoryLedgerEntriesInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InventoryReadLedgerEntryRecord[]> {
    const result = await client.query<InventoryLedgerReadRow>(
      `
        select
          ledger.id,
          ledger.branch_id,
          b.name as branch_name,
          b.status as branch_status,
          ledger.product_id,
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
          ledger.transaction_type,
          ledger.quantity_delta_on_hand::text as quantity_delta_on_hand,
          ledger.quantity_delta_reserved::text as quantity_delta_reserved,
          ledger.unit_cost::text as unit_cost,
          ledger.total_cost::text as total_cost,
          ledger.source_type,
          ledger.source_id,
          ledger.occurred_at,
          ledger.created_by_user_id
        from inventory_ledger_entries ledger
        inner join branches b
          on b.tenant_id = ledger.tenant_id
         and b.id = ledger.branch_id
        inner join products p
          on p.tenant_id = ledger.tenant_id
         and p.id = ledger.product_id
        inner join product_categories pc
          on pc.tenant_id = p.tenant_id
         and pc.id = p.category_id
        where ledger.tenant_id = $1::uuid
          and ($2::uuid[] is null or ledger.branch_id = any($2::uuid[]))
          and ($3::uuid is null or ledger.product_id = $3::uuid)
          and ($4::text is null or ledger.transaction_type = $4::text)
          and ($5::text is null or ledger.source_type = $5::text)
          and ($6::uuid is null or ledger.source_id = $6::uuid)
          and ($7::timestamptz is null or ledger.occurred_at >= $7::timestamptz)
          and ($8::timestamptz is null or ledger.occurred_at <= $8::timestamptz)
        order by ledger.occurred_at desc, ledger.id desc
        limit $9
      `,
      [
        input.tenantId,
        input.branchIds,
        input.productId,
        input.transactionType,
        input.sourceType,
        input.sourceId,
        input.fromOccurredAt,
        input.toOccurredAt,
        input.limit,
      ],
    );

    return result.rows.map(mapInventoryLedgerReadRow);
  }
}

function mapProductStockRow(row: ProductStockRow): InventoryReadStockBalanceRecord {
  return {
    branch: mapBranch(row),
    product: mapProduct(row),
    onHandQty: row.on_hand_qty,
    reservedQty: row.reserved_qty,
    availableQty: row.available_qty,
    isLowStock: row.is_low_stock,
    updatedAt: toDate(row.updated_at),
    lockVersion: row.lock_version,
  };
}

function mapFifoLayerReadRow(row: FifoLayerReadRow): InventoryReadFifoLayerRecord {
  return {
    id: row.id,
    branch: mapBranch(row),
    product: mapProduct(row),
    quantityReceived: row.quantity_received,
    remainingQuantity: row.remaining_quantity,
    activeReservedQuantity: row.active_reserved_quantity,
    allocatableQuantity: row.allocatable_quantity,
    unitCost: row.unit_cost,
    sourceTransactionType: mapFifoLayerSourceTransactionType(row.source_transaction_type),
    sourceTransactionId: row.source_transaction_id,
    receivedAt: toDate(row.received_at),
    originalSourceLayerId: row.original_source_layer_id,
  };
}

function mapInventoryLedgerReadRow(row: InventoryLedgerReadRow): InventoryReadLedgerEntryRecord {
  return {
    id: row.id,
    branch: mapBranch(row),
    product: mapProduct(row),
    transactionType: mapInventoryTransactionType(row.transaction_type),
    quantityDeltaOnHand: row.quantity_delta_on_hand,
    quantityDeltaReserved: row.quantity_delta_reserved,
    unitCost: row.unit_cost,
    totalCost: row.total_cost,
    sourceType: row.source_type,
    sourceId: row.source_id,
    occurredAt: toDate(row.occurred_at),
    createdByUserId: row.created_by_user_id,
  };
}

function mapBranch(row: InventoryReadBaseRow): InventoryReadStockBalanceRecord['branch'] {
  return {
    id: row.branch_id,
    name: row.branch_name,
    status: row.branch_status,
  };
}

function mapProduct(row: InventoryReadBaseRow): InventoryReadProductRecord {
  return {
    id: row.product_id,
    name: row.product_name,
    sku: row.sku,
    barcode: row.barcode,
    brand: row.brand,
    unitOfMeasure: row.unit_of_measure,
    status: row.product_status,
    category: {
      id: row.category_id,
      name: row.category_name,
      status: row.category_status,
    },
    reorderLevel: row.reorder_level,
  };
}

function mapInventoryTransactionType(transactionType: string): InventoryTransactionType {
  if ((INVENTORY_TRANSACTION_TYPE_VALUES as readonly string[]).includes(transactionType)) {
    return transactionType as InventoryTransactionType;
  }

  throw new Error(`Unknown inventory transaction type: ${transactionType}.`);
}

function mapFifoLayerSourceTransactionType(
  sourceTransactionType: string,
): FifoLayerSourceTransactionType {
  if (
    (FIFO_LAYER_SOURCE_TRANSACTION_TYPE_VALUES as readonly string[]).includes(sourceTransactionType)
  ) {
    return sourceTransactionType as FifoLayerSourceTransactionType;
  }

  throw new Error(`Unknown FIFO layer source transaction type: ${sourceTransactionType}.`);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
