import { Inject, Injectable } from '@nestjs/common';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { assertBranchAccessAllowed } from '../../../shared/authorization/branch-access';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type { ListStockBalancesQuery } from '../api/inventory-stock-balances.schemas';
import {
  StockBalanceStore,
  type GetStockAvailabilityInput,
  type StockAvailabilityRecord,
  type StockBalanceRecord,
} from './stock-balance.store';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_QUANTITY_PATTERN = /^-?\d+(\.\d{1,3})?$/;
const MAX_QUANTITY_UNITS = 999_999_999_999_999n;
const ZERO_QUANTITY = '0.000';

export interface StockBalanceBranchResponse {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'inactive';
}

export interface StockBalanceProductCategoryResponse {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'inactive';
}

export interface StockBalanceProductResponse {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly brand: string | null;
  readonly unit_of_measure: string;
  readonly status: 'active' | 'inactive';
  readonly category: StockBalanceProductCategoryResponse;
  readonly reorder_level: string;
}

export interface StockBalanceResponse {
  readonly branch: StockBalanceBranchResponse;
  readonly product: StockBalanceProductResponse;
  readonly on_hand_qty: string;
  readonly reserved_qty: string;
  readonly available_qty: string;
  readonly is_low_stock: boolean;
  readonly updated_at: string;
  readonly lock_version: number;
}

export interface StockBalanceListResponse {
  readonly stock_balances: readonly StockBalanceResponse[];
}

export interface StockAvailabilityQueryCommand {
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
}

export interface AssertSufficientAvailableStockCommand extends StockAvailabilityQueryCommand {
  readonly requestedQuantity: string;
}

export interface StockAvailabilitySnapshot {
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly product_id: string;
  readonly on_hand_qty: string;
  readonly reserved_qty: string;
  readonly available_qty: string;
  readonly lock_version: number | null;
}

@Injectable()
export class InventoryStockBalancesService {
  constructor(
    @Inject(StockBalanceStore)
    private readonly stockBalanceStore: StockBalanceStore,
  ) {}

  async listStockBalances(
    query: ListStockBalancesQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<StockBalanceListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.stockBalanceStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertInventoryPermission(context, isShopOwner, 'inventory.read');

    const branchIds = resolveBranchIdsForStockBalanceRead(context, query.branch_id ?? null);

    if (branchIds !== null && branchIds.length === 0) {
      return {
        stock_balances: [],
      };
    }

    const stockBalances = await this.stockBalanceStore.listStockBalances({
      tenantId: context.tenantId,
      branchIds,
      productId: query.product_id ?? null,
      categoryId: query.category_id ?? null,
      normalizedSearch: normalizeNullableText(query.q),
      lowStockOnly: query.low_stock,
      limit: query.limit,
    });

    return {
      stock_balances: stockBalances.map(toStockBalanceResponse),
    };
  }

  async getAvailableStock(
    command: StockAvailabilityQueryCommand,
    client?: DatabaseQueryClient,
  ): Promise<StockAvailabilitySnapshot | null> {
    const input = normalizeStockAvailabilityCommand(command);
    const stockAvailability = await this.stockBalanceStore.getStockAvailability(input, client);

    return stockAvailability === null ? null : toStockAvailabilitySnapshot(stockAvailability);
  }

  async lockAvailableStockForUpdate(
    command: StockAvailabilityQueryCommand,
    client?: DatabaseQueryClient,
  ): Promise<StockAvailabilitySnapshot | null> {
    const input = normalizeStockAvailabilityCommand(command);
    const stockAvailability = await this.stockBalanceStore.lockStockAvailabilityForUpdate(
      input,
      client,
    );

    return stockAvailability === null ? null : toStockAvailabilitySnapshot(stockAvailability);
  }

  async assertSufficientAvailableStock(
    command: AssertSufficientAvailableStockCommand,
    client?: DatabaseQueryClient,
  ): Promise<StockAvailabilitySnapshot> {
    const input = normalizeStockAvailabilityCommand(command);
    const requestedQuantity = normalizePositiveQuantity(command.requestedQuantity, 'requested_qty');

    const stockAvailability = await this.stockBalanceStore.lockStockAvailabilityForUpdate(
      input,
      client,
    );
    const snapshot =
      stockAvailability === null
        ? createZeroStockAvailabilitySnapshot(input)
        : toStockAvailabilitySnapshot(stockAvailability);

    if (compareQuantityStrings(snapshot.available_qty, requestedQuantity) < 0) {
      throw GarageOsApiException.inventoryInsufficientAvailableStock([
        {
          field: 'requested_qty',
          code: 'insufficient_available_stock',
          message: `Requested quantity ${requestedQuantity} exceeds available stock ${snapshot.available_qty}.`,
        },
      ]);
    }

    return snapshot;
  }
}

function resolveBranchIdsForStockBalanceRead(
  context: ResolvedTenantContext,
  requestedBranchId: string | null,
): readonly string[] | null {
  const normalizedRequestedBranchId = normalizeNullableText(requestedBranchId);

  if (normalizedRequestedBranchId !== null) {
    assertBranchAccessAllowed({
      context,
      branchId: normalizedRequestedBranchId,
    });

    return [normalizedRequestedBranchId];
  }

  if (context.tenantWideBranchAccess) {
    return null;
  }

  return [
    ...new Set(
      context.assignedBranchIds
        .map((branchId) => branchId.trim())
        .filter((branchId) => branchId.length > 0),
    ),
  ];
}

