import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query, getClient } from '@/lib/postgres';
import { runCypher } from '@/lib/neo4j';
import { generateTextEmbedding } from '@/lib/embeddings';

export const dynamic = 'force-dynamic';

/**
 * POST /api/commits — Two-Phase Polyglot Commit Coordinator
 *
 * Atomically commits staged files across PostgreSQL and Neo4j:
 *  Phase 1 (PostgreSQL): BEGIN → insert trees/tree_nodes → fn_create_atomic_commit()
 *  Phase 2 (Neo4j):      MERGE (:Commit) + [:PARENT] edges
 *  Rollback:              If Neo4j fails, PostgreSQL ROLLBACK ensures split-brain prevention
 */
export async function POST(req: NextRequest) {
  const client = await getClient();
  let pgBegan = false;

  try {
    const body = await req.json();
    const {
      repo_id,
      author_id,
      branch_name = 'main',
      message,
      second_parent_hash,
      simulate_neo4j_failure = false,
    } = body;

    // ── Input Validation ─────────────────────────────────────────────
    if (!repo_id || !author_id || !message || !message.trim()) {
      return NextResponse.json(
        { success: false, error: 'repo_id, author_id, and a non-empty message are required.' },
        { status: 400 }
      );
    }

    // ── 1. Fetch staged rows ─────────────────────────────────────────
    const stagedRes = await query(
      `SELECT s.file_path, s.blob_hash, s.file_mode
       FROM staging_index s
       WHERE s.repo_id = $1 AND s.user_id = $2
       ORDER BY s.file_path ASC;`,
      [repo_id, author_id]
    );

    if (stagedRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nothing to commit: staging index is empty for this user.' },
        { status: 400 }
      );
    }

    // ── 2. Look up current branch HEAD and merge with existing tree ──
    const branchRes = await query(
      `SELECT b.target_commit_hash
       FROM branches b
       WHERE b.repo_id = $1 AND b.branch_name = $2;`,
      [repo_id, branch_name]
    );

    if (branchRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: `Branch '${branch_name}' not found in this repository.` },
        { status: 404 }
      );
    }

    const firstParentHash: string | null = branchRes.rows[0].target_commit_hash;

    // Build complete snapshot: existing committed files + staged overwrites
    const snapshotMap = new Map<string, { blob_hash: string; file_mode: string }>();

    if (firstParentHash) {
      // Fetch parent commit's tree_nodes for the full snapshot base
      const parentTreeRes = await query(
        `SELECT tn.file_path, tn.blob_hash, tn.file_mode
         FROM commits c
         JOIN tree_nodes tn ON c.tree_hash = tn.tree_hash
         WHERE c.commit_hash = $1;`,
        [firstParentHash]
      );
      for (const row of parentTreeRes.rows) {
        snapshotMap.set(row.file_path, {
          blob_hash: row.blob_hash,
          file_mode: row.file_mode,
        });
      }
    }

    // Overlay staged files (overwrites matching file_paths in the snapshot)
    for (const staged of stagedRes.rows) {
      snapshotMap.set(staged.file_path, {
        blob_hash: staged.blob_hash,
        file_mode: staged.file_mode,
      });
    }

    // ── 3. Compute Merkle tree_hash ──────────────────────────────────
    const sortedEntries = Array.from(snapshotMap.entries())
      .sort(([a], [b]) => a.localeCompare(b));

    const treeHashInput = sortedEntries
      .map(([filePath, { blob_hash, file_mode }]) => `${filePath}:${blob_hash}:${file_mode}`)
      .join('\n');

    const treeHash = crypto.createHash('sha256').update(treeHashInput).digest('hex');

    // ── 4. Build parent_hashes array ─────────────────────────────────
    const parentHashes: string[] = [];
    if (firstParentHash) parentHashes.push(firstParentHash);
    if (second_parent_hash) parentHashes.push(second_parent_hash);

    // ── 5. Compute commit_hash ───────────────────────────────────────
    const commitHashInput = [
      repo_id,
      author_id,
      treeHash,
      parentHashes.join(','),
      Date.now().toString(),
      message,
    ].join('|');

    const commitHash = crypto.createHash('sha256').update(commitHashInput).digest('hex');

    // ── 6. Compute 384-d embedding ───────────────────────────────────
    const embedding = generateTextEmbedding(message);

    // ── 7. PostgreSQL Phase — BEGIN transaction ──────────────────────
    await client.query('BEGIN');
    pgBegan = true;

    // 7a. Insert tree (idempotent via ON CONFLICT)
    await client.query(
      `INSERT INTO trees (tree_hash, repo_id)
       VALUES ($1, $2)
       ON CONFLICT (tree_hash) DO NOTHING;`,
      [treeHash, repo_id]
    );

    // 7b. Insert all snapshot entries into tree_nodes
    for (const [filePath, { blob_hash, file_mode }] of sortedEntries) {
      const pathParts = filePath.split('/');
      const parentDirPath = pathParts.length > 1
        ? pathParts.slice(0, -1).join('/')
        : null;
      const isDirectory = file_mode === '040000';

      await client.query(
        `INSERT INTO tree_nodes (tree_hash, file_path, parent_dir_path, is_directory, blob_hash, file_mode)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tree_hash, file_path) DO NOTHING;`,
        [treeHash, filePath, parentDirPath, isDirectory, blob_hash, file_mode]
      );
    }

    // 7c. Call the stored function (RBAC check + commit insert + branch advance + staging clear)
    await client.query(
      `SELECT fn_create_atomic_commit($1, $2, $3, $4, $5, $6, $7, $8::vector);`,
      [
        commitHash,
        repo_id,
        author_id,
        firstParentHash,
        branch_name,
        treeHash,
        message,
        embedding,
      ]
    );

    // ── 8. Neo4j Phase — Write commit node + PARENT edges ────────────
    // 8d. Simulate failure if requested (for viva demonstration)
    if (simulate_neo4j_failure) {
      throw new Error(
        'Simulated Neo4j network failure — triggering PostgreSQL ROLLBACK'
      );
    }

    // Build the Cypher for MERGE commit + PARENT edges
    // If there are no parents (root commit), just MERGE the commit node alone
    if (parentHashes.length > 0) {
      await runCypher(
        `MERGE (c:Commit {hash: $commit_hash})
         ON CREATE SET c.repo_id = $repo_id, c.author_id = $author_id, c.message = $message,
                       c.ci_status = 'PENDING', c.timestamp = $timestamp
         WITH c
         UNWIND $parent_hashes AS p_hash
         MATCH (parent:Commit {hash: p_hash})
         MERGE (c)-[:PARENT]->(parent)`,
        {
          commit_hash: commitHash,
          repo_id,
          author_id,
          message,
          timestamp: new Date().toISOString(),
          parent_hashes: parentHashes,
        }
      );
    } else {
      // Root commit — no parents to link
      await runCypher(
        `MERGE (c:Commit {hash: $commit_hash})
         ON CREATE SET c.repo_id = $repo_id, c.author_id = $author_id, c.message = $message,
                       c.ci_status = 'PENDING', c.timestamp = $timestamp`,
        {
          commit_hash: commitHash,
          repo_id,
          author_id,
          message,
          timestamp: new Date().toISOString(),
        }
      );
    }

    // ── 9. Both phases succeeded — COMMIT PostgreSQL ─────────────────
    await client.query('COMMIT');
    pgBegan = false;

    return NextResponse.json(
      {
        success: true,
        commit_hash: commitHash,
        tree_hash: treeHash,
        parent_hashes: parentHashes,
        files_committed: sortedEntries.length,
        staged_files_cleared: stagedRes.rows.length,
        is_merge_commit: parentHashes.length > 1,
        message,
      },
      { status: 201 }
    );
  } catch (error: any) {
    // ── ROLLBACK — Split-brain prevention ────────────────────────────
    if (pgBegan) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('ROLLBACK itself failed:', rollbackErr);
      }
    }

    console.error('Two-Phase Polyglot Commit Error:', error);

    const statusCode = error.message?.includes('RBAC Authorization Denied') ? 403
      : error.message?.includes('Simulated Neo4j') ? 500
      : error.message?.includes('staging index is empty') ? 400
      : 500;

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Two-Phase Polyglot Commit failed.',
        rollback_executed: pgBegan,
        phase_failed: error.message?.includes('Neo4j') ? 'Neo4j (Phase 2)' : 'PostgreSQL (Phase 1)',
      },
      { status: statusCode }
    );
  } finally {
    client.release();
  }
}

