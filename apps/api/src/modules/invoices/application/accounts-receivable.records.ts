import type { InvoiceStatus } from './invoice.records';

export const ACCOUNTS_RECEIVABLE_AGING_BUCKETS = {
  CURRENT: 'current',
  DAYS_1_30_OVERDUE: '1_30_days_overdue',
  DAYS_31_60_OVERDUE: '31_60_days_overdue',
  DAYS_61_90_OVERDUE: '61_90_days_overdue',
  OVER_90_DAYS_OVERDUE: 'over_90_days_overdue',
} as const;

export const ACCOUNTS_RECEIVABLE_AGING_BUCKET_VALUES = Object.values(
  ACCOUNTS_RECEIVABLE_AGING_BUCKETS,
);

export type AccountsReceivableAgingBucket =
  (typeof ACCOUNTS_RECEIVABLE_AGING_BUCKETS)[keyof typeof ACCOUNTS_RECEIVABLE_AGING_BUCKETS];

export interface AccountsReceivableInvoiceRecord {
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly branchId: string;
  readonly invoiceTotal: string;
  readonly amountPaid: string;
  readonly remainingCollectibleBalance: string;
  readonly dueDate: string | null;
  readonly status: InvoiceStatus;
  readonly agingBucket: AccountsReceivableAgingBucket;
}

export interface AccountsReceivableSummaryRecord {
  readonly agingBucket: AccountsReceivableAgingBucket;
  readonly invoiceCount: number;
  readonly remainingCollectibleBalance: string;
}
