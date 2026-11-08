'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { ReadyApp } from './Gate';
import { useFinish, useStopwatch } from './useBlock';
import { answerCard, getDueCards, logProgress, queuedCount, toSrs, xpFor, type Db } from '@/lib/db';
import { previewIntervals, suggestGrade, type Grade } from '@/lib/srs';
import { speak, ttsSupported } from '@/lib/audio';
import type { CardRow } from '@/lib/types';

const TYPE_TR: Record<string, string> = {
  word_to_meaning: 'Kelime → anlam',
  meaning_to_word: 'Anlam → kelime',
  image_to_word: 'Görsel → kelime',
  cloze: 'Boşluk doldurma',
  tr_to_target: 'Türkçe → hedef dil',
  audio_to_meaning: 'Ses → anlam',
  error_correction: 'Hata düzeltme',
  speaking_prompt: 'Konuşma',
};

export function ReviewSession({ app, db, lc, limit }: { app: ReadyApp; db: Db; lc: string | null; limit: number }) {
  const lang = app.active.language_code;
  const [queue, setQueue] = useState<CardRow[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [offline, setOffline] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const shownAt = useRef(Date.now());
  const elapsed = useStopwatch();
  const { finish, earned, back, saving } = useFinish(app, db, lc);
  const startTotal = useRef(0);

  useEffect(() => {
    getDueCards(db, app.userId, lang, limit)
      .then((rows) => {
        startTotal.current = rows.length;
        setQueue(rows);
        if (!rows.length) setFinished(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Kartlar yüklenemedi'));
  }, [db, app.userId, lang, limit]);

  const card = queue?.[0];
  const preview = useMemo(() => (card ? previewIntervals(toSrs(card)) : null), [card]);

  useEffect(() => {
    shownAt.current = Date.now();
    setRevealed(false);
  }, [card?.id, total]);

  const complete = useCallback(async () => {
    const seconds = elapsed();
    const pct = total ? (correct / total) * 100 : 100;
    try {
      if (total > 0) {
        await logProgress(db, app.userId, { lang, skill: 'vocab', activity: 'card_review', lessonId: null, score: pct, durationSec: seconds });
      }
      await finish({ seconds, xp: total * xpFor.card, cards: total, result: { cards: total, correct } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    }
  }, [correct, total, db, app.userId, lang, elapsed, finish]);

  async function grade(g: Grade) {
    if (!card || !revealed) return;
    const ms = Date.now() - shownAt.current;
    try {
      const out = await answerCard(db, app.userId, card, g, ms);
      setTotal((t) => t + 1);
      if (out.isCorrect) setCorrect((c) => c + 1);
      setOffline(queuedCount());
      const rest = (queue ?? []).slice(1);
      const soon = new Date(out.card.dueAt).getTime() - Date.now() <= 15 * 60_000;
      if ((out.card.state === 'learning' || out.card.state === 'relearning') && soon) {
        const updated: CardRow = {
          ...card, state: out.card.state, step: out.card.step, ease: out.card.ease, interval_days: out.card.intervalDays,
          due_at: out.card.dueAt, correct_count: out.card.correctCount, wrong_count: out.card.wrongCount, lapses: out.card.lapses,
          is_leech: out.card.isLeech, usage_bonus_given: out.card.usageBonusGiven,
        };
        // Aynı kart arka arkaya gelmesin
        if (rest.length) rest.splice(Math.min(3, rest.length), 0, updated);
        else rest.push(updated);
      }
      setQueue(rest);
      if (!rest.length) setFinished(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cevap kaydedilemedi');
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) void grade(Number(e.key) as Grade);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (finished && !saving && total >= 0 && queue !== null) void complete();
    // yalnızca bitiş anında bir kez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  if (error) return <div className="notice bad" role="alert">{error}</div>;
  if (!queue) return <p className="muted" role="status">Kartlar yükleniyor…</p>;

  if (finished) {
    return (
      <div className="stack">
        <h1>{startTotal.current === 0 ? 'Bugün bekleyen kart yok' : 'Tekrar bitti'}</h1>
        {total > 0 && (
          <div className="card">
            <p className="stat">{correct}/{total}</p>
            <p className="muted">doğru · +{total * xpFor.card} XP</p>
          </div>
        )}
        {offline > 0 && <p className="notice">{offline} cevap çevrimdışı kuyrukta; bağlantı gelince otomatik gönderilecek.</p>}
        {earned.map((a) => <p key={a.code} className="notice good">🏅 Yeni rozet: {a.title_tr}</p>)}
        <div className="row">
          <button className="btn primary" onClick={back}>{lc ? 'Derse dön' : 'Panele dön'}</button>
          <Link className="btn" href="/cards">Kartlarım</Link>
        </div>
      </div>
    );
  }

  if (!card || !preview) return null;
  const [front, ...rest] = card.front.split('\n');
  const speakable = card.card_type === 'word_to_meaning' || card.card_type === 'audio_to_meaning';
  const word = card.front.replace(/\s*\(.*\)$/, '');

  return (
    <div className="stack">
      <div className="row between">
        <span className="tag">{TYPE_TR[card.card_type] ?? card.card_type}</span>
        <small>{queue.length} kaldı · {correct}/{total} doğru</small>
      </div>
      <div className="bar"><i style={{ width: `${startTotal.current ? Math.min(100, (total / (startTotal.current + 0)) * 100) : 0}%` }} /></div>
      <div className="card flash" onClick={() => !revealed && setRevealed(true)}>
        {card.card_type === 'audio_to_meaning' ? (
          <p className="muted">Dinle ve anlamını hatırla</p>
        ) : (
          <>
            <div className="big">{front}</div>
            {rest.length > 0 && <div className="muted">{rest.join('\n')}</div>}
          </>
        )}
        {ttsSupported() && speakable && (
          <button className="btn small" onClick={(e) => { e.stopPropagation(); speak(word, { locale: app.activeLanguage.tts_locale, rate: app.profile.tts_rate }); }}>
            🔊 Dinle
          </button>
        )}
        {revealed && (
          <>
            <hr style={{ width: '60%', border: 0, borderTop: '1px solid var(--line)' }} />
            <div className="big" style={{ fontSize: '1.3rem' }}>{card.back}</div>
            {card.context_sentence && ttsSupported() && card.card_type !== 'cloze' && (
              <button className="btn small" onClick={(e) => { e.stopPropagation(); speak(card.context_sentence as string, { locale: app.activeLanguage.tts_locale, rate: app.profile.tts_rate }); }}>
                🔊 Örnek cümle
              </button>
            )}
          </>
        )}
        {!revealed && <small>Cevabı göstermek için dokun ya da Boşluk tuşuna bas</small>}
      </div>
      {revealed ? (
        <div className="grades" role="group" aria-label="Ne kadar hatırladın?">
          {([1, 2, 3, 4] as Grade[]).map((g) => (
            <button key={g} className={`btn ${g === suggestGrade(true, Date.now() - shownAt.current) && g >= 3 ? 'primary' : ''}`} onClick={() => void grade(g)}>
              {['Tekrar', 'Zor', 'İyi', 'Kolay'][g - 1]}
              <small>{preview[g]}</small>
            </button>
          ))}
        </div>
      ) : (
        <button className="btn primary block" onClick={() => setRevealed(true)}>Cevabı göster</button>
      )}
      <small className="muted">Kısayollar: Boşluk = göster, 1–4 = Tekrar / Zor / İyi / Kolay</small>
    </div>
  );
}
