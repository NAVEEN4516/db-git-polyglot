'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useActiveUser } from '@/lib/useActiveUser';
import {
  FolderGit2,
  Code2,
  GitBranch,
  LineChart,
  ShieldAlert,
  Lock,
  Globe,
  ArrowLeft,
  ChevronRight,
  Database,
  Terminal,
  Layers,
  Sparkles
} from 'lucide-react';

interface RepoDetails {
  repo_id: string;
  repo_name: string;
  description: string;
  is_private: boolean;
  owner_id: string;
  owner_username: string;
  default_branch: string;
}

function RepoLayoutInner({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const repoId = params?.repoId as string;

  const { activeUser, users, switchUser } = useActiveUser();
  const [repo, setRepo] = useState<RepoDetails | null>(null);
  const [userRole, setUserRole] = useState<string>('VIEWER');

  useEffect(() => {
    if (!repoId) return;

    const fetchRepo = async () => {
      try {
        const url = activeUser?.user_id
          ? `/api/repos?userId=${activeUser.user_id}`
          : '/api/repos';
        const res = await fetch(url);
        const data = await res.json();
        if (data.success && Array.isArray(data.repositories)) {
          const found = data.repositories.find((r: any) => r.repo_id === repoId);
          if (found) {
            setRepo(found);
          }
        }
      } catch (err) {
        console.error('Failed to fetch repo header info:', err);
      }
    };

    fetchRepo();
  }, [repoId, activeUser?.user_id]);

  useEffect(() => {
    if (!repoId || !activeUser) return;

    const fetchRole = async () => {
      try {
        const res = await fetch(`/api/collaborators?repoId=${repoId}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.collaborators)) {
          const c = data.collaborators.find((collab: any) => collab.user_id === activeUser.user_id);
          if (c) {
            setUserRole(c.access_role);
          } else if (repo?.owner_id === activeUser.user_id) {
            setUserRole('OWNER');
          } else {
            setUserRole('VIEWER');
          }
        }
      } catch (err) {
        console.error('Failed to load user role:', err);
      }
    };

    fetchRole();
  }, [repoId, activeUser?.user_id, repo?.owner_id]);

  const tabs = [
    {
      name: 'Code & CAS Staging',
      href: `/repos/${repoId}`,
      exact: true,
      icon: Code2,
      tag: 'Merkle Tree',
    },
    {
      name: 'Commit DAG & LCA Studio',
      href: `/repos/${repoId}/graph`,
      exact: false,
      icon: GitBranch,
      tag: 'Neo4j 5',
    },
    {
      name: 'SQL CTE & Vector Analytics',
      href: `/repos/${repoId}/analytics`,
      exact: false,
      icon: LineChart,
      tag: 'pgvector + CTE',
    },
    {
      name: 'RBAC & Viva Guards',
      href: `/repos/${repoId}/settings`,
      exact: false,
      icon: ShieldAlert,
      tag: 'Triggers & RLS',
    },
  ];

  return (
    <div className="min-h-screen bg-[#0D1117] text-[#C9D1D9] flex flex-col font-sans selection:bg-[#2F81F7]/30 selection:text-white">
      {/* ── GitHub Primer Top Header ───────────────────────────────────── */}
      <header className="border-b border-[#30363D] bg-[#161B22]/70 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center space-x-3">
            <Link
              href="/"
              className="p-1.5 rounded-md bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-white border border-[#30363D] transition"
              title="Return to Dashboard"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>

            <div className="flex items-center space-x-2 text-sm">
              <Link href="/" className="text-[#58A6FF] hover:underline font-medium">
                {repo?.owner_username || 'repositories'}
              </Link>
              <span className="text-[#8B949E]">/</span>
              <div className="flex items-center space-x-2">
                <FolderGit2 className="w-4 h-4 text-[#8B949E]" />
                <span className="font-bold text-white tracking-tight">
                  {repo?.repo_name || 'Repository'}
                </span>
              </div>
            </div>

            {repo?.is_private ? (
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

          {/* Active Demo Role Switcher Pill */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center bg-[#0D1117] border border-[#30363D] rounded-lg px-2.5 py-1 text-xs shadow-inner">
              <span className="text-[#8B949E] mr-1.5 hidden sm:inline">Active Demo User:</span>
              <span className="font-semibold text-white font-mono mr-2">
                {activeUser?.username || 'Guest'}
              </span>

              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                  userRole === 'OWNER'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : userRole === 'MAINTAINER'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : userRole === 'CONTRIBUTOR'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-[#21262D] text-[#8B949E] border border-[#30363D]'
                }`}
              >
                {userRole}
              </span>

              <select
                aria-label="Switch User"
                value={activeUser?.user_id || ''}
                onChange={(e) => {
                  const u = users.find((item) => item.user_id === e.target.value);
                  if (u) switchUser(u);
                }}
                className="bg-transparent text-[11px] text-[#58A6FF] font-mono ml-2 focus:outline-none cursor-pointer border-l border-[#30363D] pl-2"
              >
                {users.map((u) => (
                  <option key={u.user_id} value={u.user_id} className="bg-[#161B22] text-[#C9D1D9]">
                    Switch to {u.username}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── GitHub Primer Underlined Tabs ───────────────────────────── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-2 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = tab.exact
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
            const Icon = tab.icon;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center space-x-2 py-3 px-3.5 border-b-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-[#F78166] text-white font-semibold'
                    : 'border-transparent text-[#8B949E] hover:text-[#C9D1D9] hover:border-[#8B949E]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#8B949E]'}`} />
                <span>{tab.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    isActive
                      ? 'bg-[#21262D] text-[#58A6FF] border border-[#30363D]'
                      : 'bg-[#21262D] text-[#8B949E]'
                  }`}
                >
                  {tab.tag}
                </span>
              </Link>
            );
          })}
        </div>
      </header>

      {/* ── Main View Slot ───────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-7">
        {children}
      </main>
    </div>
  );
}

export default function RepoLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0D1117] text-[#8B949E] flex items-center justify-center font-mono text-xs">
          Loading Repository...
        </div>
      }
    >
      <RepoLayoutInner>{children}</RepoLayoutInner>
    </Suspense>
  );
}