function normalizeStockAvailabilityCommand(
  command: StockAvailabilityQueryCommand,
): GetStockAvailabilityInput {
  return {
    tenantId: normalizeUuid(command.tenantId, 'tenant_id'),
    branchId: normalizeUuid(command.branchId, 'branch_id'),
    productId: normalizeUuid(command.productId, 'product_id'),
  };
}

function normalizeUuid(value: string, field: string): string {
  const normalizedValue = normalizeRequiredText(value, field);

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'invalid_uuid',
        message: `${field} must be a valid UUID.`,
      },
    ]);
  }

  return normalizedValue;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim().replace(/\s+/g, ' ');

  return normalizedValue.length > 0 ? normalizedValue.toLowerCase() : null;
}

function normalizePositiveQuantity(value: string, field: string): string {
  const units = parseQuantityUnits(value, field);

  if (units <= 0n) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'quantity_must_be_positive',
        message: 'Quantity must be greater than zero.',
      },
    ]);
  }

  if (units > MAX_QUANTITY_UNITS) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'quantity_too_large',
        message: 'Quantity is too large.',
      },
    ]);
  }

  return formatQuantityUnits(units);
}

export function calculateAvailableQuantity(onHandQty: string, reservedQty: string): string {
  return formatQuantityUnits(
    parseQuantityUnits(onHandQty, 'on_hand_qty') - parseQuantityUnits(reservedQty, 'reserved_qty'),
  );
}

function compareQuantityStrings(left: string, right: string): number {
  const leftUnits = parseQuantityUnits(left, 'left_quantity');
  const rightUnits = parseQuantityUnits(right, 'right_quantity');

  if (leftUnits === rightUnits) {
    return 0;
  }

  return leftUnits > rightUnits ? 1 : -1;
}

function parseQuantityUnits(value: string, field: string): bigint {
  const normalizedValue = normalizeRequiredText(value, field);

  if (!SIGNED_QUANTITY_PATTERN.test(normalizedValue)) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'invalid_quantity',
        message: 'Quantity must be a decimal with up to 3 decimals.',
      },
    ]);
  }

  const isNegative = normalizedValue.startsWith('-');
  const unsignedValue = isNegative ? normalizedValue.slice(1) : normalizedValue;
  const [wholePart = '0', decimalPart = ''] = unsignedValue.split('.');
  const normalizedWholePart = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const normalizedDecimalPart = decimalPart.padEnd(3, '0');

  const units = BigInt(normalizedWholePart) * 1000n + BigInt(normalizedDecimalPart);

  return isNegative ? -units : units;
}

function formatQuantityUnits(value: bigint): string {
  const isNegative = value < 0n;
  const absoluteValue = isNegative ? -value : value;
  const wholePart = absoluteValue / 1000n;
  const decimalPart = absoluteValue % 1000n;

  return `${isNegative ? '-' : ''}${wholePart.toString()}.${decimalPart.toString().padStart(3, '0')}`;
}

function normalizeRequiredText(value: string, field: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw GarageOsApiException.validationFailed([
      {
        field,
        code: 'required',
        message: `${field} is required.`,
      },
    ]);
  }

  return normalizedValue;
}

function assertInventoryPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

function toStockBalanceResponse(stockBalance: StockBalanceRecord): StockBalanceResponse {
  const availableQty = calculateAvailableQuantity(stockBalance.onHandQty, stockBalance.reservedQty);

  return {
    branch: {
      id: stockBalance.branchId,
      name: stockBalance.branchName,
      status: stockBalance.branchStatus,
    },
    product: {
      id: stockBalance.productId,
      name: stockBalance.productName,
      sku: stockBalance.sku,
      barcode: stockBalance.barcode,
      brand: stockBalance.brand,
      unit_of_measure: stockBalance.unitOfMeasure,
      status: stockBalance.productStatus,
      category: {
        id: stockBalance.categoryId,
        name: stockBalance.categoryName,
        status: stockBalance.categoryStatus,
      },
      reorder_level: stockBalance.reorderLevel,
    },
    on_hand_qty: stockBalance.onHandQty,
    reserved_qty: stockBalance.reservedQty,
    available_qty: availableQty,
    is_low_stock: stockBalance.isLowStock,
    updated_at: stockBalance.updatedAt.toISOString(),
    lock_version: stockBalance.lockVersion,
  };
}

function toStockAvailabilitySnapshot(
  stockAvailability: StockAvailabilityRecord,
): StockAvailabilitySnapshot {
  return {
    tenant_id: stockAvailability.tenantId,
    branch_id: stockAvailability.branchId,
    product_id: stockAvailability.productId,
    on_hand_qty: stockAvailability.onHandQty,
    reserved_qty: stockAvailability.reservedQty,
    available_qty: calculateAvailableQuantity(
      stockAvailability.onHandQty,
      stockAvailability.reservedQty,
    ),
    lock_version: stockAvailability.lockVersion,
  };
}

function createZeroStockAvailabilitySnapshot(
  input: GetStockAvailabilityInput,
): StockAvailabilitySnapshot {
  return {
    tenant_id: input.tenantId,
    branch_id: input.branchId,
    product_id: input.productId,
    on_hand_qty: ZERO_QUANTITY,
    reserved_qty: ZERO_QUANTITY,
    available_qty: ZERO_QUANTITY,
    lock_version: null,
  };
}
