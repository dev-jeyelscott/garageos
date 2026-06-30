export interface StockBalanceRow {
  readonly id: string;
  readonly branchId: string;
  readonly branchName: string;
  readonly productName: string;
  readonly sku: string;
  readonly categoryName: string;
  readonly onHandQuantity: number;
  readonly reservedQuantity: number;
  readonly availableQuantity: number;
  readonly reorderLevel: number;
  readonly unit: string;
  readonly lastMovementLabel: string;
}

export interface StockBalanceFilters {
  readonly branchId: string;
  readonly search: string;
  readonly stockState: 'all' | 'low_stock' | 'available' | 'reserved';
}

export interface StockBalanceSummary {
  readonly totalRows: number;
  readonly lowStockRows: number;
  readonly reservedRows: number;
  readonly availableQuantity: number;
}

export const stockBalanceRows: readonly StockBalanceRow[] = [
  {
    id: 'stock-bal-main-brake-pads',
    branchId: 'branch-main',
    branchName: 'Main Branch',
    productName: 'Front brake pads',
    sku: 'BRK-PAD-FRONT',
    categoryName: 'Brakes',
    onHandQuantity: 12,
    reservedQuantity: 3,
    availableQuantity: 9,
    reorderLevel: 6,
    unit: 'set',
    lastMovementLabel: 'Last movement: inventory receiving',
  },
  {
    id: 'stock-bal-main-engine-oil',
    branchId: 'branch-main',
    branchName: 'Main Branch',
    productName: '10W-40 engine oil',
    sku: 'OIL-10W40-1L',
    categoryName: 'Fluids',
    onHandQuantity: 8,
    reservedQuantity: 2,
    availableQuantity: 6,
    reorderLevel: 10,
    unit: 'bottle',
    lastMovementLabel: 'Last movement: service reservation',
  },
  {
    id: 'stock-bal-north-spark-plug',
    branchId: 'branch-north',
    branchName: 'North Branch',
    productName: 'Spark plug',
    sku: 'IGN-SPARK-STD',
    categoryName: 'Ignition',
    onHandQuantity: 24,
    reservedQuantity: 0,
    availableQuantity: 24,
    reorderLevel: 8,
    unit: 'piece',
    lastMovementLabel: 'Last movement: inventory adjustment post',
  },
];

export function filterStockBalanceRows(
  rows: readonly StockBalanceRow[],
  filters: StockBalanceFilters,
): readonly StockBalanceRow[] {
  const normalizedSearch = filters.search.trim().toLowerCase();

  return rows.filter((row) => {
    const matchesBranch = filters.branchId === 'all' || row.branchId === filters.branchId;
    const matchesSearch =
      normalizedSearch.length === 0 ||
      row.productName.toLowerCase().includes(normalizedSearch) ||
      row.sku.toLowerCase().includes(normalizedSearch) ||
      row.categoryName.toLowerCase().includes(normalizedSearch);
    const matchesStockState =
      filters.stockState === 'all' ||
      (filters.stockState === 'low_stock' && row.availableQuantity <= row.reorderLevel) ||
      (filters.stockState === 'available' && row.availableQuantity > 0) ||
      (filters.stockState === 'reserved' && row.reservedQuantity > 0);

    return matchesBranch && matchesSearch && matchesStockState;
  });
}

export function summarizeStockBalanceRows(rows: readonly StockBalanceRow[]): StockBalanceSummary {
  return rows.reduce<StockBalanceSummary>(
    (summary, row) => ({
      totalRows: summary.totalRows + 1,
      lowStockRows: summary.lowStockRows + (row.availableQuantity <= row.reorderLevel ? 1 : 0),
      reservedRows: summary.reservedRows + (row.reservedQuantity > 0 ? 1 : 0),
      availableQuantity: summary.availableQuantity + row.availableQuantity,
    }),
    {
      totalRows: 0,
      lowStockRows: 0,
      reservedRows: 0,
      availableQuantity: 0,
    },
  );
}
