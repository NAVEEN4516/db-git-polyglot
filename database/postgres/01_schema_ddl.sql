CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL CHECK (char_length(username) >= 3),
    email VARCHAR(100) UNIQUE NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    password_hash VARCHAR(255) NOT NULL,
    system_role VARCHAR(20) NOT NULL DEFAULT 'USER' CHECK (system_role IN ('ADMIN', 'USER')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS repositories (
    repo_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    repo_name VARCHAR(100) NOT NULL CHECK (repo_name ~ '^[A-Za-z0-9._-]+$'),
    description TEXT DEFAULT '',
    is_private BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner_id, repo_name)
);

CREATE TABLE IF NOT EXISTS repo_collaborators (
    repo_id UUID NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    access_role VARCHAR(20) NOT NULL CHECK (access_role IN ('OWNER', 'MAINTAINER', 'CONTRIBUTOR', 'VIEWER')),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (repo_id, user_id)
);

CREATE TABLE IF NOT EXISTS blobs (
    blob_hash CHAR(64) PRIMARY KEY CHECK (blob_hash ~ '^[0-9a-f]{64}$'),
    content BYTEA NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trees (
    tree_hash CHAR(64) PRIMARY KEY CHECK (tree_hash ~ '^[0-9a-f]{64}$'),
    repo_id UUID NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tree_nodes (
    tree_hash CHAR(64) NOT NULL REFERENCES trees(tree_hash) ON DELETE CASCADE,
    file_path VARCHAR(512) NOT NULL CHECK (char_length(file_path) > 0),
    parent_dir_path VARCHAR(512) DEFAULT NULL,
    is_directory BOOLEAN DEFAULT FALSE,
    blob_hash CHAR(64) REFERENCES blobs(blob_hash),
    file_mode VARCHAR(10) NOT NULL DEFAULT '100644' CHECK (file_mode IN ('100644', '100755', '040000', '120000')),
    PRIMARY KEY (tree_hash, file_path)
);

CREATE TABLE IF NOT EXISTS staging_index (
    repo_id UUID NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    file_path VARCHAR(512) NOT NULL CHECK (char_length(file_path) > 0),
    blob_hash CHAR(64) NOT NULL REFERENCES blobs(blob_hash),
    file_mode VARCHAR(10) NOT NULL DEFAULT '100644' CHECK (file_mode IN ('100644', '100755')),
    staged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (repo_id, user_id, file_path)
);

CREATE TABLE IF NOT EXISTS commits (
    commit_hash CHAR(64) PRIMARY KEY CHECK (commit_hash ~ '^[0-9a-f]{64}$'),
    repo_id UUID NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(user_id),
    parent_commit_hash CHAR(64) REFERENCES commits(commit_hash),
    tree_hash CHAR(64) NOT NULL REFERENCES trees(tree_hash),
    message TEXT NOT NULL CHECK (char_length(trim(message)) > 0),
    msg_embedding vector(384),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS branches (
    branch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id UUID NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
    branch_name VARCHAR(100) NOT NULL CHECK (branch_name ~ '^[A-Za-z0-9._/-]+$'),
    target_commit_hash CHAR(64) REFERENCES commits(commit_hash),
    is_default BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(repo_id, branch_name)
);

CREATE TABLE IF NOT EXISTS repo_head (
    repo_id UUID PRIMARY KEY REFERENCES repositories(repo_id) ON DELETE CASCADE,
    current_branch_id UUID REFERENCES branches(branch_id) ON DELETE SET NULL,
    is_detached BOOLEAN NOT NULL DEFAULT FALSE,
    detached_commit_hash CHAR(64) REFERENCES commits(commit_hash),
    CHECK (
        (is_detached = FALSE AND current_branch_id IS NOT NULL AND detached_commit_hash IS NULL) OR
        (is_detached = TRUE AND detached_commit_hash IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_tree_nodes_lookup ON tree_nodes(tree_hash, file_path);
CREATE INDEX IF NOT EXISTS idx_commits_repo_created ON commits(repo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commits_fts ON commits USING GIN (to_tsvector('english', message));
CREATE INDEX IF NOT EXISTS idx_commits_embedding_hnsw ON commits USING hnsw (msg_embedding vector_cosine_ops);
