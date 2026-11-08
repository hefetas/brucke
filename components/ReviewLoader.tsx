'use client';

import { useEffect, useState } from 'react';
import type { ReadyApp } from './Gate';
import { ReviewSession } from './ReviewSession';
import type { Db } from '@/lib/db';

/** Aralıklı tekrar kartı oturumu. Derse bağlıysa (?lc=) kart sayısı süreye göre belirlenir (≈25 sn/kart). */
export function ReviewLoader({ app, db }: { app: ReadyApp; db: Db }) {
  const [state, setState] = useState<{ lc: string | null; limit: number } | null>(null);

  useEffect(() => {
    const lc = new URLSearchParams(window.location.search).get('lc');
    if (!lc) {
      setState({ lc: null, limit: 50 });
      return;
    }
    db.from('lesson_contents').select('planned_seconds').eq('id', lc).maybeSingle().then(({ data }) => {
      setState({ lc, limit: Math.max(5, Math.floor((data?.planned_seconds ?? 300) / 25)) });
    });
  }, [db]);

  if (!state) return <p className="muted">Hazırlanıyor…</p>;
  return (
    <>
      <h1>Kart tekrarı</h1>
      <ReviewSession app={app} db={db} lc={state.lc} limit={state.limit} />
    </>
  );
}
