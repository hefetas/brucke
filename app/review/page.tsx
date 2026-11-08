'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Gate, type ReadyApp } from '@/components/Gate';
import { ReviewLoader } from '@/components/ReviewLoader';
import { WordDrill } from '@/components/WordDrill';
import { countDue, type Db } from '@/lib/db';
import { loadProgressBySkill } from '@/lib/lesson';
import { weakGrammarOf } from '@/lib/planner';
import { loadJourney } from '@/lib/journey-data';
import { KIND_ICON, KIND_LABEL, MASTERY_SCORE, stepHref } from '@/lib/journey';
import { DRILL_TYPES, buildDrill, firstLine, isWeakCard, weakJourneySteps, weakScore, type CardLite, type WeakStep } from '@/lib/review';
import { QTYPE_LABEL, typeAccuracy } from '@/lib/exam';
import { getExamContent } from '@/lib/exam-content';
import { loadAttempts } from '@/lib/exam-data';
import type { CardRow } from '@/lib/types';

export default function ReviewPage() {
  return <Gate>{({ app, db }) => <ReviewRouter app={app} db={db} />}</Gate>;
}

/** Derse bağlı (?lc=) açılırsa doğrudan kart oturumu; aksi halde Tekrar merkezi. */
function ReviewRouter({ app, db }: { app: ReadyApp; db: Db }) {
  const [mode, setMode] = useState<'wait' | 'session' | 'hub'>('wait');
  useEffect(() => {
    setMode(new URLSearchParams(window.location.search).get('lc') ? 'session' : 'hub');
  }, []);
  if (mode === 'wait') return <p className="muted" role="status">Yükleniyor…</p>;
  return mode === 'session' ? <ReviewLoader app={app} db={db} /> : <ReviewHub app={app} db={db} />;
}

interface HubData {
  due: number;
  weakCards: CardRow[];
  pool: CardLite[];
  weakTopics: { slug: string; title: string; score: number }[];
  weakSteps: WeakStep[];
  hasJourney: boolean;
  examType: { type: string; pct: number; total: number } | null;
}

