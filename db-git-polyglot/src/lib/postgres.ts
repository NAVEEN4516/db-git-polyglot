import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

const pool =
  globalThis._pgPool ||
  new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://postgres:dbgit_password@localhost:5432/dbgit',
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis._pgPool = pool;
}

/**
 * Executes a parameterized SQL query against the PostgreSQL pool.
 * @param text SQL query text
 * @param params Query parameters
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

/**
 * Checks out a client from the connection pool for explicit transaction management
 * (BEGIN / COMMIT / ROLLBACK). Remember to call client.release() when done.
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

export default pool;
