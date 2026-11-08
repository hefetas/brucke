'use client';

import { useCallback, useEffect, useState } from 'react';
import { Gate, type ReadyApp } from '@/components/Gate';
import type { Db } from '@/lib/db';
import { currentStreak } from '@/lib/lesson';
import { SKILLS, SKILL_LABEL_TR, overallLevel, xpLevel } from '@/lib/levels';
import { levelsOf } from '@/lib/db';

export default function ProfilePage() {
  return <Gate>{({ app, db }) => <Profile app={app} db={db} />}</Gate>;
}

interface Goal { id: string; kind: string; title: string; target_value: number | null; unit: string | null; status: string }
interface Ach { id: string; code: string; title_tr: string; description_tr: string; xp_reward: number; icon: string | null; category: string }

function Profile({ app, db }: { app: ReadyApp; db: Db }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [achs, setAchs] = useState<Ach[]>([]);
  const [earned, setEarned] = useState<Map<string, string>>(new Map());
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('dakika');
  const levels = levelsOf(app.active);
  const xp = xpLevel(app.active.xp);

  const load = useCallback(async () => {
    const [g, a, e, s, b] = await Promise.all([
      db.from('user_goals').select('*').eq('user_id', app.userId).neq('status', 'dropped').order('created_at', { ascending: false }),
      db.from('achievements').select('*').order('xp_reward'),
      db.from('user_achievements').select('achievement_id, earned_at').eq('user_id', app.userId),
      currentStreak(db, app.userId, app.profile.timezone),
      db.from('daily_streaks').select('streak_length').eq('user_id', app.userId).order('streak_length', { ascending: false }).limit(1),
    ]);
    setGoals((g.data ?? []) as Goal[]);
    setAchs((a.data ?? []) as Ach[]);
    setEarned(new Map((e.data ?? []).map((r: { achievement_id: string; earned_at: string }) => [r.achievement_id, r.earned_at])));
    setStreak(s.length);
    setBest(((b.data ?? [])[0] as { streak_length: number } | undefined)?.streak_length ?? 0);
  }, [db, app.userId, app.profile.timezone]);

  useEffect(() => { void load(); }, [load]);

  const purpose = goals.find((g) => g.kind === 'purpose');
  const personal = goals.filter((g) => g.kind !== 'purpose');

  return (
    <div className="stack-lg">
      <div className="hero">
        <h1>{app.profile.display_name ?? 'Profilim'}</h1>
        <p className="muted">{app.email} · {app.activeLanguage.name_tr} · genel seviye {overallLevel(levels)}{purpose ? ` · amaç: ${purpose.title}` : ''}</p>
      </div>

      <div className="grid three">
        <div className="card"><p className="stat">Sv. {xp.level}</p><p className="muted" style={{ margin: 0 }}>{app.active.xp} XP</p></div>
        <div className="card"><p className="stat">{streak}</p><p className="muted" style={{ margin: 0 }}>gün seri (en uzun {best})</p></div>
        <div className="card"><p className="stat">{earned.size}/{achs.length}</p><p className="muted" style={{ margin: 0 }}>rozet</p></div>
      </div>

      <div className="card">
        <h3>Seviyelerim</h3>
        <div className="row">{SKILLS.map((s) => <span key={s} className="tag accent">{SKILL_LABEL_TR[s]} {levels[s]}</span>)}</div>
      </div>

      <div className="card">
        <h3>Hedeflerim</h3>
        {personal.length === 0 && <p className="muted">Kendine bir hedef koy: örneğin haftada 120 dakika.</p>}
        <ul>
          {personal.map((g) => (
            <li key={g.id}>
              {g.title}{g.target_value ? ` — ${g.target_value} ${g.unit ?? ''}` : ''}{' '}
              <button className="btn small" onClick={async () => { await db.from('user_goals').update({ status: 'done' }).eq('id', g.id); await load(); }} disabled={g.status === 'done'}>{g.status === 'done' ? 'Tamam ✓' : 'Tamamla'}</button>{' '}
              <button className="btn small danger" onClick={async () => { await db.from('user_goals').update({ status: 'dropped' }).eq('id', g.id); await load(); }}>Sil</button>
            </li>
          ))}
        </ul>
        <div className="row">
          <input type="text" placeholder="Hedef (örn. Haftalık çalışma)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Hedef" style={{ flex: 2, minWidth: 160 }} />
          <input type="number" placeholder="Sayı" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Hedef sayısı" style={{ flex: 1, minWidth: 80 }} />
          <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Birim" style={{ flex: 1, minWidth: 90 }} />
          <button className="btn primary" disabled={!title.trim()} onClick={async () => {
            await db.from('user_goals').insert({ user_id: app.userId, kind: 'personal', title: title.trim(), target_value: target ? Number(target) : null, unit: unit || null });
            setTitle(''); setTarget('');
            await load();
          }}>Ekle</button>
        </div>
      </div>

      <div className="card">
        <h3>Rozetler</h3>
        <div className="grid two">
          {achs.map((a) => (
            <div key={a.id} className="row" style={{ opacity: earned.has(a.id) ? 1 : 0.45, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <span style={{ fontSize: '1.6rem' }} aria-hidden>{a.icon ?? '🏅'}</span>
              <div>
                <b>{a.title_tr}</b> {earned.has(a.id) && <span className="tag good">kazanıldı</span>}
                <div className="muted"><small>{a.description_tr}{a.xp_reward ? ` · +${a.xp_reward} XP` : ''}</small></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
