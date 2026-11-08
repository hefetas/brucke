'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Gate, type ReadyApp } from '@/components/Gate';
import { FeedbackView } from '@/components/FeedbackView';
import { useFeedback } from '@/components/useFeedback';
import { useFinish, useQueryParam, useStopwatch } from '@/components/useBlock';
import { logProgress, xpFor, type Db } from '@/lib/db';
import { countWords, usedPhrases } from '@/lib/align';
import type { WritingTask } from '@/lib/types';

export default function WritePage() {
  return <Gate>{({ app, db }) => <Write app={app} db={db} />}</Gate>;
}

function Write({ app, db }: { app: ReadyApp; db: Db }) {
  const { slug } = useParams<{ slug: string }>();
  const lc = useQueryParam('lc');
  const lang = app.active.language_code;
  const [task, setTask] = useState<WritingTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [showSample, setShowSample] = useState(false);
  const elapsed = useStopwatch();
  const fb = useFeedback(app, db, 'writing', slug);
  const { finish, earned, saving, back } = useFinish(app, db, lc);
  const draftKey = `dilyolu.draft.${lang}.${slug}`;

  useEffect(() => {
    db.from('writing_tasks').select('*').eq('language_code', lang).eq('slug', slug).maybeSingle().then(({ data, error: e }) => {
      if (e) setError(e.message);
      else if (!data) setError('Görev bulunamadı.');
      else setTask(data as WritingTask);
    });
    try {
      setText(localStorage.getItem(draftKey) ?? '');
    } catch { /* depolama yok */ }
  }, [db, lang, slug, draftKey]);

  useEffect(() => {
    try {
      if (text) localStorage.setItem(draftKey, text);
    } catch { /* yoksay */ }
  }, [text, draftKey]);

  const words = countWords(text);
  const used = useMemo(() => (task ? usedPhrases(text, task.target_phrases) : []), [task, text]);

  if (error) return <div className="notice bad" role="alert">{error}</div>;
  if (!task) return <p className="muted" role="status">Yükleniyor…</p>;

  const tooShort = words < task.min_words;
  const tooLong = words > task.max_words;
  const score = fb.result?.feedback.score ?? 0;

  async function submit() {
    if (!task) return;
    const out = await fb.request(text, elapsed());
    if (out) {
      await logProgress(db, app.userId, {
        lang, skill: 'writing', activity: 'writing_task', contentType: 'writing', contentSlug: task.slug,
        level: task.cefr_level, score: out.feedback.score, durationSec: elapsed(),
      }).catch(() => undefined);
      try { localStorage.removeItem(draftKey); } catch { /* yoksay */ }
    }
  }

  return (
    <div className="stack">
      <div>
        <span className="tag accent">{task.cefr_level}</span> <span className="tag">{task.min_words}–{task.max_words} kelime</span>
        <h1>{task.title_tr}</h1>
        <p>{task.prompt_tr}</p>
      </div>

      {task.target_phrases.length > 0 && (
        <p>
          Kullanmayı dene:{' '}
          {task.target_phrases.map((p) => (
            <span key={p} className={`tag ${used.includes(p) ? 'good' : ''}`} style={{ marginRight: 4 }}>{used.includes(p) ? '✓ ' : ''}{p}</span>
          ))}
        </p>
      )}

      <div className="card">
        <label htmlFor="txt" style={{ marginTop: 0 }}>Yazın</label>
        <textarea id="txt" value={text} onChange={(e) => setText(e.target.value)} disabled={Boolean(fb.result)} lang={lang} spellCheck />
        <div className="row between" style={{ marginTop: 8 }}>
          <span className={`tag ${tooShort || tooLong ? 'warm' : 'good'}`}>{words} kelime</span>
          {!fb.result && <small className="muted">{tooShort ? `en az ${task.min_words} kelime` : tooLong ? `en fazla ${task.max_words} kelime` : 'uzunluk uygun'}</small>}
        </div>
      </div>

      {!fb.result && (
        <div className="row">
          <button className="btn primary" disabled={fb.busy || words === 0} onClick={() => void submit()}>
            {fb.busy ? 'Değerlendiriliyor…' : 'Geri bildirim al'}
          </button>
          {task.sample_answer && <button className="btn" onClick={() => setShowSample((s) => !s)}>{showSample ? 'Örneği gizle' : 'Örnek cevabı gör'}</button>}
        </div>
      )}
      {showSample && task.sample_answer && <div className="card"><h3>Örnek cevap</h3><p>{task.sample_answer}</p></div>}
      {fb.error && <p className="notice bad" role="alert">{fb.error}</p>}

      {fb.result && (
        <>
          <FeedbackView feedback={fb.result.feedback} provider={fb.result.provider} limited={fb.result.limited} onSaveError={(i) => void fb.saveErrorCard(i)} saved={fb.saved} />
          {earned.map((a) => <p key={a.code} className="notice good">🏅 Yeni rozet: {a.title_tr}</p>)}
          <button
            className="btn primary"
            disabled={saving}
            onClick={async () => {
              await finish({ seconds: elapsed(), xp: xpFor.task(score), result: { score, words } });
              back();
            }}
          >
            Bitir · +{xpFor.task(score)} XP
          </button>
        </>
      )}
    </div>
  );
}
