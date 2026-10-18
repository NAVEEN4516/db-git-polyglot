CREATE CONSTRAINT commit_hash_unique IF NOT EXISTS FOR (c:Commit) REQUIRE c.hash IS UNIQUE;
CREATE CONSTRAINT tag_repo_unique IF NOT EXISTS FOR (t:Tag) REQUIRE (t.repo_id, t.name) IS UNIQUE;
CREATE INDEX commit_repo_idx IF NOT EXISTS FOR (c:Commit) ON (c.repo_id, c.timestamp);
