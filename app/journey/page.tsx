'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Gate, type ReadyApp } from '@/components/Gate';
import { levelsOf, type Db } from '@/lib/db';
import { deletePath, loadJourney, restartPath, savePath, type LoadedJourney } from '@/lib/journey-data';
import {
  JOURNEY_LEVELS, KIND_ICON, KIND_LABEL, LEVEL_BLURB_TR, MASTERY_SCORE, STEP_MINUTES,
  formatMinutes, levelsInRange, normalizeRange, stepHref,
} from '@/lib/journey';
import { cefrIndex, overallLevel, type Cefr } from '@/lib/levels';

export default function JourneyPage() {
  return <Gate>{({ app, db }) => <Journey app={app} db={db} />}</Gate>;
}

function Journey({ app, db }: { app: ReadyApp; db: Db }) {
  const lang = app.active.language_code;
  const langName = app.activeLanguage.name_tr;
  const [data, setData] = useState<LoadedJourney | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const reload = useCallback(async () => {
    setData(await loadJourney(db, app.userId, lang));
  }, [db, app.userId, lang]);

  useEffect(() => {
    setData(undefined);
    reload().catch((e) => setError(e instanceof Error ? e.message : 'Yol haritası yüklenemedi'));
  }, [reload]);

  if (error) return <div className="notice bad" role="alert">{error}</div>;
  if (data === undefined) return <p className="muted" role="status">Yükleniyor…</p>;

  if (data === null || editing) {
    const current = data ? { start: data.path.start_level, target: data.path.target_level } : undefined;
    return (
      <RangePicker
        langName={langName}
        initial={current ?? defaultRange(overallLevel(levelsOf(app.active)))}
        isEdit={Boolean(data)}
        onCancel={data ? () => setEditing(false) : undefined}
        onSave={async (s, t) => {
          await savePath(db, app.userId, lang, s, t);
          setEditing(false);
          await reload();
        }}
      />
    );
  }

  const { path, state, steps } = data;
  const next = state.next;

  return (
    <div className="stack-lg">
      <div className="hero">
        <h1>{langName} yol haritası: {path.start_level} → {path.target_level}</h1>
        <p className="muted">
          {state.attempted}/{state.total} adım tamam · %{state.percent}
          {state.remainingMinutes > 0 && ` · tahmini kalan ${formatMinutes(state.remainingMinutes)}`}
        </p>
        <div className="bar" aria-label={`İlerleme %${state.percent}`}><i style={{ width: `${state.percent}%` }} /></div>
      </div>

      <NextCard next={next} />

      {state.gaps.length > 0 && (
        <p className="notice">
          {state.gaps.join(', ')} seviyesi için henüz içerik eklenmedi. İçerik geldikçe yol haritan otomatik uzar; şimdilik diğer seviyelerden ilerleyebilirsin.
        </p>
      )}

      <div className="stack">
        <h2>Harita</h2>
        {state.stages.map((st) => (
          <details key={st.level} className="card" open={next.type === 'step' && next.step.stage === st.stage}>
            <summary style={{ cursor: 'pointer' }}>
              <b>{st.level}</b> <span className="muted">· {LEVEL_BLURB_TR[st.level]}</span>
              <span className="muted" style={{ float: 'right' }}>
                {st.empty ? 'içerik yok' : `${st.attempted}/${st.total}${st.average !== null ? ` · ort. %${st.average}` : ''}`}
              </span>
            </summary>
            <div style={{ marginTop: 10 }}>
              {st.steps.map((s) => (
                <StepRow key={s.key} step={s} current={next.type === 'step' && next.step.key === s.key} stat={data.scores.get(s.key)} />
              ))}
              {st.empty && <p className="muted">Bu seviye için içerik hazırlanıyor.</p>}
            </div>
          </details>
        ))}
      </div>

      <div className="row">
        <button className="btn" onClick={() => setEditing(true)}>Aralığı değiştir</button>
        <button
          className="btn"
          onClick={async () => {
            if (!window.confirm('Bu yolculuğa o ana kadar yaptıkların sayılmasın, baştan başlansın mı? (Geçmiş ilerlemen silinmez.)')) return;
            await restartPath(db, path.id);
            await reload();
          }}
        >
          Baştan başla
        </button>
        <button
          className="btn danger"
          onClick={async () => {
            if (!window.confirm('Yol haritası kaldırılsın mı? (İlerleme geçmişin silinmez.)')) return;
            await deletePath(db, path.id);
            await reload();
          }}
        >
          Yol haritasını kaldır
        </button>
      </div>
      <p className="muted"><small>Toplam {steps.length} adım · {path.start_level}–{path.target_level} · bir adımdan %{MASTERY_SCORE} altı alırsan sistem seni o konuya en fazla iki kez geri getirir.</small></p>
    </div>
  );
}

