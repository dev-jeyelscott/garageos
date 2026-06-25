import type { QueryResultRow } from 'pg';

export const API_DATABASE_CLIENT = Symbol('API_DATABASE_CLIENT');

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

export interface DatabaseConnection extends DatabaseQueryClient {
  release(): void;
}

export interface DatabaseConnectionProvider extends DatabaseQueryClient {
  connect(): Promise<DatabaseConnection>;
}
