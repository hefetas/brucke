'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gate, type ReadyApp } from '@/components/Gate';
import { addDays, countDue, levelsOf, localDate, type Db } from '@/lib/db';
import { currentStreak, loadProgressBySkill } from '@/lib/lesson';
import { weakGrammarOf } from '@/lib/planner';
import { loadJourney } from '@/lib/journey-data';
import { KIND_ICON, stepHref } from '@/lib/journey';
import { CEFR_LEVELS, SKILLS, SKILL_LABEL_TR, cefrIndex, evaluateLevel, overallLevel, weakSkills, xpLevel } from '@/lib/levels';
import type { LessonRow } from '@/lib/types';

export default function DashboardPage() {
  return <Gate>{({ app, db }) => <Dashboard app={app} db={db} />}</Gate>;
}

interface Data {
  due: number;
  streak: { length: number; todayMet: boolean };
  lesson: LessonRow | null;
  week: { date: string; minutes: number }[];
  unread: number;
  weak: string[];
  suggestions: string[];
  words: number;
  weakTopics: { slug: string; title: string; score: number }[];
  journey: { range: string; percent: number; title: string; href: string } | null;
}

function Dashboard({ app, db }: { app: ReadyApp; db: Db }) {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lang = app.active.language_code;
  const levels = levelsOf(app.active);

  useEffect(() => {
    (async () => {
      const today = localDate(app.profile.timezone);
      const [due, streak, lesson, week, unread, progress, words] = await Promise.all([
        countDue(db, app.userId, lang),
        currentStreak(db, app.userId, app.profile.timezone),
        db.from('lessons').select('*').eq('user_id', app.userId).eq('language_code', lang).eq('lesson_date', today).maybeSingle(),
        db.from('daily_streaks').select('activity_date, minutes_studied').eq('user_id', app.userId).gte('activity_date', addDays(today, -6)),
        db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', app.userId).is('read_at', null).lte('scheduled_for', new Date().toISOString()),
        loadProgressBySkill(db, app.userId, lang),
        db.from('user_cards').select('id', { count: 'exact', head: true }).eq('user_id', app.userId).eq('language_code', lang).is('deleted_at', null).not('vocabulary_id', 'is', null),
      ]);
      const minutes = new Map<string, number>(((week.data ?? []) as { activity_date: string; minutes_studied: number }[]).map((r) => [r.activity_date, Number(r.minutes_studied)] as [string, number]));
      const suggestions: string[] = [];
      for (const s of SKILLS) {
        const dec = evaluateLevel(progress.bySkill[s] ?? [], levels[s]);
        if (dec.levelUp) suggestions.push(`${SKILL_LABEL_TR[s]}: bir üst seviyeye geçmeye hazırsın`);
        else if (dec.suggestDrop) suggestions.push(`${SKILL_LABEL_TR[s]}: son sonuçların düşük, bir alt seviye daha rahat olabilir`);
      }
      const weakList = weakGrammarOf(progress.rows).slice(0, 2);
      let weakTopicRows: Data['weakTopics'] = [];
      if (weakList.length) {
        const { data: titles } = await db.from('grammar_topics').select('slug, title_tr').eq('language_code', lang).in('slug', weakList.map((w) => w.slug));
        const titleOf = new Map(((titles ?? []) as { slug: string; title_tr: string }[]).map((t) => [t.slug, t.title_tr] as [string, string]));
        weakTopicRows = weakList.filter((w) => titleOf.has(w.slug)).map((w) => ({ slug: w.slug, title: titleOf.get(w.slug) as string, score: Math.round(w.score) }));
      }
      const journey = await loadJourney(db, app.userId, lang).catch(() => null);
      let journeyCard: Data['journey'] = null;
      if (journey) {
        const nx = journey.state.next;
        const range = `${journey.path.start_level} → ${journey.path.target_level}`;
        journeyCard =
          nx.type === 'step'
            ? { range, percent: journey.state.percent, title: `${KIND_ICON[nx.step.kind]} ${nx.step.title}`, href: stepHref(nx.step) }
            : nx.type === 'review'
              ? { range, percent: journey.state.percent, title: `🔁 ${nx.due} kart tekrar bekliyor`, href: '/review' }
              : { range, percent: journey.state.percent, title: nx.type === 'finished' ? '🎉 Yolculuğu tamamladın' : 'Sıradaki seviye hazırlanıyor', href: '/journey' };
      }
      setD({
        due,
        streak,
        lesson: (lesson.data as LessonRow | null) ?? null,
        week: Array.from({ length: 7 }, (_, i) => {
          const date = addDays(today, i - 6);
          return { date, minutes: minutes.get(date) ?? 0 };
        }),
        unread: unread.count ?? 0,
        weak: weakSkills(progress.bySkill).map((s) => SKILL_LABEL_TR[s]),
        suggestions,
        words: words.count ?? 0,
        weakTopics: weakTopicRows,
        journey: journeyCard,
      });
    })().catch((e) => setError(e instanceof Error ? e.message : 'Panel yüklenemedi'));
  }, [app, db, lang]);

  if (error) return <div className="notice bad" role="alert">{error}</div>;
  if (!d) return <p className="muted" role="status">Yükleniyor…</p>;

  const xp = xpLevel(app.active.xp);
  const maxMin = Math.max(app.profile.daily_minutes, ...d.week.map((w) => w.minutes));
  const lessonState = d.lesson?.status;
  const overall = overallLevel(levels);
  const hello = app.profile.display_name ? `Merhaba ${app.profile.display_name}` : 'Merhaba';

  return (
    <div className="stack-lg">
      <div className="hero">
        <h1>{hello} 👋</h1>
        <p className="muted">{app.activeLanguage.name_tr} · genel seviye {overall} · bugün {app.profile.daily_minutes} dakika hedefin var</p>
      </div>

      {!app.active.placement_done && (
        <div className="notice">
          Seviyeni henüz ölçmedik. <Link href="/placement">Kısa seviye testini çöz</Link>
        </div>
      )}
      {d.suggestions.map((s) => <p key={s} className="notice good">{s}. <Link href="/progress">İlerleme sayfasında onayla</Link></p>)}

      <div className="card">
        {d.journey ? (
          <div className="row between">
            <div>
              <h2>Yol haritası · {d.journey.range} · %{d.journey.percent}</h2>
              <p className="muted" style={{ margin: 0 }}>Sıradaki adım: {d.journey.title}</p>
            </div>
            <div className="row">
              <Link className="btn primary" href={d.journey.href}>Devam et</Link>
              <Link className="btn" href="/journey">Harita</Link>
            </div>
          </div>
        ) : (
          <div className="row between">
            <div>
              <h2>Yol haritası</h2>
              <p className="muted" style={{ margin: 0 }}>Seviye aralığını seç (ör. B1 → C1); sistem sıradaki adımı her seferinde söylesin.</p>
            </div>
            <Link className="btn primary" href="/journey">Başla</Link>
          </div>
        )}
      </div>

      <div className="card">
        <div className="row between">
          <div>
            <h2>Bugünkü ders</h2>
            <p className="muted" style={{ margin: 0 }}>
              {lessonState === 'completed' ? 'Bugünkü dersi tamamladın. Harika!' : lessonState === 'in_progress' ? 'Yarım kalan dersin seni bekliyor.' : `${app.profile.daily_minutes} dakikalık plan hazır.`}
            </p>
          </div>
          <Link className="btn primary" href="/lesson/today">
            {lessonState === 'completed' ? 'Özeti gör' : lessonState === 'in_progress' ? 'Devam et' : 'Dersi başlat'}
          </Link>
        </div>
      </div>

      {d.weakTopics.length > 0 && (
        <div className="card">
          <h3>Zorlandığın konu</h3>
          <p className="muted" style={{ margin: '0 0 8px' }}>Son alıştırmada düşük puan aldığın konular. Ders planında da öne alınır.</p>
          {d.weakTopics.map((t) => (
            <div className="row between" key={t.slug} style={{ marginBottom: 6 }}>
              <span>{t.title} <span className="muted">· %{t.score}</span></span>
              <Link className="btn small" href={`/grammar/${t.slug}?lc=${lang}`}>Tekrar çalış</Link>
            </div>
          ))}
        </div>
      )}

      <div className="grid three">
        <div className="card">
          <p className="stat">{d.streak.length}</p>
          <p className="muted" style={{ margin: 0 }}>gün seri {d.streak.todayMet ? '· bugün tamam ✓' : '· bugün henüz değil'}</p>
        </div>
        <div className="card">
          <p className="stat">{d.due}</p>
          <p className="muted" style={{ margin: '0 0 8px' }}>bekleyen kart</p>
          {d.due > 0 && <Link className="btn small" href="/review">Tekrar et</Link>}
        </div>
        <div className="card">
          <p className="stat">Sv. {xp.level}</p>
          <div className="bar" style={{ margin: '8px 0' }}><i style={{ width: `${(xp.into / xp.needed) * 100}%` }} /></div>
          <p className="muted" style={{ margin: 0 }}>{xp.into}/{xp.needed} XP · {d.words} kelime</p>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h3>Son 7 gün (dakika)</h3>
          <div className="spark" role="img" aria-label={`Son 7 gün dakikaları: ${d.week.map((w) => Math.round(w.minutes)).join(', ')}`}>
            {d.week.map((w) => (
              <i key={w.date} className={w.minutes ? '' : 'off'} title={`${w.date}: ${Math.round(w.minutes)} dk`} style={{ height: `${Math.max(4, (w.minutes / maxMin) * 100)}%` }} />
            ))}
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}><small>Hedef: {app.profile.daily_minutes} dk</small></p>
        </div>
        <div className="card">
          <h3>Becerilerin</h3>
          {SKILLS.map((s) => (
            <div className="skillrow" key={s}>
              <span>{SKILL_LABEL_TR[s]}</span>
              <div className="bar"><i style={{ width: `${((cefrIndex(levels[s]) + 1) / CEFR_LEVELS.length) * 100}%` }} /></div>
              <b>{levels[s]}</b>
            </div>
          ))}
          {d.weak.length > 0 && <p className="muted" style={{ margin: '8px 0 0' }}>Biraz daha ilgi isteyenler: {d.weak.join(', ')}</p>}
        </div>
      </div>

      <div className="row">
        <Link className="btn" href="/library">Kütüphane</Link>
        <Link className="btn" href="/cards">Kartlarım</Link>
        <Link className="btn" href="/notifications">Bildirimler{d.unread > 0 ? ` (${d.unread})` : ''}</Link>
      </div>
    </div>
  );
}
