import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';

export const dynamic = 'force-dynamic';

const VALID_ROLES = ['OWNER', 'MAINTAINER', 'CONTRIBUTOR', 'VIEWER'];

/**
 * GET /api/collaborators?repoId=...
 * Lists all collaborators for the specified repository with their user details and roles.
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
        rc.repo_id, 
        rc.user_id, 
        u.username, 
        u.email, 
        rc.access_role, 
        rc.granted_at
       FROM repo_collaborators rc
       JOIN users u ON rc.user_id = u.user_id
       WHERE rc.repo_id = $1
       ORDER BY 
         CASE rc.access_role
           WHEN 'OWNER' THEN 1
           WHEN 'MAINTAINER' THEN 2
           WHEN 'CONTRIBUTOR' THEN 3
           WHEN 'VIEWER' THEN 4
           ELSE 5
         END,
         rc.granted_at ASC;`,
      [repoId]
    );

    return NextResponse.json({ success: true, collaborators: result.rows });
  } catch (error: any) {
    console.error('Error fetching collaborators:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch collaborators' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/collaborators
 * Upserts a collaborator role in repo_collaborators.
 * Requires requester to have 'OWNER' or 'MAINTAINER' privilege.
 * Body: { repo_id, user_id, access_role, requester_id? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { repo_id, user_id, access_role, requester_id } = body;

    if (!repo_id || !user_id || !access_role) {
      return NextResponse.json(
        { success: false, error: 'repo_id, user_id, and access_role are required' },
        { status: 400 }
      );
    }

    const normalizedRole = access_role.toUpperCase();
    if (!VALID_ROLES.includes(normalizedRole)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid access_role: '${access_role}'. Allowed: ${VALID_ROLES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Verify requester has OWNER or MAINTAINER permissions if requester_id is supplied
    if (requester_id) {
      const authCheck = await query(
        `SELECT access_role FROM repo_collaborators WHERE repo_id = $1 AND user_id = $2;`,
        [repo_id, requester_id]
      );

      const requesterRole = authCheck.rows[0]?.access_role;
      if (!requesterRole || !['OWNER', 'MAINTAINER'].includes(requesterRole)) {
        return NextResponse.json(
          {
            success: false,
            error: 'RBAC Authorization Denied: Only OWNER or MAINTAINER can manage collaborators.',
          },
          { status: 403 }
        );
      }
    }

    // Upsert collaborator role
    const result = await query(
      `INSERT INTO repo_collaborators (repo_id, user_id, access_role)
       VALUES ($1, $2, $3)
       ON CONFLICT (repo_id, user_id)
       DO UPDATE SET access_role = EXCLUDED.access_role, granted_at = CURRENT_TIMESTAMP
       RETURNING repo_id, user_id, access_role, granted_at;`,
      [repo_id, user_id, normalizedRole]
    );

    return NextResponse.json({
      success: true,
      collaborator: result.rows[0],
      message: `Collaborator role updated to '${normalizedRole}'.`,
    });
  } catch (error: any) {
    console.error('Error upserting collaborator:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to upsert collaborator' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/collaborators
 * Removes a collaborator from the repository.
 * Query params or body: { repoId, userId, requesterId? }
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let repo_id = searchParams.get('repoId');
    let user_id = searchParams.get('userId');
    let requester_id = searchParams.get('requesterId');

    // Also parse JSON body if query params not provided
    if (!repo_id || !user_id) {
      try {
        const body = await req.json();
        repo_id = repo_id || body.repo_id;
        user_id = user_id || body.user_id;
        requester_id = requester_id || body.requester_id;
      } catch {
        // body parsing optional if searchParams provided
      }
    }

    if (!repo_id || !user_id) {
      return NextResponse.json(
        { success: false, error: 'repo_id and user_id are required' },
        { status: 400 }
      );
    }

    // Prevent deletion of the sole repository OWNER
    const targetCheck = await query(
      `SELECT access_role FROM repo_collaborators WHERE repo_id = $1 AND user_id = $2;`,
      [repo_id, user_id]
    );

    if (targetCheck.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Target collaborator does not exist on this repository.' },
        { status: 404 }
      );
    }

    if (targetCheck.rows[0].access_role === 'OWNER') {
      const ownerCountRes = await query(
        `SELECT COUNT(*)::int as count FROM repo_collaborators WHERE repo_id = $1 AND access_role = 'OWNER';`,
        [repo_id]
      );
      if (ownerCountRes.rows[0].count <= 1) {
        return NextResponse.json(
          { success: false, error: 'Cannot remove the sole OWNER of the repository.' },
          { status: 400 }
        );
      }
    }

    // Verify requester role if supplied
    if (requester_id && requester_id !== user_id) {
      const authCheck = await query(
        `SELECT access_role FROM repo_collaborators WHERE repo_id = $1 AND user_id = $2;`,
        [repo_id, requester_id]
      );
      const reqRole = authCheck.rows[0]?.access_role;
      if (!reqRole || !['OWNER', 'MAINTAINER'].includes(reqRole)) {
        return NextResponse.json(
          {
            success: false,
            error: 'RBAC Authorization Denied: Only OWNER or MAINTAINER can remove collaborators.',
          },
          { status: 403 }
        );
      }
    }

    const delRes = await query(
      `DELETE FROM repo_collaborators 
       WHERE repo_id = $1 AND user_id = $2
       RETURNING repo_id, user_id;`,
      [repo_id, user_id]
    );

    return NextResponse.json({
      success: true,
      removed: delRes.rows[0],
      message: 'Collaborator removed successfully.',
    });
  } catch (error: any) {
    console.error('Error removing collaborator:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to remove collaborator' },
      { status: 500 }
    );
  }
}
