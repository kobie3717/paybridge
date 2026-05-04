export interface PgQueryResult<T = any> {
  rows: T[];
  rowCount: number | null;
}

export interface PgPoolLike {
  query<T = any>(sql: string, params?: unknown[]): Promise<PgQueryResult<T>>;
}
