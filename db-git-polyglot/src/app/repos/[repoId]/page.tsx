'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useActiveUser } from '@/lib/useActiveUser';
import {
  GitBranch,
  FolderGit2,
  FileCode,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Database,
  Layers,
  UploadCloud,
  FilePlus,
  Eye,
  GitMerge,
  ToggleRight,
  GitCommit,
  Clock,
  Sparkles,
  ArrowRight,
  ChevronDown,
  X,
  FileText,
  Lock,
  Code,
  GitCompare
} from 'lucide-react';

function getFileContentString(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object') {
    if (content.type === 'Buffer' && Array.isArray(content.data)) {
      try {
        return new TextDecoder().decode(new Uint8Array(content.data));
      } catch {
        return '';
      }
    }
  }
  return String(content);
}

interface DiffLine {
  type: 'add' | 'del' | 'same';
  text: string;
}

function computeUnifiedDiff(oldRaw: any, newRaw: any): DiffLine[] {
  const oldText = getFileContentString(oldRaw);
  const newText = getFileContentString(newRaw);
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const m = oldLines.length;
  const n = newLines.length;
  if (m > 600 || n > 600) {
    return [{ type: 'same', text: '(Diff preview truncated for performance)' }];
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let i = m;
  let j = n;
  const temp: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      temp.push({ type: 'same', text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      temp.push({ type: 'add', text: newLines[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      temp.push({ type: 'del', text: oldLines[i - 1] });
      i--;
    }
  }
  return temp.reverse();
}

interface Branch {
  branch_id: string;
  branch_name: string;
  target_commit_hash: string | null;
  is_default: boolean;
  is_current_head: boolean;
  latest_commit_message?: string;
}

interface CommittedFile {
  file_path: string;
  file_mode: string;
  blob_hash: string;
  size_bytes: number;
  content?: string;
  commit_hash?: string;
  message?: string;
}

interface StagedFile {
  file_path: string;
  blob_hash: string;
  file_mode: string;
  size_bytes: number;
  staged_at: string;
  content_preview?: string;
}

function CodeAndStagingContent() {
  const params = useParams();
  const repoId = params?.repoId as string;
  const { activeUser } = useActiveUser();

  // Branch state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('main');
  const [newBranchName, setNewBranchName] = useState<string>('');
  const [showNewBranchInput, setShowNewBranchInput] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(true);

  // Committed Snapshot Table
  const [committedFiles, setCommittedFiles] = useState<CommittedFile[]>([]);
  const [loadingCommitted, setLoadingCommitted] = useState(false);
  const [activeCommitInfo, setActiveCommitInfo] = useState<{ hash: string | null; message: string | null }>({
    hash: null,
    message: null,
  });

  // Staging area
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [loadingStaged, setLoadingStaged] = useState(false);

  // Stage form
  const [stagePath, setStagePath] = useState('');
  const [stageMode, setStageMode] = useState<'100644' | '100755'>('100644');
  const [stageContent, setStageContent] = useState('');
  const [stageSubmitting, setStageSubmitting] = useState(false);

  // Commit box
  const [commitMessage, setCommitMessage] = useState('');
  const [secondParentBranch, setSecondParentBranch] = useState<string>('');
  const [committing, setCommitting] = useState(false);

  // Toast / notification state
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string; phase?: string } | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Selected file preview box
  const [viewingFile, setViewingFile] = useState<CommittedFile | null>(null);

  // Check if active staging input modifies an existing committed file
  const existingCommittedFile = committedFiles.find(
    (cf) => cf.file_path === stagePath.trim()
  );

  const activeDiffLines = React.useMemo(() => {
    if (!existingCommittedFile) return [];
    return computeUnifiedDiff(existingCommittedFile.content || '', stageContent);
  }, [existingCommittedFile, stageContent]);

  const showToast = (type: 'success' | 'error', message: string, phase?: string) => {
    setToast({ type, message, phase });
    setTimeout(() => setToast(null), 8000);
  };

  // 1. Fetch branches
  const fetchBranches = useCallback(async () => {
    if (!repoId) return;
    setLoadingBranches(true);
    try {
      const res = await fetch(`/api/branches?repoId=${repoId}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.branches)) {
        setBranches(data.branches);
        const head = data.branches.find((b: Branch) => b.is_current_head) ||
          data.branches.find((b: Branch) => b.is_default) ||
          data.branches[0];
        if (head && !selectedBranch) {
          setSelectedBranch(head.branch_name);
        }
      }
    } catch (err) {
      console.error('Failed to fetch branches:', err);
    } finally {
      setLoadingBranches(false);
    }
  }, [repoId, selectedBranch]);

  // 2. Fetch committed files for selected branch
  const fetchCommittedFiles = useCallback(async (branchName: string) => {
    if (!repoId || !branchName) return;
    setLoadingCommitted(true);
    try {
      const res = await fetch(`/api/commits?repoId=${repoId}&branchName=${branchName}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.files)) {
        setCommittedFiles(data.files);
        setActiveCommitInfo({
          hash: data.commit_hash,
          message: data.commit_message,
        });
        if (data.files.length > 0 && !viewingFile) {
          setViewingFile(data.files[0]);
        }
      } else {
        setCommittedFiles([]);
        setActiveCommitInfo({ hash: null, message: null });
        setViewingFile(null);
      }
    } catch (err) {
      console.error('Failed to load committed files:', err);
    } finally {
      setLoadingCommitted(false);
    }
  }, [repoId, viewingFile]);

  // 3. Fetch staged files for active user
  const fetchStagedFiles = useCallback(async () => {
    if (!repoId || !activeUser?.user_id) return;
    setLoadingStaged(true);
    try {
      const res = await fetch(`/api/staging?repoId=${repoId}&userId=${activeUser.user_id}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.staged_files)) {
        setStagedFiles(data.staged_files);
      } else {
        setStagedFiles([]);
      }
    } catch (err) {
      console.error('Failed to load staged files:', err);
    } finally {
      setLoadingStaged(false);
    }
  }, [repoId, activeUser?.user_id]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    if (selectedBranch) {
      fetchCommittedFiles(selectedBranch);
    }
  }, [selectedBranch, fetchCommittedFiles]);

  useEffect(() => {
    fetchStagedFiles();
  }, [fetchStagedFiles]);

  // Switch Branch
  const handleSwitchBranch = async (branchName: string) => {
    setSelectedBranch(branchName);
    try {
      await fetch('/api/branches', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId, branch_name: branchName }),
      });
      fetchBranches();
      fetchCommittedFiles(branchName);
      showToast('success', `Checked out branch '${branchName}'`);
    } catch (err) {
      console.error('Failed to switch branch:', err);
    }
  };

  // Create Branch
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;

    try {
      const current = branches.find((b) => b.branch_name === selectedBranch);
      const res = await fetch('/api/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_id: repoId,
          branch_name: newBranchName.trim(),
          start_commit_hash: current?.target_commit_hash || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create branch');
      }
      showToast('success', `Branch '${newBranchName.trim()}' created`);
      const created = newBranchName.trim();
      setNewBranchName('');
      setShowNewBranchInput(false);
      await fetchBranches();
      setSelectedBranch(created);
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Delete Branch
  const handleDeleteBranch = async (branchName: string) => {
    if (!confirm(`Are you sure you want to delete branch '${branchName}'?`)) return;

    try {
      const res = await fetch('/api/branches', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId, branch_name: branchName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete branch');
      }
      showToast('success', `Branch '${branchName}' deleted`);
      const defaultB = branches.find((b) => b.is_default)?.branch_name || 'main';
      setSelectedBranch(defaultB);
      await fetchBranches();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Stage a file
  const handleStageFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) {
      showToast('error', 'Select an active demo user first');
      return;
    }
    if (!stagePath.trim() || !stageContent) {
      showToast('error', 'Please provide both file path and content');
      return;
    }

    setStageSubmitting(true);
    try {
      const res = await fetch('/api/staging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_id: repoId,
          user_id: activeUser.user_id,
          file_path: stagePath.trim(),
          file_mode: stageMode,
          content: stageContent,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to stage file');
      }
      showToast('success', `Staged '${stagePath.trim()}' in CAS`);
      setStagePath('');
      setStageContent('');
      await fetchStagedFiles();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setStageSubmitting(false);
    }
  };

  // Toggle file mode (SQL UPDATE demonstration)
  const handleToggleMode = async (file: StagedFile) => {
    if (!activeUser) return;
    const newMode = file.file_mode === '100644' ? '100755' : '100644';
    try {
      const res = await fetch('/api/staging', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_id: repoId,
          user_id: activeUser.user_id,
          file_path: file.file_path,
          file_mode: newMode,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Update failed');
      showToast('success', `Updated file_mode of '${file.file_path}' to ${newMode}`);
      fetchStagedFiles();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Unstage a file (SQL DELETE demonstration)
  const handleUnstage = async (filePath: string) => {
    if (!activeUser) return;
    try {
      const res = await fetch('/api/staging', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_id: repoId,
          user_id: activeUser.user_id,
          file_path: filePath,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Delete failed');
      showToast('success', `Unstaged '${filePath}'`);
      fetchStagedFiles();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Polyglot Two-Phase Commit
  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) {
      showToast('error', 'Select an active demo user first');
      return;
    }
    if (!commitMessage.trim()) {
      showToast('error', 'Commit message cannot be empty');
      return;
    }
    if (stagedFiles.length === 0) {
      showToast('error', 'Staging area is empty. Stage at least one file before committing.');
      return;
    }

    setCommitting(true);
    try {
      let secondParentHash: string | undefined = undefined;
      if (secondParentBranch) {
        const b = branches.find((item) => item.branch_name === secondParentBranch);
        if (b && b.target_commit_hash) {
          secondParentHash = b.target_commit_hash;
        }
      }

      const res = await fetch('/api/commits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_id: repoId,
          author_id: activeUser.user_id,
          branch_name: selectedBranch,
          message: commitMessage.trim(),
          second_parent_hash: secondParentHash,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const phase = data.phase_failed || 'PostgreSQL';
        throw new Error(data.error || `Two-phase commit failed during ${phase}`);
      }

      showToast(
        'success',
        `Atomic Commit ${data.commit_hash.slice(0, 8)} created (${data.files_committed} files in snapshot)`
      );
      setCommitMessage('');
      setSecondParentBranch('');
      await fetchStagedFiles();
      await fetchCommittedFiles(selectedBranch);
      await fetchBranches();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setCommitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const selectedBranchObj = branches.find((b) => b.branch_name === selectedBranch);

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {toast && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between shadow-2xl transition-all ${
            toast.type === 'success'
              ? 'bg-[#161B22] border-[#238636] text-[#3FB950]'
              : 'bg-[#161B22] border-[#F85149] text-[#F85149]'
          }`}
        >
          <div className="flex items-start space-x-3">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-[#3FB950] mt-0.5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-[#F85149] mt-0.5 flex-shrink-0" />
            )}
            <div>
              <div className="font-semibold text-xs uppercase tracking-wider">
                {toast.type === 'success' ? 'Transaction Succeeded' : 'Coordinator Exception / Denied'}
              </div>
              <p className="text-xs mt-1 text-[#C9D1D9] font-mono leading-relaxed">{toast.message}</p>
            </div>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-xs text-[#8B949E] hover:text-white ml-4 font-mono"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* ── 12-Column Layout ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── Left 7 Columns: GitHub File Tree & Code Viewer ─────────── */}
        <div className="lg:col-span-7 space-y-5">
          {/* Top Branch Bar */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center space-x-2 flex-wrap gap-y-2">
              {/* Branch Selector Dropdown */}
              <div className="relative flex items-center bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] rounded-md px-3 py-1.5 transition cursor-pointer">
                <GitBranch className="w-3.5 h-3.5 text-[#58A6FF] mr-2" />
                <select
                  aria-label="Select Branch"
                  value={selectedBranch}
                  onChange={(e) => handleSwitchBranch(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer pr-2 font-mono"
                >
                  {branches.map((b) => (
                    <option key={b.branch_id} value={b.branch_name} className="bg-[#161B22] text-[#C9D1D9]">
                      {b.branch_name} {b.is_default ? '(default)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Commit Counter / Target Hash */}
              {selectedBranchObj?.target_commit_hash && (
                <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md bg-[#0D1117] border border-[#30363D] text-[11px] font-mono text-[#8B949E]">
                  <GitCommit className="w-3 h-3 text-[#58A6FF]" />
                  <span className="text-[#C9D1D9] font-semibold">
                    {selectedBranchObj.target_commit_hash.slice(0, 8)}
                  </span>
                </div>
              )}

              {/* Delete branch button (non-default only) */}
              {!selectedBranchObj?.is_default && (
                <button
                  onClick={() => handleDeleteBranch(selectedBranch)}
                  className="p-1.5 rounded-md hover:bg-[#21262D] text-[#8B949E] hover:text-[#F85149] transition"
                  title="Delete branch (SQL DELETE)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* New Branch Trigger / Popover */}
            <div className="flex items-center space-x-2">
              {showNewBranchInput ? (
                <form onSubmit={handleCreateBranch} className="flex items-center space-x-1.5">
                  <input
                    type="text"
                    required
                    pattern="^[A-Za-z0-9._/-]+$"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="branch-name"
                    className="px-2.5 py-1 text-xs rounded-md bg-[#0D1117] border border-[#30363D] text-white font-mono focus:outline-none focus:border-[#58A6FF] w-32"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-xs font-semibold rounded-md bg-[#238636] hover:bg-[#2ea043] text-white"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewBranchInput(false)}
                    className="p-1 text-[#8B949E] hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setShowNewBranchInput(true)}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-[#21262D] hover:bg-[#30363D] text-[#C9D1D9] hover:text-white border border-[#30363D] transition flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5 text-[#58A6FF]" />
                  <span>New Branch</span>
                </button>
              )}
            </div>
          </div>

          {/* Latest Commit Message Header Strip */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl px-4 py-3 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center space-x-2.5 overflow-hidden">
              <div className="w-6 h-6 rounded-full bg-[#21262D] flex items-center justify-center flex-shrink-0 text-[#58A6FF]">
                <GitCommit className="w-3.5 h-3.5" />
              </div>
              <div className="truncate">
                <span className="text-white font-medium">
                  {activeCommitInfo.message || 'Initial empty repository'}
                </span>
                {activeCommitInfo.hash && (
                  <span className="text-[#8B949E] ml-2 text-[11px]">
                    &bull; {activeCommitInfo.hash.slice(0, 8)}
                  </span>
                )}
              </div>
            </div>
            <span className="text-[#8B949E] text-[11px] flex-shrink-0 ml-2">
              {committedFiles.length} file{committedFiles.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* GitHub-Style Committed File Tree Table */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#21262D]/60 text-[#8B949E] text-[11px] uppercase border-b border-[#30363D]">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Name</th>
                    <th className="py-2.5 px-4 font-semibold">Mode</th>
                    <th className="py-2.5 px-4 font-semibold">CAS Blob Hash</th>
                    <th className="py-2.5 px-4 font-semibold">Size</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363D]">
                  {loadingCommitted ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#8B949E]">
                        Loading Merkle tree snapshot...
                      </td>
                    </tr>
                  ) : committedFiles.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#8B949E]">
                        No files in current branch snapshot. Stage files on the right to commit!
                      </td>
                    </tr>
                  ) : (
                    committedFiles.map((file) => {
                      const isSelected = viewingFile?.file_path === file.file_path;
                      return (
                        <tr
                          key={file.file_path}
                          onClick={() => setViewingFile(file)}
                          className={`hover:bg-[#21262D]/50 transition cursor-pointer ${
                            isSelected ? 'bg-[#21262D]/80' : ''
                          }`}
                        >
                          <td className="py-2.5 px-4 font-medium text-white flex items-center space-x-2">
                            <FileCode className="w-3.5 h-3.5 text-[#58A6FF] flex-shrink-0" />
                            <span className="hover:underline">{file.file_path}</span>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="px-1.5 py-0.5 rounded bg-[#0D1117] border border-[#30363D] text-[10px] text-[#8B949E]">
                              {file.file_mode}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-[#8B949E]">
                            <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                              <span className="text-[#3FB950] font-mono">{file.blob_hash.slice(0, 8)}</span>
                              <button
                                onClick={() => copyToClipboard(file.blob_hash)}
                                className="p-1 hover:text-white transition"
                                title="Copy 64-char SHA-256 hash"
                              >
                                {copiedHash === file.blob_hash ? (
                                  <Check className="w-3 h-3 text-[#3FB950]" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-[#8B949E]">{file.size_bytes} B</td>
                          <td className="py-2.5 px-4 text-right space-x-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setStagePath(file.file_path);
                                setStageMode(file.file_mode as '100644' | '100755');
                                setStageContent(getFileContentString(file.content));
                                setViewingFile(file);
                              }}
                              className="text-xs text-[#3FB950] hover:underline font-sans"
                              title="Load into CAS Editor to edit & view unified diff"
                            >
                              Edit/Diff
                            </button>
                            <span className="text-xs text-[#58A6FF] hover:underline font-sans">
                              {isSelected ? 'Inspecting' : 'View'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* GitHub-Style Code Box Viewer with Line-Numbered Gutter */}
          {viewingFile && (
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl overflow-hidden shadow-md">
              {/* File Metadata Header Bar */}
              <div className="px-4 py-3 bg-[#21262D]/70 border-b border-[#30363D] flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2 overflow-hidden">
                  <FileText className="w-4 h-4 text-[#58A6FF] flex-shrink-0" />
                  <span className="font-semibold text-white">{viewingFile.file_path}</span>
                  <span className="text-[#8B949E] text-[11px]">
                    &bull; {viewingFile.size_bytes} B &bull; {viewingFile.file_mode}
                  </span>
                </div>

                <div className="flex items-center space-x-2 text-[11px]">
                  <span className="text-[#8B949E] hidden sm:inline">SHA-256:</span>
                  <span className="text-[#3FB950] font-mono">{viewingFile.blob_hash.slice(0, 12)}...</span>
                  <button
                    onClick={() => copyToClipboard(getFileContentString(viewingFile.content))}
                    className="p-1 text-[#8B949E] hover:text-white transition"
                    title="Copy file contents"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setViewingFile(null)}
                    className="text-[#8B949E] hover:text-white ml-1"
                    title="Close file preview"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Line-Numbered Code Body */}
              {(() => {
                const text = getFileContentString(viewingFile.content);
                const lines = text.split('\n');
                return (
                  <div className="flex bg-[#0D1117] text-xs font-mono overflow-x-auto max-h-[380px]">
                    {/* Line Gutter */}
                    <div className="py-3 px-3 text-right bg-[#090D16] text-[#484F58] border-r border-[#30363D] select-none flex-shrink-0">
                      {lines.map((_, i) => (
                        <div key={i} className="leading-relaxed">
                          {i + 1}
                        </div>
                      ))}
                    </div>

                    {/* Code Contents */}
                    <pre className="py-3 px-4 text-[#C9D1D9] leading-relaxed flex-1 overflow-x-auto">
                      {text || '// (Empty file)'}
                    </pre>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* ── Right 5 Columns: CAS Staging Index & Polyglot Commit Studio ── */}
        <div className="lg:col-span-5 space-y-5">
          {/* Supabase-Style Staging Area Panel */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-[#21262D]/50 border-b border-[#30363D] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Database className="w-4 h-4 text-[#3FB950]" />
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                  CAS Staging Area (<code className="text-[#3FB950]">staging_index</code>)
                </h3>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#238636]/10 text-[#3FB950] border border-[#238636]/30 font-mono font-bold">
                {stagedFiles.length} staged
              </span>
            </div>

            {loadingStaged ? (
              <div className="p-6 text-center text-xs text-[#8B949E] font-mono">
                Checking staging index...
              </div>
            ) : stagedFiles.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#8B949E]">
                No files currently staged for user{' '}
                <span className="text-[#58A6FF] font-mono">{activeUser?.username}</span>.
                Use the editor below to stage files into Content-Addressable Storage.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#0D1117] text-[#8B949E] text-[10px] uppercase border-b border-[#30363D]">
                    <tr>
                      <th className="py-2 px-3">File Path</th>
                      <th className="py-2 px-3">Mode</th>
                      <th className="py-2 px-3">SHA-256</th>
                      <th className="py-2 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#30363D]">
                    {stagedFiles.map((file) => (
                      <tr key={file.file_path} className="hover:bg-[#21262D]/50 transition">
                        <td className="py-2 px-3 text-white truncate max-w-[120px]">
                          {file.file_path}
                        </td>
                        <td className="py-2 px-3">
                          <button
                            onClick={() => handleToggleMode(file)}
                            className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-[#21262D] hover:bg-[#30363D] text-[10px] text-[#C9D1D9] border border-[#30363D] transition"
                            title="Toggle permission mode (SQL UPDATE)"
                          >
                            <span>{file.file_mode}</span>
                            <ToggleRight className="w-3 h-3 text-[#3FB950]" />
                          </button>
                        </td>
                        <td className="py-2 px-3 text-[#3FB950]">
                          {file.blob_hash.slice(0, 8)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={() => handleUnstage(file.file_path)}
                            className="text-[#F85149] hover:text-[#ff7b72] text-xs p-1"
                            title="Unstage (SQL DELETE)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* File Editor Form: INSERT into CAS & staging_index */}
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-[#30363D] mb-4">
              <div className="flex items-center space-x-2">
                <FilePlus className="w-4 h-4 text-[#58A6FF]" />
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                  Stage New File (CAS INSERT)
                </h3>
              </div>
              <span className="text-[10px] text-[#8B949E] font-mono">SHA-256 Deduplication</span>
            </div>

            <form onSubmit={handleStageFile} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-[#C9D1D9] mb-1">
                  File Path
                </label>
                <input
                  type="text"
                  required
                  value={stagePath}
                  onChange={(e) => setStagePath(e.target.value)}
                  placeholder="e.g. src/auth/token.ts"
                  className="w-full px-3 py-1.5 rounded-md bg-[#0D1117] border border-[#30363D] text-white text-xs font-mono focus:outline-none focus:border-[#58A6FF]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#C9D1D9] mb-1">
                  POSIX Mode
                </label>
                <select
                  value={stageMode}
                  onChange={(e) => setStageMode(e.target.value as '100644' | '100755')}
                  className="w-full px-3 py-1.5 rounded-md bg-[#0D1117] border border-[#30363D] text-white text-xs font-mono focus:outline-none focus:border-[#58A6FF] cursor-pointer"
                >
                  <option value="100644">100644 (Regular text file)</option>
                  <option value="100755">100755 (Executable binary/script)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#C9D1D9] mb-1">
                  File Content
                </label>
                <textarea
                  rows={4}
                  required
                  value={stageContent}
                  onChange={(e) => setStageContent(e.target.value)}
                  placeholder="Enter file text content..."
                  className="w-full px-3 py-2 rounded-md bg-[#0D1117] border border-[#30363D] text-white text-xs font-mono focus:outline-none focus:border-[#58A6FF]"
                />
              </div>

              <button
                type="submit"
                disabled={stageSubmitting}
                className="w-full py-2 rounded-md text-xs font-semibold bg-[#21262D] hover:bg-[#30363D] text-white border border-[#30363D] transition flex items-center justify-center space-x-2"
              >
                {stageSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="w-3.5 h-3.5 text-[#58A6FF]" />
                )}
                <span>Stage File (INSERT INTO staging_index)</span>
              </button>
            </form>
          </div>

          {/* GitHub-Style Unified Diff Preview */}
          {existingCommittedFile && activeDiffLines.length > 0 && (
            <div className="bg-[#0D1117] border border-[#30363D] rounded-xl overflow-hidden font-mono text-xs shadow-md">
              <div className="px-3.5 py-2 bg-[#161B22] border-b border-[#30363D] flex items-center justify-between text-[11px]">
                <div className="flex items-center space-x-2 text-white">
                  <GitCompare className="w-3.5 h-3.5 text-[#58A6FF]" />
                  <span className="font-semibold">{existingCommittedFile.file_path}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#58A6FF]/10 text-[#58A6FF] border border-[#58A6FF]/30 font-bold">
                    UNIFIED DIFF
                  </span>
                </div>
                <span className="text-[#8B949E] text-[10px]">
                  Parent Blob: <code className="text-[#3FB950]">{existingCommittedFile.blob_hash.slice(0, 8)}</code>
                </span>
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-[#21262D]/40 text-xs">
                {activeDiffLines.map((line, idx) => (
                  <div
                    key={idx}
                    className={`px-3 py-1 flex items-start space-x-2.5 font-mono ${
                      line.type === 'add'
                        ? 'bg-[#2ea04326] text-[#3fb950]'
                        : line.type === 'del'
                        ? 'bg-[#f8514926] text-[#f85149]'
                        : 'text-[#8B949E]'
                    }`}
                  >
                    <span className="w-4 select-none font-bold text-center">
                      {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                    </span>
                    <span className="whitespace-pre-wrap break-all flex-1">{line.text || ' '}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Green GitHub-Style Commit Box */}
          <div className="bg-[#161B22] border border-[#238636]/40 rounded-xl p-5 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-[#30363D] mb-4">
              <div className="flex items-center space-x-2">
                <GitCommit className="w-4 h-4 text-[#3FB950]" />
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                  Two-Phase Commit Coordinator
                </h3>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#238636]/10 text-[#3FB950] border border-[#238636]/30 font-mono">
                PostgreSQL &harr; Neo4j
              </span>
            </div>

            <form onSubmit={handleCommit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-[#C9D1D9] mb-1">
                  Commit Message
                </label>
                <input
                  type="text"
                  required
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="feat: add token authentication logic"
                  className="w-full px-3 py-2 rounded-md bg-[#0D1117] border border-[#30363D] text-white text-xs focus:outline-none focus:border-[#58A6FF]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#C9D1D9] mb-1">
                  Optional 2nd Parent Branch (3-Way Merge Commit)
                </label>
                <select
                  value={secondParentBranch}
                  onChange={(e) => setSecondParentBranch(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md bg-[#0D1117] border border-[#30363D] text-white text-xs font-mono focus:outline-none focus:border-[#58A6FF] cursor-pointer"
                >
                  <option value="">None (Standard single-parent commit)</option>
                  {branches
                    .filter((b) => b.branch_name !== selectedBranch && b.target_commit_hash)
                    .map((b) => (
                      <option key={b.branch_id} value={b.branch_name}>
                        Merge from: {b.branch_name} ({b.target_commit_hash?.slice(0, 8)})
                      </option>
                    ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={committing || stagedFiles.length === 0}
                className="w-full py-2.5 rounded-md text-xs font-semibold bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed text-white transition flex items-center justify-center space-x-2 shadow-sm"
              >
                {committing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>
                  Commit to {selectedBranch} ({stagedFiles.length} file{stagedFiles.length === 1 ? '' : 's'})
                </span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CodeAndStagingPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-[#8B949E] font-mono text-xs">
          Loading Code &amp; CAS Staging Studio...
        </div>
      }
    >
      <CodeAndStagingContent />
    </Suspense>
  );
}
