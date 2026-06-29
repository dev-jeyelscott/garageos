import { Inject, Injectable } from '@nestjs/common';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import { InventoryAdjustmentStore } from './inventory-adjustment.store';

@Injectable()
export class InventoryAdjustmentValueImpactService {
  constructor(
    @Inject(InventoryAdjustmentStore)
    private readonly inventoryAdjustmentStore: InventoryAdjustmentStore,
  ) {}

  async calculateLineImpact(
    input: {
      readonly tenantId: string;
      readonly branchId: string;
      readonly productId: string;
      readonly quantityDifference: string;
      readonly unitCost: string | null;
      readonly productDefaultCost: string;
    },
    client?: DatabaseQueryClient,
  ): Promise<{ readonly valueImpact: string; readonly estimatedFifoCost: string | null }> {
    if (compareQuantity(input.quantityDifference, '0.000') > 0) {
      return {
        valueImpact: multiplyQuantityMoney(
          input.quantityDifference,
          input.unitCost ?? input.productDefaultCost,
        ),
        estimatedFifoCost: null,
      };
    }

    const estimatedFifoCost = await this.estimateFifoCost(
      input.tenantId,
      input.branchId,
      input.productId,
      absQuantity(input.quantityDifference),
      client,
    );

    return {
      valueImpact: `-${estimatedFifoCost}`,
      estimatedFifoCost,
    };
  }

  async estimateFifoCost(
    tenantId: string,
    branchId: string,
    productId: string,
    quantity: string,
    client?: DatabaseQueryClient,
  ): Promise<string> {
    let remaining = quantityToUnits(quantity);
    let totalCents = 0n;
    const layers = await this.inventoryAdjustmentStore.listFifoCostLayers(
      {
        tenantId,
        branchId,
        productId,
      },
      client,
    );

    for (const layer of layers) {
      if (remaining <= 0n) {
        break;
      }

      const allocatable = quantityToUnits(layer.allocatableQuantity);
      const consumed = allocatable < remaining ? allocatable : remaining;
      totalCents += (consumed * moneyToCents(layer.unitCost)) / 1000n;
      remaining -= consumed;
    }

    if (remaining > 0n) {
      throw GarageOsApiException.inventoryInsufficientAvailableStock([
        {
          field: 'lines.product_id',
          code: 'insufficient_fifo_layers',
          message: 'Available FIFO layers cannot cover the requested negative adjustment.',
        },
      ]);
    }

    return formatCents(totalCents);
  }
}

export function addMoney(left: string, right: string): string {
  return formatSignedCents(moneyToSignedCents(left) + moneyToSignedCents(right));
}

export function compareQuantity(left: string, right: string): number {
  const leftUnits = quantityToUnits(left);
  const rightUnits = quantityToUnits(right);

  return leftUnits === rightUnits ? 0 : leftUnits > rightUnits ? 1 : -1;
}

export function subtractQuantity(left: string, right: string): string {
  return formatQuantityUnits(quantityToUnits(left) - quantityToUnits(right));
}

export function absQuantity(value: string): string {
  return formatQuantityUnits(
    quantityToUnits(value) < 0n ? -quantityToUnits(value) : quantityToUnits(value),
  );
}

function multiplyQuantityMoney(quantity: string, money: string): string {
  const quantityUnits = quantityToUnits(quantity);
  const cents = moneyToCents(money);

  return formatSignedCents((quantityUnits * cents) / 1000n);
}

function quantityToUnits(value: string): bigint {
  const isNegative = value.startsWith('-');
  const unsigned = isNegative ? value.slice(1) : value;
  const [wholePart = '0', decimalPart = ''] = unsigned.split('.');
  const units = BigInt(wholePart) * 1000n + BigInt(decimalPart.padEnd(3, '0'));

  return isNegative ? -units : units;
}

function moneyToCents(value: string): bigint {
  return moneyToSignedCents(value);
}

function moneyToSignedCents(value: string): bigint {
  const isNegative = value.startsWith('-');
  const unsigned = isNegative ? value.slice(1) : value;
  const [wholePart = '0', decimalPart = ''] = unsigned.split('.');
  const cents = BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, '0'));

  return isNegative ? -cents : cents;
}

function formatCents(value: bigint): string {
  const dollars = value / 100n;
  const cents = value % 100n;

  return `${dollars.toString()}.${cents.toString().padStart(2, '0')}`;
}

function formatSignedCents(value: bigint): string {
  return value < 0n ? `-${formatCents(-value)}` : formatCents(value);
}

function formatQuantityUnits(value: bigint): string {
  const isNegative = value < 0n;
  const absoluteValue = isNegative ? -value : value;
  const wholePart = absoluteValue / 1000n;
  const decimalPart = absoluteValue % 1000n;

  return `${isNegative ? '-' : ''}${wholePart.toString()}.${decimalPart.toString().padStart(3, '0')}`;
}
