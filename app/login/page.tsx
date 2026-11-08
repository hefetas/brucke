'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'bad' | 'good'; text: string } | null>(null);
  const allowSignup = process.env.NEXT_PUBLIC_ALLOW_SIGNUP === 'true';

  async function submit(mode: 'in' | 'up') {
    setBusy(true);
    setMsg(null);
    const db = supabaseBrowser();
    const res =
      mode === 'in'
        ? await db.auth.signInWithPassword({ email, password })
        : await db.auth.signUp({ email, password });
    setBusy(false);
    if (res.error) {
      setMsg({ kind: 'bad', text: res.error.message });
      return;
    }
    if (mode === 'up' && !res.data.session) {
      setMsg({ kind: 'good', text: 'Kayıt oluşturuldu. E-postandaki bağlantıyla doğrula, sonra giriş yap.' });
      return;
    }
    router.replace('/');
    router.refresh();
  }

  async function google() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setBusy(false);
      setMsg({ kind: 'bad', text: error.message });
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: '10vh auto 0' }}>
      <h1>Dil<span style={{ color: 'var(--accent)' }}>Yolu</span></h1>
      <p className="muted">Kişisel dil çalışma alanın. Hesabı Supabase panelinden oluşturduysan e-posta ve parolanla gir.</p>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void submit('in');
        }}
      >
        <label htmlFor="email">E-posta</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="pw">Parola</label>
        <input id="pw" type="password" autoComplete="current-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        {msg && <p className={`notice ${msg.kind}`} role="alert" style={{ marginTop: 12 }}>{msg.text}</p>}
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn primary" disabled={busy} type="submit">Giriş yap</button>
          {allowSignup && (
            <button className="btn" disabled={busy} type="button" onClick={() => void submit('up')}>
              Kayıt ol
            </button>
          )}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy} type="button" onClick={() => void google()}>
            Google ile giriş yap
          </button>
        </div>
      </form>
    </div>
  );
}
