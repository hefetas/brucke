'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useApp } from './AppProvider';
import type { AppState, Db } from '@/lib/db';
import type { Language, UserLanguage } from '@/lib/types';

export type ReadyApp = AppState & { active: UserLanguage; activeLanguage: Language };

/** Veri yüklenene ve aktif dil seçilene kadar bekler; sonra render fonksiyonunu çağırır. */
export function Gate({ children }: { children: (ctx: { app: ReadyApp; db: Db }) => ReactNode }) {
  const { app, db, loading, error } = useApp();
  if (loading) return <p className="muted" role="status">Yükleniyor…</p>;
  if (error) return <div className="notice bad" role="alert">{error}</div>;
  if (!app) {
    return (
      <p>
        Oturum bulunamadı. <Link href="/login">Giriş yap</Link>
      </p>
    );
  }
  if (!app.active || !app.activeLanguage) {
    return (
      <div className="notice">
        Henüz bir hedef dil seçilmedi. <Link href="/setup">Kurulumu tamamla</Link>
      </div>
    );
  }
  return <>{children({ app: app as ReadyApp, db })}</>;
}
