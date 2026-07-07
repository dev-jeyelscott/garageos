import { FinancialReportStore } from './application/financial-report.store';
import { PostgresFinancialReportRepository } from './persistence/postgres-financial-report.repository';

export const REPORT_PROVIDERS = [
  {
    provide: FinancialReportStore,
    useClass: PostgresFinancialReportRepository,
  },
] as const;
