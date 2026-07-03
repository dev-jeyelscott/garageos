import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import type { InvoiceStatus } from './invoice.records';
import type {
  AccountsReceivableInvoiceRecord,
  AccountsReceivableSummaryRecord,
} from './accounts-receivable.records';

export interface ListAccountsReceivableInput {
  readonly tenantId: string;
  readonly branchIds: readonly string[] | null;
  readonly branchId: string | null;
  readonly customerId: string | null;
  readonly status: InvoiceStatus | null;
  readonly fromDate: Date | null;
  readonly toDate: Date | null;
  readonly asOfDate: Date | null;
  readonly limit: number;
}

export interface SummarizeAccountsReceivableInput {
  readonly tenantId: string;
  readonly branchIds: readonly string[] | null;
  readonly branchId: string | null;
  readonly customerId: string | null;
  readonly fromDate: Date | null;
  readonly toDate: Date | null;
  readonly asOfDate: Date | null;
}

export abstract class AccountsReceivableStore {
  abstract isActiveShopOwner(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<boolean>;

  abstract listAccountsReceivable(
    input: ListAccountsReceivableInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly AccountsReceivableInvoiceRecord[]>;

  abstract summarizeAccountsReceivable(
    input: SummarizeAccountsReceivableInput,
    client?: DatabaseQueryClient,
  ): Promise<readonly AccountsReceivableSummaryRecord[]>;
}
