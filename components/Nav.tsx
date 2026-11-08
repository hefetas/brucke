'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from './AppProvider';
import { setActiveLanguage } from '@/lib/db';

const LINKS = [
  { href: '/dashboard', label: 'Panel' },
  { href: '/lesson/today', label: 'Bugünkü ders' },
  { href: '/review', label: 'Tekrar' },
  { href: '/library', label: 'Kütüphane' },
  { href: '/progress', label: 'İlerleme' },
  { href: '/profile', label: 'Profil' },
  { href: '/settings', label: 'Ayarlar' },
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const { app, db, refresh } = useApp();
  if (path === '/login') return null;

  const targets = app?.userLangs.filter((u) => u.role === 'target') ?? [];
  const nameOf = (code: string) => app?.languages.find((l) => l.code === code)?.name_tr ?? code;

  async function switchLang(code: string) {
    if (!app) return;
    await setActiveLanguage(db, app.userId, code);
    await refresh();
    router.refresh();
  }

  return (
    <nav className="nav" aria-label="Ana gezinme">
      <div className="nav-inner">
        <Link href="/dashboard" className="brand">
          Dil<span>Yolu</span>
        </Link>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="link" aria-current={path === l.href || path.startsWith(`${l.href}/`) ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
        <span className="spacer" />
        {targets.length > 1 && (
          <select
            aria-label="Çalışılan dil"
            value={app?.active?.language_code ?? ''}
            onChange={(e) => void switchLang(e.target.value)}
            style={{ width: 'auto', minHeight: 34, padding: '0.2rem 0.5rem' }}
          >
            {targets.map((t) => (
              <option key={t.language_code} value={t.language_code}>
                {nameOf(t.language_code)}
              </option>
            ))}
          </select>
        )}
      </div>
    </nav>
  );
}
