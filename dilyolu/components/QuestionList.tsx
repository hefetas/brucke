'use client';

import { useState } from 'react';
import type { Question } from '@/lib/types';

interface Props {
  questions: Question[];
  onDone: (scorePct: number, answers: number[]) => void;
  doneLabel?: string;
}

export function QuestionList({ questions, onDone, doneLabel = 'Bitir' }: Props) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [finished, setFinished] = useState(false);
  const answered = answers.filter((a) => a !== null).length;
  const correct = answers.filter((a, i) => a === questions[i].answer).length;

  if (!questions.length) {
    return (
      <button className="btn primary" onClick={() => onDone(100, [])}>
        {doneLabel}
      </button>
    );
  }

  return (
    <div className="stack">
      {questions.map((q, qi) => {
        const picked = answers[qi];
        return (
          <fieldset key={qi} className="card" style={{ border: '1px solid var(--line)' }}>
            <legend className="tag">Soru {qi + 1}</legend>
            <p><b>{q.prompt}</b></p>
            {q.options.map((o, oi) => {
              const cls = picked === null ? '' : oi === q.answer ? 'right' : oi === picked ? 'wrong' : '';
              return (
                <button
                  key={oi}
                  type="button"
                  className={`btn option ${cls}`}
                  disabled={picked !== null}
                  onClick={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                >
                  {o}
                </button>
              );
            })}
            {picked !== null && q.explain_tr && <p className="muted" style={{ marginTop: 8 }}>{q.explain_tr}</p>}
          </fieldset>
        );
      })}
      {!finished ? (
        <button
          className="btn primary"
          disabled={answered < questions.length}
          onClick={() => {
            setFinished(true);
            onDone(Math.round((correct / questions.length) * 100), answers as number[]);
          }}
        >
          {answered < questions.length ? `${answered}/${questions.length} cevaplandı` : doneLabel}
        </button>
      ) : (
        <p className="notice good">
          {correct}/{questions.length} doğru
        </p>
      )}
    </div>
  );
}
