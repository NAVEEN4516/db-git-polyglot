// ============================================================================
// DB-Git Neo4j Cypher Query Reference — DAG Operations, LCA Merge-Base & RUD
// Neo4j 5 — Rubric #4 (NoSQL DB), #9 (NoSQL RUD), #8 (Procedure/Trigger/CTE)
// ============================================================================

// A. CONSTRAINTS & INDEXES (from 01_constraints_indexes.cypher — run once)
CREATE CONSTRAINT commit_hash_unique IF NOT EXISTS FOR (c:Commit) REQUIRE c.hash IS UNIQUE;
CREATE CONSTRAINT tag_repo_unique IF NOT EXISTS FOR (t:Tag) REQUIRE (t.repo_id, t.name) IS UNIQUE;
CREATE INDEX commit_repo_idx IF NOT EXISTS FOR (c:Commit) ON (c.repo_id, c.timestamp);

// B. CREATE COMMIT & PARENT EDGES (Called inside Two-Phase Polyglot Commit)
MERGE (c:Commit {hash: $commit_hash})
ON CREATE SET c.repo_id = $repo_id, c.author_id = $author_id, c.message = $message,
              c.ci_status = 'PENDING', c.timestamp = $timestamp
WITH c
UNWIND $parent_hashes AS p_hash
MATCH (parent:Commit {hash: p_hash})
MERGE (c)-[:PARENT]->(parent);

// C. READ 1: BOUNDED DAG LINEAGE FOR NEXT.JS GRAPH CANVAS
MATCH (c:Commit {repo_id: $repo_id})
OPTIONAL MATCH (c)-[:PARENT]->(p:Commit)
OPTIONAL MATCH (t:Tag {repo_id: $repo_id})-[:TARGETS]->(c)
RETURN c.hash AS hash, c.message AS message, c.ci_status AS ci_status, c.timestamp AS timestamp,
       collect(DISTINCT p.hash) AS parents, collect(DISTINCT t.name) AS tags
ORDER BY c.timestamp DESC LIMIT 200;

// D. READ 2: SAFE LOWEST COMMON ANCESTOR (LCA) FOR 3-WAY MERGE BASE
MATCH p1 = (b1:Commit {hash: $branch_a_head})-[:PARENT*0..100]->(lca:Commit),
      p2 = (b2:Commit {hash: $branch_b_head})-[:PARENT*0..100]->(lca)
WITH lca, (length(p1) + length(p2)) AS total_distance, length(p1) AS dist_a, length(p2) AS dist_b
ORDER BY total_distance ASC
RETURN lca.hash AS merge_base_hash, lca.message AS merge_base_message, dist_a, dist_b LIMIT 1;

// E. READ 3: NOSQL GRAPH AGGREGATION (ROOT vs. STANDARD vs. MERGE COMMITS)
MATCH (c:Commit {repo_id: $repo_id})
OPTIONAL MATCH (c)-[r:PARENT]->(p:Commit)
WITH c, COUNT(r) AS parent_count
RETURN CASE WHEN parent_count > 1 THEN 'Merge Commit'
            WHEN parent_count = 1 THEN 'Standard Commit'
            ELSE 'Root Commit' END AS commit_type,
       COUNT(c) AS total_commits
ORDER BY total_commits DESC;

// F. UPDATE (SET): UPDATE CI STATUS OR CREATE/MOVE RELEASE TAG
MATCH (c:Commit {hash: $commit_hash, repo_id: $repo_id})
SET c.ci_status = $new_ci_status, c.verified_at = timestamp()
RETURN c.hash AS hash, c.ci_status AS ci_status;

MERGE (t:Tag {repo_id: $repo_id, name: $tag_name})
WITH t
OPTIONAL MATCH (t)-[old_rel:TARGETS]->(:Commit)
DELETE old_rel
WITH t
MATCH (target:Commit {hash: $target_commit_hash, repo_id: $repo_id})
CREATE (t)-[:TARGETS {updated_at: timestamp()}]->(target)
SET t.updated_at = timestamp()
RETURN t.name AS tag, target.hash AS target_hash;

// G. DELETE (DETACH DELETE): GARBAGE COLLECTION (dbgit gc) OF ORPHAN COMMITS
MATCH (c:Commit {repo_id: $repo_id})
WHERE NOT EXISTS {
    MATCH (head:Commit {repo_id: $repo_id})-[:PARENT*0..100]->(c)
    WHERE head.hash IN $active_branch_head_hashes
}
DETACH DELETE c
RETURN COUNT(c) AS pruned_orphan_commits;
