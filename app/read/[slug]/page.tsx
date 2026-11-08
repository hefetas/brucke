'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Gate, type ReadyApp } from '@/components/Gate';
import { GlossaryPanel } from '@/components/GlossaryPanel';
import { QuestionList } from '@/components/QuestionList';
import { WordText } from '@/components/WordText';
import { useFinish, useQueryParam, useStopwatch } from '@/components/useBlock';
import { addCardsFromWords, logProgress, xpFor, type Db } from '@/lib/db';
import { speak, stopSpeaking, ttsSupported } from '@/lib/audio';
import { countWords } from '@/lib/align';
import type { GlossaryItem, ReadingContent } from '@/lib/types';

export default function ReadPage() {
  return <Gate>{({ app, db }) => <Read app={app} db={db} />}</Gate>;
}

function Read({ app, db }: { app: ReadyApp; db: Db }) {
  const { slug } = useParams<{ slug: string }>();
  const lc = useQueryParam('lc');
  const lang = app.active.language_code;
  const [c, setC] = useState<ReadingContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [readSec, setReadSec] = useState<number | null>(null);
  const startedAt = useRef(Date.now());
  const elapsed = useStopwatch();
  const { finish, earned, saving, back } = useFinish(app, db, lc);

  useEffect(() => {
    db.from('reading_contents').select('*').eq('language_code', lang).eq('slug', slug).maybeSingle().then(({ data, error: e }) => {
      if (e) setError(e.message);
      else if (!data) setError('İçerik bulunamadı.');
      else setC(data as ReadingContent);
      startedAt.current = Date.now();
    });
    return () => stopSpeaking();
  }, [db, lang, slug]);

  if (error) return <div className="notice bad" role="alert">{error}</div>;
  if (!c) return <p className="muted" role="status">Yükleniyor…</p>;

  const words = c.word_count ?? countWords(c.body);
  const add = (items: GlossaryItem[]) => addCardsFromWords(db, app.userId, lang, items, { type: 'reading', slug: c.slug, cefr: c.cefr_level });
  const paragraphs = c.body.split(/\n{2,}/);
  const wpm = readSec ? Math.round((words / readSec) * 60) : null;

  async function onQuestions(pct: number) {
    if (!c) return;
    setScore(pct);
    await logProgress(db, app.userId, {
      lang, skill: 'reading', activity: 'comprehension', contentType: 'reading', contentSlug: c.slug,
      level: c.cefr_level, score: pct, durationSec: elapsed(),
    }).catch(() => undefined);
  }

  return (
    <div className="stack">
      <div>
        <span className="tag accent">{c.cefr_level}</span> <span className="tag">{c.kind}</span> <span className="tag">{words} kelime</span>
        <h1>{c.title}</h1>
      </div>

      <div className="card">
        <p className="muted"><small>Bilmediğin bir kelime altı noktalıysa dokun: anlamı çıkar ve kartlarına ekleyebilirsin.</small></p>
        <div className="prose">
          {paragraphs.map((p, i) => (
            <p key={i}><WordText text={p} glossary={c.glossary} onAdd={(g) => add([g])} /></p>
          ))}
        </div>
        <div className="row">
          {ttsSupported() && (
            <button className="btn small" onClick={() => speak(c.body.replace(/\n+/g, ' '), { locale: app.activeLanguage.tts_locale, rate: Math.min(1, app.profile.tts_rate) })}>🔊 Sesli oku</button>
          )}
          {readSec === null ? (
            <button className="btn small primary" onClick={() => { stopSpeaking(); setReadSec(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000))); }}>
              Okudum
            </button>
          ) : (
            <span className="tag good">{readSec} sn · ~{wpm} kelime/dk</span>
          )}
        </div>
      </div>

      {readSec !== null && (
        <div>
          <h3>Anlama soruları</h3>
          <QuestionList questions={c.questions} onDone={(p) => void onQuestions(p)} />
        </div>
      )}

      {score !== null && (
        <>
          <GlossaryPanel glossary={c.glossary} onAdd={add} />
          {earned.map((a) => <p key={a.code} className="notice good">🏅 Yeni rozet: {a.title_tr}</p>)}
          <button
            className="btn primary"
            disabled={saving}
            onClick={async () => {
              await finish({ seconds: elapsed(), xp: xpFor.comprehension(score), result: { score, wpm } });
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
