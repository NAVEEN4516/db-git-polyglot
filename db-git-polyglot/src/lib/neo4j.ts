import neo4j, { Driver } from 'neo4j-driver';

declare global {
  // eslint-disable-next-line no-var
  var _neo4jDriver: Driver | undefined;
}

const driver: Driver =
  globalThis._neo4jDriver ||
  neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'dbgit_neo4j_pass'
    ),
    {
      disableLosslessIntegers: true,
    }
  );

if (process.env.NODE_ENV !== 'production') {
  globalThis._neo4jDriver = driver;
}

/**
 * Executes a Cypher query using a managed session.
 * Always closes the session in a finally block.
 * @param cypher Cypher query string
 * @param params Parameter record for the query
 * @param mode 'READ' | 'WRITE' (default: 'WRITE')
 * @returns Array of record objects
 */
export async function runCypher<T = Record<string, any>>(
  cypher: string,
  params: Record<string, any> = {},
  mode: 'READ' | 'WRITE' = 'WRITE'
): Promise<T[]> {
  const session = driver.session({
    defaultAccessMode: mode === 'READ' ? neo4j.session.READ : neo4j.session.WRITE,
  });

  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}

export default driver;
