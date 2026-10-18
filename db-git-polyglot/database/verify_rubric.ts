import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import './init_db';

const REPO_NAME = 'pesu-db-git-core';
const VIEWER_USERNAME = 'priya_viewer';

type QueryFn = (text: string, params?: any[]) => Promise<{ rows: any[] }>;
type CypherFn = (cypher: string, params?: Record<string, any>) => Promise<any[]>;

interface TestCase {
  id: string;
  name: string;
  detail: string;
}

async function loadHandles() {
  const libPath = fs.existsSync(path.resolve(__dirname, '../src/lib'))
    ? path.resolve(__dirname, '../src/lib')
    : path.resolve(__dirname, '../db-git-polyglot/src/lib');
  const pgModule = await import(pathToFileURL(path.join(libPath, 'postgres.ts')).href);
  const neoModule = await import(pathToFileURL(path.join(libPath, 'neo4j.ts')).href);
  const embeddings = await import(pathToFileURL(path.join(libPath, 'embeddings.ts')).href);
  return {
    query: pgModule.query as QueryFn,
    pool: pgModule.default,
    runCypher: neoModule.runCypher as CypherFn,
    driver: neoModule.default,
    generateTextEmbedding: embeddings.generateTextEmbedding as (text: string) => string,
  };
}

async function run(): Promise<void> {
  const { query, pool, runCypher, driver, generateTextEmbedding } = await loadHandles();

  const results: Array<TestCase & { passed: boolean }> = [];

  const repoRes = await query(`SELECT repo_id FROM repositories WHERE repo_name = $1 LIMIT 1;`, [REPO_NAME]);
  if (repoRes.rows.length === 0) {
    throw new Error(`Repository '${REPO_NAME}' not found. Run: npx tsx database/seed.ts`);
  }
  const repoId: string = repoRes.rows[0].repo_id;

  console.log('\n================================================================');
  console.log('DB-Git Phase 6 — Automated Rubric Test Runner');
  console.log(`Repository: ${REPO_NAME} (${repoId})`);
  console.log('================================================================\n');

  results.push(await tc01(query, repoId));
  results.push(await tc02(query));
  results.push(await tc03(query));
  results.push(await tc04(query, repoId));
  results.push(await tc05(query, runCypher, repoId));
  results.push(await tc06(query, repoId, generateTextEmbedding));

  console.log('┌────────┬──────────────────────────────────────────┬────────┐');
  console.log('│ ID     │ Test Case                                │ Result │');
  console.log('├────────┼──────────────────────────────────────────┼────────┤');
  for (const r of results) {
    const id = r.id.padEnd(6);
    const name = r.name.padEnd(40);
    const mark = r.passed ? '[PASS]' : '[FAIL]';
    console.log(`│ ${id} │ ${name} │ ${mark} │`);
  }
  console.log('└────────┴──────────────────────────────────────────┴────────┘\n');

  for (const r of results) {
    console.log(`${r.passed ? '✓' : '✗'} ${r.id} ${r.name}: ${r.detail}`);
  }

  const failed = results.filter((r) => !r.passed);
  console.log('\n================================================================');
  console.log(failed.length === 0 ? '✓ All 6 rubric test cases PASSED' : `✗ ${failed.length} test case(s) FAILED`);
  console.log('================================================================\n');

  await pool.end();
  await driver.close();
  process.exit(failed.length === 0 ? 0 : 1);
}

async function tc01(query: QueryFn, repoId: string): Promise<TestCase & { passed: boolean }> {
  const res = await query(
    `SELECT deduplication_savings_pct FROM v_repo_storage_efficiency WHERE repo_id = $1;`,
    [repoId]
  );
  const pct = Number(res.rows[0]?.deduplication_savings_pct ?? 0);
  const passed = pct > 50;
  return {
    id: 'TC-01',
    name: 'CAS Deduplication',
    passed,
    detail: `v_repo_storage_efficiency.deduplication_savings_pct = ${pct} (assert > 50)`,
  };
}

async function tc02(query: QueryFn): Promise<TestCase & { passed: boolean }> {
  try {
    await query('DELETE FROM commits;');
    return {
      id: 'TC-02',
      name: 'Immutability Trigger',
      passed: false,
      detail: 'DELETE FROM commits succeeded — trg_immutable_commits is NOT active',
    };
  } catch (err: any) {
    const msg = String(err.message || '');
    const passed = msg.includes('Cryptographic Integrity Violation');
    return {
      id: 'TC-02',
      name: 'Immutability Trigger',
      passed,
      detail: passed
        ? `PostgreSQL raised Cryptographic Integrity Violation`
        : `Unexpected error: ${msg}`,
    };
  }
}

async function tc03(query: QueryFn): Promise<TestCase & { passed: boolean }> {
  try {
    await query(`INSERT INTO blobs (blob_hash, content, size_bytes) VALUES ('invalid_hash', $1, 4);`, [
      Buffer.from('test'),
    ]);
    return {
      id: 'TC-03',
      name: 'CHECK Validation',
      passed: false,
      detail: "INSERT with blob_hash 'invalid_hash' succeeded — CHECK constraint missing",
    };
  } catch (err: any) {
    const passed = err.code === '23514';
    return {
      id: 'TC-03',
      name: 'CHECK Validation',
      passed,
      detail: passed
        ? `SQLSTATE 23514 (check_violation) on invalid blob_hash`
        : `Expected SQLSTATE 23514, got ${err.code || err.message}`,
    };
  }
}

