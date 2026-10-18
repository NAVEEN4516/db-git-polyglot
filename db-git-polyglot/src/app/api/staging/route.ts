import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getClient } from '@/lib/postgres';

export const dynamic = 'force-dynamic';

/**
 * GET /api/staging?repoId=...&userId=...&branchName=...
 * Returns:
 * 1. committed_files: Snapshot files from the active branch's latest commit (commits -> tree_nodes -> blobs)
 * 2. staged_files: Current uncommitted files in staging_index for this user
 */
export async function GET(req: NextRequest) {
  const client = await getClient();
  try {
    const { searchParams } = new URL(req.url);
    const repoId = searchParams.get('repoId');
    const userId = searchParams.get('userId');
    const branchName = searchParams.get('branchName') || 'main';

    if (!repoId) {
      return NextResponse.json(
        { success: false, error: 'repoId is required' },
        { status: 400 }
      );
    }

    await client.query('BEGIN');
    if (userId) {
      await client.query("SELECT set_config('app.current_user_id', $1, true);", [userId]);
    } else {
      await client.query("SELECT set_config('app.current_user_id', '', true);");
    }

    // 1. Fetch current branch target commit and its committed snapshot files
    const branchRes = await client.query(
      `SELECT b.branch_id, b.branch_name, b.target_commit_hash, c.tree_hash, c.message, c.created_at
       FROM branches b
       LEFT JOIN commits c ON b.target_commit_hash = c.commit_hash
       WHERE b.repo_id = $1 AND b.branch_name = $2;`,
      [repoId, branchName]
    );

    let committedFiles: any[] = [];
    const currentBranch = branchRes.rows[0];

    if (currentBranch?.tree_hash) {
      const treeRes = await client.query(
        `SELECT 
          tn.file_path, 
          tn.blob_hash, 
          tn.file_mode, 
          tn.is_directory,
          b.size_bytes,
          encode(b.content, 'escape') AS content
         FROM tree_nodes tn
         LEFT JOIN blobs b ON tn.blob_hash = b.blob_hash
         WHERE tn.tree_hash = $1
         ORDER BY tn.file_path ASC;`,
        [currentBranch.tree_hash]
      );
      committedFiles = treeRes.rows;
    }

    // 2. Fetch staged files for this user in this repo
    let stagedFiles: any[] = [];
    if (userId) {
      const stagedRes = await client.query(
        `SELECT 
          s.repo_id, 
          s.user_id, 
          s.file_path, 
          s.blob_hash, 
          s.file_mode, 
          s.staged_at, 
          b.size_bytes,
          encode(b.content, 'escape') AS content
         FROM staging_index s
         JOIN blobs b ON s.blob_hash = b.blob_hash
         WHERE s.repo_id = $1 AND s.user_id = $2
         ORDER BY s.file_path ASC;`,
        [repoId, userId]
      );
      stagedFiles = stagedRes.rows;
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      branch: currentBranch || null,
      target_commit_hash: currentBranch?.target_commit_hash || null,
      committed_files: committedFiles,
      staged_files: stagedFiles,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error in GET /api/staging:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch staging details' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/**
 * POST /api/staging
 * Stages a file using Content-Addressable Storage (CAS) Deduplication:
 * 1. Computes SHA-256 hash of content
 * 2. INSERT INTO blobs ... ON CONFLICT (blob_hash) DO NOTHING
 * 3. INSERT INTO staging_index ... ON CONFLICT DO UPDATE
 * Body: { repo_id, user_id, file_path, content, file_mode? }
 */
export async function POST(req: NextRequest) {
  const client = await getClient();
  try {
    const body = await req.json();
    const { repo_id, user_id, file_path, content = '', file_mode = '100644' } = body;

    if (!repo_id || !user_id || !file_path) {
      return NextResponse.json(
        { success: false, error: 'repo_id, user_id, and file_path are required' },
        { status: 400 }
      );
    }

    const cleanPath = file_path.trim().replace(/^\/+/, '');
    if (!cleanPath) {
      return NextResponse.json(
        { success: false, error: 'file_path cannot be empty' },
        { status: 400 }
      );
    }

    const validModes = ['100644', '100755'];
    const mode = validModes.includes(file_mode) ? file_mode : '100644';

    // Compute cryptographic SHA-256 Content-Addressable Hash
    const contentBuffer = Buffer.from(content, 'utf-8');
    const sizeBytes = contentBuffer.length;
    const blobHash = crypto.createHash('sha256').update(contentBuffer).digest('hex');

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true);", [user_id]);

    // Check if blob already existed in storage (CAS deduplication detection)
    const checkBlob = await client.query(
      `SELECT blob_hash FROM blobs WHERE blob_hash = $1;`,
      [blobHash]
    );
    const wasAlreadyStored = checkBlob.rows.length > 0;

    // CAS Step 1: Insert content-addressable blob (deduplicates if hash already exists)
    await client.query(
      `INSERT INTO blobs (blob_hash, content, size_bytes)
       VALUES ($1, $2, $3)
       ON CONFLICT (blob_hash) DO NOTHING;`,
      [blobHash, contentBuffer, sizeBytes]
    );

    // CAS Step 2: Upsert into user's staging index
    const stagingRes = await client.query(
      `INSERT INTO staging_index (repo_id, user_id, file_path, blob_hash, file_mode)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (repo_id, user_id, file_path)
       DO UPDATE SET blob_hash = EXCLUDED.blob_hash, 
                     file_mode = EXCLUDED.file_mode, 
                     staged_at = CURRENT_TIMESTAMP
       RETURNING repo_id, user_id, file_path, blob_hash, file_mode, staged_at;`,
      [repo_id, user_id, cleanPath, blobHash, mode]
    );

    await client.query('COMMIT');

    return NextResponse.json(
      {
        success: true,
        staged_file: stagingRes.rows[0],
        blob_hash: blobHash,
        size_bytes: sizeBytes,
        is_deduplicated: wasAlreadyStored,
        message: wasAlreadyStored
          ? `File '${cleanPath}' staged with zero additional storage (CAS deduplication hit).`
          : `File '${cleanPath}' staged with new blob created (${sizeBytes} bytes).`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error staging file:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to stage file' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/**
 * PUT /api/staging
 * Updates file_mode of an already staged file.
 * Body: { repo_id, user_id, file_path, file_mode }
 */
export async function PUT(req: NextRequest) {
  const client = await getClient();
  try {
    const body = await req.json();
    const { repo_id, user_id, file_path, file_mode } = body;

    if (!repo_id || !user_id || !file_path || !file_mode) {
      return NextResponse.json(
        { success: false, error: 'repo_id, user_id, file_path, and file_mode are required' },
        { status: 400 }
      );
    }

    const validModes = ['100644', '100755'];
    if (!validModes.includes(file_mode)) {
      return NextResponse.json(
        { success: false, error: `Invalid file_mode: '${file_mode}'. Allowed: 100644 (regular) or 100755 (executable)` },
        { status: 400 }
      );
    }

    const cleanPath = file_path.trim().replace(/^\/+/, '');

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true);", [user_id]);

    const result = await client.query(
      `UPDATE staging_index
       SET file_mode = $1, staged_at = CURRENT_TIMESTAMP
       WHERE repo_id = $2 AND user_id = $3 AND file_path = $4
       RETURNING repo_id, user_id, file_path, file_mode, staged_at;`,
      [file_mode, repo_id, user_id, cleanPath]
    );

    await client.query('COMMIT');

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: `File '${cleanPath}' not found in your staging index` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      staged_file: result.rows[0],
      message: `File mode for '${cleanPath}' updated to ${file_mode}.`,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error updating staged file mode:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update file mode' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/staging
 * Unstages a file (or all files) from staging_index.
 * Query params or body: { repoId, userId, filePath }
 */
export async function DELETE(req: NextRequest) {
  const client = await getClient();
  try {
    const { searchParams } = new URL(req.url);
    let repo_id = searchParams.get('repoId');
    let user_id = searchParams.get('userId');
    let file_path = searchParams.get('filePath');

    if (!repo_id || !user_id || !file_path) {
      try {
        const body = await req.json();
        repo_id = repo_id || body.repo_id;
        user_id = user_id || body.user_id;
        file_path = file_path || body.file_path;
      } catch {
        // body parsing optional
      }
    }

    if (!repo_id || !user_id || !file_path) {
      return NextResponse.json(
        { success: false, error: 'repo_id, user_id, and file_path are required' },
        { status: 400 }
      );
    }

    const cleanPath = file_path.trim().replace(/^\/+/, '');

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true);", [user_id]);

    // Allow wildcard unstage all files for user
    if (cleanPath === '*' || cleanPath === '__ALL__') {
      const delAll = await client.query(
        `DELETE FROM staging_index 
         WHERE repo_id = $1 AND user_id = $2
         RETURNING file_path;`,
        [repo_id, user_id]
      );
      await client.query('COMMIT');
      return NextResponse.json({
        success: true,
        unstaged_count: delAll.rows.length,
        message: `Unstaged ${delAll.rows.length} files.`,
      });
    }

    const result = await client.query(
      `DELETE FROM staging_index
       WHERE repo_id = $1 AND user_id = $2 AND file_path = $3
       RETURNING repo_id, user_id, file_path;`,
      [repo_id, user_id, cleanPath]
    );

    await client.query('COMMIT');

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: `File '${cleanPath}' was not in your staging index` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      unstaged_file: result.rows[0],
      message: `File '${cleanPath}' unstaged successfully.`,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error unstaging file:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to unstage file' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
