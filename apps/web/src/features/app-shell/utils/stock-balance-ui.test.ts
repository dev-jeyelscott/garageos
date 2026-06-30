import { describe, expect, it } from 'vitest';

import {
  filterStockBalanceRows,
  stockBalanceRows,
  summarizeStockBalanceRows,
} from './stock-balance-ui';

describe('stock balance UI helpers', () => {
  it('filters stock balances by branch and product search without changing source rows', () => {
    const filteredRows = filterStockBalanceRows(stockBalanceRows, {
      branchId: 'branch-main',
      search: 'oil',
      stockState: 'all',
    });

    expect(filteredRows).toHaveLength(1);
    expect(filteredRows[0]?.sku).toBe('OIL-10W40-1L');
    expect(stockBalanceRows).toHaveLength(3);
  });

  it('keeps low-stock and reserved states derived from read-only quantities', () => {
    expect(
      filterStockBalanceRows(stockBalanceRows, {
        branchId: 'all',
        search: '',
        stockState: 'low_stock',
      }).map((row) => row.sku),
    ).toEqual(['OIL-10W40-1L']);

    expect(
      filterStockBalanceRows(stockBalanceRows, {
        branchId: 'all',
        search: '',
        stockState: 'reserved',
      }).map((row) => row.sku),
    ).toEqual(['BRK-PAD-FRONT', 'OIL-10W40-1L']);
  });

  it('summarizes visible rows for read-oriented stock cards', () => {
    expect(summarizeStockBalanceRows(stockBalanceRows)).toEqual({
      totalRows: 3,
      lowStockRows: 1,
      reservedRows: 2,
      availableQuantity: 39,
    });
  });
});
