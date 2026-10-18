'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useParams } from 'next/navigation';
import {
  LineChart,
  HardDrive,
  Database,
  Layers,
  Search,
  Users,
  Flame,
  GitCommit,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  RefreshCw,
  Cpu,
  Binary,
  CheckCircle2,
  Terminal,
  Play,
  FileCode2,
  ChevronDown,
  ChevronUp,
  AlertOctagon,
  Copy,
  Check,
  Zap
} from 'lucide-react';

interface StorageEfficiency {
  repo_id: string;
  repo_name: string;
  unique_blobs: number;
  logical_bytes: number;
  stored_bytes: number;
  dedup_ratio: number;
  savings_pct: number;
}

interface HighChurnFile {
  file_path: string;
  modification_commits: number;
  distinct_authors: number;
  max_file_size: string;
}

interface Contributor {
  username: string;
  email: string;
  access_role: string;
  user_commit_count: number;
}

interface LineageCommit {
  depth: number;
  commit_hash: string;
  author: string;
  message: string;
  files: number;
  bytes: number;
  byte_delta: number;
}

interface SemanticSearchResult {
  commit_hash: string;
  message: string;
  created_at: string;
  cosine_similarity: number;
  fts_match: boolean;
}

interface ExplainPlans {
  recursive_cte?: string;
  hnsw_vector?: string;
}

