'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/AppProvider';
import { INTERESTS, PURPOSES } from '@/lib/types';

const MINUTES = [10, 20, 40, 60] as const;

export default function SetupPage() {
  const { app, db, loading, refresh } = useApp();
  const router = useRouter();
  const [name, setName] = useState('');
  const [targets, setTargets] = useState<string[]>(['en']);
  const [activeCode, setActiveCode] = useState('en');
  const [minutes, setMinutes] = useState<number>(20);
  const [interests, setInterests] = useState<string[]>([]);
  const [purpose, setPurpose] = useState<string>('Genel');
  const [reminder, setReminder] = useState('21:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!app) return;
    setName(app.profile.display_name ?? '');
    setMinutes(app.profile.daily_minutes);
    setInterests(app.profile.interests);
    setReminder(app.profile.reminder_time.slice(0, 5));
    const t = app.userLangs.filter((u) => u.role === 'target').map((u) => u.language_code);
    if (t.length) setTargets(t);
    if (app.active) setActiveCode(app.active.language_code);
  }, [app]);

  if (loading) return <p className="muted">Yükleniyor…</p>;
  if (!app) return <p>Oturum yok. <a href="/login">Giriş yap</a></p>;

  const langs = app.languages.filter((l) => l.is_target);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save() {
    if (!app) return;
    if (!targets.length) {
      setError('En az bir hedef dil seç.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const active = targets.includes(activeCode) ? activeCode : targets[0];
      const p = await db.from('user_profile').update({
        display_name: name.trim() || null,
        native_language_code: 'tr',
        daily_minutes: minutes,
        interests,
        reminder_time: reminder,
        onboarding_done: true,
      }).eq('id', app.userId);
      if (p.error) throw p.error;

      const off = await db.from('user_languages').update({ is_active: false }).eq('user_id', app.userId).eq('role', 'target');
      if (off.error) throw off.error;
      const rows = targets.map((code) => ({ user_id: app.userId, language_code: code, role: 'target', is_active: code === active }));
      const up = await db.from('user_languages').upsert(rows, { onConflict: 'user_id,language_code,role' });
      if (up.error) throw up.error;
      await db.from('user_languages').upsert(
        { user_id: app.userId, language_code: 'tr', role: 'native', is_active: false },
        { onConflict: 'user_id,language_code,role' },
      );

      await db.from('user_goals').delete().eq('user_id', app.userId).eq('kind', 'purpose');
      await db.from('user_goals').insert({ user_id: app.userId, kind: 'purpose', title: purpose });

      await refresh();
      const needsPlacement = !app.userLangs.some((u) => u.language_code === active && u.role === 'target' && u.placement_done);
      router.replace(needsPlacement ? '/placement' : '/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="hero">
        <h1>Kurulum</h1>
        <p className="muted">Bir kez doldur, istediğin zaman Ayarlar’dan değiştir. Her şey ücretsiz ve yalnızca sana ait.</p>
      </div>

      <div className="card">
        <label htmlFor="name">Adın (isteğe bağlı)</label>
        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />

        <label>Hangi dilleri öğreniyorsun?</label>
        <div className="row">
          {langs.map((l) => (
            <button key={l.code} type="button" className="chip" aria-pressed={targets.includes(l.code)} onClick={() => setTargets((t) => toggle(t, l.code))}>
              {l.name_tr}
            </button>
          ))}
        </div>
        {targets.length > 1 && (
          <>
            <label htmlFor="active">Önce hangisi?</label>
            <select id="active" value={activeCode} onChange={(e) => setActiveCode(e.target.value)}>
              {targets.map((c) => <option key={c} value={c}>{langs.find((l) => l.code === c)?.name_tr ?? c}</option>)}
            </select>
          </>
        )}

        <label>Amacın</label>
        <div className="row">
          {PURPOSES.map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={purpose === p} onClick={() => setPurpose(p)}>{p}</button>
          ))}
        </div>

        <label>Günlük çalışma süresi</label>
        <div className="row">
          {MINUTES.map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{m} dk</button>
          ))}
        </div>

        <label>İlgi alanların (içerik seçimini etkiler)</label>
        <div className="row">
          {INTERESTS.map((i) => (
            <button key={i} type="button" className="chip" aria-pressed={interests.includes(i)} onClick={() => setInterests((l) => toggle(l, i))}>{i}</button>
          ))}
        </div>

        <label htmlFor="rt">Hatırlatma saati</label>
        <input id="rt" type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} style={{ maxWidth: 160 }} />
      </div>

      {error && <p className="notice bad" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy} onClick={() => void save()}>
        {busy ? 'Kaydediliyor…' : 'Kaydet ve devam et'}
      </button>
    </div>
  );
}
