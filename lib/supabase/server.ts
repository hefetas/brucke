import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/** Oturum çerezleriyle çalışan sunucu istemcisi (RLS geçerli). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: { name: string; value: string; options?: any }[]) => {
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            /* Server Component içinden çağrıldıysa middleware oturumu yeniler */
          }
        },
      },
    },
  );
}

/** Yalnızca cron rotalarında: RLS'i aşar. İstemciye asla verilmez. */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY tanımlı değil');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
