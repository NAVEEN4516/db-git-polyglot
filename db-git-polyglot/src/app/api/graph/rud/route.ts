import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { runCypher } from '@/lib/neo4j';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/graph/rud — NoSQL UPDATE operations in Neo4j
 *
 * Supports:
 *  a) action: 'update_ci'   — SET ci_status on a Commit node
 *  b) action: 'upsert_tag'  — Create or move a release :Tag to a target Commit
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, repo_id } = body;

    if (!action || !repo_id) {
      return NextResponse.json(
        { success: false, error: 'action and repo_id are required.' },
        { status: 400 }
      );
    }

    // ── A. Update CI Status ──────────────────────────────────────────
    if (action === 'update_ci') {
      const { commit_hash, ci_status } = body;

      if (!commit_hash || !ci_status) {
        return NextResponse.json(
          { success: false, error: 'commit_hash and ci_status are required for update_ci.' },
          { status: 400 }
        );
      }

      const validStatuses = ['PENDING', 'PASS', 'FAIL'];
      if (!validStatuses.includes(ci_status.toUpperCase())) {
        return NextResponse.json(
          { success: false, error: `Invalid ci_status '${ci_status}'. Allowed: ${validStatuses.join(', ')}.` },
          { status: 400 }
        );
      }

      const records = await runCypher(
        `MATCH (c:Commit {hash: $commit_hash, repo_id: $repo_id})
         SET c.ci_status = $ci_status, c.verified_at = timestamp()
         RETURN c.hash AS hash, c.ci_status AS ci_status`,
        { commit_hash, repo_id, ci_status: ci_status.toUpperCase() }
      );

      if (records.length === 0) {
        return NextResponse.json(
          { success: false, error: `Commit '${commit_hash}' not found in Neo4j for repo ${repo_id}.` },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        updated_commit: records[0],
        message: `CI status updated to '${ci_status.toUpperCase()}'.`,
      });
    }

    // ── B. Upsert Tag (Create or Move release tag) ───────────────────
    if (action === 'upsert_tag') {
      const { tag_name, commit_hash } = body;

      if (!tag_name || !commit_hash) {
        return NextResponse.json(
          { success: false, error: 'tag_name and commit_hash are required for upsert_tag.' },
          { status: 400 }
        );
      }

      const records = await runCypher(
        `MERGE (t:Tag {repo_id: $repo_id, name: $tag_name})
         WITH t
         OPTIONAL MATCH (t)-[old_rel:TARGETS]->(:Commit)
         DELETE old_rel
         WITH t
         MATCH (target:Commit {hash: $commit_hash, repo_id: $repo_id})
         CREATE (t)-[:TARGETS {updated_at: timestamp()}]->(target)
         SET t.updated_at = timestamp()
         RETURN t.name AS tag, target.hash AS target_hash`,
        { repo_id, tag_name, commit_hash }
      );

      if (records.length === 0) {
        return NextResponse.json(
          { success: false, error: `Target commit '${commit_hash}' not found in Neo4j.` },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        tag: records[0],
        message: `Tag '${tag_name}' now targets commit '${commit_hash}'.`,
      });
    }

    return NextResponse.json(
      { success: false, error: `Unknown PUT action: '${action}'. Use 'update_ci' or 'upsert_tag'.` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error in PUT /api/graph/rud:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to perform Neo4j update operation.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/graph/rud — NoSQL DELETE operations + Viva Guard Verification
 *
 * Supports:
 *  a) action: 'delete_tag'                — DETACH DELETE a Tag node
 *  b) action: 'gc_orphans' (dbgit gc)     — Prune orphan commits unreachable from active branches
 *  c) action: 'test_immutability_trigger'  — Attempt SQL DELETE on commits to demo trg_immutable_commits
 */
