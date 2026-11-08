import { NextResponse } from 'next/server';
import * as webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase/server';
import { cronAuthorized, localHour } from '@/lib/cron';
import { addDays, localDate } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Prof {
  id: string;
  timezone: string;
  reminder_time: string;
  reminder_channel: string;
  push_subscription: webpush.PushSubscription | null;
}

/** Saatlik çalışır: hatırlatma saati gelen ve bugün çalışmamış kullanıcıya bildirim oluşturur/gönderir. */
async function run(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const db = supabaseAdmin();
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const canPush = Boolean(pub && priv);
  if (canPush) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub as string, priv as string);

  const { data: profiles, error } = await db
    .from('user_profile')
    .select('id, timezone, reminder_time, reminder_channel, push_subscription')
    .eq('onboarding_done', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let created = 0;
  let pushed = 0;
  for (const p of (profiles ?? []) as Prof[]) {
    try {
      const hour = Number(p.reminder_time.slice(0, 2));
      if (localHour(p.timezone) !== hour) continue;
      const today = localDate(p.timezone);
      const { data: rows } = await db
        .from('daily_streaks').select('activity_date, goal_met, streak_length')
        .eq('user_id', p.id).gte('activity_date', addDays(today, -1));
      const list = (rows ?? []) as { activity_date: string; goal_met: boolean; streak_length: number }[];
      if (list.some((r) => r.activity_date === today && r.goal_met)) continue;

      const since = new Date(Date.now() - 20 * 3600_000).toISOString();
      const { count } = await db.from('notifications').select('id', { count: 'exact', head: true })
        .eq('user_id', p.id).in('kind', ['daily_reminder', 'streak_warning']).gte('scheduled_for', since);
      if ((count ?? 0) > 0) continue;

      const yesterday = list.find((r) => r.activity_date === addDays(today, -1) && r.goal_met);
      const warn = yesterday && yesterday.streak_length >= 3;
      const title = warn ? `${yesterday.streak_length} günlük serin tehlikede` : 'Bugünkü dersin hazır';
      const body = warn ? 'Kısa bir ders bile seriyi korur. 10 dakika yeter.' : 'Birkaç dakikanı ayır: dil çalışmak için güzel bir an.';
      const now = new Date().toISOString();
      await db.from('notifications').insert({
        user_id: p.id, kind: warn ? 'streak_warning' : 'daily_reminder', title, body, deep_link: '/lesson/today',
        channel: p.push_subscription ? 'browser' : 'inapp', scheduled_for: now, sent_at: now,
      });
      created++;
      if (canPush && p.push_subscription && p.reminder_channel === 'browser') {
        try {
          await webpush.sendNotification(p.push_subscription, JSON.stringify({ title, body, url: '/lesson/today' }));
          pushed++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await db.from('user_profile').update({ push_subscription: null }).eq('id', p.id);
        }
      }
    } catch {
      /* bir kullanıcının hatası diğerlerini engellemesin */
    }
  }
  return NextResponse.json({ ok: true, checked: profiles?.length ?? 0, created, pushed });
}

export const GET = run;
export const POST = run;
