'use client';

import { useEffect, useState } from 'react';
import { Gate, type ReadyApp } from '@/components/Gate';
import { addDays, levelsOf, localDate, setSkillLevel, type Db } from '@/lib/db';
import { loadProgressBySkill } from '@/lib/lesson';
import { SKILLS, SKILL_LABEL_TR, evaluateLevel, nextLevel, prevLevel, type ProgressEntry, type Skill } from '@/lib/levels';
import { useApp } from '@/components/AppProvider';

export default function ProgressPage() {
  return <Gate>{({ app, db }) => <Progress app={app} db={db} />}</Gate>;
}

const ERR_TR: Record<string, string> = {
  tense: 'Zaman', preposition: 'Edat', article: 'Artikel', agreement: 'Uyum', word_order: 'Kelime sırası',
  word_choice: 'Kelime seçimi', spelling: 'Yazım', naturalness: 'Doğallık', unclear_speech: 'Telaffuz', other: 'Diğer',
};

interface Data {
  bySkill: Partial<Record<Skill, ProgressEntry[]>>;
  days: { date: string; minutes: number }[];
  accuracy: number | null;
  reviews: number;
  errorTypes: [string, number][];
  recentErrors: { original: string; corrected: string; explanation_tr: string | null; error_type: string }[];
  states: Record<string, number>;
}

