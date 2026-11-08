// Tarayıcı ses sentezi (SpeechSynthesis) ve konuşma tanıma (SpeechRecognition) yardımcıları.

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function listVoices(locale: string): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  const lang = locale.toLowerCase();
  const base = lang.split('-')[0];
  const all = window.speechSynthesis.getVoices();
  const exact = all.filter((v) => v.lang.toLowerCase().replace('_', '-') === lang);
  const loose = all.filter((v) => v.lang.toLowerCase().startsWith(base) && !exact.includes(v));
  return [...exact, ...loose];
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

export interface SpeakOptions {
  locale: string;
  rate?: number;
  voiceIndex?: number;
  onEnd?: () => void;
}

export function speak(text: string, opts: SpeakOptions): void {
  if (!ttsSupported()) {
    opts.onEnd?.();
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = opts.locale;
  u.rate = opts.rate ?? 1;
  const voices = listVoices(opts.locale);
  if (voices.length) u.voice = voices[(opts.voiceIndex ?? 0) % voices.length];
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();
  window.speechSynthesis.speak(u);
}

/** Satır satır sırayla okur; konuşmacılara farklı ses atar. İptal için dönen fonksiyonu çağır. */
export function speakLines(
  lines: { speaker?: string; text: string }[],
  opts: { locale: string; rate?: number; onLine?: (i: number) => void; onDone?: () => void },
): () => void {
  let cancelled = false;
  const speakers = [...new Set(lines.map((l) => l.speaker ?? ''))];
  const run = (i: number) => {
    if (cancelled || i >= lines.length) {
      if (!cancelled) opts.onDone?.();
      return;
    }
    opts.onLine?.(i);
    speak(lines[i].text, {
      locale: opts.locale,
      rate: opts.rate,
      voiceIndex: speakers.indexOf(lines[i].speaker ?? ''),
      onEnd: () => run(i + 1),
    });
  };
  stopSpeaking();
  run(0);
  return () => {
    cancelled = true;
    stopSpeaking();
  };
}

// ── Konuşma tanıma ──────────────────────────────────────────────────────────

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export function recognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export interface Recorder {
  stop(): Promise<{ transcript: string; audio: Blob | null }>;
}

/**
 * Mikrofonu açar: varsa tarayıcı konuşma tanımayı (canlı döküm), ve ses kaydını (MediaRecorder) başlatır.
 * Tanıma desteklenmiyorsa döküm boş döner; arayüz elle yazma alanı sunar.
 */
export async function startRecording(
  locale: string,
  onTranscript: (text: string, isFinal: boolean) => void,
  onError: (message: string) => void,
): Promise<Recorder> {
  let stream: MediaStream | null = null;
  let media: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (typeof MediaRecorder !== 'undefined') {
      media = new MediaRecorder(stream);
      media.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      media.start();
    }
  } catch {
    onError('Mikrofona erişilemedi. Tarayıcı izinlerini kontrol et.');
  }

  let finalText = '';
  let lastAll = '';
  let rec: RecognitionLike | null = null;
  let wantRunning = true;
  if (recognitionSupported()) {
    const w = window as unknown as Record<string, new () => RecognitionLike>;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    rec = new Ctor();
    rec.lang = locale;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      let fin = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      finalText = fin.trim();
      lastAll = (fin + interim).trim();
      onTranscript((fin + interim).trim(), interim === '');
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') onError('Konuşma tanıma izni verilmedi.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') onError(`Konuşma tanıma hatası: ${e.error}`);
    };
    rec.onend = () => {
      if (wantRunning) {
        try { rec?.start(); } catch { /* zaten çalışıyor */ }
      }
    };
    try { rec.start(); } catch { /* ilk başlatma hatası önemsiz */ }
  }

  return {
    stop: () =>
      new Promise((resolve) => {
        wantRunning = false;
        try { rec?.stop(); } catch { /* yoksay */ }
        const finish = () => {
          stream?.getTracks().forEach((t) => t.stop());
          resolve({
            transcript: lastAll || finalText,
            audio: chunks.length ? new Blob(chunks, { type: media?.mimeType || 'audio/webm' }) : null,
          });
        };
        if (media && media.state !== 'inactive') {
          media.onstop = finish;
          media.stop();
        } else finish();
      }),
  };
}
