'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Gate, type ReadyApp } from '@/components/Gate';
import { useApp } from '@/components/AppProvider';
import type { Db } from '@/lib/db';
import { pushSupported, subscribePush, unsubscribePush } from '@/lib/push';

export default function NotificationsPage() {
  return <Gate>{({ app, db }) => <Notifications app={app} db={db} />}</Gate>;
}

interface N {
  id: string;
  kind: string;
  title: string;
  body: string;
  deep_link: string | null;
  scheduled_for: string;
  read_at: string | null;
}

function Notifications({ app, db }: { app: ReadyApp; db: Db }) {
  const { refresh } = useApp();
  const [list, setList] = useState<N[] | null>(null);
  const [msg, setMsg] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null);
  const enabled = Boolean(app.profile.push_subscription);

  const load = useCallback(async () => {
    const { data } = await db.from('notifications').select('*').eq('user_id', app.userId)
      .lte('scheduled_for', new Date().toISOString()).order('scheduled_for', { ascending: false }).limit(60);
    setList((data ?? []) as N[]);
  }, [db, app.userId]);

  useEffect(() => { void load(); }, [load]);

  async function enable() {
    try {
      const sub = await subscribePush();
      const { error } = await db.from('user_profile').update({ push_subscription: sub, reminder_channel: 'browser' }).eq('id', app.userId);
      if (error) throw error;
      await refresh();
      setMsg({ kind: 'good', text: 'Tarayıcı bildirimleri açıldı. Hatırlatma saatinde haber vereceğim.' });
    } catch (e) {
      setMsg({ kind: 'bad', text: e instanceof Error ? e.message : 'Açılamadı' });
    }
  }

  async function disable() {
    await unsubscribePush().catch(() => undefined);
    await db.from('user_profile').update({ push_subscription: null, reminder_channel: 'inapp' }).eq('id', app.userId);
    await refresh();
    setMsg({ kind: 'good', text: 'Tarayıcı bildirimleri kapatıldı.' });
  }

  async function readAll() {
    await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', app.userId).is('read_at', null);
    await load();
  }

  return (
    <div className="stack">
      <h1>Bildirimler</h1>
      <div className="card">
        <div className="row between">
          <div>
            <b>Tarayıcı hatırlatması</b>
            <p className="muted" style={{ margin: 0 }}>Her gün {app.profile.reminder_time.slice(0, 5)}’te, o gün çalışmadıysan.</p>
          </div>
          {pushSupported() ? (
            enabled ? <button className="btn" onClick={() => void disable()}>Kapat</button> : <button className="btn primary" onClick={() => void enable()}>Aç</button>
          ) : <span className="tag">Bu tarayıcı desteklemiyor</span>}
        </div>
        {msg && <p className={`notice ${msg.kind}`} role="status" style={{ marginTop: 10 }}>{msg.text}</p>}
        <p className="muted" style={{ margin: '8px 0 0' }}><small>iPhone’da önce siteyi “Ana Ekrana Ekle” ile kurman gerekir.</small></p>
      </div>

      <div className="row between">
        <h2 style={{ margin: 0 }}>Geçmiş</h2>
        <button className="btn small" onClick={() => void readAll()}>Hepsini okundu yap</button>
      </div>
      {!list ? <p className="muted">Yükleniyor…</p> : list.length === 0 ? <p className="muted">Henüz bildirim yok.</p> : list.map((n) => (
        <div key={n.id} className="card" style={{ opacity: n.read_at ? 0.7 : 1 }}>
          <div className="row between">
            <b>{n.title}</b>
            <small className="muted">{new Date(n.scheduled_for).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</small>
          </div>
          <p style={{ margin: '4px 0' }}>{n.body}</p>
          {n.deep_link && <Link href={n.deep_link}>Aç</Link>}
        </div>
      ))}
    </div>
  );
}
