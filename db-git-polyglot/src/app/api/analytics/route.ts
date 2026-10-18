import { NextRequest, NextResponse } from 'next/server';
import { query, getClient } from '@/lib/postgres';
import { generateTextEmbedding } from '@/lib/embeddings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics?repoId=...&branchName=...&searchQuery=...
 *
 * Executes 5 analytical SQL queries demonstrating advanced PostgreSQL features:
 *  a) Storage Efficiency View (v_repo_storage_efficiency)
 *  b) High-Churn Files (JOIN + GROUP BY + HAVING)
 *  c) Above-Average Contributors (Correlated EXISTS + Nested AVG Subquery)
 *  d) Recursive Commit Lineage with Window Delta CTE (WITH RECURSIVE + LAG())
 *  e) Hybrid Semantic Vector + Full-Text Search (pgvector <=> + to_tsvector)
 *  f) EXPLAIN (ANALYZE, BUFFERS) Execution Plans for Recursive CTE & HNSW Vector
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const repoId = searchParams.get('repoId');
    const branchName = searchParams.get('branchName') || 'main';
    const searchQuery = searchParams.get('searchQuery');

    if (!repoId) {
      return NextResponse.json(
        { success: false, error: 'repoId query parameter is required.' },
        { status: 400 }
      );
    }

    // ── A. Storage Efficiency View ───────────────────────────────────
    const storageRes = await query(
      `SELECT * FROM v_repo_storage_efficiency WHERE repo_id = $1;`,
      [repoId]
    );

    // ── B. High-Churn Files (JOIN + GROUP BY + HAVING) ───────────────
    const highChurnRes = await query(
      `SELECT tn.file_path, COUNT(DISTINCT c.commit_hash) AS modification_commits,
              COUNT(DISTINCT c.author_id) AS distinct_authors,
              pg_size_pretty(MAX(b.size_bytes)) AS max_file_size
       FROM tree_nodes tn
       JOIN commits c ON tn.tree_hash = c.tree_hash
       JOIN blobs b ON tn.blob_hash = b.blob_hash
       WHERE c.repo_id = $1
       GROUP BY tn.file_path
       HAVING COUNT(DISTINCT c.commit_hash) >= 2
       ORDER BY modification_commits DESC;`,
      [repoId]
    );

    // ── C. Above-Average Contributors (Correlated EXISTS + Nested AVG Subquery) ──
    const contributorsRes = await query(
      `SELECT u.username, u.email, rc.access_role, COUNT(c.commit_hash) AS user_commit_count
       FROM users u
       JOIN repo_collaborators rc ON u.user_id = rc.user_id
       JOIN commits c ON u.user_id = c.author_id AND rc.repo_id = c.repo_id
       WHERE rc.repo_id = $1
       AND EXISTS (
         SELECT 1 FROM tree_nodes tn JOIN blobs b ON tn.blob_hash = b.blob_hash
         WHERE tn.tree_hash = c.tree_hash AND b.size_bytes > 100
       )
       GROUP BY u.user_id, u.username, u.email, rc.access_role
       HAVING COUNT(c.commit_hash) >= (
         SELECT AVG(cnt) FROM (SELECT COUNT(*) AS cnt FROM commits WHERE repo_id = $1 GROUP BY author_id) sub
       )
       ORDER BY user_commit_count DESC;`,
      [repoId]
    );

    // ── D. Recursive Commit Lineage & Window Delta CTE ───────────────
    const recursiveRes = await query(
      `WITH RECURSIVE commit_ancestry_cte AS (
         SELECT c.commit_hash, c.parent_commit_hash, c.author_id, c.tree_hash, c.message,
                c.created_at, 0 AS depth
         FROM commits c JOIN branches br ON br.target_commit_hash = c.commit_hash
         WHERE br.repo_id = $1 AND br.branch_name = COALESCE($2, 'main')
         UNION ALL
         SELECT p.commit_hash, p.parent_commit_hash, p.author_id, p.tree_hash, p.message,
                p.created_at, child.depth + 1
         FROM commits p INNER JOIN commit_ancestry_cte child ON p.commit_hash = child.parent_commit_hash
         WHERE child.depth < 50
       ),
       tree_sizes AS (
         SELECT tn.tree_hash, COUNT(tn.file_path) AS files, COALESCE(SUM(b.size_bytes), 0) AS bytes
         FROM tree_nodes tn LEFT JOIN blobs b ON tn.blob_hash = b.blob_hash GROUP BY tn.tree_hash
       )
       SELECT ca.depth, ca.commit_hash, u.username AS author, ca.message, ts.files, ts.bytes,
              ts.bytes - LAG(ts.bytes, 1, 0) OVER (ORDER BY ca.created_at ASC) AS byte_delta
       FROM commit_ancestry_cte ca
       JOIN users u ON ca.author_id = u.user_id
       LEFT JOIN tree_sizes ts ON ca.tree_hash = ts.tree_hash
       ORDER BY ca.depth ASC;`,
      [repoId, branchName]
    );

    // ── E. Hybrid Semantic Vector + Full-Text Search ─────────────────
    let semanticRes: any = { rows: [] };
    const queryTerm = searchQuery && searchQuery.trim() ? searchQuery.trim() : 'initial setup commit';
    const qVec = generateTextEmbedding(queryTerm);

    semanticRes = await query(
      `SELECT commit_hash, message, created_at,
              ROUND((1 - (msg_embedding <=> $2::vector))::numeric, 4) AS cosine_similarity,
              (to_tsvector('english', message) @@ plainto_tsquery('english', $3)) AS fts_match
       FROM commits WHERE repo_id = $1 AND msg_embedding IS NOT NULL
       ORDER BY fts_match DESC, msg_embedding <=> $2::vector ASC LIMIT 10;`,
      [repoId, qVec, queryTerm]
    );

    // ── F. EXPLAIN (ANALYZE, BUFFERS) Query Plan Generation ──────────
    let explainRecursiveText = '';
    let explainHnswText = '';

    const explainClient = await getClient();
    try {
      await explainClient.query('BEGIN READ ONLY;');

      // 1. Recursive CTE query plan
      const expRec = await explainClient.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
         WITH RECURSIVE commit_ancestry_cte AS (
           SELECT c.commit_hash, c.parent_commit_hash, c.author_id, c.tree_hash, c.message,
                  c.created_at, 0 AS depth
           FROM commits c JOIN branches br ON br.target_commit_hash = c.commit_hash
           WHERE br.repo_id = $1 AND br.branch_name = COALESCE($2, 'main')
           UNION ALL
           SELECT p.commit_hash, p.parent_commit_hash, p.author_id, p.tree_hash, p.message,
                  p.created_at, child.depth + 1
           FROM commits p INNER JOIN commit_ancestry_cte child ON p.commit_hash = child.parent_commit_hash
           WHERE child.depth < 50
         )
         SELECT COUNT(*) FROM commit_ancestry_cte;`,
        [repoId, branchName]
      );
      explainRecursiveText = expRec.rows.map((r: any) => r['QUERY PLAN']).join('\n');

      // 2. HNSW Vector index scan query plan (disable seqscan locally to force HNSW index proof)
      await explainClient.query('SET LOCAL enable_seqscan = off;');
      const expHnsw = await explainClient.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
         SELECT commit_hash, message
         FROM commits
         WHERE repo_id = $1 AND msg_embedding IS NOT NULL
         ORDER BY msg_embedding <=> $2::vector ASC
         LIMIT 5;`,
        [repoId, qVec]
      );
      explainHnswText = expHnsw.rows.map((r: any) => r['QUERY PLAN']).join('\n');

      await explainClient.query('ROLLBACK;');
    } catch (e: any) {
      try { await explainClient.query('ROLLBACK;'); } catch {}
      console.warn('Explain generation note:', e.message);
    } finally {
      explainClient.release();
    }

    return NextResponse.json({
      success: true,
      analytics: {
        storage_efficiency: storageRes.rows[0] || null,
        high_churn_files: highChurnRes.rows,
        above_average_contributors: contributorsRes.rows,
        recursive_commit_lineage: recursiveRes.rows,
        semantic_search: searchQuery
          ? { query: searchQuery, results: semanticRes.rows }
          : { query: 'initial setup commit', results: semanticRes.rows },
        explain_plans: {
          recursive_cte: explainRecursiveText,
          hnsw_vector: explainHnswText,
        },
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/analytics:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to run analytics queries.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analytics
 * Live Read-Only SQL Playground:
 * Executes SELECT, WITH, or EXPLAIN queries inside a strict `BEGIN READ ONLY; ... ROLLBACK;` block.
 * Body: { sql: string }
 */
export async function POST(req: NextRequest) {
  const client = await getClient();
  const startTime = performance.now();
  try {
    const body = await req.json();
    const { sql } = body;
    if (!sql || typeof sql !== 'string') {
      return NextResponse.json(
        { success: false, error: 'SQL query string is required' },
        { status: 400 }
      );
    }

    const cleanSql = sql.trim();
    const firstWord = cleanSql.split(/\s+/)[0]?.toUpperCase();
    if (!['SELECT', 'WITH', 'EXPLAIN'].includes(firstWord)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Security Guard: Only read-only SELECT, WITH, or EXPLAIN queries are permitted in this playground.',
        },
        { status: 403 }
      );
    }

    // Safety regex: strictly block DML/DDL write statements
    const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|EXECUTE|CREATE)\b/i;
    if (forbidden.test(cleanSql)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Security Guard: Data modification statements are prohibited inside the read-only SQL playground.',
        },
        { status: 403 }
      );
    }

    await client.query('BEGIN READ ONLY;');
    const result = await client.query(cleanSql);
    await client.query('ROLLBACK;');

    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
    const columns = result.fields ? result.fields.map((f: any) => f.name) : [];

    return NextResponse.json({
      success: true,
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
      columns,
      durationMs,
    });
  } catch (err: any) {
    try {
      await client.query('ROLLBACK;');
    } catch {}
    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
    return NextResponse.json(
      {
        success: false,
        error: err.message,
        code: err.code,
        durationMs,
      },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}
