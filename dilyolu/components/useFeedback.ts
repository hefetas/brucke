'use client';

import { useCallback, useState } from 'react';
import type { ReadyApp } from './Gate';
import type { Feedback } from '@/lib/feedback';
import type { Db } from '@/lib/db';
import { markCardsUsed, uuid } from '@/lib/db';

export interface FeedbackState {
  feedback: Feedback;
  provider: string;
  limited: boolean;
  attemptId: string | null;
}

/** Sunucudan geri bildirim ister; hataları kaydeder ve hata kartı oluşturur. */
export function useFeedback(app: ReadyApp, db: Db, kind: 'speaking' | 'writing', taskSlug: string) {
  const [result, setResult] = useState<FeedbackState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const lang = app.active.language_code;

  const request = useCallback(
    async (text: string, durationSec: number, keepAudio = false): Promise<FeedbackState | null> => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind, languageCode: lang, taskSlug, text, durationSec, keepAudio }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Geri bildirim alınamadı');
        const state: FeedbackState = { feedback: json.feedback, provider: json.provider, limited: Boolean(json.limited), attemptId: json.attemptId };
        setResult(state);
        // Hataları kaydet, kullanılan hedef ifadelerin kartlarını işaretle
        if (state.feedback.errors.length) {
          await db.from('errors').insert(
            state.feedback.errors.map((e) => ({
              user_id: app.userId, language_code: lang, source_type: kind, source_id: state.attemptId,
              error_type: e.type, original: e.original, corrected: e.corrected, explanation_tr: e.explanation_tr,
            })),
          );
        }
        await markCardsUsed(db, app.userId, lang, state.feedback.used_phrases, kind).catch(() => undefined);
        return state;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Geri bildirim alınamadı');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [app.userId, db, kind, lang, taskSlug],
  );

  const saveErrorCard = useCallback(
    async (index: number) => {
      const e = result?.feedback.errors[index];
      if (!e) return;
      const { error: err } = await db.from('user_cards').insert({
        user_id: app.userId,
        language_code: lang,
        card_type: 'error_correction',
        front: `Düzelt:\n${e.original}`,
        back: `${e.corrected}\n${e.explanation_tr}`,
        source_content_type: kind,
        source_content_slug: taskSlug,
      });
      if (!err) setSaved((s) => new Set(s).add(index));
    },
    [app.userId, db, kind, lang, result, taskSlug],
  );

  return { result, busy, error, request, saveErrorCard, saved, newId: uuid };
}
