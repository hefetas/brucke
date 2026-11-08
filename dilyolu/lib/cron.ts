import { timingSafeEqual } from 'node:crypto';

/** Cron rotalarının gizli anahtar kontrolü (Authorization: Bearer <CRON_SECRET>). */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Verilen saat diliminde 0-23 arası saat. */
export function localHour(tz: string, at: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(at);
  return Number(h) % 24;
}