function Progress({ app, db }: { app: ReadyApp; db: Db }) {
  const { refresh } = useApp();
  const lang = app.active.language_code;
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const levels = levelsOf(app.active);

  useEffect(() => {
    (async () => {
      const today = localDate(app.profile.timezone);
      const since = `${addDays(today, -(range - 1))}T00:00:00Z`;
      const [progress, streaks, reviews, errors, cards] = await Promise.all([
        loadProgressBySkill(db, app.userId, lang),
        db.from('daily_streaks').select('activity_date, minutes_studied').eq('user_id', app.userId).gte('activity_date', addDays(today, -(range - 1))),
        db.from('card_reviews').select('is_correct').eq('user_id', app.userId).gte('reviewed_at', since).limit(5000),
        db.from('errors').select('error_type, original, corrected, explanation_tr, occurred_at').eq('user_id', app.userId).eq('language_code', lang).gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(300),
        db.from('user_cards').select('state').eq('user_id', app.userId).eq('language_code', lang).is('deleted_at', null).limit(5000),
      ]);
      const mins = new Map<string, number>(((streaks.data ?? []) as { activity_date: string; minutes_studied: number }[]).map((r) => [r.activity_date, Number(r.minutes_studied)] as [string, number]));
      const rev = (reviews.data ?? []) as { is_correct: boolean }[];
      const typeCount = new Map<string, number>();
      for (const e of (errors.data ?? []) as { error_type: string }[]) typeCount.set(e.error_type, (typeCount.get(e.error_type) ?? 0) + 1);
      const states: Record<string, number> = {};
      for (const c of (cards.data ?? []) as { state: string }[]) states[c.state] = (states[c.state] ?? 0) + 1;
      setD({
        bySkill: progress.bySkill,
        days: Array.from({ length: range }, (_, i) => {
          const date = addDays(today, i - (range - 1));
          return { date, minutes: mins.get(date) ?? 0 };
        }),
        accuracy: rev.length ? Math.round((rev.filter((r) => r.is_correct).length / rev.length) * 100) : null,
        reviews: rev.length,
        errorTypes: [...typeCount.entries()].sort((a, b) => b[1] - a[1]),
        recentErrors: ((errors.data ?? []) as Data['recentErrors']).slice(0, 8),
        states,
      });
    })().catch((e) => setError(e instanceof Error ? e.message : 'Yüklenemedi'));
  }, [app, db, lang, range]);

  async function change(skill: Skill, level: ReturnType<typeof nextLevel>) {
    await setSkillLevel(db, app.userId, lang, skill, level);
    await refresh();
  }

  if (error) return <div className="notice bad" role="alert">{error}</div>;
  if (!d) return <p className="muted" role="status">Yükleniyor…</p>;

  const total = Math.round(d.days.reduce((s, x) => s + x.minutes, 0));
  const activeDays = d.days.filter((x) => x.minutes > 0).length;
  const maxMin = Math.max(1, ...d.days.map((x) => x.minutes));
  const maxErr = Math.max(1, ...d.errorTypes.map(([, n]) => n));

  return (
    <div className="stack-lg">
      <div className="row between">
        <h1 style={{ margin: 0 }}>İlerleme</h1>
        <div className="row">
          {([7, 30, 90] as const).map((r) => <button key={r} className="chip" aria-pressed={range === r} onClick={() => setRange(r)}>{r} gün</button>)}
        </div>
      </div>

      <div className="grid three">
        <div className="card"><p className="stat">{total}</p><p className="muted" style={{ margin: 0 }}>dakika · {activeDays} aktif gün</p></div>
        <div className="card"><p className="stat">{d.accuracy === null ? '—' : `%${d.accuracy}`}</p><p className="muted" style={{ margin: 0 }}>kart doğruluğu · {d.reviews} tekrar</p></div>
        <div className="card">
          <p className="stat">{(d.states.review ?? 0) + (d.states.relearning ?? 0)}</p>
          <p className="muted" style={{ margin: 0 }}>olgunlaşan kart · {d.states.learning ?? 0} öğreniliyor</p>
        </div>
      </div>

      <div className="card">
        <h3>Günlük çalışma</h3>
        <div className="spark" role="img" aria-label={`Son ${range} gün toplam ${total} dakika`}>
          {d.days.map((x) => <i key={x.date} className={x.minutes ? '' : 'off'} title={`${x.date}: ${Math.round(x.minutes)} dk`} style={{ height: `${Math.max(4, (x.minutes / maxMin) * 100)}%` }} />)}
        </div>
      </div>

      <div className="card">
        <h3>Beceriler</h3>
        <p className="muted"><small>Ortalama, o becerideki son 10 etkinliğin puanıdır.</small></p>
        {SKILLS.map((s) => {
          const list = d.bySkill[s] ?? [];
          const dec = evaluateLevel(list, levels[s]);
          return (
            <div key={s} style={{ margin: '12px 0' }}>
              <div className="skillrow" style={{ margin: 0 }}>
                <span>{SKILL_LABEL_TR[s]}</span>
                <div className="bar"><i style={{ width: `${list.length ? dec.recentAverage : 0}%` }} /></div>
                <b>{levels[s]}</b>
              </div>
              <small className="muted">{list.length ? `Ort. %${dec.recentAverage} (${dec.recentCount} etkinlik)` : 'Henüz veri yok'}</small>
              {dec.levelUp && (
                <p className="notice good" style={{ margin: '6px 0 0' }}>
                  Son sonuçların güçlü. {nextLevel(levels[s])} seviyesine geçmek ister misin?{' '}
                  <button className="btn small primary" onClick={() => void change(s, nextLevel(levels[s]))}>Evet, geç</button>
                </p>
              )}
              {dec.suggestDrop && (
                <p className="notice" style={{ margin: '6px 0 0' }}>
                  Son sonuçların düşük. {prevLevel(levels[s])} seviyesine inmek daha rahat olabilir.{' '}
                  <button className="btn small" onClick={() => void change(s, prevLevel(levels[s]))}>Seviyeyi düşür</button>
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid two">
        <div className="card">
          <h3>Hata türleri</h3>
          {d.errorTypes.length === 0 ? <p className="muted">Bu aralıkta kayıtlı hata yok.</p> : d.errorTypes.map(([t, n]) => (
            <div className="skillrow" key={t}><span>{ERR_TR[t] ?? t}</span><div className="bar warm"><i style={{ width: `${(n / maxErr) * 100}%` }} /></div><b>{n}</b></div>
          ))}
        </div>
        <div className="card">
          <h3>Son hatalar</h3>
          {d.recentErrors.length === 0 ? <p className="muted">Henüz yok.</p> : (
            <table><tbody>
              {d.recentErrors.map((e, i) => (
                <tr key={i}><td><span className="missing">{e.original}</span><br /><span className="ok">{e.corrected}</span>{e.explanation_tr && <div className="muted"><small>{e.explanation_tr}</small></div>}</td></tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}
