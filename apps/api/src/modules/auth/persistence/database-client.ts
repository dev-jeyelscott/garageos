import type { Provider } from '@nestjs/common';
import type { QueryResultRow } from 'pg';

import { API_DATABASE_CLIENT } from '../../../shared/database/database-client';

export const AUTH_DATABASE_CLIENT = Symbol('AUTH_DATABASE_CLIENT');

export type DatabaseRow = QueryResultRow;

export interface DatabaseQueryResult<Row extends DatabaseRow = DatabaseRow> {
  readonly rows: readonly Row[];
  readonly rowCount: number | null;
}

export interface DatabaseQueryClient {
  query<Row extends DatabaseRow = DatabaseRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<Row>>;
}

export const AUTH_DATABASE_CLIENT_PROVIDER: Provider = {
  provide: AUTH_DATABASE_CLIENT,
  useExisting: API_DATABASE_CLIENT,
};
