'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { awardXp, checkAchievements, completeBlock, touchStreak, type Db, type NewAchievement } from '@/lib/db';
import type { ReadyApp } from './Gate';

/** Adres çubuğundaki ?ad=değer parametresini (sunucu çıktısını bozmadan) bağlandıktan sonra okur. */
export function useQueryParam(name: string): string | null {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    setV(new URLSearchParams(window.location.search).get(name));
  }, [name]);
  return v;
}

/** Sayfada geçen süreyi ölçer (sekme görünür olduğu sürece). */
export function useStopwatch() {
  const acc = useRef(0);
  const last = useRef<number | null>(null);
  useEffect(() => {
    const start = () => { last.current = Date.now(); };
    const stop = () => {
      if (last.current) acc.current += Date.now() - last.current;
      last.current = null;
    };
    const vis = () => (document.visibilityState === 'visible' ? start() : stop());
    start();
    document.addEventListener('visibilitychange', vis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  return useCallback(() => {
    const running = last.current ? Date.now() - last.current : 0;
    return Math.round((acc.current + running) / 1000);
  }, []);
}

/**
 * Bir etkinlik bittiğinde: XP, seri, rozet ve (derse bağlıysa) ders adımını tamamlar.
 * Yeni rozetleri döndürür, sayfa isterse gösterir.
 */
export function useFinish(app: ReadyApp, db: Db, lc: string | null) {
  const router = useRouter();
  const [earned, setEarned] = useState<NewAchievement[]>([]);
  const [saving, setSaving] = useState(false);
  const finish = useCallback(
    async (opts: { seconds: number; xp: number; cards?: number; result?: Record<string, unknown> }) => {
      setSaving(true);
      try {
        if (lc) await completeBlock(db, lc, opts.seconds, opts.result ?? {});
        await awardXp(db, app.userId, app.active.language_code, opts.xp);
        const streak = await touchStreak(db, app.userId, app.profile.timezone, app.profile.daily_minutes, {
          minutes: opts.seconds / 60,
          cards: opts.cards ?? 0,
          xp: opts.xp,
        });
        const got = await checkAchievements(db, app.userId, app.active.language_code, streak.length);
        setEarned(got);
        return got;
      } finally {
        setSaving(false);
      }
    },
    [app, db, lc],
  );
  const back = useCallback(() => router.push(lc ? '/lesson/today' : '/dashboard'), [router, lc]);
  return { finish, earned, saving, back };
}
