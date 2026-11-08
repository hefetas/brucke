import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const TABLES: { name: string; key: string }[] = [
  { name: 'user_profile', key: 'id' },
  { name: 'user_goals', key: 'user_id' },
  { name: 'user_languages', key: 'user_id' },
  { name: 'lessons', key: 'user_id' },
  { name: 'lesson_contents', key: 'user_id' },
  { name: 'user_cards', key: 'user_id' },
  { name: 'card_reviews', key: 'user_id' },
  { name: 'user_progress', key: 'user_id' },
  { name: 'daily_streaks', key: 'user_id' },
  { name: 'user_achievements', key: 'user_id' },
  { name: 'errors', key: 'user_id' },
  { name: 'notifications', key: 'user_id' },
  { name: 'task_attempts', key: 'user_id' },
  { name: 'placement_attempts', key: 'user_id' },
];

export async function GET() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 });

  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), email: auth.user.email };
  for (const t of TABLES) {
    const rows: unknown[] = [];
    // Supabase tek istekte en fazla 1000 satır döndürür; sayfa sayfa çek
    for (let from = 0; from < 50_000; from += 1000) {
      const { data, error } = await supabase.from(t.name).select('*').eq(t.key, auth.user.id).range(from, from + 999);
      if (error) return NextResponse.json({ error: `${t.name}: ${error.message}` }, { status: 500 });
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    out[t.name] = rows;
  }
  // Abonelik anahtarları yedeğe girmesin
  const profile = (out.user_profile as Record<string, unknown>[])[0];
  if (profile) delete profile.push_subscription;

  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="dilyolu-yedek.json"',
      'cache-control': 'no-store',
    },
  });
}
