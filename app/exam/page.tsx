'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Gate, type ReadyApp } from '@/components/Gate';
import { addCardsFromWords, localDate, type Db } from '@/lib/db';
import {
  EXAM_SECTIONS, GOETHE_LEVELS, GOETHE_PASS_PCT, QTYPE_LABEL, SECTION_ICON, SECTION_LABEL, BAND_STEPS,
  daysUntil, estimatedOverall, goethePassState, nextStep, summarize, typeAccuracy, weeklyPlan,
  type ExamSection, type GoetheLevel,
} from '@/lib/exam';
import { getExamContent, itemRefs } from '@/lib/exam-content';
import { loadAttempts, loadSettings, resetAttempts, saveSettings, type ExamSettings } from '@/lib/exam-data';
import type { AttemptLite } from '@/lib/exam';

export default function ExamPage() {
  return <Gate>{({ app, db }) => <ExamHub app={app} db={db} />}</Gate>;
}

const VOCAB_CHUNK = 12;

function ExamHub({ app, db }: { app: ReadyApp; db: Db }) {
  const lang = app.active.language_code;
  const content = getExamContent(lang);
  const [settings, setSettings] = useState<ExamSettings | null | undefined>(undefined);
  const [attempts, setAttempts] = useState<AttemptLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [vocabDone, setVocabDone] = useState(0);
  const [vocabBusy, setVocabBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const vocabKey = `exam-vocab-${app.userId}`;

  const reload = useCallback(async () => {
    const [s, a] = await Promise.all([loadSettings(db, app.userId, lang), loadAttempts(db, app.userId, lang)]);
    setSettings(s);
    setAttempts(a);
  }, [db, app.userId, lang]);

  useEffect(() => {
    if (!content) return;
    setSettings(undefined);
    reload().catch((e) => setError(e instanceof Error ? e.message : 'Yüklenemedi'));
    try { setVocabDone(Number(localStorage.getItem(vocabKey) ?? 0) || 0); } catch { /* yoksay */ }
  }, [reload, content, vocabKey]);

  const exam = content?.exam ?? 'ielts';
  const level: GoetheLevel | null = exam === 'goethe' ? (settings?.goethe_level ?? 'B1') : null;
  const target = settings?.target_band ?? 7;
  const scoped = useMemo(() => (exam === 'goethe' ? attempts.filter((a) => a.level === level) : attempts), [attempts, exam, level]);
  const sum = useMemo(() => summarize(exam, attempts, level), [exam, attempts, level]);
  const refs = useMemo(() => (content ? itemRefs(content, level) : []), [content, level]);
  const today = localDate(app.profile.timezone);
  const days = daysUntil(settings?.exam_date ?? null, today);

  const weakest = useMemo<ExamSection | null>(() => {
    const tried = EXAM_SECTIONS.filter((s) => sum[s].attempts > 0);
    if (!tried.length) return null;
    const gap = (s: ExamSection) => (exam === 'ielts' ? target - (sum[s].band ?? 0) : GOETHE_PASS_PCT - (sum[s].pct ?? 0));
    return [...tried].sort((a, b) => gap(b) - gap(a))[0];
  }, [sum, exam, target]);
  const plan = useMemo(() => weeklyPlan(days, weakest), [days, weakest]);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const doneThisWeek = (s: ExamSection) => scoped.filter((a) => a.section === s && Date.parse(a.created_at) >= weekAgo).length;
  const next = useMemo(() => nextStep(exam, sum, refs, scoped, exam === 'ielts' ? target : null), [exam, sum, refs, scoped, target]);
  const accuracy = useMemo(() => typeAccuracy(scoped.filter((a) => a.section === 'reading' || a.section === 'listening')), [scoped]);

  if (!content) {
    return (
      <div className="card">
        <h1>Sınav hazırlığı</h1>
        <p className="muted">Sınav sekmesi şu an İngilizce (IELTS) ve Almanca (Goethe) için hazır. Üstteki listeden çalıştığın dili değiştirebilirsin.</p>
      </div>
    );
  }
  if (error) return <div className="notice bad" role="alert">{error}</div>;
  if (settings === undefined) return <p className="muted" role="status">Yükleniyor…</p>;

  const meta = content.meta;
  const overall = exam === 'ielts' ? estimatedOverall(sum) : null;
  const gp = exam === 'goethe' ? goethePassState(sum) : null;
  const vocab = meta.vocab ?? [];

  async function patch(p: Partial<ExamSettings>) {
    try {
      await saveSettings(db, app.userId, lang, {
        exam,
        target_band: settings?.target_band ?? (exam === 'ielts' ? 7 : null),
        goethe_level: settings?.goethe_level ?? (exam === 'goethe' ? 'B1' : null),
        exam_date: settings?.exam_date ?? null,
        ...p,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    }
  }

  async function doReset() {
    try {
      await resetAttempts(db, app.userId, lang);
      try {
        Object.keys(localStorage).filter((k) => k.startsWith(`exam-draft-${app.userId}-`)).forEach((k) => localStorage.removeItem(k));
      } catch { /* yoksay */ }
      setConfirmReset(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sıfırlanamadı');
    }
  }

  async function addVocab() {
    setVocabBusy(true);
    try {
      const chunk = vocab.slice(vocabDone, vocabDone + VOCAB_CHUNK);
      await addCardsFromWords(db, app.userId, lang, chunk);
      const nextDone = vocabDone + chunk.length;
      setVocabDone(nextDone);
      try { localStorage.setItem(vocabKey, String(nextDone)); } catch { /* yoksay */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kelimeler eklenemedi');
    } finally {
      setVocabBusy(false);
    }
  }

  const recent = [...scoped].slice(0, 6);
  const titleOf = (s: ExamSection, id: string) => (content[s] as { id: string; title: string }[]).find((i) => i.id === id)?.title ?? id;
  const weakType = accuracy[0];

  return (
    <div className="stack-lg">
      <div className="hero">
        <h1>{meta.name} hazırlığı</h1>
        <p className="muted">{meta.tagline}</p>
      </div>

      <div className="card">
        <h2>Hedefin</h2>
        <div className="grid two">
          {exam === 'ielts' ? (
            <div>
              <label htmlFor="band">Hedef band</label>
              <select id="band" value={target} onChange={(e) => void patch({ target_band: Number(e.target.value) })}>
                {BAND_STEPS.map((b) => <option key={b} value={b}>{b.toFixed(1)}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label htmlFor="glevel">Hedef seviye</label>
              <select id="glevel" value={level ?? 'B1'} onChange={(e) => void patch({ goethe_level: e.target.value as GoetheLevel })}>
                {GOETHE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="edate">Sınav tarihi (varsa)</label>
            <input id="edate" type="date" value={settings?.exam_date ?? ''} onChange={(e) => void patch({ exam_date: e.target.value || null })} />
          </div>
        </div>
        {days !== null && <p className="muted" style={{ marginBottom: 0 }}>{days > 0 ? `Sınava ${days} gün (≈${Math.ceil(days / 7)} hafta) var.` : days === 0 ? 'Sınav bugün!' : 'Sınav tarihi geçmiş; yeni bir tarih seçebilirsin.'}</p>}
      </div>

      {next && next.item && (
        <div className="card">
          <div className="row between">
            <div>
              <h2>Sıradaki adım</h2>
              <p style={{ margin: 0 }}>{SECTION_ICON[next.section]} {next.item.title}</p>
              <p className="muted" style={{ margin: 0 }}>{next.reason}</p>
            </div>
            <Link className="btn primary" href={`/exam/${next.section}/${next.item.id}`}>Başla</Link>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Hazırlık durumu</h2>
        {exam === 'ielts' ? (
          <p>
            Tahmini genel band: <b>{overall ?? '—'}</b> · hedef <b>{target.toFixed(1)}</b>
            {overall !== null && <span className={overall >= target ? 'ok' : 'close'}> · {overall >= target ? 'hedefe ulaştın' : `fark ${(target - overall).toFixed(1)}`}</span>}
            {overall === null && <span className="muted"> (her beceriden en az bir deneme gerekli)</span>}
          </p>
        ) : (
          <p>
            {level} seviyesi · her modülde <b>≥ %{GOETHE_PASS_PCT}</b> gerekir.
            {gp && gp.untried.length === 0 && <span className={gp.failing.length === 0 ? 'ok' : 'close'}> {gp.failing.length === 0 ? 'Şu an dört modülde de eşiğin üstündesin.' : `Eşiğin altında: ${gp.failing.map((s) => SECTION_LABEL.goethe[s]).join(', ')}.`}</span>}
          </p>
        )}
        {EXAM_SECTIONS.map((s) => {
          const x = sum[s];
          const pct = exam === 'ielts' ? ((x.band ?? 0) / 9) * 100 : (x.pct ?? 0);
          const label = x.attempts === 0 ? 'denenmedi' : exam === 'ielts' ? `band ${x.band}` : `%${Math.round(x.pct ?? 0)}`;
          return (
            <div className="skillrow" key={s} style={{ gridTemplateColumns: '90px 1fr 90px' }}>
              <span>{SECTION_LABEL[exam][s]}</span>
              <div className="bar" style={{ position: 'relative' }}>
                <i style={{ width: `${pct}%` }} />
                {exam === 'ielts' && <span aria-hidden style={{ position: 'absolute', left: `${(target / 9) * 100}%`, top: -2, bottom: -2, width: 2, background: 'var(--ink)' }} />}
                {exam === 'goethe' && <span aria-hidden style={{ position: 'absolute', left: `${GOETHE_PASS_PCT}%`, top: -2, bottom: -2, width: 2, background: 'var(--ink)' }} />}
              </div>
              <b>{label}</b>
            </div>
          );
        })}
        <p className="muted" style={{ marginBottom: 0 }}><small>Çizgi {exam === 'ielts' ? 'hedef bandını' : 'geçme eşiğini'} gösterir. Her beceri son 3 denemenin ortalamasıdır. Yazma ve konuşma öz değerlendirmedir.</small></p>
      </div>

      <div className="card">
        <h2>Bu haftanın planı{plan.weeks !== null ? ` · ${plan.weeks} hafta kaldı` : ''}</h2>
        {EXAM_SECTIONS.map((s) => {
          const need = plan.perWeek[s];
          const done = doneThisWeek(s);
          return (
            <div className="row between" key={s} style={{ margin: '4px 0' }}>
              <span>{SECTION_ICON[s]} {SECTION_LABEL[exam][s]}{plan.focus === s ? <span className="tag warm" style={{ marginLeft: 6 }}>odak</span> : null}</span>
              <span className={done >= need ? 'ok' : 'muted'}>{done}/{need} görev {done >= need ? '✓' : ''}</span>
            </div>
          );
        })}
        {exam === 'ielts' && <p className="muted" style={{ marginBottom: 0 }}>Ayrıca haftada ≈{plan.vocab} yeni akademik kelime çalış (aşağıdaki kelime kartları).</p>}
        {exam === 'goethe' && <p className="muted" style={{ marginBottom: 0 }}>Plan, en zayıf modüle bir ekstra görev ekler; sınava 4 haftadan az kaldıysa sıklık artar.</p>}
      </div>

      <div className="grid two">
        {EXAM_SECTIONS.map((s) => (
          <Link key={s} href={`/exam/${s}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h3 style={{ marginTop: 0 }}>{SECTION_ICON[s]} {SECTION_LABEL[exam][s]}</h3>
            <p className="muted" style={{ margin: 0 }}>
              {refs.filter((r) => r.section === s).length} görev · {sum[s].attempts} deneme
            </p>
          </Link>
        ))}
      </div>

      {weakType && (
        <div className="card">
          <h3>En çok zorlandığın soru tipi</h3>
          <p style={{ margin: '0 0 4px' }}><b>{QTYPE_LABEL[weakType.type as keyof typeof QTYPE_LABEL] ?? weakType.type}</b> <span className="muted">· %{Math.round(weakType.pct)} doğru ({weakType.correct}/{weakType.total})</span></p>
          <p className="muted" style={{ margin: 0 }}>{meta.strategies[weakType.type] ?? ''}</p>
        </div>
      )}

      {exam === 'ielts' && vocab.length > 0 && (
        <div className="card">
          <div className="row between">
            <div>
              <h3 style={{ marginTop: 0 }}>Akademik kelimeler</h3>
              <p className="muted" style={{ margin: 0 }}>{vocabDone}/{vocab.length} kelime kartlarına eklendi. Eklenenler Tekrar sekmesindeki aralıklı tekrara girer.</p>
            </div>
            <button className="btn primary" disabled={vocabBusy || vocabDone >= vocab.length} onClick={() => void addVocab()}>
              {vocabBusy ? 'Ekleniyor…' : vocabDone >= vocab.length ? 'Hepsi eklendi' : `Sonraki ${Math.min(VOCAB_CHUNK, vocab.length - vocabDone)} kelimeyi ekle`}
            </button>
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="card">
          <h3>Son denemeler</h3>
          {recent.map((a) => (
            <div className="row between" key={a.created_at + a.item_id} style={{ margin: '4px 0' }}>
              <span>{SECTION_ICON[a.section]} {titleOf(a.section, a.item_id)}</span>
              <span className="muted">{exam === 'ielts' && a.band !== null ? `band ${a.band}` : `%${Math.round(a.score_pct)}`}</span>
            </div>
          ))}
        </div>
      )}

      {attempts.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>İlerlemeyi sıfırla</h3>
          {!confirmReset ? (
            <div className="row between">
              <p className="muted" style={{ margin: 0 }}>Tüm {meta.name} denemelerini ({attempts.length}) silip baştan başlayabilirsin. Hedefin ve tarihin kalır.</p>
              <button className="btn danger" onClick={() => setConfirmReset(true)}>Sıfırla</button>
            </div>
          ) : (
            <div className="stack">
              <p className="notice bad" style={{ margin: 0 }}>{attempts.length} deneme ve yazı taslakların kalıcı olarak silinecek. Bu geri alınamaz. Kelime kartların ve diğer ilerlemen etkilenmez.</p>
              <div className="row">
                <button className="btn danger" onClick={() => void doReset()}>Evet, hepsini sil</button>
                <button className="btn" onClick={() => setConfirmReset(false)}>Vazgeç</button>
              </div>
            </div>
          )}
        </div>
      )}

      <details className="card">
        <summary><b>Sınav formatı hakkında</b></summary>
        {meta.format && <ul>{meta.format.map((f) => <li key={f.section}><b>{SECTION_LABEL[exam][f.section]}:</b> {f.text}</li>)}</ul>}
        {meta.levels && level && <p>{meta.levels[level]?.text}</p>}
        <p className="muted" style={{ marginBottom: 0 }}>{meta.formatNote}</p>
      </details>
    </div>
  );
}
