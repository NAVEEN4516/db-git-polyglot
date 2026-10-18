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
