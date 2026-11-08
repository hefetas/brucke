'use client';

import { useState } from 'react';
import type { GlossaryItem } from '@/lib/types';

export function GlossaryPanel({ glossary, onAdd }: { glossary: GlossaryItem[]; onAdd: (items: GlossaryItem[]) => Promise<number> }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [count, setCount] = useState(0);
  if (!glossary.length) return null;

  async function addAll() {
    setState('busy');
    try {
      setCount(await onAdd(glossary));
      setState('done');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="card">
      <div className="row between">
        <h3 style={{ margin: 0 }}>Anahtar kelimeler</h3>
        <button className="btn small primary" disabled={state === 'busy' || state === 'done'} onClick={() => void addAll()}>
          {state === 'done' ? (count ? `${count} kart eklendi` : 'Zaten kartlarında') : state === 'busy' ? 'Ekleniyor…' : 'Hepsini kartlara ekle'}
        </button>
      </div>
      {state === 'error' && <p className="notice bad" role="alert">Kartlar eklenemedi, tekrar dene.</p>}
      <table>
        <tbody>
          {glossary.map((g) => (
            <tr key={g.lemma}>
              <td style={{ width: '32%' }}><b>{g.lemma}</b> {g.pos && <small className="muted">{g.pos}</small>}</td>
              <td>
                {g.meaning_tr}
                {g.example && <div className="muted"><small>{g.example}</small></div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
