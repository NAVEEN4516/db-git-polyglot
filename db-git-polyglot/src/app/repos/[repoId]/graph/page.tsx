'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useActiveUser } from '@/lib/useActiveUser';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  Node,
  Edge,
  MarkerType,
  Handle,
  Position,
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  GitBranch,
  GitMerge,
  GitCommit,
  Tag,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Trash2,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  Plus,
  X,
  Layers,
  ArrowRight
} from 'lucide-react';

interface DagCommit {
  hash: string;
  message: string;
  ci_status: 'PASS' | 'PASSED' | 'FAIL' | 'FAILED' | 'PENDING';
  timestamp: string;
  parents: string[];
  tags: string[];
}

interface Branch {
  branch_id: string;
  branch_name: string;
  target_commit_hash: string | null;
  is_default: boolean;
  is_current_head: boolean;
}

interface LcaResult {
  merge_base_hash: string | null;
  merge_base_message?: string;
  dist_a?: number;
  dist_b?: number;
  branch_a?: string;
  branch_b?: string;
}

interface AggregationItem {
  commit_type: string;
  total_commits: number;
}

// ── Custom Linear/Vercel Styled Commit Node ─────────────────────────
function CommitNodeComponent({ data, selected }: NodeProps) {
  const commit = data.commit as DagCommit;
  const isLca = data.isLca as boolean;
  const isOrphan = data.isOrphan as boolean;
  const branchLabels = (data.branchLabels as string[]) || [];

  const ciStatus = commit.ci_status?.toUpperCase() || 'PENDING';

  return (
    <div
      className={`relative w-[280px] rounded-xl p-3.5 transition-all duration-200 cursor-pointer font-sans shadow-lg ${
        isLca
          ? 'bg-[#161B22] border-2 border-[#10B981] ring-2 ring-[#10B981] shadow-[0_0_25px_rgba(16,185,129,0.35)]'
          : selected
          ? 'bg-[#1C2128] border-2 border-[#58A6FF] shadow-md shadow-[#58A6FF]/10'
          : 'bg-[#161B22] border border-[#30363D] hover:border-[#8B949E]'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-[#58A6FF] !w-2.5 !h-2.5 !border-[#0D1117]"
      />

      {/* Floating LCA Badge */}
      {isLca && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-[#10B981] text-[#0D1117] font-extrabold text-[9px] uppercase tracking-wider flex items-center space-x-1 shadow-md shadow-[#10B981]/50 whitespace-nowrap">
          <Sparkles className="w-2.5 h-2.5" />
          <span>LOWEST COMMON ANCESTOR (MERGE BASE)</span>
        </div>
      )}

      {/* Top Strip: Hash & CI Status */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#30363D]/70">
        <div className="flex items-center space-x-1.5 font-mono">
          <GitCommit className="w-3.5 h-3.5 text-[#58A6FF] flex-shrink-0" />
          <span className="font-bold text-xs text-white">
            {commit.hash.slice(0, 8)}
          </span>
        </div>

        {/* CI Status Dot & Badge */}
        {ciStatus === 'PASS' || ciStatus === 'PASSED' ? (
          <span className="inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded-full bg-[#238636]/15 text-[#3FB950] border border-[#238636]/30 font-semibold font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950]" />
            <span>PASSED</span>
          </span>
        ) : ciStatus === 'FAIL' || ciStatus === 'FAILED' ? (
          <span className="inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded-full bg-[#F85149]/15 text-[#F85149] border border-[#F85149]/30 font-semibold font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F85149]" />
            <span>FAILED</span>
          </span>
        ) : (
          <span className="inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded-full bg-[#D29922]/15 text-[#D29922] border border-[#D29922]/30 font-semibold font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D29922] animate-pulse" />
            <span>PENDING</span>
          </span>
        )}
      </div>

      {/* Message */}
      <p className="text-xs text-[#C9D1D9] line-clamp-2 leading-relaxed mb-2.5 font-normal">
        {commit.message}
      </p>

      {/* Branch Head & Tag Pills */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {branchLabels.map((br) => (
          <span
            key={br}
            className="text-[9px] px-1.5 py-0.5 rounded bg-[#388BFD]/15 text-[#58A6FF] border border-[#388BFD]/30 font-mono font-bold flex items-center space-x-1"
          >
            <GitBranch className="w-2.5 h-2.5" />
            <span>{br}</span>
          </span>
        ))}

        {commit.tags?.filter(Boolean).map((t) => (
          <span
            key={t}
            className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono flex items-center space-x-1"
          >
            <Tag className="w-2.5 h-2.5" />
            <span>{t}</span>
          </span>
        ))}

        {isOrphan && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#F85149]/20 text-[#F85149] border border-[#F85149]/40 font-mono font-bold flex items-center space-x-1">
            <AlertTriangle className="w-2.5 h-2.5" />
            <span>Dangling Orphan</span>
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-[#58A6FF] !w-2.5 !h-2.5 !border-[#0D1117]"
      />
    </div>
  );
}

const nodeTypes = {
  commitNode: CommitNodeComponent,
};

function CommitDagContent() {
  const params = useParams();
  const repoId = params?.repoId as string;
  const { activeUser } = useActiveUser();

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);

  // Raw Graph & Branch data
  const [dagHistory, setDagHistory] = useState<DagCommit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [aggregations, setAggregations] = useState<AggregationItem[]>([]);
  const [lcaData, setLcaData] = useState<LcaResult | null>(null);

  // LCA Calculator inputs
  const [branchA, setBranchA] = useState<string>('');
  const [branchB, setBranchB] = useState<string>('');
  const [computingLca, setComputingLca] = useState(false);

  // Selected Commit for Side Inspector
  const [selectedCommit, setSelectedCommit] = useState<DagCommit | null>(null);

  // Tag & CI Update states
  const [newTagName, setNewTagName] = useState('');
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [gcLoading, setGcLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 6000);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch full DAG data
  const fetchGraphData = useCallback(async (computeLcaWith?: { a: string; b: string }) => {
    if (!repoId) return;
    setLoading(true);
    try {
      let url = `/api/graph/lca?repoId=${repoId}`;
      if (computeLcaWith && computeLcaWith.a && computeLcaWith.b) {
        url += `&branchA=${encodeURIComponent(computeLcaWith.a)}&branchB=${encodeURIComponent(computeLcaWith.b)}`;
      }

      const [lcaRes, branchRes] = await Promise.all([
        fetch(url),
        fetch(`/api/branches?repoId=${repoId}`),
      ]);

      const [lcaJson, branchJson] = await Promise.all([
        lcaRes.json(),
        branchRes.json(),
      ]);

      if (lcaJson.success) {
        setDagHistory(lcaJson.dag_history || []);
        setAggregations(lcaJson.aggregation || []);
        if (lcaJson.lca) {
          setLcaData(lcaJson.lca);
        }
      }

      if (branchJson.success && Array.isArray(branchJson.branches)) {
        setBranches(branchJson.branches);
        if (branchJson.branches.length >= 2 && !branchA && !branchB) {
          setBranchA(branchJson.branches[0].branch_name);
          setBranchB(branchJson.branches[1].branch_name);
        } else if (branchJson.branches.length === 1 && !branchA) {
          setBranchA(branchJson.branches[0].branch_name);
        }
      }
    } catch (err) {
      console.error('Failed to load DAG data:', err);
    } finally {
      setLoading(false);
      setComputingLca(false);
    }
  }, [repoId, branchA, branchB]);

  useEffect(() => {
    if (mounted) {
      fetchGraphData();
    }
  }, [mounted, fetchGraphData]);

  // Compute LCA between selected branches
  const handleComputeLca = async () => {
    if (!branchA || !branchB) {
      showToast('error', 'Select both Branch A and Branch B to compute merge-base');
      return;
    }
    setComputingLca(true);
    await fetchGraphData({ a: branchA, b: branchB });
  };

  // 1-Click Merge Branch into Active Branch
  const handleOneClickMerge = async () => {
    if (!branchA || !branchB) {
      showToast('error', 'Select both branches to merge');
      return;
    }
    if (!activeUser) {
      showToast('error', 'Select an active demo user first');
      return;
    }

    const branchBObj = branches.find((b) => b.branch_name === branchB);
    if (!branchBObj?.target_commit_hash) {
      showToast('error', `Branch '${branchB}' has no target commit`);
      return;
    }

    setMerging(true);
    try {
      let lcaHash = lcaData?.merge_base_hash;
      if (!lcaHash) {
        const lcaRes = await fetch(
          `/api/graph/lca?repoId=${repoId}&branchA=${encodeURIComponent(branchA)}&branchB=${encodeURIComponent(branchB)}`
        );
        const lcaJson = await lcaRes.json();
        if (lcaJson.success && lcaJson.lca) {
          lcaHash = lcaJson.lca.merge_base_hash;
        }
      }

      const shortLca = lcaHash ? lcaHash.slice(0, 8) : 'merge-base';
      const mergeMsg = `Merge branch '${branchB}' into ${branchA} (LCA: ${shortLca})`;

      // Auto-stage a merge note so two-phase commit coordinator passes staging check
      await fetch('/api/staging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_id: repoId,
          user_id: activeUser.user_id,
          file_path: `.git/MERGE_MSG`,
          content: `${mergeMsg}\n\nMerged via Polyglot 3-Way Coordinator with LCA ${shortLca}.\n`,
          file_mode: '100644',
        }),
      });

      const res = await fetch('/api/commits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_id: repoId,
          author_id: activeUser.user_id,
          branch_name: branchA,
          message: mergeMsg,
          second_parent_hash: branchBObj.target_commit_hash,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to merge branch');
      }

      showToast(
        'success',
        `Merged '${branchB}' into '${branchA}'! New 2-parent commit: ${data.commit.commit_hash.slice(0, 8)}`
      );
      await fetchGraphData({ a: branchA, b: branchB });
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setMerging(false);
    }
  };

  // Run Garbage Collection (`dbgit gc`)
  const handleRunGc = async () => {
    if (!confirm('Run Garbage Collection (dbgit gc) to prune orphan commits unreachable from active branches?')) {
      return;
    }
    setGcLoading(true);
    try {
      const res = await fetch('/api/graph/rud', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'gc_orphans',
          repo_id: repoId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'GC failed');
      showToast('success', data.message || `Garbage collection pruned ${data.pruned_orphan_commits} orphan commit(s)`);
      await fetchGraphData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setGcLoading(false);
    }
  };

  // Update CI Status
  const handleUpdateCi = async (newStatus: 'PASS' | 'FAIL' | 'PENDING') => {
    if (!selectedCommit) return;
    setInspectorLoading(true);
    try {
      const res = await fetch('/api/graph/rud', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_ci',
          repo_id: repoId,
          commit_hash: selectedCommit.hash,
          ci_status: newStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update CI');
      showToast('success', `CI status updated to ${newStatus}`);
      setSelectedCommit((prev) => (prev ? { ...prev, ci_status: newStatus } : null));
      await fetchGraphData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setInspectorLoading(false);
    }
  };

  // Upsert Tag
  const handleUpsertTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCommit || !newTagName.trim()) return;
    setInspectorLoading(true);
    try {
      const res = await fetch('/api/graph/rud', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert_tag',
          repo_id: repoId,
          commit_hash: selectedCommit.hash,
          tag_name: newTagName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to attach tag');
      showToast('success', `Attached tag '${newTagName.trim()}' to commit ${selectedCommit.hash.slice(0, 8)}`);
      setNewTagName('');
      await fetchGraphData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setInspectorLoading(false);
    }
  };

  // Delete Tag
  const handleDeleteTag = async (tagName: string) => {
    if (!confirm(`Delete tag '${tagName}' from Neo4j?`)) return;
    setInspectorLoading(true);
    try {
      const res = await fetch('/api/graph/rud', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_tag',
          repo_id: repoId,
          tag_name: tagName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete tag');
      showToast('success', `Tag '${tagName}' deleted`);
      await fetchGraphData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setInspectorLoading(false);
    }
  };

  // Layout Nodes & Edges for React Flow
  const { nodes, edges } = useMemo(() => {
    if (!dagHistory || dagHistory.length === 0) {
      return { nodes: [], edges: [] };
    }

    const branchHeadMap = new Map<string, string[]>();
    for (const b of branches) {
      if (b.target_commit_hash) {
        const list = branchHeadMap.get(b.target_commit_hash) || [];
        list.push(b.branch_name + (b.is_current_head ? ' (HEAD)' : ''));
        branchHeadMap.set(b.target_commit_hash, list);
      }
    }

    // Determine reachable commits from active branch heads
    const reachable = new Set<string>();
    const commitMap = new Map<string, DagCommit>();
    for (const c of dagHistory) {
      commitMap.set(c.hash, c);
    }

    const queue: string[] = [];
    for (const b of branches) {
      if (b.target_commit_hash) queue.push(b.target_commit_hash);
    }

    while (queue.length > 0) {
      const h = queue.shift()!;
      if (!reachable.has(h)) {
        reachable.add(h);
        const c = commitMap.get(h);
        if (c?.parents) {
          for (const p of c.parents) {
            if (p) queue.push(p);
          }
        }
      }
    }

    // Sort chronologically ascending for tree hierarchy
    const sorted = [...dagHistory].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const laneMap = new Map<string, number>();
    let currentLane = 0;

    const flowNodes: Node[] = sorted.map((c, idx) => {
      let lane = 0;
      if (c.parents && c.parents.length > 0) {
        const primaryParent = c.parents[0];
        if (laneMap.has(primaryParent)) {
          lane = laneMap.get(primaryParent)!;
        } else {
          lane = currentLane;
        }
        if (c.parents.length > 1) {
          lane = Math.min(...c.parents.map((p) => laneMap.get(p) ?? 0));
        }
      } else {
        lane = currentLane++;
      }
      laneMap.set(c.hash, lane);

      const isLca = Boolean(lcaData?.merge_base_hash && lcaData.merge_base_hash === c.hash);
      const isOrphan = !reachable.has(c.hash);

      return {
        id: c.hash,
        type: 'commitNode',
        position: {
          x: lane * 320 + 80,
          y: idx * 160 + 50,
        },
        data: {
          commit: c,
          isLca,
          isOrphan,
          branchLabels: branchHeadMap.get(c.hash) || [],
        },
      };
    });

    const flowEdges: Edge[] = [];
    for (const c of dagHistory) {
      if (c.parents && Array.isArray(c.parents)) {
        for (const p of c.parents) {
          if (p && commitMap.has(p)) {
            flowEdges.push({
              id: `${c.hash}->${p}`,
              source: c.hash,
              target: p,
              animated: true,
              style: { stroke: '#388BFD', strokeWidth: 2 },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#388BFD',
                width: 16,
                height: 16,
              },
            });
          }
        }
      }
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [dagHistory, branches, lcaData]);

  if (!mounted) {
    return (
      <div className="h-[540px] rounded-xl bg-[#161B22] border border-[#30363D] animate-shimmer flex items-center justify-center text-[#8B949E] font-mono text-xs">
        Initializing Interactive React Flow DAG Canvas...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between shadow-2xl transition ${
            toast.type === 'success'
              ? 'bg-[#161B22] border-[#238636] text-[#3FB950]'
              : 'bg-[#161B22] border-[#F85149] text-[#F85149]'
          }`}
        >
          <span className="text-xs font-mono">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-xs font-mono ml-4 text-[#8B949E] hover:text-white">
            DISMISS
          </button>
        </div>
      )}

      {/* ── Top Floating Glassmorphic Control Toolbar ────────────────── */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 shadow-sm space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* 3-Way Merge Base (LCA) Calculator */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-white mr-1 font-mono">
              <GitMerge className="w-4 h-4 text-[#58A6FF]" />
              <span>3-Way LCA Finder:</span>
            </div>

            <div className="flex items-center space-x-1 bg-[#0D1117] border border-[#30363D] rounded-md px-2 py-1">
              <span className="text-[10px] text-[#8B949E] font-mono">A:</span>
              <select
                aria-label="Branch A"
                value={branchA}
                onChange={(e) => setBranchA(e.target.value)}
                className="bg-transparent text-white text-xs font-mono focus:outline-none cursor-pointer"
              >
                <option value="">Select Branch</option>
                {branches.map((b) => (
                  <option key={b.branch_id} value={b.branch_name} className="bg-[#161B22]">
                    {b.branch_name}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-[#8B949E] text-xs">&harr;</span>

            <div className="flex items-center space-x-1 bg-[#0D1117] border border-[#30363D] rounded-md px-2 py-1">
              <span className="text-[10px] text-[#8B949E] font-mono">B:</span>
              <select
                aria-label="Branch B"
                value={branchB}
                onChange={(e) => setBranchB(e.target.value)}
                className="bg-transparent text-white text-xs font-mono focus:outline-none cursor-pointer"
              >
                <option value="">Select Branch</option>
                {branches.map((b) => (
                  <option key={b.branch_id} value={b.branch_name} className="bg-[#161B22]">
                    {b.branch_name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleComputeLca}
              disabled={computingLca || !branchA || !branchB}
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white transition flex items-center space-x-1.5 shadow-sm"
            >
              {computingLca ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              <span>Compute LCA</span>
            </button>
          </div>

          {/* Right Actions: GC and Refresh */}
          <div className="flex items-center space-x-2.5">
            <button
              onClick={handleRunGc}
              disabled={gcLoading}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-[#21262D] hover:bg-[#30363D] text-[#C9D1D9] hover:text-[#F85149] border border-[#30363D] transition flex items-center space-x-1.5"
              title="Prune unreachable orphan commits via Cypher DETACH DELETE"
            >
              {gcLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3 text-[#F85149]" />}
              <span>Prune Orphans (<code className="text-[#58A6FF]">dbgit gc</code>)</span>
            </button>

            <button
              onClick={() => fetchGraphData()}
              className="p-1.5 rounded-md bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-white border border-[#30363D] transition"
              title="Refresh Graph"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#58A6FF]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Status Strip: Computed LCA & Commit Type Pills */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-[#30363D] gap-2.5 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            {lcaData?.merge_base_hash ? (
              <div className="flex flex-wrap items-center gap-2 text-[#3FB950]">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                  <span>
                    LCA Merge-Base: <strong className="text-white">{lcaData.merge_base_hash.slice(0, 10)}</strong>
                  </span>
                  <span className="text-[#8B949E] text-[11px]">
                    (dist: {lcaData.dist_a} from {lcaData.branch_a}, {lcaData.dist_b} from {lcaData.branch_b})
                  </span>
                </div>
                <button
                  onClick={handleOneClickMerge}
                  disabled={merging}
                  className="px-2.5 py-1 rounded bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white font-mono text-[11px] font-semibold transition flex items-center space-x-1 shadow-sm border border-[#2ea043]/30"
                  title={`Merge ${branchB} into ${branchA}`}
                >
                  {merging ? <RefreshCw className="w-3 h-3 animate-spin" /> : <GitMerge className="w-3 h-3" />}
                  <span>1-Click Merge &apos;{branchB}&apos; into &apos;{branchA}&apos;</span>
                </button>
              </div>
            ) : (
              <span className="text-[#8B949E]">
                Select two branches to find Lowest Common Ancestor.
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[#8B949E] text-[11px]">Breakdown:</span>
            {aggregations.map((agg) => (
              <span
                key={agg.commit_type}
                className="px-2 py-0.5 rounded bg-[#0D1117] border border-[#30363D] text-[#C9D1D9] text-[11px]"
              >
                {agg.commit_type}: <strong className="text-[#58A6FF]">{agg.total_commits}</strong>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Graph Canvas + Side Inspector ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* React Flow Canvas */}
        <div className={`${selectedCommit ? 'lg:col-span-8' : 'lg:col-span-12'} transition-all duration-300`}>
          <div className="h-[580px] rounded-2xl bg-[#090D16] border border-[#30363D] overflow-hidden relative shadow-xl">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={(_, node) => {
                const c = dagHistory.find((item) => item.hash === node.id);
                if (c) setSelectedCommit(c);
              }}
              fitView
              minZoom={0.2}
              maxZoom={1.8}
            >
              <Background color="#21262d" gap={20} size={1.2} variant={BackgroundVariant.Dots} />
              <Controls className="!bg-[#161B22] !border-[#30363D] !text-[#C9D1D9] !fill-[#C9D1D9] !rounded-lg overflow-hidden shadow-lg" />
            </ReactFlow>

            {nodes.length === 0 && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-[#8B949E] text-xs font-mono">
                <GitBranch className="w-10 h-10 text-[#30363D] mb-2" />
                <span>No commits found in Neo4j graph for this repository.</span>
                <span className="text-[#484F58] mt-1">Stage and commit files from the Code view!</span>
              </div>
            )}
          </div>
        </div>

        {/* Node Inspector Side Panel */}
        {selectedCommit && (
          <div className="lg:col-span-4 bg-[#161B22] border border-[#30363D] rounded-2xl p-5 shadow-2xl space-y-5">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#30363D] mb-3">
                <div className="flex items-center space-x-2">
                  <GitCommit className="w-4 h-4 text-[#58A6FF]" />
                  <h3 className="font-semibold text-white text-sm">Node Inspector</h3>
                </div>
                <button
                  onClick={() => setSelectedCommit(null)}
                  className="text-xs text-[#8B949E] hover:text-white font-mono"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Commit Properties */}
              <div className="space-y-2.5 text-xs font-mono">
                <div>
                  <span className="text-[#8B949E] block text-[10px] uppercase">Commit Hash</span>
                  <span className="text-[#58A6FF] font-bold break-all">{selectedCommit.hash}</span>
                </div>

                <div>
                  <span className="text-[#8B949E] block text-[10px] uppercase">Message</span>
                  <span className="text-white font-sans text-xs mt-0.5 block">{selectedCommit.message}</span>
                </div>

                <div>
                  <span className="text-[#8B949E] block text-[10px] uppercase">Timestamp</span>
                  <span className="text-[#C9D1D9]">{new Date(selectedCommit.timestamp).toLocaleString()}</span>
                </div>

                <div>
                  <span className="text-[#8B949E] block text-[10px] uppercase">Parent Commits</span>
                  <span className="text-[#C9D1D9]">
                    {selectedCommit.parents?.length > 0
                      ? selectedCommit.parents.map((p) => p.slice(0, 8)).join(', ')
                      : 'None (Root Commit)'}
                  </span>
                </div>
              </div>

              {/* Action 1: Update CI Status (Cypher SET) */}
              <div className="mt-5 pt-4 border-t border-[#30363D]">
                <h4 className="text-xs font-semibold text-white mb-2 flex items-center space-x-1.5 font-mono">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#3FB950]" />
                  <span>Update CI Status (Cypher SET)</span>
                </h4>
                <div className="grid grid-cols-3 gap-2 font-mono">
                  <button
                    onClick={() => handleUpdateCi('PASS')}
                    disabled={inspectorLoading}
                    className="py-1.5 text-xs font-semibold rounded-md bg-[#238636]/20 hover:bg-[#238636]/30 text-[#3FB950] border border-[#238636]/40 transition"
                  >
                    PASS
                  </button>
                  <button
                    onClick={() => handleUpdateCi('FAIL')}
                    disabled={inspectorLoading}
                    className="py-1.5 text-xs font-semibold rounded-md bg-[#F85149]/20 hover:bg-[#F85149]/30 text-[#F85149] border border-[#F85149]/40 transition"
                  >
                    FAIL
                  </button>
                  <button
                    onClick={() => handleUpdateCi('PENDING')}
                    disabled={inspectorLoading}
                    className="py-1.5 text-xs font-semibold rounded-md bg-[#D29922]/20 hover:bg-[#D29922]/30 text-[#D29922] border border-[#D29922]/40 transition"
                  >
                    PENDING
                  </button>
                </div>
              </div>

              {/* Action 2: Attach / Move Release Tag (Cypher MERGE) */}
              <div className="mt-5 pt-4 border-t border-[#30363D]">
                <h4 className="text-xs font-semibold text-white mb-2 flex items-center space-x-1.5 font-mono">
                  <Tag className="w-3.5 h-3.5 text-purple-400" />
                  <span>Release Tag (Cypher MERGE)</span>
                </h4>
                <form onSubmit={handleUpsertTag} className="flex gap-2 mb-3">
                  <input
                    type="text"
                    required
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="e.g. v1.0.0"
                    className="flex-1 px-3 py-1.5 text-xs rounded-md bg-[#0D1117] border border-[#30363D] text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="submit"
                    disabled={inspectorLoading || !newTagName.trim()}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tag</span>
                  </button>
                </form>

                {selectedCommit.tags?.filter(Boolean).length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    <span className="text-[11px] text-[#8B949E] font-mono">Attached Tags:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCommit.tags.filter(Boolean).map((t) => (
                        <div
                          key={t}
                          className="flex items-center space-x-1 px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 text-xs font-mono"
                        >
                          <span>{t}</span>
                          <button
                            onClick={() => handleDeleteTag(t)}
                            className="hover:text-[#F85149] ml-1 font-bold"
                            title="Delete Tag (NoSQL DELETE)"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommitDagPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[540px] rounded-xl bg-[#161B22] border border-[#30363D] animate-shimmer flex items-center justify-center text-[#8B949E] font-mono text-xs">
          Loading Commit DAG &amp; LCA...
        </div>
      }
    >
      <CommitDagContent />
    </Suspense>
  );
}
