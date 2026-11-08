'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { flushQueue, loadApp, type AppState, type Db } from '@/lib/db';

interface Ctx {
  db: Db;
  app: AppState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppProvider eksik');
  return c;
}

/** Aktif dil ve profil hazır olana kadar bekler; sayfalar bunu tek yerden kullanır. */
export function useReady() {
  const { app, loading, error, db } = useApp();
  return { app, loading, error, db, ready: Boolean(app && app.active && app.activeLanguage) };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const db = useMemo(() => supabaseBrowser(), []);
  const path = usePathname();
  const router = useRouter();
  const [app, setApp] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const state = await loadApp(db);
      setApp(state);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    if (path === '/login') {
      setApp(null); // çıkış sonrası eski kullanıcının verisi kalmasın
      setLoading(false);
      return;
    }
    if (!app) void refresh();
  }, [path, app, refresh]);

  useEffect(() => {
    if (!app) return;
    if (!app.profile.onboarding_done && path !== '/setup' && path !== '/login') router.replace('/setup');
  }, [app, path, router]);

  useEffect(() => {
    const t = app?.profile.theme;
    if (!t || t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }, [app?.profile.theme]);

  useEffect(() => {
    if (!app) return;
    void flushQueue(db);
    const on = () => void flushQueue(db);
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [app, db]);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ db, app, loading, error, refresh }), [db, app, loading, error, refresh]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