function ReviewHub({ app, db }: { app: ReadyApp; db: Db }) {
  const lang = app.active.language_code;
  const [d, setD] = useState<HubData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drilling, setDrilling] = useState(false);

  const load = useCallback(async () => {
    const [due, weakQ, poolQ, progress, journey] = await Promise.all([
      countDue(db, app.userId, lang),
      db.from('user_cards').select('*').eq('user_id', app.userId).eq('language_code', lang).is('deleted_at', null).neq('state', 'suspended').or('lapses.gt.0,wrong_count.gt.0').limit(60),
      db.from('user_cards').select('id, card_type, front, back, lapses, wrong_count, correct_count').eq('user_id', app.userId).eq('language_code', lang).is('deleted_at', null).in('card_type', [...DRILL_TYPES]).limit(200),
      loadProgressBySkill(db, app.userId, lang),
      loadJourney(db, app.userId, lang).catch(() => null),
    ]);
    if (weakQ.error) throw weakQ.error;
    const weakCards = ((weakQ.data ?? []) as CardRow[]).filter(isWeakCard).sort((a, b) => weakScore(b) - weakScore(a)).slice(0, 30);

    const weakList = weakGrammarOf(progress.rows).slice(0, 5);
    let weakTopics: HubData['weakTopics'] = [];
    if (weakList.length) {
      const { data: titles } = await db.from('grammar_topics').select('slug, title_tr').eq('language_code', lang).in('slug', weakList.map((w) => w.slug));
      const titleOf = new Map(((titles ?? []) as { slug: string; title_tr: string }[]).map((t) => [t.slug, t.title_tr] as [string, string]));
      weakTopics = weakList.filter((w) => titleOf.has(w.slug)).map((w) => ({ slug: w.slug, title: titleOf.get(w.slug) as string, score: Math.round(w.score) }));
    }

    const weakSteps = journey ? weakJourneySteps(journey.steps.filter((s) => s.kind !== 'grammar'), journey.scores, MASTERY_SCORE) : [];

    let examType: HubData['examType'] = null;
    if (getExamContent(lang)) {
      const attempts = await loadAttempts(db, app.userId, lang, 200).catch(() => []);
      const w = typeAccuracy(attempts.filter((a) => a.section === 'reading' || a.section === 'listening'))[0];
      if (w && w.pct < 70) examType = { type: w.type, pct: w.pct, total: w.total };
    }

    setD({ due, weakCards, pool: ((poolQ.data ?? []) as CardLite[]), weakTopics, weakSteps, hasJourney: !!journey, examType });
  }, [db, app.userId, lang]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Tekrar sayfası yüklenemedi'));
  }, [load]);

  const drill = useMemo(() => (d ? buildDrill(d.weakCards, d.pool) : []), [d]);
  const rows = useMemo(() => new Map((d?.weakCards ?? []).map((c) => [c.id, c] as [string, CardRow])), [d]);

  if (error) return <div className="notice bad" role="alert">{error}</div>;
  if (!d) return <p className="muted" role="status">Yükleniyor…</p>;

  const nothing = !d.due && !d.weakCards.length && !d.weakTopics.length && !d.weakSteps.length && !d.examType;
  const exam = getExamContent(lang);

  return (
    <div className="stack-lg">
      <div className="hero">
        <h1>Tekrar</h1>
        <p className="muted">Zorlandığın kelimeler, konular ve adımlar burada toplanır; her biri için kısa bir tekrar var.</p>
      </div>

      {nothing && <div className="card"><p style={{ margin: 0 }}>Şu an tekrar edilecek bir şey yok. Yol haritasında ilerledikçe zorlandığın yerler burada birikecek.</p></div>}

      <div className="card">
        <div className="row between">
          <div>
            <h2>Bekleyen kartlar</h2>
            <p className="muted" style={{ margin: 0 }}>{d.due > 0 ? `${d.due} kartın tekrar zamanı geldi.` : 'Bugün için bekleyen kart yok.'}</p>
          </div>
          <div className="row">
            <Link className={`btn${d.due > 0 ? ' primary' : ''}`} href="/review/cards">Kartları tekrar et</Link>
            <Link className="btn" href="/cards">Kartlarım</Link>
          </div>
        </div>
      </div>

      {d.weakCards.length > 0 && (
        <div className="card stack">
          <div className="row between">
            <div>
              <h2>Zorlandığın kelimeler ({d.weakCards.length})</h2>
              <p className="muted" style={{ margin: 0 }}>Çok unuttuğun ya da sık yanlış yaptığın kartlar.</p>
            </div>
            {drill.length > 0 && !drilling && <button className="btn primary" onClick={() => setDrilling(true)}>Mini alıştırma ({drill.length} soru)</button>}
          </div>
          {drilling && <WordDrill app={app} db={db} questions={drill} rows={rows} onDone={() => { setDrilling(false); void load(); }} />}
          {!drilling && d.weakCards.slice(0, 8).map((c) => (
            <div className="row between" key={c.id}>
              <span style={{ whiteSpace: 'pre-line' }}>{firstLine(c.front)}</span>
              <span className="muted">{firstLine(c.back)} · {c.wrong_count}✗ {c.correct_count}✓{c.is_leech ? ' · takılan kart' : ''}</span>
            </div>
          ))}
        </div>
      )}

      {d.weakTopics.length > 0 && (
        <div className="card">
          <h2>Zorlandığın dilbilgisi konuları</h2>
          <p className="muted" style={{ margin: '0 0 8px' }}>Son alıştırmada düşük puan aldığın konular. Alıştırmayı bir daha çöz; iyi puan alınca listeden çıkar.</p>
          {d.weakTopics.map((t) => (
            <div className="row between" key={t.slug} style={{ marginBottom: 6 }}>
              <span>{t.title} <span className="muted">· %{t.score}</span></span>
              <Link className="btn small" href={`/grammar/${t.slug}?lc=${lang}`}>Tekrar çalış</Link>
            </div>
          ))}
        </div>
      )}

      {d.weakSteps.length > 0 && (
        <div className="card">
          <h2>Yol haritasında zorlandığın adımlar</h2>
          <p className="muted" style={{ margin: '0 0 8px' }}>En iyi puanın %{MASTERY_SCORE} altında kalan dinleme, okuma, konuşma ve yazma adımları.</p>
          {d.weakSteps.map((s) => (
            <div className="row between" key={s.key} style={{ marginBottom: 6 }}>
              <span>{KIND_ICON[s.kind as keyof typeof KIND_ICON]} {s.title} <span className="muted">· {KIND_LABEL[s.kind as keyof typeof KIND_LABEL]} · en iyi %{Math.round(s.best)}</span></span>
              <Link className="btn small" href={stepHref({ kind: s.kind as 'listening', slug: s.slug })}>Tekrar dene</Link>
            </div>
          ))}
        </div>
      )}

      {d.examType && exam && (
        <div className="card">
          <div className="row between">
            <div>
              <h2>{exam.meta.name}: zayıf soru tipi</h2>
              <p style={{ margin: 0 }}><b>{QTYPE_LABEL[d.examType.type as keyof typeof QTYPE_LABEL] ?? d.examType.type}</b> <span className="muted">· %{Math.round(d.examType.pct)} doğru ({d.examType.total} soru)</span></p>
              <p className="muted" style={{ margin: 0 }}>{exam.meta.strategies[d.examType.type] ?? ''}</p>
            </div>
            <Link className="btn" href="/exam">Sınav sekmesi</Link>
          </div>
        </div>
      )}

      {!d.hasJourney && (
        <p className="muted">Yol haritası seçersen zorlandığın adımlar da burada görünür. <Link href="/journey">Yol haritasını aç</Link></p>
      )}
    </div>
  );
}
