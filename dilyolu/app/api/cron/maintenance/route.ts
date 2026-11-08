import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { cronAuthorized } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Günlük çalışır: eski bildirimleri siler; pazar günleri haftalık özet bildirimi üretir. */
async function run(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString();
  await db.from('notifications').delete().lt('scheduled_for', cutoff);

  let reports = 0;
  if (new Date().getUTCDay() === 0) {
    const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const { data: profiles } = await db.from('user_profile').select('id').eq('onboarding_done', true);
    for (const p of (profiles ?? []) as { id: string }[]) {
      const { data: days } = await db
        .from('daily_streaks').select('minutes_studied, cards_reviewed, lessons_completed')
        .eq('user_id', p.id).gte('activity_date', since);
      const rows = (days ?? []) as { minutes_studied: number; cards_reviewed: number; lessons_completed: number }[];
      if (!rows.length) continue;
      const minutes = Math.round(rows.reduce((s, r) => s + Number(r.minutes_studied), 0));
      const cards = rows.reduce((s, r) => s + r.cards_reviewed, 0);
      const lessons = rows.reduce((s, r) => s + r.lessons_completed, 0);
      const now = new Date().toISOString();
      await db.from('notifications').insert({
        user_id: p.id, kind: 'weekly_report', title: 'Haftalık özet',
        body: `Bu hafta ${rows.length} gün çalıştın: ${minutes} dakika, ${lessons} ders, ${cards} kart tekrarı.`,
        deep_link: '/progress', channel: 'inapp', scheduled_for: now, sent_at: now,
      });
      reports++;
    }
  }
  return NextResponse.json({ ok: true, reports });
}

export const GET = run;
export const POST = run;
