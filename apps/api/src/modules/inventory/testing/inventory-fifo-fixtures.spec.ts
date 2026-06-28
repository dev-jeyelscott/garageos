import { describe, expect, it } from 'vitest';

import {
  FIFO_FIXTURE_DATES,
  FIFO_FIXTURE_EXPECTED,
  FIFO_FIXTURE_IDS,
  createDeterministicActiveFifoReservationAllocations,
  createDeterministicFifoLayerAllocationCandidates,
  createDeterministicInventoryReadFifoLayerRecords,
  createDeterministicInventoryReadLedgerEntryRecord,
  createDeterministicInventoryReadStockBalanceRecord,
  createDeterministicInventoryReservationRecord,
  createDeterministicReservationLedgerEntryRecord,
  createDeterministicStockAvailabilityRecord,
} from './inventory-fifo-fixtures';

describe('deterministic FIFO fixtures', () => {
  it('provides FIFO layer candidates ordered by received date and cost', () => {
    const layers = createDeterministicFifoLayerAllocationCandidates();

    expect(layers.map((layer) => layer.id)).toEqual([
      FIFO_FIXTURE_IDS.FIFO_LAYER_OLDEST,
      FIFO_FIXTURE_IDS.FIFO_LAYER_MIDDLE,
      FIFO_FIXTURE_IDS.FIFO_LAYER_NEWEST,
    ]);
    expect(layers.map((layer) => layer.receivedAt)).toEqual([
      FIFO_FIXTURE_DATES.RECEIVED_OLDEST,
      FIFO_FIXTURE_DATES.RECEIVED_MIDDLE,
      FIFO_FIXTURE_DATES.RECEIVED_NEWEST,
    ]);
    expect(layers.map((layer) => layer.unitCost)).toEqual([
      FIFO_FIXTURE_EXPECTED.OLDEST_UNIT_COST,
      FIFO_FIXTURE_EXPECTED.MIDDLE_UNIT_COST,
      FIFO_FIXTURE_EXPECTED.NEWEST_UNIT_COST,
    ]);
  });

  it('models the canonical partial oldest-layer plus next-layer reservation', () => {
    const reservation = createDeterministicInventoryReservationRecord();
    const allocations = createDeterministicActiveFifoReservationAllocations();

    const allocatedQuantity = allocations.reduce(
      (total, allocation) => total + parseQuantityUnits(allocation.reservedQuantity),
      0n,
    );
    const totalCost = allocations.reduce(
      (total, allocation) =>
        total +
        (parseQuantityUnits(allocation.reservedQuantity) *
          parseMoneyCents(allocation.unitCostSnapshot)) /
          1000n,
      0n,
    );

    expect(formatQuantityUnits(allocatedQuantity)).toBe(reservation.reservedQuantity);
    expect(allocations.map((allocation) => allocation.fifoLayerId)).toEqual([
      FIFO_FIXTURE_IDS.FIFO_LAYER_OLDEST,
      FIFO_FIXTURE_IDS.FIFO_LAYER_MIDDLE,
    ]);
    expect(allocations.map((allocation) => allocation.reservedQuantity)).toEqual([
      FIFO_FIXTURE_EXPECTED.OLDEST_ALLOCATION_QTY,
      FIFO_FIXTURE_EXPECTED.MIDDLE_ALLOCATION_QTY,
    ]);
    expect(formatMoneyCents(totalCost)).toBe(FIFO_FIXTURE_EXPECTED.TOTAL_CONSUMPTION_COST);
  });

  it('keeps stock availability deterministic and internally consistent', () => {
    const availability = createDeterministicStockAvailabilityRecord();
    const readStock = createDeterministicInventoryReadStockBalanceRecord();

    expect(
      parseQuantityUnits(availability.onHandQty) - parseQuantityUnits(availability.reservedQty),
    ).toBe(parseQuantityUnits(availability.availableQty));
    expect(readStock.branch.id).toBe(availability.branchId);
    expect(readStock.product.id).toBe(availability.productId);
    expect(readStock.onHandQty).toBe(availability.onHandQty);
    expect(readStock.reservedQty).toBe(availability.reservedQty);
    expect(readStock.availableQty).toBe(availability.availableQty);
  });

  it('keeps read-model FIFO fixtures aligned to allocation-layer fixtures', () => {
    const allocationLayers = createDeterministicFifoLayerAllocationCandidates();
    const readLayers = createDeterministicInventoryReadFifoLayerRecords();

    expect(readLayers).toHaveLength(allocationLayers.length);
    expect(readLayers.map((layer) => layer.id)).toEqual(allocationLayers.map((layer) => layer.id));
    expect(readLayers.map((layer) => layer.allocatableQuantity)).toEqual(
      allocationLayers.map((layer) => layer.allocatableQuantity),
    );
    expect(readLayers.map((layer) => layer.unitCost)).toEqual(
      allocationLayers.map((layer) => layer.unitCost),
    );
  });

  it('provides matching reservation and consumption ledger fixtures', () => {
    const reservationLedger = createDeterministicReservationLedgerEntryRecord();
    const consumptionLedger = createDeterministicInventoryReadLedgerEntryRecord();

    expect(reservationLedger.quantityDeltaOnHand).toBe('0.000');
    expect(reservationLedger.quantityDeltaReserved).toBe(
      FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY,
    );
    expect(reservationLedger.totalCost).toBeNull();

    expect(consumptionLedger.quantityDeltaOnHand).toBe(
      `-${FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY}`,
    );
    expect(consumptionLedger.quantityDeltaReserved).toBe(
      `-${FIFO_FIXTURE_EXPECTED.REQUESTED_RESERVATION_QTY}`,
    );
    expect(consumptionLedger.totalCost).toBe(FIFO_FIXTURE_EXPECTED.TOTAL_CONSUMPTION_COST);
  });
});

function parseQuantityUnits(value: string): bigint {
  const [wholePart = '0', fractionalPart = ''] = value.split('.');

  return BigInt(wholePart) * 1000n + BigInt(fractionalPart.padEnd(3, '0'));
}

function formatQuantityUnits(value: bigint): string {
  const wholePart = value / 1000n;
  const fractionalPart = value % 1000n;

  return `${wholePart.toString()}.${fractionalPart.toString().padStart(3, '0')}`;
}

function parseMoneyCents(value: string): bigint {
  const [wholePart = '0', fractionalPart = ''] = value.split('.');

  return BigInt(wholePart) * 100n + BigInt(fractionalPart.padEnd(2, '0'));
}

function formatMoneyCents(value: bigint): string {
  const wholePart = value / 100n;
  const fractionalPart = value % 100n;

  return `${wholePart.toString()}.${fractionalPart.toString().padStart(2, '0')}`;
}