/**
 * GET /api/commits?repoId=...&branchName=... or ?commitHash=...
 * Returns the committed files (tree_nodes + blobs) for a given branch HEAD or commit hash.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const repoId = searchParams.get('repoId');
    const branchName = searchParams.get('branchName') || 'main';
    const commitHash = searchParams.get('commitHash');

    if (commitHash) {
      const res = await query(
        `SELECT tn.file_path, tn.file_mode, tn.blob_hash, b.size_bytes, encode(b.content, 'escape') AS content,
                c.commit_hash, c.message, c.created_at
         FROM commits c
         JOIN tree_nodes tn ON c.tree_hash = tn.tree_hash
         JOIN blobs b ON tn.blob_hash = b.blob_hash
         WHERE c.commit_hash = $1
         ORDER BY tn.file_path ASC;`,
        [commitHash]
      );
      return NextResponse.json({ success: true, files: res.rows });
    }

    if (!repoId) {
      return NextResponse.json(
        { success: false, error: 'repoId or commitHash query parameter is required' },
        { status: 400 }
      );
    }

    const res = await query(
      `SELECT tn.file_path, tn.file_mode, tn.blob_hash, b.size_bytes, encode(b.content, 'escape') AS content,
              c.commit_hash, c.message, c.created_at
       FROM branches br
       JOIN commits c ON br.target_commit_hash = c.commit_hash
       JOIN tree_nodes tn ON c.tree_hash = tn.tree_hash
       JOIN blobs b ON tn.blob_hash = b.blob_hash
       WHERE br.repo_id = $1 AND br.branch_name = $2
       ORDER BY tn.file_path ASC;`,
      [repoId, branchName]
    );

    return NextResponse.json({
      success: true,
      branch_name: branchName,
      commit_hash: res.rows[0]?.commit_hash || null,
      commit_message: res.rows[0]?.message || null,
      files: res.rows,
    });
  } catch (error: any) {
    console.error('Error fetching commit snapshot tree:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch commit tree' },
      { status: 500 }
    );
  }
}
