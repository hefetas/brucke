'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Gate, type ReadyApp } from '@/components/Gate';
import { GlossaryPanel } from '@/components/GlossaryPanel';
import { QuestionList } from '@/components/QuestionList';
import { WordText } from '@/components/WordText';
import { useFinish, useQueryParam, useStopwatch } from '@/components/useBlock';
import { addCardsFromWords, logProgress, xpFor, type Db } from '@/lib/db';
import { speakLines, stopSpeaking, ttsSupported } from '@/lib/audio';
import type { GlossaryItem, ListeningContent } from '@/lib/types';

export default function ListenPage() {
  return <Gate>{({ app, db }) => <Listen app={app} db={db} />}</Gate>;
}

function Listen({ app, db }: { app: ReadyApp; db: Db }) {
  const { slug } = useParams<{ slug: string }>();
  const lc = useQueryParam('lc');
  const lang = app.active.language_code;
  const [c, setC] = useState<ListeningContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [line, setLine] = useState(-1);
  const [rate, setRate] = useState(Math.min(1, app.profile.tts_rate));
  const [plays, setPlays] = useState(0);
  const [showText, setShowText] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const elapsed = useStopwatch();
  const { finish, earned, saving, back } = useFinish(app, db, lc);

  useEffect(() => {
    db.from('listening_contents').select('*').eq('language_code', lang).eq('slug', slug).maybeSingle().then(({ data, error: e }) => {
      if (e) setError(e.message);
      else if (!data) setError('İçerik bulunamadı.');
      else setC(data as ListeningContent);
    });
    return () => {
      cancel.current?.();
      stopSpeaking();
    };
  }, [db, lang, slug]);

  if (error) return <div className="notice bad" role="alert">{error}</div>;
  if (!c) return <p className="muted" role="status">Yükleniyor…</p>;

  function play() {
    if (!c) return;
    if (playing) {
      cancel.current?.();
      setPlaying(false);
      setLine(-1);
      return;
    }
    setPlaying(true);
    setPlays((p) => p + 1);
    cancel.current = speakLines(c.transcript, {
      locale: app.activeLanguage.tts_locale,
      rate,
      onLine: setLine,
      onDone: () => { setPlaying(false); setLine(-1); },
    });
  }

  const add = (items: GlossaryItem[]) =>
    addCardsFromWords(db, app.userId, lang, items, { type: 'listening', slug: c.slug, cefr: c.cefr_level });

  async function onQuestions(pct: number) {
    if (!c) return;
    setScore(pct);
    setShowText(true);
    await logProgress(db, app.userId, {
      lang, skill: 'listening', activity: 'comprehension', contentType: 'listening', contentSlug: c.slug,
      level: c.cefr_level, score: pct, durationSec: elapsed(),
    }).catch(() => undefined);
  }

  const canShowText = showText || score !== null;
  return (
    <div className="stack">
      <div>
        <span className="tag accent">{c.cefr_level}</span> <span className="tag">{c.kind}</span>
        <h1>{c.title}</h1>
      </div>

      <div className="card">
        <h3>1. Dinle</h3>
        {c.audio_url ? (
          <audio controls src={c.audio_url} style={{ width: '100%' }} onPlay={() => setPlays((p) => p + 1)} />
        ) : ttsSupported() ? (
          <div className="row">
            <button className="btn primary" onClick={play}>{playing ? '■ Durdur' : plays ? '▶ Tekrar dinle' : '▶ Dinle'}</button>
            <label className="inline">Hız
              <select value={rate} onChange={(e) => setRate(Number(e.target.value))} style={{ width: 'auto' }} aria-label="Hız">
                <option value={0.7}>0,7×</option>
                <option value={0.85}>0,85×</option>
                <option value={1}>1×</option>
              </select>
            </label>
          </div>
        ) : (
          <p className="notice">Bu tarayıcıda ses sentezi yok; metni okuyarak devam edebilirsin.</p>
        )}
        <p className="muted" style={{ margin: '8px 0 0' }}><small>{plays} kez dinledin. Önce metne bakmadan dinlemeyi dene.</small></p>
        {!canShowText && (
          <p><button className="btn small" onClick={() => setShowText(true)}>Metni göster</button></p>
        )}
        {canShowText && (
          <div style={{ marginTop: 12 }}>
            {c.transcript.map((t, i) => (
              <div key={i} className={`turn ${line === i ? 'on' : ''}`}>
                {t.speaker && <b>{t.speaker}:</b>}
                <WordText text={t.text} glossary={c.glossary} onAdd={(g) => add([g])} />
                {t.tr && score !== null && <div className="muted"><small>{t.tr}</small></div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3>2. Sorular</h3>
        <QuestionList questions={c.questions} onDone={(p) => void onQuestions(p)} />
      </div>

      {score !== null && (
        <>
          <GlossaryPanel glossary={c.glossary} onAdd={add} />
          {earned.map((a) => <p key={a.code} className="notice good">🏅 Yeni rozet: {a.title_tr}</p>)}
          <button
            className="btn primary"
            disabled={saving}
            onClick={async () => {
              await finish({ seconds: elapsed(), xp: xpFor.comprehension(score), result: { score, plays } });
              back();
            }}
          >
            Bitir · +{xpFor.comprehension(score)} XP
          </button>
        </>
      )}
    </div>
  );
}
