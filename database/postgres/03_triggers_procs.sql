CREATE OR REPLACE FUNCTION prevent_historical_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Cryptographic Integrity Violation: % records are immutable and cannot be modified or deleted.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_blobs ON blobs;
CREATE TRIGGER trg_immutable_blobs
BEFORE UPDATE OR DELETE ON blobs
FOR EACH ROW EXECUTE FUNCTION prevent_historical_modification();

DROP TRIGGER IF EXISTS trg_immutable_commits ON commits;
CREATE TRIGGER trg_immutable_commits
BEFORE UPDATE OR DELETE ON commits
FOR EACH ROW EXECUTE FUNCTION prevent_historical_modification();

CREATE OR REPLACE FUNCTION fn_create_atomic_commit(
    p_commit_hash CHAR(64),
    p_repo_id UUID,
    p_author_id UUID,
    p_parent_hash CHAR(64),
    p_branch_name VARCHAR(100),
    p_tree_hash CHAR(64),
    p_message TEXT,
    p_embedding vector(384)
) RETURNS CHAR(64) AS $$
DECLARE
    v_role VARCHAR(20);
BEGIN
    SELECT access_role INTO v_role
    FROM repo_collaborators
    WHERE repo_id = p_repo_id AND user_id = p_author_id;

    IF v_role IS NULL OR v_role = 'VIEWER' THEN
        RAISE EXCEPTION 'RBAC Authorization Denied: User lacks write privileges on repository %', p_repo_id;
    END IF;

    INSERT INTO commits (commit_hash, repo_id, author_id, parent_commit_hash, tree_hash, message, msg_embedding)
    VALUES (p_commit_hash, p_repo_id, p_author_id, p_parent_hash, p_tree_hash, p_message, p_embedding);

    UPDATE branches
    SET target_commit_hash = p_commit_hash, updated_at = CURRENT_TIMESTAMP
    WHERE repo_id = p_repo_id AND branch_name = p_branch_name;

    DELETE FROM staging_index
    WHERE repo_id = p_repo_id AND user_id = p_author_id;

    RETURN p_commit_hash;
END;
$$ LANGUAGE plpgsql;
