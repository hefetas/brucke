'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gate, type ReadyApp } from '@/components/Gate';
import { addCardsFromWords, addCustomCard, addStarterWords, type Db } from '@/lib/db';
import { formatInterval } from '@/lib/srs';
import type { CardRow, GlossaryItem } from '@/lib/types';

export default function CardsPage() {
  return <Gate>{({ app, db }) => <Cards app={app} db={db} />}</Gate>;
}

const STATE_TR: Record<string, string> = { new: 'yeni', learning: 'öğreniyor', review: 'tekrar', relearning: 'yeniden', suspended: 'askıda' };

function Cards({ app, db }: { app: ReadyApp; db: Db }) {
  const lang = app.active.language_code;
  const [rows, setRows] = useState<CardRow[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'due' | 'leech' | 'suspended'>('all');
  const [error, setError] = useState<string | null>(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [word, setWord] = useState('');
  const [found, setFound] = useState<GlossaryItem | null>(null);
  const [looking, setLooking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await db
      .from('user_cards').select('*').eq('user_id', app.userId).eq('language_code', lang).is('deleted_at', null)
      .order('learned_at', { ascending: false }).limit(600);
    if (e) setError(e.message);
    else setRows((data ?? []) as CardRow[]);
  }, [db, app.userId, lang]);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const now = Date.now();
    return (rows ?? []).filter((r) => {
      if (filter === 'due' && !(r.state !== 'suspended' && new Date(r.due_at).getTime() <= now)) return false;
      if (filter === 'leech' && !r.is_leech) return false;
      if (filter === 'suspended' && r.state !== 'suspended') return false;
      const t = q.trim().toLowerCase();
      return !t || r.front.toLowerCase().includes(t) || r.back.toLowerCase().includes(t);
    });
  }, [rows, q, filter]);

  async function patch(id: string, values: Record<string, unknown>) {
    const { error: e } = await db.from('user_cards').update(values).eq('id', id).eq('user_id', app.userId);
    if (e) setError(e.message);
    else await load();
  }

  async function lookup() {
    setLooking(true);
    setMsg(null);
    setFound(null);
    try {
      const res = await fetch(`/api/vocabulary/lookup?word=${encodeURIComponent(word.trim())}&lang=${lang}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Bulunamadı');
      setFound(json.entry as GlossaryItem);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Bulunamadı');
    } finally {
      setLooking(false);
    }
  }

  return (
    <div className="stack-lg">
      <div className="row between">
        <h1 style={{ margin: 0 }}>Kartlarım</h1>
        <button className="btn" onClick={async () => {
          try {
            const n = await addStarterWords(db, app.userId, lang, app.active.level_vocab, 10);
            setMsg(n ? `${n} kart eklendi (başlangıç kelimeleri)` : 'Bu seviyedeki başlangıç kelimelerinin hepsi zaten kartlarında.');
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Eklenemedi');
          }
        }}>+ 10 başlangıç kelimesi</button>
      </div>
      {msg && <p className="notice good" role="status">{msg}</p>}
      {error && <p className="notice bad" role="alert">{error}</p>}

      <div className="grid two">
        <div className="card">
          <h3>Kelime ara ve ekle</h3>
          <p className="muted"><small>Yapay zekâ anahtarı tanımlıysa anlam ve örnek cümle otomatik gelir.</small></p>
          <div className="row">
            <input type="text" value={word} onChange={(e) => setWord(e.target.value)} placeholder={lang === 'de' ? 'z. B. die Entscheidung' : 'e.g. reliable'} aria-label="Kelime" style={{ flex: 1 }} />
            <button className="btn" disabled={looking || !word.trim()} onClick={() => void lookup()}>{looking ? '…' : 'Bul'}</button>
          </div>
          {found && (
            <div style={{ marginTop: 10 }}>
              <p><b>{found.lemma}</b> {found.pos && <small className="muted">{found.pos}</small>}<br />{found.meaning_tr}</p>
              {found.example && <p className="muted"><small>{found.example}<br />{found.example_tr}</small></p>}
              <button className="btn primary small" onClick={async () => {
                const n = await addCardsFromWords(db, app.userId, lang, [found], { type: 'lookup', slug: found.lemma });
                setMsg(n ? `${n} kart eklendi` : 'Zaten kartlarında');
                setFound(null);
                setWord('');
                await load();
              }}>Kartlara ekle</button>
            </div>
          )}
          {msg && <p className="notice" style={{ marginTop: 10 }}>{msg}</p>}
        </div>

        <div className="card">
          <h3>Kendi kartını yaz</h3>
          <label htmlFor="f" style={{ marginTop: 0 }}>Ön yüz</label>
          <input id="f" type="text" value={front} onChange={(e) => setFront(e.target.value)} />
          <label htmlFor="b">Arka yüz</label>
          <input id="b" type="text" value={back} onChange={(e) => setBack(e.target.value)} />
          <p style={{ marginTop: 10 }}>
            <button className="btn primary small" disabled={!front.trim() || !back.trim()} onClick={async () => {
              await addCustomCard(db, app.userId, lang, front.trim(), back.trim());
              setFront(''); setBack('');
              await load();
            }}>Ekle</button>
          </p>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara…" aria-label="Kartlarda ara" style={{ flex: 1, minWidth: 160 }} />
          {(['all', 'due', 'leech', 'suspended'] as const).map((f) => (
            <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {{ all: 'Hepsi', due: 'Bekleyen', leech: 'Zor kartlar', suspended: 'Askıda' }[f]}
            </button>
          ))}
        </div>
        {!rows ? <p className="muted">Yükleniyor…</p> : (
          <>
            <p className="muted"><small>{shown.length} kart</small></p>
            <table>
              <thead><tr><th>Kart</th><th>Durum</th><th /></tr></thead>
              <tbody>
                {shown.map((r) => {
                  const mins = (new Date(r.due_at).getTime() - Date.now()) / 60000;
                  return (
                    <tr key={r.id}>
                      <td>
                        <b>{r.front.split('\n')[0]}</b> {r.is_leech && <span className="tag warm">zor</span>}
                        <div className="muted"><small>{r.back.split('\n')[0]}</small></div>
                      </td>
                      <td>
                        <span className="tag">{STATE_TR[r.state]}</span>
                        <div className="muted"><small>{r.state === 'suspended' ? '—' : mins <= 0 ? 'şimdi' : formatInterval(mins)}</small></div>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn small" onClick={() => void patch(r.id, r.state === 'suspended' ? { state: 'learning', due_at: new Date().toISOString() } : { state: 'suspended' })}>
                          {r.state === 'suspended' ? 'Sürdür' : 'Askıya al'}
                        </button>{' '}
                        <button className="btn small danger" aria-label="Sil" onClick={() => { if (confirm('Bu kart silinsin mi?')) void patch(r.id, { deleted_at: new Date().toISOString() }); }}>Sil</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
