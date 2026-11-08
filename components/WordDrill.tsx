'use client';

import { useRef, useState } from 'react';
import type { ReadyApp } from './Gate';
import { useFinish, useStopwatch } from './useBlock';
import { answerCard, logProgress, type Db } from '@/lib/db';
import type { DrillQuestion } from '@/lib/review';
import type { CardRow } from '@/lib/types';

/** Zorlandığın kelimelerden kısa bir çoktan seçmeli alıştırma. Yanıtlar kartın aralıklı tekrar takvimine işlenir. */
export function WordDrill({ app, db, questions, rows, onDone }: { app: ReadyApp; db: Db; questions: DrillQuestion[]; rows: Map<string, CardRow>; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);
  const shownAt = useRef(Date.now());
  const correctRef = useRef(0);
  const elapsed = useStopwatch();
  const { finish } = useFinish(app, db, null);
  const q = questions[i];

  async function record(ok: boolean) {
    const row = rows.get(q.cardId);
    if (row) await answerCard(db, app.userId, row, ok ? 3 : 1, Date.now() - shownAt.current).catch(() => undefined);
    if (ok) {
      correctRef.current += 1;
      setCorrect(correctRef.current);
    }
  }

  async function choose(opt: string) {
    if (picked !== null) return;
    setPicked(opt);
    await record(opt === q.answer);
  }

  async function selfCheck(ok: boolean) {
    await record(ok);
    await advance();
  }

  async function advance() {
    if (i + 1 < questions.length) {
      setI(i + 1);
      setPicked(null);
      setRevealed(false);
      shownAt.current = Date.now();
      return;
    }
    setDone(true);
    const got = correctRef.current;
    const pct = (got / questions.length) * 100;
    await logProgress(db, app.userId, { lang: app.active.language_code, skill: 'vocab', activity: 'card_review', score: pct, durationSec: elapsed() }).catch(() => undefined);
    await finish({ seconds: elapsed(), xp: 5 + got * 2, cards: questions.length }).catch(() => undefined);
  }

  if (done) {
    return (
      <div className="card stack">
        <h3>Mini tekrar bitti: {correct}/{questions.length}</h3>
        <p className="muted" style={{ margin: 0 }}>Yanıtların kelime kartlarının tekrar takvimine işlendi; yanlış yaptıkların kısa süre sonra yeniden karşına çıkar.</p>
        <div className="row"><button className="btn primary" onClick={onDone}>Tamam</button></div>
      </div>
    );
  }

  return (
    <div className="card stack">
      <p className="muted" style={{ margin: 0 }}>Soru {i + 1}/{questions.length}</p>
      <h2 style={{ margin: 0, whiteSpace: 'pre-line' }}>{q.prompt}</h2>
      {q.options ? (
        <>
          {q.options.map((o) => {
            const cls = picked === null ? '' : o === q.answer ? 'right' : o === picked ? 'wrong' : '';
            return <button key={o} className={`btn option ${cls}`} disabled={picked !== null} onClick={() => void choose(o)}>{o}</button>;
          })}
          {picked !== null && <div className="row"><button className="btn primary" onClick={() => void advance()}>{i + 1 < questions.length ? 'Sonraki' : 'Bitir'}</button></div>}
        </>
      ) : (
        <>
          {revealed ? <p className="prose" style={{ margin: 0 }}>{q.answer}</p> : <button className="btn" onClick={() => setRevealed(true)}>Cevabı göster</button>}
          {revealed && (
            <div className="row">
              <button className="btn primary" onClick={() => void selfCheck(true)}>Biliyordum</button>
              <button className="btn" onClick={() => void selfCheck(false)}>Bilemedim</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
