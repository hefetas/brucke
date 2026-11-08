'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from './AppProvider';
import { setActiveLanguage } from '@/lib/db';

// Üst gezinme tam dört sekmedir; sonuncusu çalışılan dile göre IELTS ya da Goethe olur.
const EXAM_TAB: Record<string, string> = { en: 'IELTS', de: 'Goethe' };

const MORE = [
  { href: '/lesson/today', label: 'Bugünkü ders' },
  { href: '/library', label: 'Kütüphane' },
  { href: '/cards', label: 'Kartlarım' },
  { href: '/progress', label: 'İlerleme' },
  { href: '/notifications', label: 'Bildirimler' },
  { href: '/profile', label: 'Profil' },
  { href: '/settings', label: 'Ayarlar' },
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const { app, db, refresh } = useApp();
  if (path === '/login') return null;

  const lang = app?.active?.language_code ?? '';
  const links = [
    { href: '/dashboard', label: 'Panel' },
    { href: '/journey', label: 'Yol haritası' },
    { href: '/review', label: 'Tekrar' },
    { href: '/exam', label: EXAM_TAB[lang] ?? 'Sınav' },
  ];
  const moreActive = MORE.some((m) => path === m.href || path.startsWith(`${m.href}/`));

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
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="link" aria-current={path === l.href || path.startsWith(`${l.href}/`) ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
        <span className="spacer" />
        <details className="more">
          <summary className={`link${moreActive ? ' on' : ''}`} aria-label="Diğer sayfalar">⋯ Menü</summary>
          <div className="more-pop">
            {MORE.map((m) => (
              <Link key={m.href} href={m.href} aria-current={path === m.href || path.startsWith(`${m.href}/`) ? 'page' : undefined} onClick={(e) => (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open')}>
                {m.label}
              </Link>
            ))}
          </div>
        </details>
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
