import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import bcrypt from 'bcryptjs';
import { initializeDatabase } from './init_db';

const DEMO_PASSWORD = 'password123';
const REPO_NAME = 'pesu-db-git-core';
const LICENSE_BYTES = 24 * 1024;
const ORPHAN_HASH = `deadbeef${'0'.repeat(56)}`;

type QueryFn = (text: string, params?: any[]) => Promise<{ rows: any[] }>;
type CypherFn = (cypher: string, params?: Record<string, any>) => Promise<any[]>;

function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function makeLicenseBlob(): Buffer {
  const header = Buffer.from(
    'MIT License\nCopyright (c) 2026 PES University — DB-Git Polyglot Core.\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software.\n',
    'utf8'
  );
  const pad = Buffer.alloc(Math.max(0, LICENSE_BYTES - header.length), 0x41);
  return Buffer.concat([header, pad]).subarray(0, LICENSE_BYTES);
}

function merkleTreeHash(entries: { file_path: string; blob_hash: string; file_mode: string }[]): string {
  const sorted = [...entries].sort((a, b) => a.file_path.localeCompare(b.file_path));
  const input = sorted.map((e) => `${e.file_path}:${e.blob_hash}:${e.file_mode}`).join('\n');
  return sha256(input);
}

function computeCommitHash(input: {
  repoId: string;
  authorId: string;
  treeHash: string;
  parentHashes: string[];
  message: string;
  nonce: string;
}): string {
  return sha256(
    [input.repoId, input.authorId, input.treeHash, input.parentHashes.join(','), input.nonce, input.message].join('|')
  );
}

function parentDir(filePath: string): string | null {
  const parts = filePath.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : null;
}

async function resetDemoData(query: QueryFn, runCypher: CypherFn) {
  console.log('>>> Resetting demo data (immutability triggers temporarily disabled)...');

  await query('ALTER TABLE blobs DISABLE TRIGGER trg_immutable_blobs;');
  await query('ALTER TABLE commits DISABLE TRIGGER trg_immutable_commits;');

  try {
    await query('DELETE FROM repo_head;');
    await query('DELETE FROM staging_index;');
    await query('DELETE FROM branches;');
    await query('DELETE FROM commits;');
    await query('DELETE FROM tree_nodes;');
    await query('DELETE FROM trees;');
    await query('DELETE FROM blobs;');
    await query('DELETE FROM repo_collaborators;');
    await query('DELETE FROM repositories;');
    await query('DELETE FROM users;');
  } finally {
    await query('ALTER TABLE blobs ENABLE TRIGGER trg_immutable_blobs;');
    await query('ALTER TABLE commits ENABLE TRIGGER trg_immutable_commits;');
  }

  await runCypher('MATCH (n) DETACH DELETE n');
  console.log('✓ Demo data cleared and immutability triggers re-enabled.\n');
}

async function upsertBlob(query: QueryFn, content: Buffer) {
  const blobHash = sha256(content);
  await query(
    `INSERT INTO blobs (blob_hash, content, size_bytes)
     VALUES ($1, $2, $3)
     ON CONFLICT (blob_hash) DO NOTHING;`,
    [blobHash, content, content.length]
  );
  return blobHash;
}

async function insertTree(
  query: QueryFn,
  repoId: string,
  entries: { file_path: string; blob_hash: string; file_mode?: string }[]
) {
  const normalized = entries.map((e) => ({
    file_path: e.file_path,
    blob_hash: e.blob_hash,
    file_mode: e.file_mode || '100644',
  }));
  const treeHash = merkleTreeHash(normalized);

  await query(
    `INSERT INTO trees (tree_hash, repo_id) VALUES ($1, $2) ON CONFLICT (tree_hash) DO NOTHING;`,
    [treeHash, repoId]
  );

  for (const entry of normalized) {
    await query(
      `INSERT INTO tree_nodes (tree_hash, file_path, parent_dir_path, is_directory, blob_hash, file_mode)
       VALUES ($1, $2, $3, FALSE, $4, $5)
       ON CONFLICT (tree_hash, file_path) DO NOTHING;`,
      [treeHash, entry.file_path, parentDir(entry.file_path), entry.blob_hash, entry.file_mode]
    );
  }

  return treeHash;
}