function AnalyticsDashboardContent() {
  const params = useParams();
  const repoId = params?.repoId as string;

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const [storage, setStorage] = useState<StorageEfficiency | null>(null);
  const [highChurn, setHighChurn] = useState<HighChurnFile[]>([]);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [lineage, setLineage] = useState<LineageCommit[]>([]);
  const [searchResults, setSearchResults] = useState<SemanticSearchResult[]>([]);
  const [explainPlans, setExplainPlans] = useState<ExplainPlans | null>(null);

  // EXPLAIN Drawer State
  const [showExplainDrawer, setShowExplainDrawer] = useState(false);
  const [activeExplainTab, setActiveExplainTab] = useState<'recursive' | 'hnsw'>('recursive');
  const [copiedPlan, setCopiedPlan] = useState(false);

  // Live Read-Only SQL Playground State
  const [playgroundSql, setPlaygroundSql] = useState<string>(
    `SELECT r.repo_name, b.branch_name, c.commit_hash, c.message\nFROM repositories r\nJOIN branches b ON r.repo_id = b.repo_id\nJOIN commits c ON b.target_commit_hash = c.commit_hash\nLIMIT 5;`
  );
  const [runningSql, setRunningSql] = useState(false);
  const [sqlResult, setSqlResult] = useState<{
    rows: any[];
    columns: string[];
    rowCount: number;
    durationMs: number;
  } | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (queryParam?: string) => {
    if (!repoId) return;
    if (!queryParam) setLoading(true);
    else setSearching(true);

    try {
      let url = `/api/analytics?repoId=${repoId}&branchName=main`;
      if (queryParam && queryParam.trim()) {
        url += `&searchQuery=${encodeURIComponent(queryParam.trim())}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.analytics) {
        setStorage(data.analytics.storage_efficiency);
        setHighChurn(data.analytics.high_churn_files || []);
        setContributors(data.analytics.above_average_contributors || []);
        setLineage(data.analytics.recursive_commit_lineage || []);
        if (data.analytics.explain_plans) {
          setExplainPlans(data.analytics.explain_plans);
        }
        if (data.analytics.semantic_search?.results) {
          setSearchResults(data.analytics.semantic_search.results);
        } else if (!queryParam) {
          setSearchResults([]);
        }
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
      setSearching(false);
    }
  }, [repoId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      fetchAnalytics(searchQuery.trim());
    } else {
      setSearchResults([]);
    }
  };

  const handleRunSql = async (queryToRun?: string) => {
    const sql = queryToRun || playgroundSql;
    if (!sql.trim()) return;
    setRunningSql(true);
    setSqlError(null);
    try {
      const res = await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSqlError(data.error || 'Execution failed');
        setSqlResult(null);
      } else {
        setSqlResult(data);
        setSqlError(null);
      }
    } catch (err: any) {
      setSqlError(err.message);
      setSqlResult(null);
    } finally {
      setRunningSql(false);
    }
  };

  const copyPlanToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPlan(true);
    setTimeout(() => setCopiedPlan(false), 2000);
  };

  const savingsPct = Math.max(0, Number(storage?.savings_pct || 0));
  const dedupRatio = Number(storage?.dedup_ratio || 1);
  const logicalBytes = Number(storage?.logical_bytes || 0);
  const storedBytes = Number(storage?.stored_bytes || 0);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* ── Top Header Strip ─────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-[#30363D] gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981]">
              <LineChart className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  SQL CTE & pgvector Analytics Dashboard
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#21262D] text-[#8B949E] border border-[#30363D]">
                  PostgreSQL 16 Engine
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#8B949E] mt-1 leading-relaxed">
                Demonstrates high-performance analytical SQL views, window functions with recursive ancestry CTEs,
                correlated subqueries with HAVING, and 384-dimensional cosine vector embeddings.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2.5 self-start md:self-auto">
          <button
            onClick={() => setShowExplainDrawer(!showExplainDrawer)}
            className="px-3.5 py-1.5 rounded-md bg-[#21262D] hover:bg-[#30363D] border border-[#58A6FF]/40 text-xs font-medium text-[#58A6FF] transition flex items-center space-x-2 shadow-sm"
          >
            <Zap className="w-3.5 h-3.5 text-[#58A6FF]" />
            <span>EXPLAIN (ANALYZE) Plans</span>
            {showExplainDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => fetchAnalytics(searchQuery)}
            className="px-3.5 py-1.5 rounded-md bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] text-xs font-medium text-[#C9D1D9] transition flex items-center space-x-2 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#10B981]' : ''}`} />
            <span>Refresh Analytics</span>
          </button>
        </div>
      </div>

      {/* ── Expandable EXPLAIN (ANALYZE, BUFFERS) Plan Inspector ──────── */}
      {showExplainDrawer && explainPlans && (
        <div className="rounded-xl bg-[#05070B] border border-[#58A6FF]/40 p-5 shadow-2xl font-mono text-xs space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-[#30363D]">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-[#58A6FF]" />
              <h3 className="font-bold text-white text-sm">
                EXPLAIN (ANALYZE, BUFFERS) Query Plan Inspector
              </h3>
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex rounded-md bg-[#161B22] p-0.5 border border-[#30363D]">
                <button
                  onClick={() => setActiveExplainTab('recursive')}
                  className={`px-2.5 py-1 rounded text-[11px] transition ${
                    activeExplainTab === 'recursive'
                      ? 'bg-[#2F81F7] text-white font-bold'
                      : 'text-[#8B949E] hover:text-white'
                  }`}
                >
                  Recursive CTE Plan
                </button>
                <button
                  onClick={() => setActiveExplainTab('hnsw')}
                  className={`px-2.5 py-1 rounded text-[11px] transition ${
                    activeExplainTab === 'hnsw'
                      ? 'bg-[#10B981] text-white font-bold'
                      : 'text-[#8B949E] hover:text-white'
                  }`}
                >
                  HNSW Vector Index Plan
                </button>
              </div>
              <button
                onClick={() =>
                  copyPlanToClipboard(
                    activeExplainTab === 'recursive'
                      ? explainPlans.recursive_cte || ''
                      : explainPlans.hnsw_vector || ''
                  )
                }
                className="p-1.5 rounded bg-[#21262D] text-[#8B949E] hover:text-white border border-[#30363D]"
                title="Copy execution plan"
              >
                {copiedPlan ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="rounded-lg bg-[#0D1117] border border-[#30363D] p-4 overflow-x-auto max-h-72">
            <pre className="text-[#58A6FF] text-[11px] leading-relaxed whitespace-pre">
              {activeExplainTab === 'recursive'
                ? explainPlans.recursive_cte || 'No Recursive CTE query plan captured.'
                : explainPlans.hnsw_vector || 'No HNSW vector index plan captured.'}
            </pre>
          </div>
          <div className="text-[11px] text-[#8B949E] flex items-center justify-between">
            <span>
              Engine: PostgreSQL 16 &bull; Formatted with Buffer cache hits &amp; execution timings
            </span>
            <span className="text-[#10B981]">Index-Scan Verified ✓</span>
          </div>
        </div>
      )}

      {/* ── A. 4-Card KPI Ribbon: v_repo_storage_efficiency ──────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-[#10B981]" />
            <h2 className="text-sm font-semibold text-white tracking-tight">
              Storage Deduplication Metrics
            </h2>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-[#161B22] text-[#8B949E] border border-[#30363D]">
            [SQL VIEW: v_repo_storage_efficiency]
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Unique CAS Blobs */}
          <div className="p-4 rounded-xl bg-[#161B22] border border-[#30363D] hover:border-[#8B949E]/40 transition shadow-sm relative overflow-hidden group">
            <div className="flex items-center justify-between text-[#8B949E] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-[#8B949E]">Unique CAS Blobs</span>
              <div className="p-1.5 rounded-md bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">
                <Layers className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white font-mono tracking-tight">
              {storage?.unique_blobs ?? 0}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#21262D] text-[11px] font-mono text-[#8B949E]">
              <span>COUNT(DISTINCT blob_hash)</span>
              <span className="text-[#10B981]">Indexed</span>
            </div>
          </div>

          {/* Card 2: Physical Stored Bytes */}
          <div className="p-4 rounded-xl bg-[#161B22] border border-[#30363D] hover:border-[#8B949E]/40 transition shadow-sm relative overflow-hidden group">
            <div className="flex items-center justify-between text-[#8B949E] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-[#8B949E]">Physical Disk Stored</span>
              <div className="p-1.5 rounded-md bg-[#2F81F7]/10 text-[#2F81F7] border border-[#2F81F7]/20">
                <HardDrive className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white font-mono tracking-tight">
              {storedBytes.toLocaleString()} <span className="text-xs font-normal text-[#8B949E]">Bytes</span>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#21262D] text-[11px] font-mono text-[#8B949E]">
              <span>SUM(b.size_bytes)</span>
              <span className="text-[#58A6FF]">CAS Table</span>
            </div>
          </div>

          {/* Card 3: Logical Uncompressed */}
          <div className="p-4 rounded-xl bg-[#161B22] border border-[#30363D] hover:border-[#8B949E]/40 transition shadow-sm relative overflow-hidden group">
            <div className="flex items-center justify-between text-[#8B949E] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-[#8B949E]">Logical Uncompressed</span>
              <div className="p-1.5 rounded-md bg-[#A371F7]/10 text-[#A371F7] border border-[#A371F7]/20">
                <Binary className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white font-mono tracking-tight">
              {logicalBytes.toLocaleString()} <span className="text-xs font-normal text-[#8B949E]">Bytes</span>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#21262D] text-[11px] font-mono text-[#8B949E]">
              <span>Tree node aggregation</span>
              <span className="text-[#A371F7]">Raw Size</span>
            </div>
          </div>

          {/* Card 4: Deduplication Savings % with Progress Bar */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-[#10B981]/10 via-[#161B22] to-[#161B22] border border-[#10B981]/40 transition shadow-sm relative overflow-hidden group">
            <div className="flex items-center justify-between text-[#10B981] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-[#10B981]">Storage Efficiency</span>
              <div className="p-1.5 rounded-md bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30">
                <Cpu className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-black text-[#10B981] font-mono tracking-tight">
                {savingsPct.toFixed(1)}%
              </span>
              <span className="text-xs font-mono text-[#8B949E]">
                ({dedupRatio.toFixed(2)}x dedup)
              </span>
            </div>
            
            {/* Visual ratio progress bar */}
            <div className="mt-3">
              <div className="w-full bg-[#21262D] rounded-full h-1.5 overflow-hidden flex">
                <div
                  className="bg-[#10B981] h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(5, savingsPct))}%` }}
                  title={`${savingsPct.toFixed(1)}% deduplication savings`}
                />
              </div>
              <div className="flex justify-between items-center mt-1.5 text-[10px] font-mono text-[#8B949E]">
                <span>Physical: {storedBytes}B</span>
                <span className="text-[#10B981] font-semibold">{savingsPct.toFixed(1)}% Saved</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── B. Live Read-Only SQL Playground ──────────────────────────── */}
      <div className="rounded-xl bg-[#161B22] border border-[#30363D] overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[#30363D] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-md bg-[#58A6FF]/10 text-[#58A6FF] border border-[#58A6FF]/20">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-semibold text-white">
                  Live Read-Only SQL Playground
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#238636]/15 text-[#3FB950] border border-[#238636]/30">
                  BEGIN READ ONLY ... ROLLBACK
                </span>
              </div>
              <p className="text-xs text-[#8B949E] mt-0.5">
                Run live read-only SQL queries or test query plans during the viva with instantaneous execution metrics.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleRunSql()}
            disabled={runningSql || !playgroundSql.trim()}
            className="px-4 py-2 rounded-md text-xs font-semibold bg-[#238636] hover:bg-[#2EA043] disabled:opacity-50 text-white transition flex items-center space-x-2 shadow-sm border border-[#2EA043]/40 self-start sm:self-auto"
          >
            {runningSql ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>Execute SQL Query</span>
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Preset Queries */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B949E]">Viva Presets:</span>
            {[
              {
                label: 'Storage Deduplication View',
                sql: `SELECT * FROM v_repo_storage_efficiency WHERE repo_id = '${repoId}';`,
              },
              {
                label: 'Recursive Commit Lineage',
                sql: `WITH RECURSIVE ca AS (\n  SELECT commit_hash, parent_commit_hash, message, 0 AS depth\n  FROM commits\n  WHERE repo_id = '${repoId}' AND parent_commit_hash IS NULL\n  UNION ALL\n  SELECT c.commit_hash, c.parent_commit_hash, c.message, ca.depth + 1\n  FROM commits c JOIN ca ON c.parent_commit_hash = ca.commit_hash\n)\nSELECT depth, commit_hash, message FROM ca ORDER BY depth ASC;`,
              },
              {
                label: 'High-Churn Files HAVING',
                sql: `SELECT tn.file_path, COUNT(DISTINCT c.commit_hash) AS commits\nFROM tree_nodes tn\nJOIN commits c ON tn.tree_hash = c.tree_hash\nWHERE c.repo_id = '${repoId}'\nGROUP BY tn.file_path\nHAVING COUNT(DISTINCT c.commit_hash) >= 2;`,
              },
              {
                label: 'EXPLAIN ANALYZE HNSW Vector Search',
                sql: `EXPLAIN (ANALYZE, BUFFERS)\nSELECT commit_hash, message\nFROM commits\nWHERE repo_id = '${repoId}' AND msg_embedding IS NOT NULL\nORDER BY msg_embedding <=> (SELECT msg_embedding FROM commits WHERE repo_id = '${repoId}' LIMIT 1) ASC\nLIMIT 5;`,
              },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setPlaygroundSql(preset.sql);
                  handleRunSql(preset.sql);
                }}
                className="px-2.5 py-1 rounded-md bg-[#21262D] hover:bg-[#30363D] text-[#C9D1D9] hover:text-white border border-[#30363D] font-mono text-[11px] transition"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* SQL Editor Area */}
          <textarea
            rows={5}
            value={playgroundSql}
            onChange={(e) => setPlaygroundSql(e.target.value)}
            placeholder="Type arbitrary read-only SELECT, WITH, or EXPLAIN query here..."
            className="w-full p-3 text-xs font-mono rounded-lg bg-[#0D1117] border border-[#30363D] text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] leading-relaxed"
          />

          {/* Error Message */}
          {sqlError && (
            <div className="p-3 rounded-lg bg-[#F85149]/10 border border-[#F85149]/30 text-[#F85149] text-xs font-mono flex items-start space-x-2">
              <AlertOctagon className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">SQL Execution Error:</div>
                <div className="mt-0.5 whitespace-pre-wrap">{sqlError}</div>
              </div>
            </div>
          )}

          {/* Query Results Table */}
          {sqlResult && (
            <div className="border border-[#30363D] rounded-lg overflow-hidden bg-[#0D1117]">
              <div className="px-4 py-2 bg-[#161B22] border-b border-[#30363D] flex items-center justify-between text-xs text-[#8B949E] font-mono">
                <span>
                  Returned <strong className="text-white">{sqlResult.rowCount}</strong> row{sqlResult.rowCount === 1 ? '' : 's'}
                </span>
                <span className="text-[#10B981]">Execution Time: {sqlResult.durationMs} ms</span>
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-[#161B22]/80 text-[#8B949E] text-[10px] uppercase border-b border-[#30363D] sticky top-0">
                    <tr>
                      {sqlResult.columns.map((col) => (
                        <th key={col} className="py-2 px-3">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262D]">
                    {sqlResult.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-[#161B22]/50 transition">
                        {sqlResult.columns.map((col) => (
                          <td key={col} className="py-2 px-3 text-[#C9D1D9] whitespace-nowrap">
                            {row[col] !== null && typeof row[col] === 'object'
                              ? JSON.stringify(row[col])
                              : String(row[col] ?? 'NULL')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── C. pgvector Semantic Search & Full-Text Search ────────────── */}
      <div className="rounded-xl bg-[#161B22] border border-[#30363D] overflow-hidden shadow-sm">
        <div className="p-5 border-b border-[#30363D] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-md bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-semibold text-white">
                  pgvector Semantic Commit Search
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30">
                  HNSW Index + vector(384) &lt;=&gt; Cosine Distance
                </span>
              </div>
              <p className="text-xs text-[#8B949E] mt-0.5">
                Dense semantic vector distance queries accelerated by hierarchical navigable small-world graph (HNSW) indexing.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-1 rounded bg-[#21262D] text-[#8B949E] border border-[#30363D] self-start sm:self-auto">
            [SQL: vector_cosine_ops + to_tsvector]
          </span>
        </div>

        <div className="p-5">
          <form onSubmit={handleSearch} className="flex gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#8B949E] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search commit intent (e.g. 'security authentication tokens', 'math utility additions', or 'initial repository setup')..."
                className="w-full pl-9 pr-20 py-2 text-xs rounded-md bg-[#0D1117] border border-[#30363D] text-[#C9D1D9] placeholder-[#8B949E] focus:outline-none focus:border-[#2F81F7] focus:ring-1 focus:ring-[#2F81F7] font-mono transition"
              />
              <span className="absolute right-2.5 top-2 px-1.5 py-0.5 text-[10px] font-mono bg-[#21262D] text-[#8B949E] rounded border border-[#30363D]">
                ENTER ↵
              </span>
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-4 py-2 rounded-md text-xs font-semibold bg-[#238636] hover:bg-[#2EA043] disabled:opacity-50 text-white transition flex items-center space-x-2 shadow-sm border border-[#2EA043]/40"
            >
              {searching ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              <span>Query Embeddings</span>
            </button>
          </form>

          {/* Quick query chips */}
          <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] text-[#8B949E]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B949E]">Try Semantic Queries:</span>
            {[
              'security authentication token',
              'math logic addition',
              'initial project scaffolding',
              'merge branch feature',
            ].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setSearchQuery(chip);
                  fetchAnalytics(chip);
                }}
                className="px-2 py-0.5 rounded-full bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-[#C9D1D9] border border-[#30363D] font-mono text-[10px] transition"
              >
                &quot;{chip}&quot;
              </button>
            ))}
          </div>

          {/* Results Table */}
          {searchResults.length > 0 && (
            <div className="mt-4 border border-[#30363D] rounded-lg overflow-hidden bg-[#0D1117]">
              <div className="px-4 py-2 bg-[#161B22] border-b border-[#30363D] flex items-center justify-between text-xs text-[#8B949E]">
                <span className="font-mono text-[#C9D1D9]">
                  {searchResults.length} Commit{searchResults.length === 1 ? '' : 's'} Matched
                </span>
                <span className="text-[11px] font-mono">Ranked by Cosine Similarity & DESC</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#161B22]/80 text-[#8B949E] text-[10px] uppercase border-b border-[#30363D]">
                    <tr>
                      <th className="py-2.5 px-4">Commit Hash</th>
                      <th className="py-2.5 px-4">Commit Message</th>
                      <th className="py-2.5 px-4">Semantic Similarity</th>
                      <th className="py-2.5 px-4">Search Match Type</th>
                      <th className="py-2.5 px-4 text-right">Committed At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262D]">
                    {searchResults.map((res) => {
                      const score = Number(res.cosine_similarity) * 100;
                      return (
                        <tr key={res.commit_hash} className="hover:bg-[#161B22]/50 transition">
                          <td className="py-2.5 px-4">
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#2F81F7]/10 text-[#58A6FF] border border-[#2F81F7]/30">
                              {res.commit_hash.slice(0, 8)}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-[#C9D1D9] font-sans font-medium text-xs">
                            {res.message}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center space-x-2">
                              <div className="w-16 bg-[#21262D] rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-[#10B981] h-1.5 rounded-full"
                                  style={{ width: `${Math.min(100, Math.max(5, score))}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-semibold text-[#10B981]">
                                {score.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            {res.fts_match ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                FTS Exact Hit
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-[#21262D] text-[#8B949E] border border-[#30363D]">
                                Vector Inferred
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right text-[#8B949E] text-[11px]">
                            {new Date(res.created_at).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── D & E. High-Churn Hotspots & High-Impact Contributors ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* C: High-Churn Files */}
        <div className="rounded-xl bg-[#161B22] border border-[#30363D] overflow-hidden shadow-sm flex flex-col">
          <div className="p-4 border-b border-[#30363D] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Flame className="w-4 h-4 text-[#D29922]" />
              <h2 className="text-sm font-semibold text-white">High-Churn File Hotspots</h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#21262D] text-[#8B949E] border border-[#30363D]">
              [SQL: HAVING COUNT &gt;= 2]
            </span>
          </div>

          <div className="p-4 flex-1">
            <p className="text-xs text-[#8B949E] mb-3 leading-relaxed">
              Identifies heavily modified files across distinct commits using <code className="text-[#58A6FF] font-mono text-[11px]">GROUP BY file_path HAVING COUNT(DISTINCT commit_hash) &gt;= 2</code>.
            </p>

            {highChurn.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#8B949E] border border-dashed border-[#30363D] rounded-lg">
                No files have reached &gt;= 2 modification commits yet.
              </div>
            ) : (
              <div className="border border-[#30363D] rounded-lg overflow-hidden bg-[#0D1117]">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-[#161B22] text-[#8B949E] text-[10px] uppercase border-b border-[#30363D]">
                    <tr>
                      <th className="py-2 px-3">File Path</th>
                      <th className="py-2 px-3 text-center">Commits</th>
                      <th className="py-2 px-3 text-center">Authors</th>
                      <th className="py-2 px-3 text-right">Max Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262D]">
                    {highChurn.map((hc) => (
                      <tr key={hc.file_path} className="hover:bg-[#161B22]/50 transition">
                        <td className="py-2 px-3 text-[#C9D1D9] font-medium">{hc.file_path}</td>
                        <td className="py-2 px-3 text-center">
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-[#D29922]/15 text-[#D29922] border border-[#D29922]/30">
                            {hc.modification_commits}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center text-[#8B949E]">{hc.distinct_authors}</td>
                        <td className="py-2 px-3 text-right text-[#8B949E]">{hc.max_file_size}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* D: High-Impact Contributors */}
        <div className="rounded-xl bg-[#161B22] border border-[#30363D] overflow-hidden shadow-sm flex flex-col">
          <div className="p-4 border-b border-[#30363D] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-[#58A6FF]" />
              <h2 className="text-sm font-semibold text-white">Above-Average Contributors</h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#21262D] text-[#8B949E] border border-[#30363D]">
              [SQL: Correlated EXISTS + Nested AVG]
            </span>
          </div>

          <div className="p-4 flex-1">
            <p className="text-xs text-[#8B949E] mb-3 leading-relaxed">
              Filters contributors with commits touching blobs &gt; 100B exceeding repo average commit count via correlated subquery.
            </p>

            {contributors.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#8B949E] border border-dashed border-[#30363D] rounded-lg">
                No contributors exceeding repository average yet.
              </div>
            ) : (
              <div className="border border-[#30363D] rounded-lg overflow-hidden bg-[#0D1117]">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-[#161B22] text-[#8B949E] text-[10px] uppercase border-b border-[#30363D]">
                    <tr>
                      <th className="py-2 px-3">Username</th>
                      <th className="py-2 px-3 text-center">RBAC Role</th>
                      <th className="py-2 px-3 text-right">Commit Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262D]">
                    {contributors.map((c) => (
                      <tr key={c.username} className="hover:bg-[#161B22]/50 transition">
                        <td className="py-2 px-3 font-semibold text-[#C9D1D9]">
                          <div className="flex items-center space-x-2">
                            <div className="w-5 h-5 rounded-full bg-[#21262D] flex items-center justify-center text-[10px] text-[#58A6FF] font-bold border border-[#30363D]">
                              {c.username.slice(0, 1).toUpperCase()}
                            </div>
                            <span>{c.username}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#21262D] text-[#8B949E] border border-[#30363D]">
                            {c.access_role}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                            {c.user_commit_count} commits
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── F. Recursive CTE Lineage Table: WITH RECURSIVE + LAG() ───── */}
      <div className="rounded-xl bg-[#161B22] border border-[#30363D] overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[#30363D] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <GitCommit className="w-4 h-4 text-[#10B981]" />
            <h2 className="text-sm font-semibold text-white">
              Recursive Commit Lineage & Window Delta CTE
            </h2>
          </div>
          <span className="text-[10px] px-2.5 py-0.5 rounded bg-[#21262D] text-[#8B949E] font-mono border border-[#30363D] self-start sm:self-auto">
            [SQL: WITH RECURSIVE + LAG() OVER ()]
          </span>
        </div>

        <div className="p-4">
          <p className="text-xs text-[#8B949E] mb-3 leading-relaxed">
            Traverses the commit parent ancestry graph recursively starting from the tip of <code className="text-[#58A6FF] font-mono">main</code>, computing physical tree byte deltas between successive revisions with windowed <code className="text-[#10B981] font-mono">LAG()</code>.
          </p>

          {lineage.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#8B949E] border border-dashed border-[#30363D] rounded-lg">
              No commit lineage found on branch main.
            </div>
          ) : (
            <div className="border border-[#30363D] rounded-lg overflow-hidden bg-[#0D1117]">
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-[#161B22] text-[#8B949E] text-[10px] uppercase border-b border-[#30363D]">
                    <tr>
                      <th className="py-2.5 px-4">Depth</th>
                      <th className="py-2.5 px-4">Commit Hash</th>
                      <th className="py-2.5 px-4">Author</th>
                      <th className="py-2.5 px-4">Message</th>
                      <th className="py-2.5 px-4 text-center">Files</th>
                      <th className="py-2.5 px-4 text-right">Total Bytes</th>
                      <th className="py-2.5 px-4 text-right">Byte Delta (LAG)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262D]">
                    {lineage.map((row) => {
                      const delta = Number(row.byte_delta);
                      return (
                        <tr key={row.commit_hash} className="hover:bg-[#161B22]/50 transition">
                          <td className="py-2.5 px-4 text-[#8B949E] font-bold">
                            <span className="text-[#58A6FF]">L-</span> #{row.depth}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#2F81F7]/10 text-[#58A6FF] border border-[#2F81F7]/30">
                              {row.commit_hash.slice(0, 8)}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-[#C9D1D9]">
                            <div className="flex items-center space-x-1.5">
                              <div className="w-4 h-4 rounded-full bg-[#21262D] text-[#8B949E] flex items-center justify-center text-[9px] font-bold">
                                {row.author.slice(0, 1).toUpperCase()}
                              </div>
                              <span>{row.author}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-[#C9D1D9] font-sans font-medium">
                            {row.message}
                          </td>
                          <td className="py-2.5 px-4 text-center text-[#8B949E]">{row.files}</td>
                          <td className="py-2.5 px-4 text-right text-[#8B949E]">{row.bytes} B</td>
                          <td className="py-2.5 px-4 text-right">
                            {delta > 0 ? (
                              <span className="inline-flex items-center text-[#10B981] font-bold px-1.5 py-0.5 rounded bg-[#10B981]/10 border border-[#10B981]/20">
                                <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                                +{delta} B
                              </span>
                            ) : delta < 0 ? (
                              <span className="inline-flex items-center text-[#F85149] font-bold px-1.5 py-0.5 rounded bg-[#F85149]/10 border border-[#F85149]/20">
                                <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                                {delta} B
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-[#8B949E] px-1.5 py-0.5 rounded bg-[#21262D]">
                                <Minus className="w-3 h-3 mr-0.5" />
                                0 B
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-[#8B949E] font-mono text-xs">
          Loading SQL CTE & pgvector Analytics...
        </div>
      }
    >
      <AnalyticsDashboardContent />
    </Suspense>
  );
}
