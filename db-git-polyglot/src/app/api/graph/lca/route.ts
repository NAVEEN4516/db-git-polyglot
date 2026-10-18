import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { runCypher } from '@/lib/neo4j';

export const dynamic = 'force-dynamic';

/**
 * GET /api/graph/lca?repoId=...&branchA=...&branchB=...
 *
 * Runs three Neo4j read queries:
 *  a) Bounded DAG History for the React Flow graph canvas
 *  b) Safe 3-Way Merge Base (Lowest Common Ancestor) between two branches
 *  c) NoSQL Graph Aggregation (Root / Standard / Merge commit breakdown)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const repoId = searchParams.get('repoId');
    const branchA = searchParams.get('branchA');
    const branchB = searchParams.get('branchB');

    if (!repoId) {
      return NextResponse.json(
        { success: false, error: 'repoId query parameter is required.' },
        { status: 400 }
      );
    }

    // ── A. DAG History — Bounded commit lineage for Next.js graph ────
    const dagHistory = await runCypher(
      `MATCH (c:Commit {repo_id: $repo_id})
       OPTIONAL MATCH (c)-[:PARENT]->(p:Commit)
       OPTIONAL MATCH (t:Tag {repo_id: $repo_id})-[:TARGETS]->(c)
       RETURN c.hash AS hash, c.message AS message, c.ci_status AS ci_status, c.timestamp AS timestamp,
              collect(DISTINCT p.hash) AS parents, collect(DISTINCT t.name) AS tags
       ORDER BY c.timestamp DESC LIMIT 200`,
      { repo_id: repoId },
      'READ'
    );

    // ── B. Safe LCA Merge-Base (only if both branches are provided) ──
    let lcaResult: any = null;
    if (branchA && branchB) {
      // Look up HEAD commit hashes for each branch from PostgreSQL
      const branchARes = await query(
        `SELECT target_commit_hash FROM branches WHERE repo_id = $1 AND branch_name = $2;`,
        [repoId, branchA]
      );
      const branchBRes = await query(
        `SELECT target_commit_hash FROM branches WHERE repo_id = $1 AND branch_name = $2;`,
        [repoId, branchB]
      );

      const branchAHead = branchARes.rows[0]?.target_commit_hash;
      const branchBHead = branchBRes.rows[0]?.target_commit_hash;

      if (branchAHead && branchBHead) {
        const lcaRecords = await runCypher(
          `MATCH p1 = (b1:Commit {hash: $branch_a_head})-[:PARENT*0..100]->(lca:Commit),
                 p2 = (b2:Commit {hash: $branch_b_head})-[:PARENT*0..100]->(lca)
           WITH lca, (length(p1) + length(p2)) AS total_distance, length(p1) AS dist_a, length(p2) AS dist_b
           ORDER BY total_distance ASC
           RETURN lca.hash AS merge_base_hash, lca.message AS merge_base_message, dist_a, dist_b
           LIMIT 1`,
          { branch_a_head: branchAHead, branch_b_head: branchBHead },
          'READ'
        );

        lcaResult = lcaRecords.length > 0
          ? {
              ...lcaRecords[0],
              branch_a: branchA,
              branch_b: branchB,
              branch_a_head: branchAHead,
              branch_b_head: branchBHead,
            }
          : {
              merge_base_hash: null,
              message: 'No common ancestor found within 100 hops.',
              branch_a: branchA,
              branch_b: branchB,
              branch_a_head: branchAHead,
              branch_b_head: branchBHead,
            };
      } else {
        lcaResult = {
          merge_base_hash: null,
          message: `One or both branches have no commits yet. branchA head: ${branchAHead || 'null'}, branchB head: ${branchBHead || 'null'}`,
          branch_a: branchA,
          branch_b: branchB,
        };
      }
    }

    // ── C. NoSQL Graph Aggregation (commit type breakdown) ───────────
    const aggregation = await runCypher(
      `MATCH (c:Commit {repo_id: $repo_id})
       OPTIONAL MATCH (c)-[r:PARENT]->(p:Commit)
       WITH c, COUNT(r) AS parent_count
       RETURN CASE WHEN parent_count > 1 THEN 'Merge Commit'
                   WHEN parent_count = 1 THEN 'Standard Commit'
                   ELSE 'Root Commit' END AS commit_type,
              COUNT(c) AS total_commits
       ORDER BY total_commits DESC`,
      { repo_id: repoId },
      'READ'
    );

    return NextResponse.json({
      success: true,
      dag_history: dagHistory,
      lca: lcaResult,
      aggregation,
    });
  } catch (error: any) {
    console.error('Error in GET /api/graph/lca:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to query graph data.' },
      { status: 500 }
    );
  }
}