async function persistCommit(opts: {
  query: QueryFn;
  runCypher: CypherFn;
  generateTextEmbedding: (text: string) => string;
  repoId: string;
  authorId: string;
  branchName: string;
  parentHashes: string[];
  treeHash: string;
  message: string;
  nonce: string;
  timestamp: string;
}) {
  const commitHash = computeCommitHash({
    repoId: opts.repoId,
    authorId: opts.authorId,
    treeHash: opts.treeHash,
    parentHashes: opts.parentHashes,
    message: opts.message,
    nonce: opts.nonce,
  });
  const embedding = opts.generateTextEmbedding(opts.message);
  const firstParent = opts.parentHashes[0] ?? null;

  await opts.query(`SELECT fn_create_atomic_commit($1, $2, $3, $4, $5, $6, $7, $8::vector);`, [
    commitHash,
    opts.repoId,
    opts.authorId,
    firstParent,
    opts.branchName,
    opts.treeHash,
    opts.message,
    embedding,
  ]);

  if (opts.parentHashes.length > 0) {
    await opts.runCypher(
      `MERGE (c:Commit {hash: $commit_hash})
       ON CREATE SET c.repo_id = $repo_id, c.author_id = $author_id, c.message = $message,
                     c.ci_status = 'PENDING', c.timestamp = $timestamp
       WITH c
       UNWIND $parent_hashes AS p_hash
       MATCH (parent:Commit {hash: p_hash})
       MERGE (c)-[:PARENT]->(parent)`,
      {
        commit_hash: commitHash,
        repo_id: opts.repoId,
        author_id: opts.authorId,
        message: opts.message,
        timestamp: opts.timestamp,
        parent_hashes: opts.parentHashes,
      }
    );
  } else {
    await opts.runCypher(
      `MERGE (c:Commit {hash: $commit_hash})
       ON CREATE SET c.repo_id = $repo_id, c.author_id = $author_id, c.message = $message,
                     c.ci_status = 'PENDING', c.timestamp = $timestamp`,
      {
        commit_hash: commitHash,
        repo_id: opts.repoId,
        author_id: opts.authorId,
        message: opts.message,
        timestamp: opts.timestamp,
      }
    );
  }

  return commitHash;
}

