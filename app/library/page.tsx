'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gate, type ReadyApp } from '@/components/Gate';
import type { Db } from '@/lib/db';
import { CEFR_LEVELS, type Cefr } from '@/lib/levels';

export default function LibraryPage() {
  return <Gate>{({ app, db }) => <Library app={app} db={db} />}</Gate>;
}

interface Item {
  slug: string;
  title: string;
  level: Cefr;
  extra?: string;
}

const SECTIONS = [
  { key: 'listening', label: '🎧 Dinleme', table: 'listening_contents', path: 'listen', cols: 'slug, title, cefr_level, kind' },
  { key: 'reading', label: '📖 Okuma', table: 'reading_contents', path: 'read', cols: 'slug, title, cefr_level, kind' },
  { key: 'grammar', label: '🧩 Dilbilgisi', table: 'grammar_topics', path: 'grammar', cols: 'slug, title_tr, cefr_level' },
  { key: 'speaking', label: '🎙️ Konuşma', table: 'speaking_tasks', path: 'speak', cols: 'slug, title_tr, cefr_level, kind' },
  { key: 'writing', label: '✍️ Yazma', table: 'writing_tasks', path: 'write', cols: 'slug, title_tr, cefr_level, kind' },
] as const;

function Library({ app, db }: { app: ReadyApp; db: Db }) {
  const lang = app.active.language_code;
  const [tab, setTab] = useState<(typeof SECTIONS)[number]['key']>('listening');
  const [level, setLevel] = useState<Cefr | 'all'>('all');
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const section = SECTIONS.find((s) => s.key === tab)!;

  useEffect(() => {
    setItems(null);
    db.from(section.table).select(section.cols).eq('language_code', lang).order('cefr_level').order('slug').then(({ data, error: e }) => {
      if (e) return setError(e.message);
      setItems(((data ?? []) as unknown as Record<string, string>[]).map((r) => ({
        slug: r.slug, title: r.title ?? r.title_tr, level: r.cefr_level as Cefr, extra: r.kind,
      })));
    });
  }, [db, lang, section]);

  const shown = (items ?? []).filter((i) => level === 'all' || i.level === level);

  return (
    <div className="stack">
      <h1>Kütüphane</h1>
      <p className="muted">{app.activeLanguage.name_tr} içeriklerinden istediğini seç; ders planının dışında serbestçe çalış.</p>
      <div className="row">
        {SECTIONS.map((s) => (
          <button key={s.key} className="chip" aria-pressed={tab === s.key} onClick={() => setTab(s.key)}>{s.label}</button>
        ))}
      </div>
      <div className="row">
        <button className="chip" aria-pressed={level === 'all'} onClick={() => setLevel('all')}>Tüm seviyeler</button>
        {CEFR_LEVELS.slice(0, 5).map((l) => (
          <button key={l} className="chip" aria-pressed={level === l} onClick={() => setLevel(l)}>{l}</button>
        ))}
      </div>
      {error && <p className="notice bad" role="alert">{error}</p>}
      {!items ? <p className="muted">Yükleniyor…</p> : shown.length === 0 ? <p className="muted">Bu filtrede içerik yok.</p> : (
        <div className="grid two">
          {shown.map((i) => (
            <Link key={i.slug} href={`/${section.path}/${i.slug}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="tag accent">{i.level}</span> {i.extra && <span className="tag">{i.extra}</span>}
              <h3 style={{ marginTop: 8 }}>{i.title}</h3>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
