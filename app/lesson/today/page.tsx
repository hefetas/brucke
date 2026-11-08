'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Gate, type ReadyApp } from '@/components/Gate';
import { awardXp, checkAchievements, completeBlock, localDate, touchStreak, xpFor, type Db, type NewAchievement } from '@/lib/db';
import { BLOCK_LINK, ensureTodayLesson, type TodayLesson } from '@/lib/lesson';
import { realWorldFor } from '@/lib/realworld';
import type { LessonContentRow } from '@/lib/types';

export default function TodayPage() {
  return <Gate>{({ app, db }) => <Today app={app} db={db} />}</Gate>;
}

const STEP_TR: Record<number, string> = { 1: 'Girdi', 2: 'Anlama', 3: 'Hatırlama', 4: 'Üretim', 5: 'Serbest' };
const TYPE_ICON: Record<string, string> = {
  listening: '🎧', reading: '📖', grammar: '🧩', speaking: '🎙️', writing: '✍️', review: '🔁', real_world: '🌍', free: '✨',
};
const fmt = (s: number) => (s >= 60 ? `${Math.round(s / 60)} dk` : `${s} sn`);

function Today({ app, db }: { app: ReadyApp; db: Db }) {
  const [data, setData] = useState<TodayLesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [earned, setEarned] = useState<NewAchievement[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const reload = useCallback(async () => {
    const t = await ensureTodayLesson(db, app);
    if (t && t.lesson.status === 'planned' && t.blocks.some((b) => b.status !== 'pending')) {
      await db.from('lessons').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', t.lesson.id);
      t.lesson.status = 'in_progress';
    }
    setData(t);
  }, [db, app]);

  useEffect(() => {
    reload().catch((e) => setError(e instanceof Error ? e.message : 'Ders hazırlanamadı'));
  }, [reload]);

  if (error) return <div className="notice bad" role="alert">{error}</div>;
  if (!data) return <p className="muted" role="status">Bugünkü dersin hazırlanıyor…</p>;

  const { lesson, blocks } = data;
  const pending = blocks.filter((b) => b.status === 'pending');
  const allDone = pending.length === 0;
  const completed = lesson.status === 'completed';
  const plannedMin = Math.round(blocks.reduce((s, b) => s + b.planned_seconds, 0) / 60);
  const doneMin = Math.round(blocks.reduce((s, b) => s + (b.actual_seconds ?? 0), 0) / 60);
  const today = localDate(app.profile.timezone);

  async function mark(b: LessonContentRow, status: 'done' | 'skipped', result: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      if (status === 'done') await completeBlock(db, b.id, b.planned_seconds, result);
      else await db.from('lesson_contents').update({ status: 'skipped' }).eq('id', b.id);
      await db.from('lessons').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', lesson.id).eq('status', 'planned');
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    setBusy(true);
    try {
      const secs = blocks.reduce((s, b) => s + (b.actual_seconds ?? 0), 0);
      const xp = xpFor.lesson;
      await db.from('lessons').update({
        status: 'completed', completed_at: new Date().toISOString(), xp_earned: xp,
        summary: { minutes: Math.round(secs / 60), blocks: blocks.length, skipped: blocks.filter((b) => b.status === 'skipped').length },
      }).eq('id', lesson.id);
      await awardXp(db, app.userId, lesson.language_code, xp);
      const streak = await touchStreak(db, app.userId, app.profile.timezone, app.profile.daily_minutes, { lessons: 1, xp });
      setEarned(await checkAchievements(db, app.userId, lesson.language_code, streak.length));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-lg">
      <div className="hero">
        <h1>Bugünkü ders</h1>
        <p className="muted">{lesson.plan_minutes} dakikalık plan · {today}</p>
      </div>

      {completed && (
        <div className="notice good">
          🎉 Ders tamamlandı: yaklaşık {Math.max(doneMin, 1)} dakika çalıştın, +{lesson.xp_earned} XP.
          {earned.map((a) => <div key={a.code}>🏅 Yeni rozet: {a.title_tr}</div>)}
        </div>
      )}

      <div className="card">
        <div className="bar" aria-label="Ders ilerlemesi">
          <i style={{ width: `${(blocks.filter((b) => b.status !== 'pending').length / Math.max(1, blocks.length)) * 100}%` }} />
        </div>
        <p className="muted" style={{ margin: '6px 0 0' }}><small>{blocks.length - pending.length}/{blocks.length} adım · planlanan {plannedMin} dk</small></p>
        <ol className="steps">
          {blocks.map((b, i) => (
            <li key={b.id}>
              <span className={`dot ${b.status === 'done' ? 'done' : ''}`}>{b.status === 'done' ? '✓' : b.status === 'skipped' ? '–' : i + 1}</span>
              <div style={{ flex: 1 }}>
                <div>
                  {TYPE_ICON[b.content_type]} <b>{b.title}</b> <span className="tag">{STEP_TR[b.step]}</span>
                </div>
                <small className="muted">
                  ~{fmt(b.planned_seconds)}
                  {b.status === 'done' && b.actual_seconds ? ` · ${fmt(b.actual_seconds)} sürdü` : ''}
                  {b.status === 'skipped' ? ' · atlandı' : ''}
                </small>
                {b.content_type === 'real_world' && b.status === 'pending' && !completed && (() => {
                  const t = realWorldFor(lesson.language_code, lesson.lesson_date);
                  return (
                    <div className="card" style={{ marginTop: 8 }}>
                      <h3>{t.title}</h3>
                      <p>{t.steps_tr}</p>
                      <label htmlFor="rw">Ne yaptın? (kısa not)</label>
                      <input id="rw" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
                      <div className="row" style={{ marginTop: 10 }}>
                        <button className="btn primary small" disabled={busy} onClick={() => void mark(b, 'done', { note })}>Yaptım</button>
                      </div>
                    </div>
                  );
                })()}
                {b.content_type === 'free' && b.status === 'pending' && !completed && (
                  <p style={{ margin: '6px 0 0' }}>
                    <Link className="btn small" href="/library">Kütüphaneden seç</Link>{' '}
                    <button className="btn small" disabled={busy} onClick={() => void mark(b, 'done')}>Bitti</button>
                  </p>
                )}
              </div>
              {b.status === 'pending' && !completed && b.content_type !== 'real_world' && b.content_type !== 'free' && (
                <div className="row">
                  <Link className="btn primary small" href={BLOCK_LINK[b.content_type](b.content_slug, b.id)}>Başla</Link>
                  <button className="btn small" disabled={busy} onClick={() => void mark(b, 'skipped')}>Atla</button>
                </div>
              )}
              {b.status === 'pending' && !completed && (b.content_type === 'real_world' || b.content_type === 'free') && (
                <button className="btn small" disabled={busy} onClick={() => void mark(b, 'skipped')}>Atla</button>
              )}
            </li>
          ))}
        </ol>
      </div>

      {allDone && !completed && (
        <button className="btn primary" disabled={busy} onClick={() => void complete()}>Dersi bitir</button>
      )}
      {completed && <Link className="btn primary" href="/dashboard">Panele dön</Link>}
    </div>
  );
}
