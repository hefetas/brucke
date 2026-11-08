'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Gate, type ReadyApp } from '@/components/Gate';
import { useApp } from '@/components/AppProvider';
import { setActiveLanguage, type Db } from '@/lib/db';
import { INTERESTS } from '@/lib/types';

export default function SettingsPage() {
  return <Gate>{({ app, db }) => <Settings app={app} db={db} />}</Gate>;
}

function Settings({ app, db }: { app: ReadyApp; db: Db }) {
  const { refresh } = useApp();
  const router = useRouter();
  const p = app.profile;
  const [name, setName] = useState(p.display_name ?? '');
  const [minutes, setMinutes] = useState<number>(p.daily_minutes);
  const [reminder, setReminder] = useState(p.reminder_time.slice(0, 5));
  const [theme, setTheme] = useState(p.theme);
  const [rate, setRate] = useState(Number(p.tts_rate));
  const [subs, setSubs] = useState(p.show_subtitles);
  const [interests, setInterests] = useState<string[]>(p.interests);
  const [tz, setTz] = useState(p.timezone);
  const [msg, setMsg] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { document.title = 'Ayarlar · DilYolu'; }, []);

  async function save() {
    const { error } = await db.from('user_profile').update({
      display_name: name.trim() || null, daily_minutes: minutes, reminder_time: reminder, theme, tts_rate: rate,
      show_subtitles: subs, interests, timezone: tz,
    }).eq('id', app.userId);
    if (error) setMsg({ kind: 'bad', text: error.message });
    else {
      await refresh();
      setMsg({ kind: 'good', text: 'Kaydedildi. Değişen süre yarınki dersten itibaren geçerli olur.' });
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch('/api/export');
      if (!res.ok) throw new Error('Dışa aktarılamadı');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `dilyolu-yedek-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setMsg({ kind: 'bad', text: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setExporting(false);
    }
  }

  async function logout() {
    await db.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  const targets = app.userLangs.filter((u) => u.role === 'target');
  return (
    <div className="stack-lg">
      <h1>Ayarlar</h1>

      <div className="card">
        <h3>Genel</h3>
        <label htmlFor="n" style={{ marginTop: 0 }}>Adın</label>
        <input id="n" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <label htmlFor="m">Günlük süre</label>
        <select id="m" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          {[10, 20, 40, 60].map((m) => <option key={m} value={m}>{m} dakika</option>)}
        </select>
        <label htmlFor="r">Hatırlatma saati</label>
        <input id="r" type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} style={{ maxWidth: 160 }} />
        <label htmlFor="tz">Saat dilimi</label>
        <input id="tz" type="text" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Europe/Istanbul" />
        <label>İlgi alanları</label>
        <div className="row">
          {INTERESTS.map((i) => (
            <button key={i} className="chip" aria-pressed={interests.includes(i)} onClick={() => setInterests((l) => (l.includes(i) ? l.filter((x) => x !== i) : [...l, i]))}>{i}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Görünüm ve ses</h3>
        <label htmlFor="th" style={{ marginTop: 0 }}>Tema</label>
        <select id="th" value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
          <option value="system">Cihaza göre</option>
          <option value="light">Açık</option>
          <option value="dark">Koyu</option>
        </select>
        <label htmlFor="rt">Okuma hızı: {rate.toFixed(2)}×</label>
        <input id="rt" type="range" min={0.5} max={1.5} step={0.05} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        <label className="inline" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={subs} onChange={(e) => setSubs(e.target.checked)} /> Dinleme metnini varsayılan göster
        </label>
      </div>

      {targets.length > 1 && (
        <div className="card">
          <h3>Çalışılan dil</h3>
          <div className="row">
            {targets.map((t) => (
              <button key={t.language_code} className="chip" aria-pressed={t.is_active} onClick={async () => { await setActiveLanguage(db, app.userId, t.language_code); await refresh(); }}>
                {app.languages.find((l) => l.code === t.language_code)?.name_tr}
              </button>
            ))}
          </div>
        </div>
      )}

      {msg && <p className={`notice ${msg.kind}`} role="status">{msg.text}</p>}
      <div className="row">
        <button className="btn primary" onClick={() => void save()}>Kaydet</button>
        <Link className="btn" href="/setup">Kurulumu yeniden aç</Link>
        <Link className="btn" href="/placement">Seviye testini tekrarla</Link>
      </div>

      <div className="card">
        <h3>Verilerim</h3>
        <p className="muted">Tüm kartların, ilerlemen, hataların ve yazdıkların tek bir JSON dosyası olarak iner. Veriler yalnızca senin hesabında durur.</p>
        <div className="row">
          <button className="btn" disabled={exporting} onClick={() => void exportData()}>{exporting ? 'Hazırlanıyor…' : 'Yedeği indir (JSON)'}</button>
          <button className="btn danger" onClick={() => void logout()}>Çıkış yap</button>
        </div>
      </div>
    </div>
  );
}
