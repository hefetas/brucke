'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Gate, type ReadyApp } from '@/components/Gate';
import { FeedbackView } from '@/components/FeedbackView';
import { useFeedback } from '@/components/useFeedback';
import { useFinish, useQueryParam, useStopwatch } from '@/components/useBlock';
import { logProgress, xpFor, type Db } from '@/lib/db';
import { alignWords } from '@/lib/align';
import { recognitionSupported, speak, startRecording, stopSpeaking, ttsSupported, type Recorder } from '@/lib/audio';
import type { SpeakingTask } from '@/lib/types';

export default function SpeakPage() {
  return <Gate>{({ app, db }) => <Speak app={app} db={db} />}</Gate>;
}

function Speak({ app, db }: { app: ReadyApp; db: Db }) {
  const { slug } = useParams<{ slug: string }>();
  const lc = useQueryParam('lc');
  const lang = app.active.language_code;
  const locale = app.activeLanguage.stt_locale;
  const [task, setTask] = useState<SpeakingTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [left, setLeft] = useState(0);
  const [live, setLive] = useState('');
  const [text, setText] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [keepAudio, setKeepAudio] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [spokenSec, setSpokenSec] = useState(0);
  const recorder = useRef<Recorder | null>(null);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsed = useStopwatch();
  const fb = useFeedback(app, db, 'speaking', slug);
  const { finish, earned, saving, back } = useFinish(app, db, lc);
  const canStt = typeof window !== 'undefined' && recognitionSupported();

  useEffect(() => {
    db.from('speaking_tasks').select('*').eq('language_code', lang).eq('slug', slug).maybeSingle().then(({ data, error: e }) => {
      if (e) setError(e.message);
      else if (!data) setError('Görev bulunamadı.');
      else setTask(data as SpeakingTask);
    });
    return () => {
      stopSpeaking();
      if (timer.current) clearInterval(timer.current);
      void recorder.current?.stop();
    };
  }, [db, lang, slug]);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  if (error) return <div className="notice bad" role="alert">{error}</div>;
  if (!task) return <p className="muted" role="status">Yükleniyor…</p>;

  async function start() {
    if (!task) return;
    setMicError(null);
    setLive('');
    setText('');
    setAudioUrl(null);
    setAudioBlob(null);
    stopSpeaking();
    recorder.current = await startRecording(locale, (t) => setLive(t), setMicError);
    startedAt.current = Date.now();
    setRecording(true);
    setLeft(task.max_seconds);
    timer.current = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          void stop();
          return 0;
        }
        return l - 1;
      });
    }, 1000);
  }

  async function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const r = recorder.current;
    recorder.current = null;
    if (!r) return;
    setRecording(false);
    setSpokenSec(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
    const out = await r.stop();
    setText(out.transcript);
    if (out.audio) {
      setAudioBlob(out.audio);
      setAudioUrl(URL.createObjectURL(out.audio));
    }
  }

  const align = task.kind === 'repeat' && text ? alignWords(task.model_text, text) : null;

  async function submit() {
    if (!task) return;
    const out = await fb.request(text, spokenSec || elapsed(), keepAudio && Boolean(audioBlob));
    if (!out) return;
    let score = out.feedback.score;
    if (align && out.provider === 'rules') score = align.accuracy;
    else if (align) score = Math.round((align.accuracy + score) / 2);
    await logProgress(db, app.userId, {
      lang, skill: 'speaking', activity: 'speaking_task', contentType: 'speaking', contentSlug: task.slug,
      level: task.cefr_level, score, durationSec: spokenSec || undefined,
    }).catch(() => undefined);
    if (keepAudio && audioBlob && out.attemptId) {
      const ext = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
      const path = `${app.userId}/${out.attemptId}.${ext}`;
      const up = await db.storage.from('recordings').upload(path, audioBlob, { contentType: audioBlob.type });
      if (!up.error) await db.from('task_attempts').update({ audio_path: path }).eq('id', out.attemptId);
    }
  }

  const score = fb.result?.feedback.score ?? 0;
  return (
    <div className="stack">
      <div>
        <span className="tag accent">{task.cefr_level}</span> <span className="tag">{task.max_seconds} sn</span>
        <h1>{task.title_tr}</h1>
        <p>{task.prompt_tr}</p>
      </div>

      <div className="card">
        <h3>Örnek</h3>
        <p className="prose" style={{ fontSize: '1.05rem' }}>{task.model_text}</p>
        <div className="row">
          {ttsSupported() && (
            <>
              <button className="btn small" onClick={() => speak(task.model_text, { locale: app.activeLanguage.tts_locale, rate: Math.min(1, app.profile.tts_rate) })}>🔊 Dinle</button>
              <button className="btn small" onClick={() => speak(task.model_text, { locale: app.activeLanguage.tts_locale, rate: 0.7 })}>🐢 Yavaş</button>
            </>
          )}
        </div>
        {task.target_phrases.length > 0 && (
          <p style={{ marginTop: 10 }}>Kullanmayı dene: {task.target_phrases.map((p) => <span key={p} className="tag" style={{ marginRight: 4 }}>{p}</span>)}</p>
        )}
      </div>

      {!fb.result && (
        <div className="card">
          <h3>Sıra sende</h3>
          <div className="row">
            <button className={`btn rec ${recording ? 'live' : ''}`} aria-label={recording ? 'Kaydı durdur' : 'Kaydı başlat'} onClick={() => (recording ? void stop() : void start())}>
              {recording ? '■' : '🎙️'}
            </button>
            <div>
              {recording ? <b>Dinliyorum… {left} sn</b> : <span className="muted">Düğmeye bas ve konuş.</span>}
              {!canStt && <div className="muted"><small>Bu tarayıcı konuşma tanımayı desteklemiyor (Chrome/Edge/Safari dene). Söylediğini aşağıya yazabilirsin.</small></div>}
            </div>
          </div>
          {recording && live && <p className="muted" style={{ marginTop: 10 }}>{live}</p>}
          {micError && <p className="notice bad" role="alert" style={{ marginTop: 10 }}>{micError}</p>}
          {!recording && (text || audioUrl || !canStt) && (
            <>
              <label htmlFor="tr">Söylediğin (yanlış anlaşıldıysa düzeltebilirsin)</label>
              <textarea id="tr" value={text} onChange={(e) => setText(e.target.value)} lang={lang} style={{ minHeight: 100 }} />
              {audioUrl && <audio controls src={audioUrl} style={{ width: '100%', marginTop: 10 }} />}
              {audioBlob && (
                <label className="inline" style={{ marginTop: 10 }}>
                  <input type="checkbox" checked={keepAudio} onChange={(e) => setKeepAudio(e.target.checked)} /> Kaydı özel alanımda sakla
                </label>
              )}
              {align && (
                <p style={{ marginTop: 10 }}>
                  <b>Karşılaştırma ({align.accuracy}%):</b>{' '}
                  {align.words.map((w, i) => <span key={i} className={w.status} style={{ marginRight: 4 }}>{w.word}</span>)}
                </p>
              )}
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn primary" disabled={fb.busy || !text.trim()} onClick={() => void submit()}>
                  {fb.busy ? 'Değerlendiriliyor…' : 'Geri bildirim al'}
                </button>
                <button className="btn" onClick={() => void start()}>Tekrar kaydet</button>
              </div>
            </>
          )}
        </div>
      )}
      {fb.error && <p className="notice bad" role="alert">{fb.error}</p>}

      {fb.result && (
        <>
          <FeedbackView feedback={fb.result.feedback} provider={fb.result.provider} limited={fb.result.limited} onSaveError={(i) => void fb.saveErrorCard(i)} saved={fb.saved} />
          {earned.map((a) => <p key={a.code} className="notice good">🏅 Yeni rozet: {a.title_tr}</p>)}
          <button
            className="btn primary"
            disabled={saving}
            onClick={async () => {
              await finish({ seconds: elapsed(), xp: xpFor.task(score), result: { score, seconds: spokenSec } });
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
