'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gate, type ReadyApp } from '@/components/Gate';
import { useApp } from '@/components/AppProvider';
import type { Db } from '@/lib/db';
import { speak, stopSpeaking } from '@/lib/audio';
import { CEFR_LEVELS, SKILLS, SKILL_LABEL_TR, cefrIndex, estimatePlacement, type PlacementAnswer, type SkillLevels } from '@/lib/levels';
import { PLACEMENT, buildQueue, type PlacementItem } from '@/lib/placement';

export default function PlacementPage() {
  return <Gate>{({ app, db }) => <Placement app={app} db={db} />}</Gate>;
}

function Placement({ app, db }: { app: ReadyApp; db: Db }) {
  const router = useRouter();
  const { refresh } = useApp();
  const lang = app.active.language_code;
  const bank = PLACEMENT[lang] ?? [];
  const [queue, setQueue] = useState<PlacementItem[]>(() => buildQueue(bank, cefrIndex));
  const [answers, setAnswers] = useState<PlacementAnswer[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = queue[0];
  const done = !current;
  const result: SkillLevels | null = useMemo(() => (done ? estimatePlacement(answers) : null), [done, answers]);

  function choose(i: number) {
    if (picked !== null || !current) return;
    setPicked(i);
    stopSpeaking();
    const correct = i === current.answer;
    const next = [...answers, { skill: current.skill, level: current.level, correct }];
    setAnswers(next);
    setTimeout(() => {
      setPicked(null);
      // Bir seviyenin tüm soruları cevaplanıp %50'nin altında kaldıysa o becerinin üst seviyelerini atla
      const rest = queue.slice(1);
      const sameLevelLeft = rest.some((q) => q.skill === current.skill && q.level === current.level);
      let filtered = rest;
      if (!sameLevelLeft) {
        const at = next.filter((a) => a.skill === current.skill && a.level === current.level);
        if (at.filter((a) => a.correct).length / at.length < 0.5) {
          filtered = rest.filter((q) => q.skill !== current.skill);
        }
      }
      setQueue(filtered);
    }, 700);
  }

  async function accept(levels: SkillLevels) {
    setSaving(true);
    setError(null);
    try {
      const upd = await db.from('user_languages').update({
        level_listening: levels.listening, level_reading: levels.reading, level_speaking: levels.speaking,
        level_writing: levels.writing, level_vocab: levels.vocab, level_grammar: levels.grammar, placement_done: true,
      }).eq('user_id', app.userId).eq('language_code', lang).eq('role', 'target');
      if (upd.error) throw upd.error;
      await db.from('placement_attempts').update({ is_current: false }).eq('user_id', app.userId).eq('language_code', lang);
      await db.from('placement_attempts').insert({
        user_id: app.userId, language_code: lang, completed_at: new Date().toISOString(), answers, result: levels, is_current: true,
      });
      await refresh();
      router.replace('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
      setSaving(false);
    }
  }

  async function skip() {
    await accept({ listening: 'A1', reading: 'A1', speaking: 'A1', writing: 'A1', vocab: 'A1', grammar: 'A1' });
  }

  if (!bank.length) {
    return <div className="notice">Bu dil için seviye testi içeriği bulunamadı. <button className="btn small" onClick={() => void skip()}>A1’den başla</button></div>;
  }

  if (done && result) {
    return (
      <div className="stack">
        <h1>Sonuç</h1>
        <p className="muted">Konuşma ve yazma ölçülemediği için dinleme, kelime ve dilbilgisi sonuçlarından güvenli tarafta türetildi. Dersler ilerledikçe otomatik güncellenir.</p>
        <div className="card">
          {SKILLS.map((s) => (
            <div className="skillrow" key={s}>
              <span>{SKILL_LABEL_TR[s]}</span>
              <div className="bar"><i style={{ width: `${((cefrIndex(result[s]) + 1) / CEFR_LEVELS.length) * 100}%` }} /></div>
              <b>{result[s]}</b>
            </div>
          ))}
        </div>
        {error && <p className="notice bad" role="alert">{error}</p>}
        <button className="btn primary" disabled={saving} onClick={() => void accept(result)}>Bu seviyelerle başla</button>
      </div>
    );
  }

  const total = bank.length;
  return (
    <div className="stack">
      <div className="row between">
        <h1 style={{ margin: 0 }}>Seviye testi</h1>
        <button className="btn small" disabled={saving} onClick={() => void skip()}>Atla (A1’den başla)</button>
      </div>
      <div className="bar" aria-label="İlerleme"><i style={{ width: `${(answers.length / total) * 100}%` }} /></div>
      <div className="card">
        <span className="tag">{current.skill === 'listening' ? 'Dinleme' : current.skill === 'reading' ? 'Okuma' : current.skill === 'vocab' ? 'Kelime' : 'Dilbilgisi'}</span>
        {current.audio_text && (
          <p style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => speak(current.audio_text as string, { locale: app.activeLanguage.tts_locale })}>▶ Dinle</button>
          </p>
        )}
        {current.passage && <p className="prose" style={{ marginTop: 10 }}>{current.passage}</p>}
        <p style={{ marginTop: 10 }}><b>{current.prompt}</b></p>
        {current.options.map((o, i) => (
          <button
            key={i}
            className={`btn option ${picked === null ? '' : i === current.answer ? 'right' : i === picked ? 'wrong' : ''}`}
            disabled={picked !== null}
            onClick={() => choose(i)}
          >
            {o}
          </button>
        ))}
        <button className="btn small" disabled={picked !== null} onClick={() => choose(-1)} style={{ marginTop: 8 }}>Bilmiyorum</button>
      </div>
    </div>
  );
}
