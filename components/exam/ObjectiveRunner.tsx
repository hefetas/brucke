'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { ReadyApp } from '../Gate';
import { useFinish, useStopwatch } from '../useBlock';
import type { Db } from '@/lib/db';
import { speakLines, stopSpeaking, ttsSupported } from '@/lib/audio';
import { QTYPE_LABEL, bandFromPct, gradeAnswers, optionsOf, type ExamKind, type GradeResult } from '@/lib/exam';
import type { ExamMeta, ObjectiveItem } from '@/lib/exam-content';
import { saveAttempt } from '@/lib/exam-data';

export function ObjectiveRunner({
  app, db, exam, section, item, meta,
}: {
  app: ReadyApp; db: Db; exam: ExamKind; section: 'reading' | 'listening'; item: ObjectiveItem; meta: ExamMeta;
}) {
  const lang = app.active.language_code;
  const [answers, setAnswers] = useState<(number | string | null)[]>(() => item.questions.map(() => null));
  const [result, setResult] = useState<GradeResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [practice, setPractice] = useState(true);
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [line, setLine] = useState<number | null>(null);
  const cancel = useRef<null | (() => void)>(null);
  const elapsed = useStopwatch();
  const { finish } = useFinish(app, db, null);
  const tts = ttsSupported();

  useEffect(() => () => { cancel.current?.(); stopSpeaking(); }, []);

  function play() {
    if (!item.script || playing) return;
    setPlaying(true);
    setPlays((p) => p + 1);
    cancel.current = speakLines(item.script, {
      locale: app.activeLanguage.tts_locale,
      rate: app.profile.tts_rate,
      onLine: setLine,
      onDone: () => { setPlaying(false); setLine(null); },
    });
  }
  function stop() {
    cancel.current?.();
    setPlaying(false);
    setLine(null);
  }

  const answered = answers.filter((a) => a !== null && a !== '').length;
  const band = useMemo(() => (result && exam === 'ielts' ? bandFromPct(section, result.pct) : null), [result, exam, section]);

  async function submit() {
    stop();
    const r = gradeAnswers(item.questions, answers);
    setResult(r);
    setSaving(true);
    try {
      await saveAttempt(db, app.userId, lang, {
        exam, section, itemId: item.id, level: item.level ?? null, scorePct: r.pct,
        band: exam === 'ielts' ? bandFromPct(section, r.pct) : null, raw: r.raw, total: r.total, seconds: elapsed(),
        detail: { types: r.byType },
      });
      await finish({ seconds: elapsed(), xp: Math.round(10 + r.pct / 10) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sonuç kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  const tips = meta.strategies[section] ?? '';

  return (
    <div className="stack-lg">
      <div className="hero">
        <p className="muted" style={{ margin: 0 }}>{item.level ? `${item.level} · ` : ''}{item.difficulty ?? ''} · önerilen süre {item.minutes} dk</p>
        <h1 style={{ margin: '0.2rem 0' }}>{item.title}</h1>
      </div>

      {!result && tips && <details className="card"><summary><b>Strateji</b></summary><p className="muted" style={{ marginBottom: 0 }}>{tips}</p></details>}

      {section === 'reading' && <div className="card prose" style={{ whiteSpace: 'pre-line' }}>{item.text}</div>}

      {section === 'listening' && item.script && (
        <div className="card stack">
          {tts ? (
            <>
              <div className="row">
                <button className="btn primary" onClick={play} disabled={playing || (!practice && plays >= 1)}>
                  {playing ? 'Çalıyor…' : plays === 0 ? '▶ Dinle' : '↻ Tekrar dinle'}
                </button>
                {playing && <button className="btn" onClick={stop}>Durdur</button>}
                <label className="inline">
                  <input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} style={{ width: 'auto', minHeight: 0 }} />
                  Alıştırma modu (tekrar dinleyebilirim)
                </label>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                Sınavda ses yalnızca bir kez çalar: gerçek koşulda denemek için alıştırma modunu kapat. Soruları dinlemeden önce oku.
                {line !== null && ' · ▶'}
              </p>
            </>
          ) : (
            <p className="notice">Bu tarayıcıda sesli okuma desteklenmiyor. Metni aşağıdan oku (sınav koşulu olmaz).</p>
          )}
          {(!tts || result) && (
            <div>
              <h3>Metin</h3>
              {item.script.map((l, i) => <p key={i} style={{ margin: '0.25rem 0' }}>{l.speaker ? <b>{l.speaker}: </b> : null}{l.text}</p>)}
            </div>
          )}
        </div>
      )}

      <div className="stack">
        {item.questions.map((q, qi) => {
          const opts = optionsOf(q);
          const picked = answers[qi];
          const ok = result?.correct[qi];
          return (
            <fieldset key={qi} className="card" style={{ border: '1px solid var(--line)' }}>
              <legend className="tag">{qi + 1} · {QTYPE_LABEL[q.t]}</legend>
              <p><b>{q.q}</b></p>
              {q.t === 'fill' ? (
                <input
                  type="text"
                  value={typeof picked === 'string' ? picked : ''}
                  disabled={!!result}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setAnswers((a) => a.map((v, i) => (i === qi ? e.target.value : v)))}
                  aria-label={`Soru ${qi + 1} yanıtı`}
                />
              ) : (
                opts.map((o, oi) => {
                  const cls = !result ? (picked === oi ? 'on' : '') : oi === q.answer ? 'right' : oi === picked ? 'wrong' : '';
                  return (
                    <button
                      key={oi}
                      type="button"
                      className={`btn option ${cls}`}
                      aria-pressed={picked === oi}
                      disabled={!!result}
                      style={!result && picked === oi ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined}
                      onClick={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                    >
                      {q.t === 'mcq' ? `${String.fromCharCode(65 + oi)}. ` : ''}{o}
                    </button>
                  );
                })
              )}
              {result && (
                <p className={ok ? 'ok' : 'close'} style={{ marginTop: 8 }}>
                  {ok ? '✓ Doğru. ' : q.t === 'fill' ? `✗ Doğru yanıt: ${(q.answer as string[])[0]}. ` : '✗ Yanlış. '}
                  <span className="muted">{q.why}</span>
                </p>
              )}
            </fieldset>
          );
        })}
      </div>

      {error && <div className="notice bad" role="alert">{error}</div>}

      {!result ? (
        <div className="row">
          <button className="btn primary" onClick={() => void submit()} disabled={answered === 0 || saving}>
            Bitir ve puanla ({answered}/{item.questions.length})
          </button>
        </div>
      ) : (
        <div className="card stack">
          <h2>Sonuç: {result.raw}/{result.total} · %{Math.round(result.pct)}</h2>
          {exam === 'ielts' && band !== null && (
            <p>Tahmini band: <b>{band}</b> <span className="muted">(mini test yüzdesi 40 soruluk ölçeğe çevrilerek hesaplandı; gerçek sınavda ±0,5 sapabilir)</span></p>
          )}
          {exam === 'goethe' && (
            <p>{result.pct >= 60 ? <span className="ok"><b>≥ %60: bu modülde geçme eşiğinin üstündesin.</b></span> : <span className="close"><b>%60 eşiğinin altında. Yanlışlarına bakıp aynı tipte bir daha dene.</b></span>}</p>
          )}
          <div className="row">
            <Link className="btn primary" href={`/exam/${section}`}>Diğer görevler</Link>
            <Link className="btn" href="/exam">Sınav sekmesi</Link>
          </div>
        </div>
      )}
    </div>
  );
}
