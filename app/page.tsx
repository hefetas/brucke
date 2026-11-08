'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/AppProvider';

export default function Home() {
  const { app, loading } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(app && !app.profile.onboarding_done ? '/setup' : '/dashboard');
  }, [app, loading, router]);
  return <p className="muted" role="status">Yükleniyor…</p>;
}
