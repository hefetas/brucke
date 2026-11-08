'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ReadyApp } from '../Gate';
import { useFinish, useStopwatch } from '../useBlock';
import { SelfAssess } from './SelfAssess';
import type { Db } from '@/lib/db';
import { analyzeWriting, countWords, selfScore, type ExamKind, type WritingCheck } from '@/lib/exam';
import type { ExamMeta, WritingItem } from '@/lib/exam-content';
import { saveAttempt } from '@/lib/exam-data';

const fmt = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`;

export function WritingRunner({ app, db, exam, item, meta }: { app: ReadyApp; db: Db; exam: ExamKind; item: WritingItem; meta: ExamMeta }) {
  const lang = app.active.language_code;
  const draftKey = `exam-draft-${app.userId}-${item.id}`;
  const [text, setText] = useState('');
  const [check, setCheck] = useState<WritingCheck | null>(null);
  const criteria = meta.rubrics.writing;
  const [picks, setPicks] = useState<(number | null)[]>(() => criteria.map(() => null));
  const [saved, setSaved] = useState<{ band: number | null; pct: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const elapsed = useStopwatch();
  const { finish } = useFinish(app, db, null);

  useEffect(() => {
    try { setText(localStorage.getItem(draftKey) ?? ''); } catch { /* özel pencere */ }
  }, [draftKey]);
  useEffect(() => {
    try { localStorage.setItem(draftKey, text); } catch { /* yoksay */ }
  }, [draftKey, text]);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const words = useMemo(() => countWords(text), [text]);
  const type = meta.essayTypes[item.kind];
  const remaining = item.minutes * 60 - elapsed();
  void tick;
  const ready = words >= Math.ceil(item.minWords / 2);
  const allPicked = picks.every((p) => p !== null);
  const preview = allPicked ? selfScore(exam, picks as number[]) : null;

  async function save() {
    if (!allPicked) return;
    const s = selfScore(exam, picks as number[]);
    setSaving(true);
    setError(null);
    try {
      await saveAttempt(db, app.userId, lang, {
        exam, section: 'writing', itemId: item.id, level: item.level ?? null, scorePct: s.pct, band: s.band,
        seconds: elapsed(), detail: { words, picks, check: check ? { linkers: check.linkers.length, paragraphs: check.paragraphs } : null },
      });
      await finish({ seconds: elapsed(), xp: 25 });
      try { localStorage.removeItem(draftKey); } catch { /* yoksay */ }
      setSaved(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack-lg">
      <div className="hero">
        <p className="muted" style={{ margin: 0 }}>{item.level ? `${item.level} · ` : ''}en az {item.minWords} kelime · önerilen süre {item.minutes} dk</p>
        <h1 style={{ margin: '0.2rem 0' }}>{item.title}</h1>
      </div>

      <div className="card stack">
        <p><b>{item.prompt}</b></p>
        {item.data && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', minWidth: 280 }}>
              <thead><tr>{item.data.headers.map((h) => <th key={h} style={{ textAlign: 'left', padding: '4px 12px 4px 0', borderBottom: '1px solid var(--line)' }}>{h}</th>)}</tr></thead>
              <tbody>{item.data.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: '4px 12px 4px 0' }}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
        {item.steps && <ol style={{ margin: 0 }}>{item.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
        {item.points && <ul style={{ margin: 0 }}>{item.points.map((p) => <li key={p}>{p}</li>)}</ul>}
      </div>

      {type && (
        <details className="card">
          <summary><b>Plan ve kalıplar · {type.name}</b></summary>
          <ol>{type.outline.map((o) => <li key={o}>{o}</li>)}</ol>
          <p className="muted" style={{ marginBottom: 4 }}>Kullanışlı kalıplar:</p>
          <ul style={{ margin: 0 }}>{type.phrases.map((p) => <li key={p}>{p}</li>)}</ul>
          {meta.strategies.writing && <p className="muted">{meta.strategies.writing}</p>}
        </details>
      )}

      {!saved && (
        <div className="card stack">
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setCheck(null); }}
            style={{ minHeight: 280 }}
            aria-label="Yazın"
            spellCheck={false}
            placeholder="Buraya yaz… (taslağın bu cihazda otomatik saklanır)"
          />
          <div className="row between">
            <span className={words >= item.minWords ? 'ok' : 'close'}><b>{words}</b> / {item.minWords} kelime</span>
            <span className="muted">{remaining >= 0 ? `Kalan süre ${fmt(remaining)}` : `Süre aşıldı +${fmt(remaining)}`}</span>
          </div>
          <div className="row">
            <button className="btn" disabled={words < 5} onClick={() => setCheck(analyzeWriting(text, { lang, minWords: item.minWords, wantParagraphs: item.wantParagraphs }))}>
              Ön kontrol
            </button>
          </div>
          {check && (
            <div className="notice good">
              <p style={{ margin: '0 0 4px' }}><b>Ön kontrol</b> <span className="muted">(otomatik, not değildir)</span></p>
              <ul style={{ margin: 0 }}>
                {check.notes.map((n) => <li key={n}>{n}</li>)}
                {check.linkers.length > 0 && <li>Kullandığın bağlaçlar: {check.linkers.slice(0, 8).join(', ')}.</li>}
              </ul>
            </div>
          )}
        </div>
      )}

      {ready && !saved && (
        <div className="stack">
          <h2>Öz değerlendirme</h2>
          <p className="muted" style={{ margin: 0 }}>
            Her ölçütte yazına en yakın tanımı seç.
            {exam === 'ielts' ? ' Kendini puanlarken genelde yukarı yuvarlarız; kararsız kalırsan düşük olanı seç.' : ' Kararsız kalırsan düşük olanı seç.'}
          </p>
          <SelfAssess criteria={criteria} picks={picks} onChange={setPicks} />
          {preview && (
            <p>{exam === 'ielts' ? <>Tahmini band: <b>{preview.band}</b></> : <>Tahmini puan: <b>%{Math.round(preview.pct)}</b> {preview.pct >= 60 ? '· geçme eşiğinin üstünde' : '· %60 eşiğinin altında'}</>}</p>
          )}
          {error && <div className="notice bad" role="alert">{error}</div>}
          <div className="row">
            <button className="btn primary" disabled={!allPicked || saving} onClick={() => void save()}>Kaydet</button>
          </div>
        </div>
      )}

      {saved && (
        <div className="card stack">
          <h2>Kaydedildi</h2>
          <p>{exam === 'ielts' ? <>Bu denemenin öz değerlendirme bandı: <b>{saved.band}</b>.</> : <>Öz değerlendirme puanı: <b>%{Math.round(saved.pct)}</b>.</>}</p>
          <div className="row">
            <Link className="btn primary" href="/exam/writing">Diğer görevler</Link>
            <Link className="btn" href="/exam">Sınav sekmesi</Link>
          </div>
        </div>
      )}
    </div>
  );
}
