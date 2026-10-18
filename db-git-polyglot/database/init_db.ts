import fs from 'fs';
import path from 'path';

// 1. Manually parse .env.local to guarantee environment variables are set before drivers initialize
function loadEnvironmentVariables() {
  const candidateEnvPaths = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), 'db-git-polyglot/.env.local'),
    path.resolve(__dirname, '../.env.local'),
    path.resolve(__dirname, '.env.local'),
  ];

  for (const envPath of candidateEnvPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
      break;
    }
  }
}

loadEnvironmentVariables();

import pool, { query } from '../src/lib/postgres';
import driver, { runCypher } from '../src/lib/neo4j';

export async function initializeDatabase(options: { closeConnections?: boolean } = {}) {
  console.log('================================================================');
  console.log('DB-Git Phase 2 Database Initializer');
  console.log('PostgreSQL 16 (with pgvector) & Neo4j 5');
  console.log('================================================================\n');

  // Resolve directory for SQL/Cypher files
  const baseDbDir = fs.existsSync(path.resolve(__dirname, 'postgres'))
    ? __dirname
    : fs.existsSync(path.resolve(process.cwd(), 'database/postgres'))
    ? path.resolve(process.cwd(), 'database')
    : path.resolve(process.cwd(), 'db-git-polyglot/database');

  const psqlFiles = [
    {
      name: '01_schema_ddl.sql',
      path: path.join(baseDbDir, 'postgres', '01_schema_ddl.sql'),
      description: 'Core 10-table DDL, CHECK constraints & pgvector/HNSW indexes',
    },
    {
      name: '02_views_rbac_rls.sql',
      path: path.join(baseDbDir, 'postgres', '02_views_rbac_rls.sql'),
      description: 'Storage Efficiency View, PostgreSQL Roles, Grants & RLS policies',
    },
    {
      name: '03_triggers_procs.sql',
      path: path.join(baseDbDir, 'postgres', '03_triggers_procs.sql'),
      description: 'Cryptographic Immutability Triggers & fn_create_atomic_commit function',
    },
  ];

  console.log('>>> [1/2] Executing PostgreSQL Initializations...');
  for (const file of psqlFiles) {
    console.log(`\n--> Running: ${file.name} (${file.description})`);
    if (!fs.existsSync(file.path)) {
      throw new Error(`File not found: ${file.path}`);
    }
    const sql = fs.readFileSync(file.path, 'utf-8');
    await query(sql);
    console.log(`✓ Successfully executed ${file.name}`);
  }

  console.log('\n>>> [2/2] Executing Neo4j Constraints & Indexes...');
  const cypherFilePath = path.join(baseDbDir, 'neo4j', '01_constraints_indexes.cypher');
  if (!fs.existsSync(cypherFilePath)) {
    throw new Error(`File not found: ${cypherFilePath}`);
  }
  const cypherContent = fs.readFileSync(cypherFilePath, 'utf-8');

  // Parse individual Cypher statements (split on semicolon, filter comments/whitespace)
  const statements = cypherContent
    .split(';')
    .map((s) =>
      s
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => !line.startsWith('//') && line.length > 0)
        .join(' ')
        .trim()
    )
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    console.log(`\n--> Running Cypher: ${stmt}`);
    await runCypher(stmt);
    console.log(`✓ Cypher statement executed.`);
  }

  console.log('\n================================================================');
  console.log('>>> Verification Auditing...');
  console.log('================================================================');

  // Verify PostgreSQL Tables
  const tableRes = await query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  console.log('\nPostgreSQL Tables Created:');
  tableRes.rows.forEach((r: { table_name: string }) => console.log(`  - ${r.table_name}`));

  // Verify PostgreSQL Views
  const viewRes = await query(`
    SELECT table_name 
    FROM information_schema.views 
    WHERE table_schema = 'public';
  `);
  console.log('\nPostgreSQL Views Created:');
  viewRes.rows.forEach((r: { table_name: string }) => console.log(`  - ${r.table_name}`));

  // Verify PostgreSQL Triggers
  const trigRes = await query(`
    SELECT DISTINCT trigger_name, event_object_table
    FROM information_schema.triggers
    WHERE trigger_schema = 'public';
  `);
  console.log('\nPostgreSQL Immutability Triggers Active:');
  trigRes.rows.forEach((r: { trigger_name: string; event_object_table: string }) =>
    console.log(`  - ${r.trigger_name} ON ${r.event_object_table}`)
  );

  // Verify Stored Function
  const procRes = await query(`
    SELECT routine_name 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' AND routine_name = 'fn_create_atomic_commit';
  `);
  console.log('\nPostgreSQL Stored Functions:');
  procRes.rows.forEach((r: { routine_name: string }) => console.log(`  - ${r.routine_name}()`));

  // Verify Neo4j Constraints
  const neoConstraints = await runCypher('SHOW CONSTRAINTS');
  console.log('\nNeo4j Constraints Active:');
  neoConstraints.forEach((c: any) =>
    console.log(`  - ${c.name} (${c.type} on ${c.labelsOrTypes || c.entityType})`)
  );

  // Verify Neo4j Indexes
  const neoIndexes = await runCypher('SHOW INDEXES');
  console.log('\nNeo4j Indexes Active:');
  neoIndexes.forEach((idx: any) =>
    console.log(`  - ${idx.name} (${idx.type} on ${idx.labelsOrTypes || idx.entityType})`)
  );

  console.log('\n================================================================');
  console.log('✓ Phase 2 Initialization & Verification Complete!');
  console.log('================================================================\n');

  if (options.closeConnections) {
    await pool.end();
    await driver.close();
  }

  return { query, pool, runCypher, driver };
}

const isDirectRun = /(^|[\\/])init_db\.(cjs|mjs|js|ts)$/.test(process.argv[1] || '');
if (isDirectRun) {
  initializeDatabase({ closeConnections: true })
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('\n❌ Database initialization failed:', err);
      process.exit(1);
    });
}
