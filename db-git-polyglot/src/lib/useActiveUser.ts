'use client';

import { useState, useEffect, useCallback } from 'react';

export interface User {
  user_id: string;
  username: string;
  email: string;
  system_role: 'ADMIN' | 'USER';
}

const STORAGE_KEY = 'dbgit_active_user';
const EVENT_NAME = 'dbgit_active_user_changed';

export function useActiveUser() {
  const [activeUser, setActiveUserState] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/auth');
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        setUsers(data.users);

        // Check localStorage
        const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            const found = data.users.find((u: User) => u.user_id === parsed.user_id);
            if (found) {
              setActiveUserState(found);
              return;
            }
          } catch {
            // parse error fallback
          }
        }

        // Default to first user if available
        if (data.users.length > 0) {
          const defaultUser = data.users.find((u: User) => u.username.includes('owner')) || data.users[0];
          setActiveUserState(defaultUser);
          if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultUser));
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch demo users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setActiveUserState(JSON.parse(e.newValue));
        } catch {}
      }
    };

    const handleCustomEvent = (e: any) => {
      if (e.detail) {
        setActiveUserState(e.detail);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(EVENT_NAME, handleCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(EVENT_NAME, handleCustomEvent);
    };
  }, [fetchUsers]);

  const switchUser = (user: User) => {
    setActiveUserState(user);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: user }));
    }
  };

  return { activeUser, users, loading, switchUser, refreshUsers: fetchUsers };
}
