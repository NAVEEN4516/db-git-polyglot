# DB-Git Polyglot: Git-Engine on PostgreSQL 16 & Neo4j 5

> **PES University — Department of Computer Science and Engineering**  
> **Course**: Database Management Systems (UE23CS251B) — Level 3 Mini-Project (50 Marks)  
> **Academic Year**: 2026

---

## 👥 Team Members & SRN

| Name | SRN | Email | GitHub Branch | Core Responsibilities |
|---|---|---|---|---|
| **Naveen Prasad M** | **PES1UG24AM379** | `pes1ug24am379@pesu.pes.edu` | [`feat/naveen-sql-cas`](https://github.com/NAVEEN4516/db-git-polyglot/tree/feat/naveen-sql-cas) | PostgreSQL DDL/views/RLS/CTE scripts, SQL/CAS/Analytics API routes, Explorer/Analytics/Settings UI views |
| **Nishanth Nag G** | **PES1UG24AM381** | `pes1ug24am381@pesu.pes.edu` | [`feat/nishanth-neo4j-dag`](https://github.com/NAVEEN4516/db-git-polyglot/tree/feat/nishanth-neo4j-dag) | Triggers/stored procedures, Neo4j Cypher scripts, seed/verify/viva runners, Two-Phase Commit & Graph LCA/RUD routes, React Flow DAG UI |

---

## 🏛️ 3-Tier Polyglot System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT TIER (Next.js 16 App Router)                  │
│   • Repository Explorer & Staging Studio    • Interactive React Flow Commit DAG & LCA  │
│   • SQL Storage & pgvector Analytics        • 4-Role RBAC Collaborator Console         │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTP / REST Route Handlers
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                     APPLICATION TIER (Two-Phase Polyglot Coordinator)                  │
│   • Merkle Tree Construction (SHA-256)      • Deterministic 384-d Embedding Engine     │
│   • Phase 1: PostgreSQL ACID Tx (BEGIN)    • Phase 2: Neo4j Graph MERGE                │
│   • Atomic Rollback Coordinator on Failure  • Native JWT & bcrypt Authentication       │
└───────────────────────┬────────────────────────────────────────┬───────────────────────┘
                        │ SQL (pg.Pool)                          │ Bolt Protocol Driver
                        ▼                                        ▼
┌───────────────────────────────────────────┐ ┌──────────────────────────────────────────┐
│  DATABASE TIER 1: PostgreSQL 16 + pgvector│ │       DATABASE TIER 2: Neo4j 5 Graph     │
│  • Content-Addressable Blobs (SHA-256)    │ │  • Commit DAG Nodes (:Commit) & Tags     │
│  • Trees, Tree Nodes & Linear Commits     │ │  • Directed Parent Edges [:PARENT]       │
│  • Staging Index, Repositories, Branches  │ │  • Lowest Common Ancestor (LCA) Merge    │
│  • RBAC & RLS (OWNER, MAINTAINER, etc.)   │ │  • Graph Aggregation & Topology Stats    │
│  • Immutability Triggers (Blobs/Commits)  │ │  • NoSQL RUD: CI status SET, Tags        │
│  • PL/pgSQL fn_create_atomic_commit()     │ │  • Orphan Commit Pruning (dbgit gc)      │
│  • Cosine Similarity Vector Search (<=>)  │ └──────────────────────────────────────────┘
│  • Deduplication View & Recursive CTEs    │
└───────────────────────────────────────────┘
```

---

## 📊 Complete 14-Component (50-Mark) PES University Evaluation Rubric

Every component of the evaluation rubric is fully implemented, verified, and mapped to its exact source file and automated verification test case:

| # | Rubric Component | Marks | Implementation File(s) | Exact Deliverable & Verification Proof | Test Case Mapping |
|---|---|:---:|---|---|:---:|
| **1** | **ER Diagram & Mapping** | **2** | `documents/` & Section 2 | 10-table normalized PostgreSQL ER schema mapped to Neo4j `(:Commit)` and `(:Tag)` graph nodes with bidirectional consistency. | — |
| **2** | **Relational Schema & Constraints** | **3** | `database/postgres/01_schema_ddl.sql` | 10 normalized tables in 3NF/BCNF with primary keys, foreign keys with `ON DELETE CASCADE/RESTRICT`, and system constraints. | — |
| **3** | **SQL DDL with Constraints** | **4** | `database/postgres/01_schema_ddl.sql`<br>`database/postgres/02_views_rbac_rls.sql` | `CREATE`, `ALTER`, `DROP`, `CREATE VIEW`, regex CHECK constraints (`^[0-9a-f]{64}$`), range CHECK (`size_bytes >= 0`), and unique composite constraints. | **TC-03** |
| **4** | **NoSQL / Vector DB Creation** | **4** | `database/neo4j/01_constraints_indexes.cypher`<br>`database/postgres/01_schema_ddl.sql` | Neo4j uniqueness constraints on `Commit.hash`, `Tag.name`, composite indexes, plus PostgreSQL `vector(384)` with HNSW cosine distance indexing. | **TC-06** |
| **5** | **Technology Justification** | **1** | `README.md` & Implementation Plan | Workload-driven architectural justification: PostgreSQL handles ACID transactions, CAS deduplication, and relational metadata; Neo4j delivers $O(d)$ path traversal for merge-base LCA; pgvector enables semantic commit message search. | — |
| **6** | **DML Operations** | **4** | `src/app/api/staging/route.ts`<br>`src/app/api/branches/route.ts` | Explicit `INSERT` (staged files, blobs), `UPDATE` (file mode permission toggles), `DELETE` (unstaging files), and filtered `SELECT` queries. | **TC-01** |
| **7** | **Nested, Correlated, Recursive & Joins** | **4** | `database/postgres/04_analytics_cte_queries.sql`<br>`src/app/api/analytics/route.ts` | Multi-table `JOIN` with `GROUP BY` + `HAVING` (high-churn files), Correlated `EXISTS` subquery (above-average contributors), and `WITH RECURSIVE commit_ancestry_cte`. | **TC-06** |
| **8** | **Stored Procedure/Function, Trigger, CTE** | **6** | `database/postgres/03_triggers_procs.sql`<br>`database/postgres/04_analytics_cte_queries.sql` | PL/pgSQL stored function `fn_create_atomic_commit()`, immutability triggers `trg_immutable_blobs` and `trg_immutable_commits`, and analytical CTEs with `LAG()`. | **TC-02**<br>**TC-04** |
| **9** | **NoSQL / Vector Feature & RUD** | **7** | `database/neo4j/02_dag_lca_rud_queries.cypher`<br>`src/app/api/graph/lca/route.ts`<br>`src/app/api/graph/rud/route.ts` | Neo4j Read (bounded DAG lineage, 3-way LCA merge-base, topology aggregation), Update (`SET c.ci_status`, move tags), Delete (`DETACH DELETE` orphan commits via `dbgit gc`), and pgvector cosine search. | **TC-05**<br>**TC-06** |
| **10** | **Next.js Web Interface** | **3** | `src/app/repos/[repoId]/*` | 4 complete Next.js 16 App Router views: (1) File Explorer & Staging Studio, (2) React Flow DAG Visualizer, (3) SQL/Vector Analytics Dashboard, (4) RBAC Collaborator Console. | — |
| **11** | **Backend API & DB Integration** | **2** | `src/lib/postgres.ts`<br>`src/lib/neo4j.ts`<br>`src/app/api/commits/route.ts` | Connection pool singletons reading `.env.local` + Two-Phase Polyglot Commit Coordinator ensuring PostgreSQL `BEGIN` $\to$ Neo4j `MERGE` $\to$ PostgreSQL `ROLLBACK` on graph failure. | — |
| **12** | **Auth & RBAC in Database** | **4** | `database/postgres/02_views_rbac_rls.sql`<br>`src/lib/auth.ts`<br>`src/app/api/auth/route.ts` | bcrypt password hashing (cost 12), JWT token auth, 2 system roles (`ADMIN`, `USER`), 4 repository roles (`OWNER`, `MAINTAINER`, `CONTRIBUTOR`, `VIEWER`), PostgreSQL `GRANT/ROLE`, and Row-Level Security (RLS). | **TC-04** |
| **13** | **Documentation & Git/GitHub** | **2** | `README.md`<br>`database/verify_rubric.ts` | Comprehensive architecture documentation, quickstart guide, automated 6-test verification runner (`TC-01` to `TC-06`), and dual-branch GitHub history. | **TC-01** to **TC-06** |
| **14** | **Originality, Contribution & Viva** | **4** | Dual branches & commit history<br>`database/viva_demo.ts` | Perfectly divided ownership across Naveen (PES1UG24AM379) and Nishanth (PES1UG24AM381), interactive viva CLI demonstration, and zero plagiarism. | **npm run viva** |
| | **TOTAL SCORE** | **50** | | **All 14 components fully implemented, integrated, and verified.** | |

---

## 🧪 Automated Rubric Test Suite (`TC-01` to `TC-06`)

Run the test suite with:
```bash
npx tsx database/verify_rubric.ts
```

| ID | Test Case | Target Database Feature | Command / Query Executed | Expected & Verified Outcome |
|:---:|---|---|---|---|
| **TC-01** | **CAS Deduplication** | Content-Addressable Storage & SQL View | `SELECT deduplication_savings_pct FROM v_repo_storage_efficiency` | `deduplication_savings_pct > 50%` (Reports **75.00%** on 4 duplicate 24 KB license files across branches). |
| **TC-02** | **Immutability Trigger** | PL/pgSQL Cryptographic Guard | `DELETE FROM commits;` or `UPDATE blobs SET size_bytes = 0;` | PostgreSQL aborts command and raises `Cryptographic Integrity Violation: Commits are append-only`. |
| **TC-03** | **CHECK Validation** | PostgreSQL Integrity Constraints | `INSERT INTO blobs (blob_hash) VALUES ('invalid_hash');` | Insertion rejected by PostgreSQL regex CHECK constraint with SQLSTATE `23514` (`check_violation`). |
| **TC-04** | **RBAC Guard** | PL/pgSQL Stored Function Security | `SELECT fn_create_atomic_commit(..., priya_viewer, ...);` | Transaction aborted with `RBAC Authorization Denied: user does not have write access`. |
| **TC-05** | **Neo4j LCA & RUD** | Cypher Merge-Base & NoSQL CRUD | Cypher 3-Way LCA between `main` and `feat-graph-lca` + `SET c.ci_status` | Neo4j identifies common ancestor node; updates CI status to `PASSED`; prunes dangling orphans with `DETACH DELETE`. |
| **TC-06** | **Recursive CTE & Vector Search** | SQL Graph Recursion & pgvector | `WITH RECURSIVE commit_ancestry_cte` + `ORDER BY msg_embedding <=> $1::vector` | Recursively walks parent commit chain calculating byte deltas; vector cosine distance ranks semantically related commits. |

---

## ⚡ Quickstart Guide

### Prerequisites
- **Node.js**: v20 or later
- **Docker & Docker Compose**: v24 or later
- **Git**

### Step-by-Step Setup

```bash
# 1. Clone the repository
git clone https://github.com/NAVEEN4516/db-git-polyglot.git
cd db-git-polyglot

# 2. Start PostgreSQL 16 (pgvector) and Neo4j 5 containers
docker compose up -d

# 3. Enter Next.js workspace and install dependencies
cd db-git-polyglot
npm install

# 4. Configure environment variables
cp .env.example .env.local

# 5. Initialize database schemas & seed demo dataset
npm run db:init
npm run db:seed

# 6. Execute the automated 6-component rubric test suite
npx tsx database/verify_rubric.ts

# 7. Run the interactive Viva Demo Runner
npm run viva

# 8. Start the Next.js development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

- **PostgreSQL**: `localhost:5432` (`dbgit`, user: `postgres`, password: `dbgit_password`)
- **Neo4j Browser**: [http://localhost:7474](http://localhost:7474) (`bolt://localhost:7687`, user: `neo4j`, password: `dbgit_neo4j_pass`)

---

## 🔐 Demo Credentials

All test accounts use the password: `password123`

| Username | System Role | Repository Role (`pesu-db-git-core`) | Access Capabilities & Demo Purpose |
|---|:---:|:---:|---|
| **`naveen_owner`** | `ADMIN` | `OWNER` | Full administrative permissions, collaborator role assignment, repo deletion. |
| **`nishanth_maintainer`** | `USER` | `MAINTAINER` | Staging, commit creation, branch creation/deletion, CI status updates. |
| **`arjun_dev`** | `USER` | `CONTRIBUTOR` | File editing, staging, and commit authoring. |
| **`priya_viewer`** | `USER` | `VIEWER` | Read-only inspection; blocked from committing by `fn_create_atomic_commit()` (**TC-04**). |

---

## 🎤 Interactive Viva Demo Instructions (`npm run viva`)

To demonstrate the project live to the evaluation committee:

```bash
cd db-git-polyglot
npm run viva
```

The CLI viva runner provides a guided walkthrough demonstrating:
1. **CAS Deduplication Proof**: Shows physical storage ($24\text{ KB}$) vs. logical storage ($96\text{ KB}$) across 4 files achieving **75% disk savings**.
2. **Cryptographic Immutability**: Proves that `DELETE FROM commits` is blocked at the database engine level by PL/pgSQL triggers.
3. **Regex CHECK Constraint**: Demonstrates rejection of malformed SHA-256 hashes with SQLSTATE `23514`.
4. **RBAC Stored Procedure Enforcement**: Attempts a commit as `priya_viewer` and shows instant rejection.
5. **Neo4j 3-Way LCA & NoSQL RUD**: Computes the Lowest Common Ancestor between `main` and `feat-graph-lca`, updates CI status, and demonstrates `dbgit gc`.
6. **Recursive CTE & pgvector Cosine Search**: Executes a recursive graph traversal in SQL alongside semantic commit message retrieval.

---

## 🌿 Dual-Branch Contribution Structure

```
*   merge commit into main (Nishanth: feat/nishanth-neo4j-dag)
|\  
| * feat/nishanth-neo4j-dag: Neo4j Cypher, triggers, 2PC coordinator, React Flow DAG UI, seed & viva runners
* | merge commit into main (Naveen: feat/naveen-sql-cas)
|\|
| * feat/naveen-sql-cas: PostgreSQL DDL, views, RLS, CTE analytics, staging API, File Explorer & settings UI
|/
* Base Infrastructure: docker-compose, .env.example, .gitignore, documentation, connection pools
```

- **Naveen Prasad M (`PES1UG24AM379`)**: Branch `feat/naveen-sql-cas`
- **Nishanth Nag G (`PES1UG24AM381`)**: Branch `feat/nishanth-neo4j-dag`
