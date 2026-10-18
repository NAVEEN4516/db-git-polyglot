-- ============================================================================
-- DB-Git Analytical SQL Queries Reference
-- PostgreSQL 16 + pgvector — Rubric #7 (Joins/Correlated/Recursive) & #9 (pgvector)
-- ============================================================================

-- A. Storage Efficiency View (uses v_repo_storage_efficiency from 02_views_rbac_rls.sql)
SELECT * FROM v_repo_storage_efficiency WHERE repo_id = $1;

-- B. High-Churn Files (JOIN + GROUP BY + HAVING)
--    Identifies files modified across multiple commits, counting distinct authors
--    and reporting maximum blob size per file path.
SELECT tn.file_path, COUNT(DISTINCT c.commit_hash) AS modification_commits,
       COUNT(DISTINCT c.author_id) AS distinct_authors,
       pg_size_pretty(MAX(b.size_bytes)) AS max_file_size
FROM tree_nodes tn
JOIN commits c ON tn.tree_hash = c.tree_hash
JOIN blobs b ON tn.blob_hash = b.blob_hash
WHERE c.repo_id = $1
GROUP BY tn.file_path
HAVING COUNT(DISTINCT c.commit_hash) >= 2
ORDER BY modification_commits DESC;

-- C. Above-Average Contributors (Correlated EXISTS Subquery + Nested AVG)
--    Finds contributors whose commit count is at or above the per-repository average,
--    filtered to only count commits whose tree contains at least one blob > 100 bytes.
SELECT u.username, u.email, rc.access_role, COUNT(c.commit_hash) AS user_commit_count
FROM users u
JOIN repo_collaborators rc ON u.user_id = rc.user_id
JOIN commits c ON u.user_id = c.author_id AND rc.repo_id = c.repo_id
WHERE rc.repo_id = $1
AND EXISTS (
  SELECT 1 FROM tree_nodes tn JOIN blobs b ON tn.blob_hash = b.blob_hash
  WHERE tn.tree_hash = c.tree_hash AND b.size_bytes > 100
)
GROUP BY u.user_id, u.username, u.email, rc.access_role
HAVING COUNT(c.commit_hash) >= (
  SELECT AVG(cnt) FROM (SELECT COUNT(*) AS cnt FROM commits WHERE repo_id = $1 GROUP BY author_id) sub
)
ORDER BY user_commit_count DESC;

-- D. Recursive Commit Lineage & Window Delta CTE (WITH RECURSIVE + LAG())
--    Walks the commit ancestry chain from the branch HEAD up to 50 hops,
--    then computes per-commit tree sizes and byte deltas using the LAG() window function.
WITH RECURSIVE commit_ancestry_cte AS (
  SELECT c.commit_hash, c.parent_commit_hash, c.author_id, c.tree_hash, c.message,
         c.created_at, 0 AS depth
  FROM commits c JOIN branches br ON br.target_commit_hash = c.commit_hash
  WHERE br.repo_id = $1 AND br.branch_name = COALESCE($2, 'main')
  UNION ALL
  SELECT p.commit_hash, p.parent_commit_hash, p.author_id, p.tree_hash, p.message,
         p.created_at, child.depth + 1
  FROM commits p INNER JOIN commit_ancestry_cte child ON p.commit_hash = child.parent_commit_hash
  WHERE child.depth < 50
),
tree_sizes AS (
  SELECT tn.tree_hash, COUNT(tn.file_path) AS files, COALESCE(SUM(b.size_bytes), 0) AS bytes
  FROM tree_nodes tn LEFT JOIN blobs b ON tn.blob_hash = b.blob_hash GROUP BY tn.tree_hash
)
SELECT ca.depth, ca.commit_hash, u.username AS author, ca.message, ts.files, ts.bytes,
       ts.bytes - LAG(ts.bytes, 1, 0) OVER (ORDER BY ca.created_at ASC) AS byte_delta
FROM commit_ancestry_cte ca
JOIN users u ON ca.author_id = u.user_id
LEFT JOIN tree_sizes ts ON ca.tree_hash = ts.tree_hash
ORDER BY ca.depth ASC;

-- E. Hybrid Semantic Vector + Full-Text Search (pgvector <=> + to_tsvector)
--    Combines cosine similarity on 384-d msg_embedding with GIN full-text matching
--    to rank commits by both conceptual relevance and keyword presence.
SELECT commit_hash, message, created_at,
       ROUND((1 - (msg_embedding <=> $2::vector))::numeric, 4) AS cosine_similarity,
       (to_tsvector('english', message) @@ plainto_tsquery('english', $3)) AS fts_match
FROM commits WHERE repo_id = $1
ORDER BY fts_match DESC, msg_embedding <=> $2::vector ASC LIMIT 10;
