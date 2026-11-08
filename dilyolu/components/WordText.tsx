'use client';

import { useMemo, useState } from 'react';
import type { GlossaryItem } from '@/lib/types';

const strip = (s: string) =>
  s.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');

interface Props {
  text: string;
  glossary: GlossaryItem[];
  /** Karta ekle: eklenen kartların sayısını döndürür */
  onAdd: (item: GlossaryItem) => Promise<number>;
}

/** Metni kelimelere böler; sözlükte olanlar tıklanınca anlam ve "karta ekle" gösterir. */
export function WordText({ text, glossary, onAdd }: Props) {
  const [open, setOpen] = useState<GlossaryItem | null>(null);
  const [added, setAdded] = useState<Record<string, string>>({});
  const index = useMemo(() => {
    const m = new Map<string, GlossaryItem>();
    for (const g of glossary) {
      m.set(strip(g.lemma), g);
      for (const f of g.forms ?? []) m.set(strip(f), g);
    }
    return m;
  }, [glossary]);

  const parts = text.split(/(\p{L}[\p{L}'’-]*)/u);

  async function add(item: GlossaryItem) {
    setAdded((a) => ({ ...a, [item.lemma]: '…' }));
    try {
      const n = await onAdd(item);
      setAdded((a) => ({ ...a, [item.lemma]: n > 0 ? `${n} kart eklendi` : 'Zaten kartlarında' }));
    } catch {
      setAdded((a) => ({ ...a, [item.lemma]: 'Eklenemedi' }));
    }
  }

  return (
    <>
      {parts.map((p, i) => {
        const hit = index.get(strip(p));
        if (!hit) return <span key={i}>{p}</span>;
        return (
          <button key={i} type="button" className="w" onClick={() => setOpen(hit)} aria-label={`${p}: anlamı göster`}>
            {p}
          </button>
        );
      })}
      {open && (
        <div className="pop" role="dialog" aria-label="Kelime">
          <div className="row between">
            <h3 style={{ margin: 0 }}>
              {open.lemma} {open.pos && <small>{open.pos}</small>}
            </h3>
            <button className="btn small" onClick={() => setOpen(null)} aria-label="Kapat">✕</button>
          </div>
          <p style={{ margin: '0.4rem 0' }}>{open.meaning_tr}</p>
          {open.example && (
            <p className="muted" style={{ margin: '0 0 0.6rem' }}>
              {open.example}
              {open.example_tr && <><br />{open.example_tr}</>}
            </p>
          )}
          <button className="btn primary small" disabled={Boolean(added[open.lemma])} onClick={() => void add(open)}>
            {added[open.lemma] ?? 'Kartlara ekle'}
          </button>
        </div>
      )}
    </>
  );
}
