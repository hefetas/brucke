'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Gate, type ReadyApp } from '@/components/Gate';
import { useFinish, useQueryParam, useStopwatch } from '@/components/useBlock';
import { logProgress, xpFor, type Db } from '@/lib/db';
import { sameAnswer } from '@/lib/align';
import type { GrammarTopic, PracticeItem } from '@/lib/types';

export default function GrammarPage() {
  return <Gate>{({ app, db }) => <Grammar app={app} db={db} />}</Gate>;
}

function Grammar({ app, db }: { app: ReadyApp; db: Db }) {
  const { slug } = useParams<{ slug: string }>();
  const lc = useQueryParam('lc');
  const lang = app.active.language_code;
  const [topic, setTopic] = useState<GrammarTopic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'learn' | 'practice' | 'done'>('learn');
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState<null | { ok: boolean; given: string }>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const elapsed = useStopwatch();
  const { finish, earned, saving, back } = useFinish(app, db, lc);

  useEffect(() => {
    db.from('grammar_topics').select('*').eq('language_code', lang).eq('slug', slug).maybeSingle().then(({ data, error: e }) => {
      if (e) setError(e.message);
      else if (!data) setError('Konu bulunamadı.');
      else setTopic(data as GrammarTopic);
    });
  }, [db, lang, slug]);

  if (error) return <div className="notice bad" role="alert">{error}</div>;
  if (!topic) return <p className="muted" role="status">Yükleniyor…</p>;

  const items = topic.practice_items;
  const item: PracticeItem | undefined = items[idx];

  async function check(given: string, ok: boolean) {
    if (!item || !topic) return;
    setChecked({ ok, given });
    setResults((r) => [...r, ok]);
    if (!ok) {
      const correct = item.type === 'mcq' ? item.options?.[Number(item.answer)] ?? '' : String(item.answer).split('|')[0];
      await db.from('errors').insert({
        user_id: app.userId, language_code: lang, source_type: 'grammar', error_type: 'other',
        grammar_topic_id: topic.id, original: given, corrected: correct, explanation_tr: item.explain_tr ?? null,
      });
    }
  }

  async function next() {
    setChecked(null);
    setInput('');
    if (idx + 1 < items.length) setIdx(idx + 1);
    else {
      setStep('done');
      const pct = items.length ? (results.filter(Boolean).length / items.length) * 100 : 100;
      await logProgress(db, app.userId, {
        lang, skill: 'grammar', activity: 'grammar_practice', contentType: 'grammar', contentSlug: topic?.slug,
        level: topic?.cefr_level, score: pct, durationSec: elapsed(),
      }).catch(() => undefined);
    }
  }

  const correct = results.filter(Boolean).length;
  const pct = items.length ? Math.round((correct / items.length) * 100) : 100;

  return (
    <div className="stack">
      <div>
        <span className="tag accent">{topic.cefr_level}</span>
        <h1>{topic.title_tr}</h1>
        <p className="muted">{topic.title_target}</p>
      </div>

      {step === 'learn' && (
        <>
          <div className="card">
            <p style={{ whiteSpace: 'pre-line' }}>{topic.summary_tr}</p>
          </div>
          {topic.examples.length > 0 && (
            <div className="card">
              <h3>Örnekler</h3>
              <table>
                <tbody>
                  {topic.examples.map((e, i) => (
                    <tr key={i}>
                      <td>
                        <b>{e.highlight ? e.text.split(e.highlight).flatMap((part, j, arr) => (j < arr.length - 1 ? [part, <mark key={j}>{e.highlight}</mark>] : [part])) : e.text}</b>
                      </td>
                      <td className="muted">{e.tr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button className="btn primary" onClick={() => setStep(items.length ? 'practice' : 'done')}>Alıştırmalara geç</button>
        </>
      )}

      {step === 'practice' && item && (
        <div className="card">
          <div className="bar"><i style={{ width: `${(idx / items.length) * 100}%` }} /></div>
          <p className="muted" style={{ marginTop: 8 }}><small>{idx + 1}/{items.length}</small></p>
          <p><b>{item.prompt}</b></p>
          {item.type === 'mcq' ? (
            (item.options ?? []).map((o, i) => (
              <button
                key={i}
                className={`btn option ${checked ? (i === Number(item.answer) ? 'right' : checked.given === o ? 'wrong' : '') : ''}`}
                disabled={Boolean(checked)}
                onClick={() => void check(o, i === Number(item.answer))}
              >
                {o}
              </button>
            ))
          ) : (
            <>
              <input
                type="text" value={input} disabled={Boolean(checked)} lang={lang} autoCapitalize="off" autoComplete="off" spellCheck={false}
                aria-label="Cevabın" onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && input.trim() && !checked && void check(input, sameAnswer(input, String(item.answer)))}
              />
              {!checked && <button className="btn primary" style={{ marginTop: 10 }} disabled={!input.trim()} onClick={() => void check(input, sameAnswer(input, String(item.answer)))}>Kontrol et</button>}
            </>
          )}
          {checked && (
            <div style={{ marginTop: 10 }}>
              <p className={`notice ${checked.ok ? 'good' : 'bad'}`}>
                {checked.ok ? 'Doğru!' : `Doğrusu: ${item.type === 'mcq' ? item.options?.[Number(item.answer)] : String(item.answer).split('|')[0]}`}
                {item.explain_tr && <><br />{item.explain_tr}</>}
              </p>
              <button className="btn primary" onClick={() => void next()}>{idx + 1 < items.length ? 'Sonraki' : 'Bitir'}</button>
            </div>
          )}
        </div>
      )}

      {step === 'done' && (
        <>
          <div className="card">
            <p className="stat">{correct}/{items.length}</p>
            <p className="muted">doğru · yanlışların “Hatalarım” listene eklendi</p>
          </div>
          {earned.map((a) => <p key={a.code} className="notice good">🏅 Yeni rozet: {a.title_tr}</p>)}
          <button
            className="btn primary"
            disabled={saving}
            onClick={async () => {
              await finish({ seconds: elapsed(), xp: xpFor.comprehension(pct), result: { score: pct } });
              back();
            }}
          >
            Bitir · +{xpFor.comprehension(pct)} XP
          </button>
        </>
      )}
    </div>
  );
}