async function tc04(query: QueryFn, repoId: string): Promise<TestCase & { passed: boolean }> {
  const viewer = await query(`SELECT user_id FROM users WHERE username = $1;`, [VIEWER_USERNAME]);
  const dummyHash = 'a'.repeat(64);
  const tree = await query(`SELECT tree_hash FROM trees WHERE repo_id = $1 LIMIT 1;`, [repoId]);
  const parent = await query(`SELECT commit_hash FROM commits WHERE repo_id = $1 LIMIT 1;`, [repoId]);

  try {
    await query(`SELECT fn_create_atomic_commit($1, $2, $3, $4, $5, $6, $7, NULL::vector);`, [
      dummyHash,
      repoId,
      viewer.rows[0].user_id,
      parent.rows[0]?.commit_hash ?? null,
      'main',
      tree.rows[0]?.tree_hash,
      'viewer should not be allowed to commit',
    ]);
    return {
      id: 'TC-04',
      name: 'RBAC Guard',
      passed: false,
      detail: 'fn_create_atomic_commit succeeded for priya_viewer (VIEWER)',
    };
  } catch (err: any) {
    const msg = String(err.message || '');
    const passed = msg.includes('RBAC Authorization Denied');
    return {
      id: 'TC-04',
      name: 'RBAC Guard',
      passed,
      detail: passed
        ? 'fn_create_atomic_commit denied priya_viewer (VIEWER)'
        : `Unexpected error: ${msg}`,
    };
  }
}

async function tc05(
  query: QueryFn,
  runCypher: CypherFn,
  repoId: string
): Promise<TestCase & { passed: boolean }> {
  const heads = await query(
    `SELECT branch_name, target_commit_hash FROM branches WHERE repo_id = $1 AND branch_name IN ('main', 'feat-graph-lca');`,
    [repoId]
  );
  const mainHead = heads.rows.find((r) => r.branch_name === 'main')?.target_commit_hash;
  const featHead = heads.rows.find((r) => r.branch_name === 'feat-graph-lca')?.target_commit_hash;

  const lca = await runCypher(
    `MATCH p1 = (b1:Commit {hash: $branch_a_head})-[:PARENT*0..100]->(lca:Commit),
           p2 = (b2:Commit {hash: $branch_b_head})-[:PARENT*0..100]->(lca)
     WITH lca, (length(p1) + length(p2)) AS total_distance, length(p1) AS dist_a, length(p2) AS dist_b
     ORDER BY total_distance ASC
     RETURN lca.hash AS merge_base_hash, lca.message AS merge_base_message, dist_a, dist_b
     LIMIT 1`,
    { branch_a_head: mainHead, branch_b_head: featHead }
  );

  const updated = await runCypher(
    `MATCH (c:Commit {hash: $commit_hash, repo_id: $repo_id})
     SET c.ci_status = $new_ci_status, c.verified_at = timestamp()
     RETURN c.hash AS hash, c.ci_status AS ci_status`,
    { commit_hash: mainHead, repo_id: repoId, new_ci_status: 'PASSED' }
  );

  const passed = Boolean(lca[0]?.merge_base_hash) && updated[0]?.ci_status === 'PASSED';
  return {
    id: 'TC-05',
    name: 'Neo4j LCA & RUD',
    passed,
    detail: passed
      ? `LCA=${String(lca[0].merge_base_hash).slice(0, 12)}… SET ci_status=PASSED on main HEAD`
      : `LCA rows=${lca.length}, CI update=${JSON.stringify(updated[0] || null)}`,
  };
}

async function tc06(
  query: QueryFn,
  repoId: string,
  generateTextEmbedding: (text: string) => string
): Promise<TestCase & { passed: boolean }> {
  const ancestry = await query(
    `WITH RECURSIVE commit_ancestry_cte AS (
       SELECT c.commit_hash, c.parent_commit_hash, c.author_id, c.tree_hash, c.message,
              c.created_at, 0 AS depth
       FROM commits c JOIN branches br ON br.target_commit_hash = c.commit_hash
       WHERE br.repo_id = $1 AND br.branch_name = 'main'
       UNION ALL
       SELECT p.commit_hash, p.parent_commit_hash, p.author_id, p.tree_hash, p.message,
              p.created_at, child.depth + 1
       FROM commits p INNER JOIN commit_ancestry_cte child ON p.commit_hash = child.parent_commit_hash
       WHERE child.depth < 50
     )
     SELECT COUNT(*)::int AS hops FROM commit_ancestry_cte;`,
    [repoId]
  );

  const embedding = generateTextEmbedding('PostgreSQL ACID staging index and triggers');
  const vectorHits = await query(
    `SELECT commit_hash, message,
            ROUND((1 - (msg_embedding <=> $2::vector))::numeric, 4) AS cosine_similarity
     FROM commits
     WHERE repo_id = $1 AND msg_embedding IS NOT NULL
     ORDER BY msg_embedding <=> $2::vector ASC
     LIMIT 10;`,
    [repoId, embedding]
  );

  const hops = ancestry.rows[0]?.hops ?? 0;
  const passed = hops >= 2 && vectorHits.rows.length > 0 && vectorHits.rows[0].cosine_similarity !== null;
  return {
    id: 'TC-06',
    name: 'Recursive CTE & Vector Search',
    passed,
    detail: passed
      ? `commit_ancestry_cte hops=${hops}; top cosine similarity=${vectorHits.rows[0].cosine_similarity}`
      : `hops=${hops}, vector rows=${vectorHits.rows.length}`,
  };
}

run().catch(async (err) => {
  console.error('\n❌ Rubric verification failed:', err);
  process.exit(1);
});