export async function DELETE(req: NextRequest) {
  try {
    // Parse action from query params or body
    const { searchParams } = new URL(req.url);
    let action = searchParams.get('action');
    let repo_id = searchParams.get('repoId');
    let tag_name = searchParams.get('tagName');
    let bodyData: any = {};

    try {
      bodyData = await req.json();
    } catch {
      // body parsing optional — query params may suffice
    }

    action = action || bodyData.action;
    repo_id = repo_id || bodyData.repo_id;
    tag_name = tag_name || bodyData.tag_name;

    if (!action || !repo_id) {
      return NextResponse.json(
        { success: false, error: 'action and repo_id are required.' },
        { status: 400 }
      );
    }

    // ── A. Delete Tag ────────────────────────────────────────────────
    if (action === 'delete_tag') {
      if (!tag_name) {
        return NextResponse.json(
          { success: false, error: 'tag_name is required for delete_tag.' },
          { status: 400 }
        );
      }

      const records = await runCypher(
        `MATCH (t:Tag {repo_id: $repo_id, name: $tag_name})
         DETACH DELETE t
         RETURN $tag_name AS deleted_tag`,
        { repo_id, tag_name }
      );

      return NextResponse.json({
        success: true,
        deleted_tag: tag_name,
        message: records.length > 0
          ? `Tag '${tag_name}' deleted successfully.`
          : `Tag '${tag_name}' was not found (already deleted or never existed).`,
      });
    }

    // ── B. Garbage Collection — Prune Orphan Commits (dbgit gc) ──────
    if (action === 'gc_orphans') {
      // Collect active branch HEAD hashes from PostgreSQL
      const branchHeadsRes = await query(
        `SELECT target_commit_hash 
         FROM branches 
         WHERE repo_id = $1 AND target_commit_hash IS NOT NULL;`,
        [repo_id]
      );

      const activeHashes = branchHeadsRes.rows.map(
        (r: { target_commit_hash: string }) => r.target_commit_hash
      );

      if (activeHashes.length === 0) {
        return NextResponse.json({
          success: true,
          pruned_orphan_commits: 0,
          message: 'No active branch heads found — nothing to prune against.',
        });
      }

      const gcResult = await runCypher(
        `MATCH (c:Commit {repo_id: $repo_id})
         WHERE NOT EXISTS {
           MATCH (head:Commit {repo_id: $repo_id})-[:PARENT*0..100]->(c)
           WHERE head.hash IN $active_branch_head_hashes
         }
         DETACH DELETE c
         RETURN COUNT(c) AS pruned_orphan_commits`,
        { repo_id, active_branch_head_hashes: activeHashes }
      );

      const pruned = gcResult[0]?.pruned_orphan_commits ?? 0;

      return NextResponse.json({
        success: true,
        pruned_orphan_commits: pruned,
        active_branch_heads: activeHashes.length,
        message: pruned > 0
          ? `Garbage collection complete: ${pruned} orphan commit(s) pruned.`
          : 'No orphan commits found — graph is clean.',
      });
    }

    // ── C. Viva Guard — Test Immutability Trigger on commits ─────────
    if (action === 'test_immutability_trigger') {
      try {
        await query(
          `DELETE FROM commits WHERE repo_id = $1;`,
          [repo_id]
        );
        // This should never succeed if trg_immutable_commits is active
        return NextResponse.json({
          success: false,
          error: 'WARNING: DELETE succeeded — immutability trigger is NOT active!',
        });
      } catch (triggerErr: any) {
        return NextResponse.json({
          success: true,
          trigger_name: 'trg_immutable_commits',
          trigger_fired: true,
          error_message: triggerErr.message,
          message: 'Immutability trigger correctly prevented deletion of committed records.',
        });
      }
    }

    return NextResponse.json(
      { success: false, error: `Unknown DELETE action: '${action}'. Use 'delete_tag', 'gc_orphans', or 'test_immutability_trigger'.` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error in DELETE /api/graph/rud:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to perform Neo4j delete operation.' },
      { status: 500 }
    );
  }
}