async function seed() {
  const { query, pool, runCypher, driver } = await initializeDatabase({ closeConnections: false });

  const libPath = fs.existsSync(path.resolve(__dirname, '../src/lib'))
    ? path.resolve(__dirname, '../src/lib')
    : path.resolve(__dirname, '../db-git-polyglot/src/lib');
  const embeddings = await import(pathToFileURL(path.join(libPath, 'embeddings.ts')).href);
  const generateTextEmbedding = embeddings.generateTextEmbedding as (text: string) => string;

  console.log('================================================================');
  console.log('DB-Git Phase 6 — One-Shot Demo Seeder');
  console.log('================================================================\n');

  await resetDemoData(query, runCypher);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = [
    {
      username: 'naveen_owner',
      email: 'naveen.owner@pesu.edu',
      system_role: 'ADMIN',
      access_role: 'OWNER',
    },
    {
      username: 'nishanth_maintainer',
      email: 'nishanth.maintainer@pesu.edu',
      system_role: 'USER',
      access_role: 'MAINTAINER',
    },
    {
      username: 'arjun_dev',
      email: 'arjun.dev@pesu.edu',
      system_role: 'USER',
      access_role: 'CONTRIBUTOR',
    },
    {
      username: 'priya_viewer',
      email: 'priya.viewer@pesu.edu',
      system_role: 'USER',
      access_role: 'VIEWER',
    },
  ];

  const userIds: Record<string, string> = {};
  for (const user of users) {
    const res = await query(
      `INSERT INTO users (username, email, password_hash, system_role)
       VALUES ($1, $2, $3, $4)
       RETURNING user_id;`,
      [user.username, user.email, passwordHash, user.system_role]
    );
    userIds[user.username] = res.rows[0].user_id;
    console.log(`✓ User ${user.username} (${user.system_role} / ${user.access_role})`);
  }

  const ownerId = userIds.naveen_owner;
  const repoRes = await query(
    `INSERT INTO repositories (owner_id, repo_name, description, is_private)
     VALUES ($1, $2, $3, FALSE)
     RETURNING repo_id;`,
    [ownerId, REPO_NAME, 'PESU DBMS Mini Project — Polyglot Git engine (PostgreSQL + Neo4j)']
  );
  const repoId: string = repoRes.rows[0].repo_id;

  for (const user of users) {
    await query(
      `INSERT INTO repo_collaborators (repo_id, user_id, access_role)
       VALUES ($1, $2, $3);`,
      [repoId, userIds[user.username], user.access_role]
    );
  }

  const mainBranch = await query(
    `INSERT INTO branches (repo_id, branch_name, target_commit_hash, is_default)
     VALUES ($1, 'main', NULL, TRUE)
     RETURNING branch_id;`,
    [repoId]
  );
  await query(
    `INSERT INTO repo_head (repo_id, current_branch_id, is_detached, detached_commit_hash)
     VALUES ($1, $2, FALSE, NULL);`,
    [repoId, mainBranch.rows[0].branch_id]
  );
  console.log(`✓ Repository ${REPO_NAME} with 4 collaborator roles\n`);

  const licenseContent = makeLicenseBlob();
  const licenseHash = await upsertBlob(query, licenseContent);
  const readmeHash = await upsertBlob(
    query,
    Buffer.from('# pesu-db-git-core\n\nPolyglot Git-inspired CAS repository for the PESU DBMS mini project.\n', 'utf8')
  );

  const engineV1 = Buffer.from(
    "export function runEngine(): string {\n  return 'bootstrap merkle + CAS blob store';\n}\n",
    'utf8'
  );
  const engineV2 = Buffer.from(
    "export function runEngine(): string {\n  return 'CAS dedup: identical LICENSE blobs share one hash';\n}\n",
    'utf8'
  );
  const engineV3 = Buffer.from(
    "export function runEngine(): string {\n  return 'Add Neo4j Cypher LCA index traversal';\n}\n",
    'utf8'
  );
  const engineV4 = Buffer.from(
    "export function runEngine(): string {\n  return 'Implement PostgreSQL ACID staging index and triggers';\n}\n",
    'utf8'
  );
  const engineMerge = Buffer.from(
    "export function runEngine(): string {\n  return 'Merge: Neo4j Cypher LCA index traversal + PostgreSQL ACID staging index and triggers';\n}\n",
    'utf8'
  );

  const engine1 = await upsertBlob(query, engineV1);
  const engine2 = await upsertBlob(query, engineV2);
  const engine3 = await upsertBlob(query, engineV3);
  const engine4 = await upsertBlob(query, engineV4);
  const engine5 = await upsertBlob(query, engineMerge);

  const baseFiles = (engineHash: string, extraLicenseCopies: boolean) => {
    const files = [
      { file_path: 'README.md', blob_hash: readmeHash },
      { file_path: 'LICENSE', blob_hash: licenseHash },
      { file_path: 'src/engine.ts', blob_hash: engineHash },
    ];
    if (extraLicenseCopies) {
      files.push({ file_path: 'docs/LICENSE_COPY_1', blob_hash: licenseHash });
      files.push({ file_path: 'packages/core/LICENSE_COPY_2', blob_hash: licenseHash });
    }
    return files;
  };

  const t0 = Date.parse('2026-03-01T10:00:00.000Z');
  const ts = (hours: number) => new Date(t0 + hours * 3600_000).toISOString();

  const commit1 = await persistCommit({
    query,
    runCypher,
    generateTextEmbedding,
    repoId,
    authorId: ownerId,
    branchName: 'main',
    parentHashes: [],
    treeHash: await insertTree(query, repoId, baseFiles(engine1, false)),
    message: 'Initial commit: add README.md, LICENSE (24KB), and src/engine.ts',
    nonce: 'commit-1-root',
    timestamp: ts(0),
  });
  console.log(`✓ Commit 1 (root on main): ${commit1}`);

  const commit2 = await persistCommit({
    query,
    runCypher,
    generateTextEmbedding,
    repoId,
    authorId: ownerId,
    branchName: 'main',
    parentHashes: [commit1],
    treeHash: await insertTree(query, repoId, baseFiles(engine2, true)),
    message: 'Copy LICENSE into docs/ and packages/core/ to demonstrate CAS deduplication',
    nonce: 'commit-2-dedup',
    timestamp: ts(1),
  });
  console.log(`✓ Commit 2 (main, CAS copies): ${commit2}`);

  await query(
    `INSERT INTO branches (repo_id, branch_name, target_commit_hash, is_default)
     VALUES ($1, 'feat-graph-lca', $2, FALSE);`,
    [repoId, commit2]
  );

  const commit3 = await persistCommit({
    query,
    runCypher,
    generateTextEmbedding,
    repoId,
    authorId: userIds.nishanth_maintainer,
    branchName: 'feat-graph-lca',
    parentHashes: [commit2],
    treeHash: await insertTree(query, repoId, baseFiles(engine3, true)),
    message: 'Add Neo4j Cypher LCA index traversal',
    nonce: 'commit-3-feat',
    timestamp: ts(2),
  });
  console.log(`✓ Commit 3 (feat-graph-lca): ${commit3}`);

  const commit4 = await persistCommit({
    query,
    runCypher,
    generateTextEmbedding,
    repoId,
    authorId: userIds.arjun_dev,
    branchName: 'main',
    parentHashes: [commit2],
    treeHash: await insertTree(query, repoId, baseFiles(engine4, true)),
    message: 'Implement PostgreSQL ACID staging index and triggers',
    nonce: 'commit-4-main',
    timestamp: ts(3),
  });
  console.log(`✓ Commit 4 (main): ${commit4}`);

  const commit5 = await persistCommit({
    query,
    runCypher,
    generateTextEmbedding,
    repoId,
    authorId: ownerId,
    branchName: 'main',
    parentHashes: [commit4, commit3],
    treeHash: await insertTree(query, repoId, baseFiles(engine5, true)),
    message: 'Merge feat-graph-lca into main (two-parent merge commit)',
    nonce: 'commit-5-merge',
    timestamp: ts(4),
  });
  console.log(`✓ Commit 5 (2-parent merge on main): ${commit5}`);

  await runCypher(
    `MERGE (c:Commit {hash: $hash})
     ON CREATE SET c.repo_id = $repo_id,
                   c.author_id = $author_id,
                   c.message = $message,
                   c.ci_status = 'PENDING',
                   c.timestamp = $timestamp`,
    {
      hash: ORPHAN_HASH,
      repo_id: repoId,
      author_id: ownerId,
      message: 'Dangling orphan commit for dbgit gc demonstration',
      timestamp: ts(5),
    }
  );
  console.log(`✓ Commit 6 (Neo4j orphan, no branch head): ${ORPHAN_HASH}`);

  await runCypher(
    `MATCH (c:Commit)
     WHERE c.hash IN $hashes
     SET c.ci_status = 'PASSED'`,
    { hashes: [commit1, commit2, commit3, commit4] }
  );

  await runCypher(
    `MERGE (t:Tag {repo_id: $repo_id, name: 'v1.0.0'})
     WITH t
     OPTIONAL MATCH (t)-[old_rel:TARGETS]->(:Commit)
     DELETE old_rel
     WITH t
     MATCH (target:Commit {hash: $target_hash, repo_id: $repo_id})
     CREATE (t)-[:TARGETS {updated_at: timestamp()}]->(target)
     SET t.updated_at = timestamp()`,
    { repo_id: repoId, target_hash: commit5 }
  );
  console.log('✓ CI PASSED on commits 1–4; tag v1.0.0 → commit 5\n');

  const efficiency = await query(`SELECT * FROM v_repo_storage_efficiency WHERE repo_id = $1;`, [repoId]);
  const row = efficiency.rows[0];
  console.log('================================================================');
  console.log('Seed summary');
  console.log('================================================================');
  console.log(`  repo_id:                      ${repoId}`);
  console.log(`  unique_blobs_count:           ${row?.unique_blobs_count}`);
  console.log(`  physical_bytes_stored:        ${row?.physical_bytes_stored}`);
  console.log(`  logical_uncompressed_bytes:   ${row?.logical_uncompressed_bytes}`);
  console.log(`  deduplication_savings_pct:    ${row?.deduplication_savings_pct}`);
  console.log(`  orphan Neo4j hash:            ${ORPHAN_HASH}`);
  console.log(`  demo password (all users):    ${DEMO_PASSWORD}`);
  console.log('================================================================\n');

  await pool.end();
  await driver.close();
}

seed().catch(async (err) => {
  console.error('\n❌ Demo seed failed:', err);
  process.exit(1);
});