function NextCard({ next }: { next: LoadedJourney['state']['next'] }) {
  if (next.type === 'finished') {
    return (
      <div className="card">
        <h2>🎉 Yolculuğu tamamladın</h2>
        <p className="muted">Bu aralıktaki tüm adımları bitirdin. Aralığı genişletip bir üst seviyeye geçebilirsin.</p>
      </div>
    );
  }
  if (next.type === 'no-content') {
    return (
      <div className="card">
        <h2>Sıradaki seviye hazırlanıyor</h2>
        <p className="muted">{next.level} seviyesi için henüz içerik yok. Bu arada kart tekrarı yapabilir veya kütüphaneden serbest çalışabilirsin.</p>
        <div className="row"><Link className="btn" href="/review">Kart tekrarı</Link><Link className="btn" href="/library">Kütüphane</Link></div>
      </div>
    );
  }
  if (next.type === 'review') {
    return (
      <div className="card">
        <span className="tag accent">Sıradaki adım</span>
        <h2>🔁 {next.due} kart tekrar bekliyor</h2>
        <p className="muted">Birikmiş kartları önce bitirmek öğrendiklerini kalıcı yapar. Sonra yolculuğa devam edersin.</p>
        <Link className="btn primary" href="/review">Kartları tekrar et</Link>
      </div>
    );
  }
  const s = next.step;
  return (
    <div className="card">
      <span className="tag accent">Sıradaki adım</span>
      <h2>{KIND_ICON[s.kind]} {s.title}</h2>
      <p className="muted">
        {KIND_LABEL[s.kind]} · {s.level} · yaklaşık {STEP_MINUTES[s.kind]} dk
        {next.reason === 'retry' && ` · tekrar: önceki en iyi puanın %${next.previousScore}`}
      </p>
      <Link className="btn primary" href={stepHref(s)}>{next.reason === 'retry' ? 'Tekrar dene' : 'Başla'}</Link>
    </div>
  );
}

function StepRow({ step, current, stat }: { step: LoadedJourney['steps'][number]; current: boolean; stat?: { best: number } }) {
  const done = Boolean(stat);
  const weak = done && (stat as { best: number }).best < MASTERY_SCORE;
  return (
    <div className="row between" style={{ padding: '4px 0', fontWeight: current ? 700 : 400 }}>
      <span>
        {done ? (weak ? '◐' : '✓') : current ? '▶' : '○'} {KIND_ICON[step.kind]} {step.title}
      </span>
      <span className="muted">
        {done ? `%${Math.round((stat as { best: number }).best)}` : <Link href={stepHref(step)}>aç</Link>}
      </span>
    </div>
  );
}

function defaultRange(level: Cefr): { start: Cefr; target: Cefr } {
  const start = JOURNEY_LEVELS.includes(level) ? level : 'C1';
  const target = JOURNEY_LEVELS[Math.min(cefrIndex(start) + 2, JOURNEY_LEVELS.length - 1)];
  return normalizeRange(start, target);
}

function RangePicker({
  langName, initial, isEdit, onSave, onCancel,
}: {
  langName: string;
  initial: { start: Cefr; target: Cefr };
  isEdit: boolean;
  onSave: (s: Cefr, t: Cefr) => Promise<void>;
  onCancel?: () => void;
}) {
  const [start, setStart] = useState<Cefr>(initial.start);
  const [target, setTarget] = useState<Cefr>(initial.target);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const r = normalizeRange(start, target);
  const stages = levelsInRange(r.start, r.target);

  return (
    <div className="stack-lg">
      <div className="hero">
        <h1>{langName} yol haritası</h1>
        <p className="muted">
          Hangi seviyeden hangi seviyeye çalışmak istediğini seç. Sonrasında “şimdi ne yapsam?” diye düşünmezsin: sistem her seferinde sıradaki adımı söyler
          (dilbilgisi, dinleme, okuma, konuşma, yazma sırayla karışık gelir; zorlandığın yerler geri getirilir).
        </p>
      </div>
      <div className="card stack">
        <div className="grid two">
          <label>
            Başlangıç seviyesi
            <select value={start} onChange={(e) => setStart(e.target.value as Cefr)}>
              {JOURNEY_LEVELS.map((l) => <option key={l} value={l}>{l} · {LEVEL_BLURB_TR[l]}</option>)}
            </select>
          </label>
          <label>
            Hedef seviye
            <select value={target} onChange={(e) => setTarget(e.target.value as Cefr)}>
              {JOURNEY_LEVELS.map((l) => <option key={l} value={l}>{l} · {LEVEL_BLURB_TR[l]}</option>)}
            </select>
          </label>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Yolculuk: {stages.join(' → ')}. Zaten yaptığın adımlar otomatik tamamlanmış sayılır.
        </p>
        {err && <p className="notice bad" role="alert">{err}</p>}
        <div className="row">
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await onSave(r.start, r.target);
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Kaydedilemedi');
              } finally {
                setBusy(false);
              }
            }}
          >
            {isEdit ? 'Kaydet' : 'Yolculuğu başlat'}
          </button>
          {onCancel && <button className="btn" onClick={onCancel}>Vazgeç</button>}
        </div>
      </div>
    </div>
  );
}
