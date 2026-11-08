'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ReadyApp } from '../Gate';
import { useFinish, useStopwatch } from '../useBlock';
import { SelfAssess } from './SelfAssess';
import type { Db } from '@/lib/db';
import { selfScore, type ExamKind } from '@/lib/exam';
import type { ExamMeta, SpeakingItem } from '@/lib/exam-content';
import { saveAttempt } from '@/lib/exam-data';

type Phase = 'ready' | 'prep' | 'speak' | 'done';
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function SpeakingRunner({ app, db, exam, item, meta }: { app: ReadyApp; db: Db; exam: ExamKind; item: SpeakingItem; meta: ExamMeta }) {
  const lang = app.active.language_code;
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [left, setLeft] = useState(0);
  const [finished, setFinished] = useState(false);
  const [record, setRecord] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const criteria = meta.rubrics.speaking;
  const [picks, setPicks] = useState<(number | null)[]>(() => criteria.map(() => null));
  const [saved, setSaved] = useState<{ band: number | null; pct: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const elapsed = useStopwatch();
  const { finish } = useFinish(app, db, null);
  const step = item.steps[idx];
  const canRecord = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (phase !== 'prep' && phase !== 'speak') return;
    const t = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (left > 0) return;
    if (phase === 'prep') {
      setPhase('speak');
      setLeft(step.seconds);
    }
  }, [left, phase, step]);

  useEffect(() => () => { stream.current?.getTracks().forEach((t) => t.stop()); }, []);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  async function startRecording() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      chunks.current = [];
      const r = new MediaRecorder(s);
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => {
        setAudioUrl(URL.createObjectURL(new Blob(chunks.current, { type: r.mimeType || 'audio/webm' })));
        s.getTracks().forEach((t) => t.stop());
      };
      r.start();
      recorder.current = r;
    } catch {
      setRecError('Mikrofona erişilemedi; kayıt olmadan devam ediyoruz.');
      setRecord(false);
    }
  }

  async function begin() {
    if (record && idx === 0 && !recorder.current) await startRecording();
    if (step.prep) {
      setPhase('prep');
      setLeft(step.prep);
    } else {
      setPhase('speak');
      setLeft(step.seconds);
    }
  }

  function next() {
    if (idx + 1 < item.steps.length) {
      setIdx(idx + 1);
      setPhase('ready');
    } else {
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
      setFinished(true);
      setPhase('done');
    }
  }

  const allPicked = picks.every((p) => p !== null);
  const preview = allPicked ? selfScore(exam, picks as number[]) : null;

  async function save() {
    if (!allPicked) return;
    const s = selfScore(exam, picks as number[]);
    setSaving(true);
    setError(null);
    try {
      await saveAttempt(db, app.userId, lang, {
        exam, section: 'speaking', itemId: item.id, level: item.level ?? null, scorePct: s.pct, band: s.band,
        seconds: elapsed(), detail: { picks, steps: item.steps.length },
      });
      await finish({ seconds: elapsed(), xp: 20 });
      setSaved(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack-lg">
      <div className="hero">
        <p className="muted" style={{ margin: 0 }}>{item.level ? `${item.level} · ` : ''}{item.steps.length} adım</p>
        <h1 style={{ margin: '0.2rem 0' }}>{item.title}</h1>
      </div>

      {!finished && (
        <>
          {meta.strategies.speaking && idx === 0 && phase === 'ready' && (
            <details className="card"><summary><b>Strateji</b></summary><p className="muted" style={{ marginBottom: 0 }}>{meta.strategies.speaking}</p></details>
          )}
          {idx === 0 && phase === 'ready' && canRecord && (
            <label className="inline">
              <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} style={{ width: 'auto', minHeight: 0 }} />
              Konuşmamı kaydet (sadece bu tarayıcıda, sonunda dinleyebilirsin; hiçbir yere gönderilmez)
            </label>
          )}
          {recError && <div className="notice">{recError}</div>}

          <div className="card stack">
            <p className="muted" style={{ margin: 0 }}>Adım {idx + 1}/{item.steps.length}</p>
            <h2 style={{ margin: 0 }}>{step.text}</h2>
            {step.points && <ul style={{ margin: 0 }}>{step.points.map((p) => <li key={p}>{p}</li>)}</ul>}
            {phase === 'ready' && (
              <p className="muted" style={{ margin: 0 }}>
                {step.prep ? `${fmt(step.prep)} hazırlık, ardından en fazla ${fmt(step.seconds)} konuşma.` : `Hedef süre: ${fmt(step.seconds)}.`} Sesli konuş: sadece düşünmek konuşma pratiği değildir.
              </p>
            )}
            {phase === 'prep' && <p className="stat">Hazırlık {fmt(Math.max(0, left))}</p>}
            {phase === 'speak' && <p className="stat" aria-live="off">🎙️ {fmt(Math.max(0, left))}</p>}
            {phase === 'speak' && left <= 0 && <p className="close">Süre doldu; cümleni bitirip devam et.</p>}
            <div className="row">
              {phase === 'ready' && <button className="btn primary" onClick={() => void begin()}>{step.prep ? 'Hazırlığı başlat' : 'Başla'}</button>}
              {phase === 'prep' && <button className="btn" onClick={() => { setPhase('speak'); setLeft(step.seconds); }}>Hazırım, konuş</button>}
              {phase === 'speak' && <button className="btn primary" onClick={next}>{idx + 1 < item.steps.length ? 'Bitirdim, sonraki' : 'Bitirdim'}</button>}
            </div>
          </div>
        </>
      )}

      {finished && !saved && (
        <div className="stack">
          {audioUrl && (
            <div className="card">
              <h3>Kaydını dinle</h3>
              <audio controls src={audioUrl} style={{ width: '100%' }} />
              <p className="muted" style={{ marginBottom: 0 }}>Dinlerken duraksamalarını, tekrarlarını ve telaffuz sorunlarını not al.</p>
            </div>
          )}
          <h2>Öz değerlendirme</h2>
          <p className="muted" style={{ margin: 0 }}>Her ölçütte konuşmana en yakın tanımı seç. Kararsız kalırsan düşük olanı seç.</p>
          <SelfAssess criteria={criteria} picks={picks} onChange={setPicks} />
          {preview && <p>{exam === 'ielts' ? <>Tahmini band: <b>{preview.band}</b></> : <>Tahmini puan: <b>%{Math.round(preview.pct)}</b> {preview.pct >= 60 ? '· geçme eşiğinin üstünde' : '· %60 eşiğinin altında'}</>}</p>}
          {error && <div className="notice bad" role="alert">{error}</div>}
          <div className="row"><button className="btn primary" disabled={!allPicked || saving} onClick={() => void save()}>Kaydet</button></div>
        </div>
      )}

      {saved && (
        <div className="card stack">
          <h2>Kaydedildi</h2>
          <p>{exam === 'ielts' ? <>Bu denemenin öz değerlendirme bandı: <b>{saved.band}</b>.</> : <>Öz değerlendirme puanı: <b>%{Math.round(saved.pct)}</b>.</>}</p>
          <div className="row">
            <Link className="btn primary" href="/exam/speaking">Diğer görevler</Link>
            <Link className="btn" href="/exam">Sınav sekmesi</Link>
          </div>
        </div>
      )}
    </div>
  );
}
