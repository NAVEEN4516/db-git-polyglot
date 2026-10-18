ALTER TABLE repositories ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS temp_migration_audit (audit_id SERIAL PRIMARY KEY, note TEXT);
DROP TABLE IF EXISTS temp_migration_audit;

CREATE OR REPLACE VIEW v_repo_storage_efficiency AS
SELECT
    r.repo_id,
    r.repo_name,
    COUNT(DISTINCT b.blob_hash) AS unique_blobs_count,
    COALESCE(SUM(DISTINCT b.size_bytes), 0) AS physical_bytes_stored,
    COALESCE(SUM(b.size_bytes), 0) AS logical_uncompressed_bytes,
    ROUND(
        (1.0 - (COALESCE(SUM(DISTINCT b.size_bytes), 0)::numeric /
        NULLIF(SUM(b.size_bytes), 0)::numeric)) * 100, 2
    ) AS deduplication_savings_pct
FROM repositories r
LEFT JOIN trees t ON r.repo_id = t.repo_id
LEFT JOIN tree_nodes tn ON t.tree_hash = tn.tree_hash
LEFT JOIN blobs b ON tn.blob_hash = b.blob_hash
GROUP BY r.repo_id, r.repo_name;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dbgit_admin_role') THEN
        CREATE ROLE dbgit_admin_role;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dbgit_contributor_role') THEN
        CREATE ROLE dbgit_contributor_role;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dbgit_viewer_role') THEN
        CREATE ROLE dbgit_viewer_role;
    END IF;
END $$;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dbgit_admin_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON staging_index, branches, repo_head TO dbgit_contributor_role;
GRANT SELECT, INSERT ON blobs, trees, tree_nodes, commits TO dbgit_contributor_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dbgit_viewer_role;

ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS repo_visibility_policy ON repositories;
CREATE POLICY repo_visibility_policy ON repositories
FOR SELECT USING (
    is_private = FALSE
    OR current_setting('app.current_user_id', TRUE) IS NULL
    OR owner_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    OR EXISTS (
        SELECT 1 FROM repo_collaborators rc
        WHERE rc.repo_id = repositories.repo_id
          AND rc.user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    )
);
