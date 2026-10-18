import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';

export const dynamic = 'force-dynamic';

/**
 * GET /api/branches?repoId=...
 * Returns all branches for a repository joined with latest commit details and repo_head status.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const repoId = searchParams.get('repoId');

    if (!repoId) {
      return NextResponse.json(
        { success: false, error: 'repoId query parameter is required' },
        { status: 400 }
      );
    }

    const result = await query(
      `SELECT
        b.branch_id,
        b.repo_id,
        b.branch_name,
        b.target_commit_hash,
        b.is_default,
        b.updated_at,
        c.message AS latest_commit_message,
        c.author_id AS latest_commit_author_id,
        u.username AS latest_commit_author_username,
        c.created_at AS latest_commit_created_at,
        (rh.current_branch_id = b.branch_id AND rh.is_detached = FALSE) AS is_current_head,
        rh.is_detached AS repo_is_detached,
        rh.detached_commit_hash
       FROM branches b
       LEFT JOIN commits c ON b.target_commit_hash = c.commit_hash
       LEFT JOIN users u ON c.author_id = u.user_id
       LEFT JOIN repo_head rh ON b.repo_id = rh.repo_id
       WHERE b.repo_id = $1
       ORDER BY b.is_default DESC, b.branch_name ASC;`,
      [repoId]
    );

    return NextResponse.json({ success: true, branches: result.rows });
  } catch (error: any) {
    console.error('Error fetching branches:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch branches' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/branches
 * Creates a new branch copying target_commit_hash from a source branch or directly.
 * Body: { repo_id, branch_name, source_branch_name?, target_commit_hash? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { repo_id, branch_name, source_branch_name, target_commit_hash } = body;

    if (!repo_id || !branch_name) {
      return NextResponse.json(
        { success: false, error: 'repo_id and branch_name are required' },
        { status: 400 }
      );
    }

    const branchNameRegex = /^[A-Za-z0-9._/-]+$/;
    if (!branchNameRegex.test(branch_name.trim())) {
      return NextResponse.json(
        {
          success: false,
          error: 'branch_name contains invalid characters. Use alphanumeric, ., _, /, or -.',
        },
        { status: 400 }
      );
    }

    let finalCommitHash = target_commit_hash || null;

    // If target commit hash not explicitly supplied, derive from source branch
    if (!finalCommitHash) {
      const srcName = source_branch_name || 'main';
      const sourceBranchRes = await query(
        `SELECT target_commit_hash FROM branches WHERE repo_id = $1 AND branch_name = $2;`,
        [repo_id, srcName]
      );

      if (sourceBranchRes.rows.length > 0) {
        finalCommitHash = sourceBranchRes.rows[0].target_commit_hash;
      }
    }

    const insertRes = await query(
      `INSERT INTO branches (repo_id, branch_name, target_commit_hash, is_default)
       VALUES ($1, $2, $3, FALSE)
       RETURNING branch_id, repo_id, branch_name, target_commit_hash, is_default, updated_at;`,
      [repo_id, branch_name.trim(), finalCommitHash]
    );

    return NextResponse.json(
      {
        success: true,
        branch: insertRes.rows[0],
        message: `Branch '${branch_name}' created successfully.`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating branch:', error);
    if (error.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'A branch with this name already exists in this repository.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create branch' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/branches
 * Checks out a branch by switching repo_head pointer.
 * Body: { repo_id, branch_id? , branch_name? }
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { repo_id, branch_id, branch_name } = body;

    if (!repo_id || (!branch_id && !branch_name)) {
      return NextResponse.json(
        { success: false, error: 'repo_id and either branch_id or branch_name are required' },
        { status: 400 }
      );
    }

    let targetBranchId = branch_id;

    if (!targetBranchId && branch_name) {
      const bRes = await query(
        `SELECT branch_id FROM branches WHERE repo_id = $1 AND branch_name = $2;`,
        [repo_id, branch_name]
      );
      if (bRes.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: `Branch '${branch_name}' not found in this repository` },
          { status: 404 }
        );
      }
      targetBranchId = bRes.rows[0].branch_id;
    }

    const updateRes = await query(
      `UPDATE repo_head
       SET current_branch_id = $1, is_detached = FALSE, detached_commit_hash = NULL
       WHERE repo_id = $2
       RETURNING repo_id, current_branch_id, is_detached;`,
      [targetBranchId, repo_id]
    );

    if (updateRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'repo_head record not found for this repository' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      head: updateRes.rows[0],
      message: `Checked out branch successfully.`,
    });
  } catch (error: any) {
    console.error('Error switching branch:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to checkout branch' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/branches
 * Deletes a non-default feature branch.
 * Query params or body: { repoId, branchId }
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let repo_id = searchParams.get('repoId');
    let branch_id = searchParams.get('branchId');

    if (!repo_id || !branch_id) {
      try {
        const body = await req.json();
        repo_id = repo_id || body.repo_id;
        branch_id = branch_id || body.branch_id;
      } catch {
        // body parsing optional
      }
    }

    if (!repo_id || !branch_id) {
      return NextResponse.json(
        { success: false, error: 'repo_id and branch_id are required' },
        { status: 400 }
      );
    }

    // Check if target branch is default
    const branchCheck = await query(
      `SELECT branch_id, branch_name, is_default FROM branches WHERE branch_id = $1 AND repo_id = $2;`,
      [branch_id, repo_id]
    );

    if (branchCheck.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Branch not found in this repository.' },
        { status: 404 }
      );
    }

    if (branchCheck.rows[0].is_default) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete the default branch of a repository.' },
        { status: 400 }
      );
    }

    // Check if currently checked out in repo_head
    const headCheck = await query(
      `SELECT current_branch_id FROM repo_head WHERE repo_id = $1 AND current_branch_id = $2;`,
      [repo_id, branch_id]
    );
    if (headCheck.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete the currently checked-out branch. Switch branches first.' },
        { status: 400 }
      );
    }

    const deleteRes = await query(
      `DELETE FROM branches 
       WHERE branch_id = $1 AND repo_id = $2 AND is_default = FALSE
       RETURNING branch_id, branch_name;`,
      [branch_id, repo_id]
    );

    return NextResponse.json({
      success: true,
      deleted_branch: deleteRes.rows[0],
      message: `Branch '${deleteRes.rows[0].branch_name}' deleted successfully.`,
    });
  } catch (error: any) {
    console.error('Error deleting branch:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete branch' },
      { status: 500 }
    );
  }
}
