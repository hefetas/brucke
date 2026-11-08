// Konuşma metni ile hedef metni kelime düzeyinde karşılaştırma ve ifade kullanımı kontrolü.

/** Küçük harf, aksan ve noktalama temizliği (ß→ss, ä→a vb. karşılaştırma için). */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(' ') : [];
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export type WordStatus = 'ok' | 'close' | 'missing' | 'extra';
export interface AlignedWord {
  word: string;
  spoken?: string;
  status: WordStatus;
}
export interface AlignResult {
  words: AlignedWord[];
  /** 0–100: doğru + yarım puanlı yakın kelimeler / hedef kelime sayısı */
  accuracy: number;
}

const isClose = (a: string, b: string) => a.length > 3 && b.length > 3 && levenshtein(a, b) <= 1;

/**
 * En uzun ortak alt dizi ile hizalama. Hedefte olup söylenmeyen kelime "missing",
 * söylenip hedefte olmayan "extra"; bire bir yan yana düşen ve bir harf farkı olanlar "close".
 */
export function alignWords(target: string, spoken: string): AlignResult {
  const t = tokenize(target);
  const s = tokenize(spoken);
  const n = t.length;
  const m = s.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = t[i] === s[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const words: AlignedWord[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && t[i] === s[j]) {
      words.push({ word: t[i], spoken: s[j], status: 'ok' });
      i++; j++;
    } else if (i < n && j < m && dp[i + 1][j] === dp[i][j + 1] && isClose(t[i], s[j])) {
      words.push({ word: t[i], spoken: s[j], status: 'close' });
      i++; j++;
    } else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) {
      words.push({ word: t[i], status: 'missing' });
      i++;
    } else {
      words.push({ word: s[j], spoken: s[j], status: 'extra' });
      j++;
    }
  }
  const good = words.filter((w) => w.status === 'ok').length + 0.5 * words.filter((w) => w.status === 'close').length;
  return { words, accuracy: n === 0 ? 0 : Math.round((good / n) * 100) };
}

/** Metinde geçen hedef ifadeler (aksan/büyük harf duyarsız, kelime sınırında). */
export function usedPhrases(text: string, phrases: string[]): string[] {
  const hay = ` ${normalize(text)} `;
  return phrases.filter((p) => {
    const needle = normalize(p);
    return needle.length > 0 && hay.includes(` ${needle} `);
  });
}

export function countWords(text: string): number {
  return tokenize(text).length;
}

/**
 * Dilbilgisi alıştırmalarında cevap karşılaştırma: büyük/küçük harf ve sondaki noktalama esnek,
 * ama aksan serttir (schön ≠ schon). Kabul edilen cevaplar "|" ile ayrılır.
 */
export function sameAnswer(input: string, accepted: string): boolean {
  const clean = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').toLowerCase();
  return accepted.split('|').some((a) => clean(a) === clean(input));
}
