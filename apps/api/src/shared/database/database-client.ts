export const API_DATABASE_CLIENT = Symbol('API_DATABASE_CLIENT');

export interface DatabaseQueryResult<Row> {
  readonly rows: readonly Row[];
  readonly rowCount: number | null;
}

export interface DatabaseQueryClient {
  query<Row>(text: string, values?: readonly unknown[]): Promise<DatabaseQueryResult<Row>>;
}
