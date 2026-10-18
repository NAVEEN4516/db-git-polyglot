'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useActiveUser, User } from '@/lib/useActiveUser';
import {
  FolderGit2,
  GitBranch,
  HardDrive,
  Lock,
  Globe,
  Plus,
  Users,
  Database,
  RefreshCw,
  UserCheck,
  CheckCircle2,
  X,
  Server,
  Layers,
  ArrowRight,
  GitFork,
  Cpu,
  Sparkles,
  Shield,
  Circle
} from 'lucide-react';

interface Repository {
  repo_id: string;
  repo_name: string;
  description: string;
  is_private: boolean;
  created_at: string;
  owner_id: string;
  owner_username: string;
  default_branch: string;
  unique_blobs: number;
  logical_bytes: number;
  stored_bytes: number;
  dedup_ratio: number;
  savings_pct: number;
}

export default function DashboardPage() {
  const { activeUser, users, switchUser, refreshUsers } = useActiveUser();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);

  // Modals state
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isCreateRepoOpen, setIsCreateRepoOpen] = useState(false);

  // Form states
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'USER' | 'ADMIN'>('USER');

  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDesc, setNewRepoDesc] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRepos = async () => {
    setLoadingRepos(true);
    try {
      const url = activeUser?.user_id
        ? `/api/repos?userId=${activeUser.user_id}`
        : '/api/repos';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.repositories)) {
        setRepos(data.repositories);
      }
    } catch (err) {
      console.error('Failed to load repositories:', err);
    } finally {
      setLoadingRepos(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, [activeUser?.user_id]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          username: newUsername.trim(),
          email: newEmail.trim(),
          password: newPassword,
          system_role: newRole,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Registration failed');
      }
      setIsRegisterOpen(false);
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      await refreshUsers();
      if (data.user) {
        switchUser(data.user);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) {
      setErrorMsg('Please select an active user first.');
      return;
    }
    setActionLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_id: activeUser.user_id,
          repo_name: newRepoName.trim(),
          description: newRepoDesc.trim(),
          is_private: newRepoPrivate,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create repository');
      }
      setIsCreateRepoOpen(false);
      setNewRepoName('');
      setNewRepoDesc('');
      setNewRepoPrivate(false);
      await fetchRepos();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // User avatar color helper
  const getAvatarColor = (name: string) => {
    if (name.includes('owner')) return 'from-purple-600 to-indigo-600';
    if (name.includes('maintainer')) return 'from-blue-600 to-cyan-600';
    if (name.includes('dev')) return 'from-emerald-600 to-teal-600';
    return 'from-amber-600 to-orange-600';
  };

  return (
    <div className="min-h-screen bg-[#0D1117] text-[#C9D1D9] flex flex-col font-sans selection:bg-[#2F81F7]/30 selection:text-white">
      {/* ── Top Command Bar ────────────────────────────────────────────── */}
      <header className="border-b border-[#30363D] bg-[#0D1117]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Platform Info */}
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-[#238636] to-[#2EA043] flex items-center justify-center shadow-md shadow-[#238636]/20 border border-[#30363D] group-hover:scale-105 transition-transform">
                <Database className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-base text-white tracking-tight group-hover:text-[#58A6FF] transition-colors">
                    DB-Git
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#161B22] text-[#58A6FF] border border-[#30363D] font-mono font-semibold">
                    Level 3 Polyglot
                  </span>
                </div>
                <p className="text-[11px] text-[#8B949E] hidden md:block">
                  PES University Mini-Project &bull; PES1UG24AM379 &amp; PES1UG24AM381
                </p>
              </div>
            </Link>

            {/* Engine Status Pills */}
            <div className="hidden xl:flex items-center space-x-2 ml-4 pl-4 border-l border-[#30363D] text-[11px] font-mono">
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-[#161B22] border border-[#30363D] text-[#8B949E]">
                <Circle className="w-2 h-2 fill-[#238636] text-[#238636] animate-pulse" />
                <span>PostgreSQL 16 ACID</span>
              </div>
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-[#161B22] border border-[#30363D] text-[#8B949E]">
                <Circle className="w-2 h-2 fill-[#2F81F7] text-[#2F81F7] animate-pulse" />
                <span>Neo4j 5 DAG</span>
              </div>
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-[#161B22] border border-[#30363D] text-[#8B949E]">
                <Sparkles className="w-3 h-3 text-[#10B981]" />
                <span>pgvector 384-d</span>
              </div>
            </div>
          </div>

          {/* Right Action Bar: User Switcher, Register, New Repo */}
          <div className="flex items-center space-x-3">
            {/* Active Demo Role Switcher Pill */}
            <div className="flex items-center bg-[#161B22] border border-[#30363D] rounded-lg p-1 shadow-sm">
              <div
                className={`w-6 h-6 rounded-full bg-gradient-to-tr ${getAvatarColor(
                  activeUser?.username || ''
                )} flex items-center justify-center text-[10px] font-bold text-white uppercase ml-1`}
              >
                {activeUser?.username?.slice(0, 2) || 'GU'}
              </div>
              <div className="ml-2 mr-1 hidden sm:block text-left">
                <span className="block text-xs font-semibold text-white leading-tight">
                  {activeUser?.username || 'Guest'}
                </span>
              </div>
              <select
                aria-label="Active Demo User"
                value={activeUser?.user_id || ''}
                onChange={(e) => {
                  const u = users.find((item) => item.user_id === e.target.value);
                  if (u) switchUser(u);
                }}
                className="bg-transparent text-xs text-[#58A6FF] font-mono py-1 px-2 focus:outline-none cursor-pointer border-l border-[#30363D] ml-1.5"
              >
                {users.map((u) => (
                  <option key={u.user_id} value={u.user_id} className="bg-[#161B22] text-[#C9D1D9]">
                    {u.username} [{u.system_role}]
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => {
                setErrorMsg(null);
                setIsRegisterOpen(true);
              }}
              className="text-xs font-medium px-3 py-1.5 rounded-md bg-[#21262D] hover:bg-[#30363D] text-[#C9D1D9] hover:text-white border border-[#30363D] transition flex items-center space-x-1.5"
            >
              <Users className="w-3.5 h-3.5 text-[#8B949E]" />
              <span className="hidden sm:inline">Register User</span>
            </button>

            <button
              onClick={() => {
                setErrorMsg(null);
                setIsCreateRepoOpen(true);
              }}
              className="text-xs font-medium px-3.5 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white border border-[rgba(240,246,252,0.1)] transition shadow-sm flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Repository</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Workspace Architecture Banner ────────────────────────────── */}
      <div className="bg-[#161B22]/50 border-b border-[#30363D] py-8 px-4 sm:px-6 lg:px-8 bg-dot-grid">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#58A6FF] px-2 py-0.5 rounded bg-[#388BFD]/10 border border-[#388BFD]/20">
                Heterogeneous Polyglot Architecture
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Content-Addressable Repositories
            </h1>
            <p className="text-sm text-[#8B949E] max-w-2xl leading-relaxed">
              Two-phase atomic commit coordinator orchestrating SHA-256 CAS deduplication and Merkle
              trees in PostgreSQL 16 with directed acyclic graph (DAG) topological traversal in Neo4j 5.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs">
            <div className="p-3 rounded-lg bg-[#0D1117] border border-[#30363D]">
              <span className="text-[#8B949E] block text-[10px] uppercase">Storage Engine</span>
              <span className="font-semibold text-white">PostgreSQL 16</span>
              <span className="block text-[10px] text-[#238636] mt-0.5">ACID + CAS Blobs</span>
            </div>
            <div className="p-3 rounded-lg bg-[#0D1117] border border-[#30363D]">
              <span className="text-[#8B949E] block text-[10px] uppercase">DAG Graph Store</span>
              <span className="font-semibold text-white">Neo4j 5 Bolt</span>
              <span className="block text-[10px] text-[#2F81F7] mt-0.5">LCA &amp; Lineage</span>
            </div>
            <div className="col-span-2 sm:col-span-1 p-3 rounded-lg bg-[#0D1117] border border-[#30363D]">
              <span className="text-[#8B949E] block text-[10px] uppercase">Vector Search</span>
              <span className="font-semibold text-white">pgvector 384-d</span>
              <span className="block text-[10px] text-[#10B981] mt-0.5">Cosine Similarity</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content Area: Repositories List ──────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#30363D]">
          <div className="flex items-center space-x-2.5">
            <FolderGit2 className="w-5 h-5 text-[#58A6FF]" />
            <h2 className="text-lg font-semibold text-white">Repositories</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#21262D] text-[#8B949E] border border-[#30363D] font-mono">
              {repos.length}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={fetchRepos}
              className="p-1.5 rounded-md text-[#8B949E] hover:text-white hover:bg-[#21262D] border border-transparent hover:border-[#30363D] transition"
              title="Refresh repository list"
            >
              <RefreshCw className={`w-4 h-4 ${loadingRepos ? 'animate-spin text-[#58A6FF]' : ''}`} />
            </button>
          </div>
        </div>

        {loadingRepos ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-44 rounded-xl bg-[#161B22] border border-[#30363D] animate-shimmer p-6"
              />
            ))}
          </div>
        ) : repos.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-[#30363D] rounded-2xl bg-[#161B22]/30">
            <FolderGit2 className="w-12 h-12 text-[#484F58] mx-auto mb-3" />
            <h3 className="text-base font-semibold text-white">No repositories created yet</h3>
            <p className="text-sm text-[#8B949E] mt-1 max-w-sm mx-auto">
              Run <code className="text-[#58A6FF] font-mono">npx tsx database/seed.ts</code> to load the
              evaluation dataset, or click below to create your first repository.
            </p>
            <button
              onClick={() => setIsCreateRepoOpen(true)}
              className="mt-5 inline-flex items-center space-x-2 text-xs font-semibold px-4 py-2 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create Repository</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {repos.map((repo) => {
              const savings = Math.max(0, Number(repo.savings_pct || 0)).toFixed(1);
              return (
                <Link
                  key={repo.repo_id}
                  href={`/repos/${repo.repo_id}`}
                  className="group flex flex-col justify-between rounded-xl bg-[#161B22] hover:bg-[#1C2128] border border-[#30363D] hover:border-[#58A6FF]/60 p-5 transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <div>
                    {/* Repo Title & Privacy Badge */}
                    <div className="flex items-start justify-between mb-2.5">
                      <div className="flex items-center space-x-2 overflow-hidden">
                        <FolderGit2 className="w-4 h-4 text-[#58A6FF] flex-shrink-0" />
                        <h3 className="font-semibold text-white group-hover:text-[#58A6FF] transition text-sm tracking-tight truncate">
                          {repo.repo_name}
                        </h3>
                      </div>

                      {repo.is_private ? (
                        <span className="flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded-full bg-[#D29922]/10 text-[#D29922] border border-[#D29922]/30 font-mono">
                          <Lock className="w-2.5 h-2.5" />
                          <span>Private</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded-full bg-[#238636]/10 text-[#3FB950] border border-[#238636]/30 font-mono">
                          <Globe className="w-2.5 h-2.5" />
                          <span>Public</span>
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-xs text-[#8B949E] line-clamp-2 min-h-[34px] leading-relaxed">
                      {repo.description || 'Polyglot repository with Merkle trees and graph DAG.'}
                    </p>

                    {/* Metadata & Branch */}
                    <div className="flex items-center space-x-3 mt-4 text-[11px] text-[#8B949E] font-mono">
                      <div className="flex items-center space-x-1">
                        <GitBranch className="w-3 h-3 text-[#58A6FF]" />
                        <span className="text-[#C9D1D9]">{repo.default_branch || 'main'}</span>
                      </div>
                      <div>
                        Owner: <span className="text-[#C9D1D9]">{repo.owner_username}</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Strip: CAS Deduplication Efficiency */}
                  <div className="mt-5 pt-3.5 border-t border-[#30363D] flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-[#3FB950]" />
                      <span className="text-xs font-mono font-semibold text-[#3FB950]">
                        {savings}% CAS Saved
                      </span>
                    </div>

                    <div className="flex items-center space-x-1 text-xs text-[#58A6FF] font-medium group-hover:translate-x-1 transition-transform">
                      <span>Explore</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Modal: Register New User ─────────────────────────────────── */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#30363D]">
              <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                <Users className="w-4 h-4 text-[#58A6FF]" />
                <span>Register Demo User</span>
              </h3>
              <button
                onClick={() => setIsRegisterOpen(false)}
                className="text-[#8B949E] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 p-3 rounded-md bg-[#F85149]/10 border border-[#F85149]/30 text-[#F85149] text-xs font-mono">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleRegister} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#C9D1D9] mb-1">
                  Username (min 3 chars)
                </label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. naveen_lead"
                  className="w-full px-3 py-2 rounded-md bg-[#0D1117] border border-[#30363D] text-white text-xs font-mono focus:outline-none focus:border-[#58A6FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#C9D1D9] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. naveen@dbgit.pesu.edu"
                  className="w-full px-3 py-2 rounded-md bg-[#0D1117] border border-[#30363D] text-white text-xs font-mono focus:outline-none focus:border-[#58A6FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#C9D1D9] mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-md bg-[#0D1117] border border-[#30363D] text-white text-xs font-mono focus:outline-none focus:border-[#58A6FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#C9D1D9] mb-1">
                  System Role
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'USER' | 'ADMIN')}
                  className="w-full px-3 py-2 rounded-md bg-[#0D1117] border border-[#30363D] text-white text-xs font-mono focus:outline-none focus:border-[#58A6FF] cursor-pointer"
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="px-3 py-1.5 rounded-md text-xs text-[#8B949E] hover:text-white hover:bg-[#21262D] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[#238636] hover:bg-[#2ea043] text-white transition flex items-center space-x-1.5"
                >
                  {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Create Account</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Create Repository ─────────────────────────────────── */}
      {isCreateRepoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#30363D]">
              <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                <FolderGit2 className="w-4 h-4 text-[#58A6FF]" />
                <span>Create New Repository</span>
              </h3>
              <button
                onClick={() => setIsCreateRepoOpen(false)}
                className="text-[#8B949E] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 p-3 rounded-md bg-[#F85149]/10 border border-[#F85149]/30 text-[#F85149] text-xs font-mono">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateRepo} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#C9D1D9] mb-1">
                  Owner
                </label>
                <div className="px-3 py-2 rounded-md bg-[#0D1117] border border-[#30363D] text-[#C9D1D9] text-xs font-mono flex items-center justify-between">
                  <span>{activeUser?.username || 'No user selected'}</span>
                  <span className="text-[10px] text-[#3FB950] font-bold">[OWNER]</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#C9D1D9] mb-1">
                  Repository Name (alphanumeric, -, _, .)
                </label>
                <input
                  type="text"
                  required
                  pattern="^[A-Za-z0-9._-]+$"
                  value={newRepoName}
                  onChange={(e) => setNewRepoName(e.target.value)}
                  placeholder="e.g. polyglot-vcs-core"
                  className="w-full px-3 py-2 rounded-md bg-[#0D1117] border border-[#30363D] text-white text-xs font-mono focus:outline-none focus:border-[#58A6FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#C9D1D9] mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={newRepoDesc}
                  onChange={(e) => setNewRepoDesc(e.target.value)}
                  placeholder="Polyglot version control core with CAS storage..."
                  className="w-full px-3 py-2 rounded-md bg-[#0D1117] border border-[#30363D] text-white text-xs focus:outline-none focus:border-[#58A6FF]"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="isPrivate"
                  checked={newRepoPrivate}
                  onChange={(e) => setNewRepoPrivate(e.target.checked)}
                  className="w-4 h-4 rounded text-[#238636] bg-[#0D1117] border-[#30363D] focus:ring-[#238636] cursor-pointer"
                />
                <label htmlFor="isPrivate" className="text-xs text-[#8B949E] cursor-pointer select-none">
                  Private repository (enforces PostgreSQL Row-Level Security)
                </label>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateRepoOpen(false)}
                  className="px-3 py-1.5 rounded-md text-xs text-[#8B949E] hover:text-white hover:bg-[#21262D] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[#238636] hover:bg-[#2ea043] text-white transition flex items-center space-x-1.5"
                >
                  {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Initialize Repository</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
