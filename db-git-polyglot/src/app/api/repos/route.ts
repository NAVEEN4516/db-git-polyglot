import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/postgres';

export const dynamic = 'force-dynamic';

/**
 * GET /api/repos
 * Lists repositories visible to the active user (enforcing RLS policy and joining storage efficiency metrics).
 * Query params: ?userId=... & ?repoId=...
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const repoId = searchParams.get('repoId');

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Set transaction-local RLS session variable for app.current_user_id
    await client.query("SELECT set_config('app.current_user_id', $1, true);", [userId || '']);

    let sql = `
      SELECT
        r.repo_id,
        r.owner_id,
        u.username AS owner_username,
        u.email AS owner_email,
        r.repo_name,
        r.description,
        r.is_private,
        r.is_archived,
        r.created_at,
        b.branch_name AS default_branch_name,
        b.branch_id AS default_branch_id,
        b.target_commit_hash,
        rh.is_detached,
        rh.detached_commit_hash,
        rc.access_role AS user_role,
        COALESCE(v.unique_blobs_count, 0)::int AS unique_blobs_count,
        COALESCE(v.physical_bytes_stored, 0)::bigint AS physical_bytes_stored,
        COALESCE(v.logical_uncompressed_bytes, 0)::bigint AS logical_uncompressed_bytes,
        COALESCE(v.deduplication_savings_pct, 0.00)::numeric AS deduplication_savings_pct
      FROM repositories r
      JOIN users u ON r.owner_id = u.user_id
      LEFT JOIN branches b ON r.repo_id = b.repo_id AND b.is_default = TRUE
      LEFT JOIN repo_head rh ON r.repo_id = rh.repo_id
      LEFT JOIN repo_collaborators rc ON r.repo_id = rc.repo_id AND rc.user_id = $1::uuid
      LEFT JOIN v_repo_storage_efficiency v ON r.repo_id = v.repo_id
    `;

    const params: any[] = [userId || null];

    if (repoId) {
      sql += ` WHERE r.repo_id = $2::uuid `;
      params.push(repoId);
    }

    sql += ` ORDER BY r.created_at DESC;`;

    const result = await client.query(sql, params);
    await client.query('COMMIT');

    if (repoId) {
      if (result.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Repository not found or access denied' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, repository: result.rows[0] });
    }

    return NextResponse.json({ success: true, repositories: result.rows });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error fetching repositories:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch repositories' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/**
 * POST /api/repos
 * Creates a repository in an explicit ACID transaction:
 * 1. Inserts repository
 * 2. Inserts creator as 'OWNER' collaborator
 * 3. Creates default 'main' branch
 * 4. Initializes repo_head pointing to 'main'
 */
export async function POST(req: NextRequest) {
  const client = await getClient();
  try {
    const body = await req.json();
    const { owner_id, repo_name, description = '', is_private = false } = body;

    if (!owner_id) {
      return NextResponse.json(
        { success: false, error: 'owner_id is required' },
        { status: 400 }
      );
    }

    if (!repo_name || !/^[A-Za-z0-9._-]+$/.test(repo_name.trim())) {
      return NextResponse.json(
        {
          success: false,
          error: 'repo_name is required and must only contain alphanumeric characters, dots, underscores, or dashes.',
        },
        { status: 400 }
      );
    }

    await client.query('BEGIN');

    // 1. Insert repository
    const repoRes = await client.query(
      `INSERT INTO repositories (owner_id, repo_name, description, is_private)
       VALUES ($1, $2, $3, $4)
       RETURNING repo_id, owner_id, repo_name, description, is_private, created_at;`,
      [owner_id, repo_name.trim(), description.trim(), Boolean(is_private)]
    );
    const newRepo = repoRes.rows[0];

    // 2. Insert creator as 'OWNER'
    await client.query(
      `INSERT INTO repo_collaborators (repo_id, user_id, access_role)
       VALUES ($1, $2, 'OWNER');`,
      [newRepo.repo_id, owner_id]
    );

    // 3. Create default 'main' branch
    const branchRes = await client.query(
      `INSERT INTO branches (repo_id, branch_name, is_default)
       VALUES ($1, 'main', TRUE)
       RETURNING branch_id, branch_name, is_default;`,
      [newRepo.repo_id]
    );
    const defaultBranch = branchRes.rows[0];

    // 4. Initialize repo_head
    await client.query(
      `INSERT INTO repo_head (repo_id, current_branch_id, is_detached)
       VALUES ($1, $2, FALSE);`,
      [newRepo.repo_id, defaultBranch.branch_id]
    );

    await client.query('COMMIT');

    return NextResponse.json(
      {
        success: true,
        repository: {
          ...newRepo,
          default_branch_id: defaultBranch.branch_id,
          default_branch_name: defaultBranch.branch_name,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error creating repository:', error);
    if (error.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'A repository with this name already exists for this owner.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create repository' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
