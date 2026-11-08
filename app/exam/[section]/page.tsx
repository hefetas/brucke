'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Gate, type ReadyApp } from '@/components/Gate';
import type { Db } from '@/lib/db';
import { EXAM_SECTIONS, GOETHE_LEVELS, SECTION_ICON, SECTION_LABEL, type AttemptLite, type ExamSection, type GoetheLevel } from '@/lib/exam';
import { getExamContent, itemRefs } from '@/lib/exam-content';
import { loadAttempts, loadSettings, saveSettings, type ExamSettings } from '@/lib/exam-data';

export default function SectionListPage() {
  return <Gate>{({ app, db }) => <SectionList app={app} db={db} />}</Gate>;
}

function SectionList({ app, db }: { app: ReadyApp; db: Db }) {
  const params = useParams<{ section: string }>();
  const section = params.section as ExamSection;
  const lang = app.active.language_code;
  const content = getExamContent(lang);
  const [settings, setSettings] = useState<ExamSettings | null | undefined>(undefined);
  const [attempts, setAttempts] = useState<AttemptLite[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [s, a] = await Promise.all([loadSettings(db, app.userId, lang), loadAttempts(db, app.userId, lang)]);
    setSettings(s);
    setAttempts(a);
  }, [db, app.userId, lang]);

  useEffect(() => {
    reload().catch((e) => setError(e instanceof Error ? e.message : 'Yüklenemedi'));
  }, [reload]);

  const exam = content?.exam ?? 'ielts';
  const level: GoetheLevel | null = exam === 'goethe' ? (settings?.goethe_level ?? 'B1') : null;
  const items = useMemo(() => (content ? itemRefs(content, level).filter((r) => r.section === section) : []), [content, level, section]);
  const best = useMemo(() => {
    const m = new Map<string, { last: AttemptLite; n: number }>();
    for (const a of [...attempts].reverse()) if (a.section === section) m.set(a.item_id, { last: a, n: (m.get(a.item_id)?.n ?? 0) + 1 });
    return m;
  }, [attempts, section]);

  if (!content || !EXAM_SECTIONS.includes(section)) {
    return <div className="card"><p>Bu bölüm bulunamadı.</p><Link className="btn" href="/exam">Sınav sekmesi</Link></div>;
  }
  if (error) return <div className="notice bad" role="alert">{error}</div>;
  if (settings === undefined) return <p className="muted" role="status">Yükleniyor…</p>;

  async function chooseLevel(l: GoetheLevel) {
    await saveSettings(db, app.userId, lang, {
      exam: 'goethe', target_band: null, goethe_level: l, exam_date: settings?.exam_date ?? null,
    });
    await reload();
  }

  const strategy = content.meta.strategies[section] ?? '';

  return (
    <div className="stack-lg">
      <div className="hero">
        <p className="muted" style={{ margin: 0 }}><Link href="/exam">← {content.meta.name}</Link></p>
        <h1 style={{ margin: '0.2rem 0' }}>{SECTION_ICON[section]} {SECTION_LABEL[exam][section]}</h1>
      </div>

      {exam === 'goethe' && (
        <div className="row" role="group" aria-label="Seviye">
          {GOETHE_LEVELS.map((l) => (
            <button key={l} className={`chip${l === level ? ' on' : ''}`} aria-pressed={l === level} onClick={() => void chooseLevel(l)}>{l}</button>
          ))}
        </div>
      )}

      {strategy && <details className="card"><summary><b>Strateji</b></summary><p className="muted" style={{ marginBottom: 0 }}>{strategy}</p></details>}

      {items.length === 0 && <p className="muted">Bu seviye için bu bölümde henüz görev yok.</p>}
      <div className="stack">
        {items.map((it) => {
          const b = best.get(it.id);
          const score = b ? (exam === 'ielts' && b.last.band !== null ? `band ${b.last.band}` : `%${Math.round(b.last.score_pct)}`) : null;
          return (
            <div className="card row between" key={it.id}>
              <div>
                <b>{it.title}</b>
                <p className="muted" style={{ margin: 0 }}>{b ? `${b.n} deneme · son sonuç ${score}` : 'henüz denenmedi'}</p>
              </div>
              <Link className="btn primary" href={`/exam/${section}/${it.id}`}>{b ? 'Tekrar dene' : 'Başla'}</Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
