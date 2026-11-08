'use client';

import type { RubricCriterion } from '@/lib/exam';

/** Ölçüt başına bir seçenek seçtiren öz değerlendirme formu. picks[i] = seçilen seçeneğin değeri ya da null. */
export function SelfAssess({
  criteria,
  picks,
  onChange,
}: {
  criteria: RubricCriterion[];
  picks: (number | null)[];
  onChange: (picks: (number | null)[]) => void;
}) {
  return (
    <div className="stack">
      {criteria.map((c, ci) => (
        <fieldset key={c.key} className="card" style={{ border: '1px solid var(--line)' }}>
          <legend className="tag">{c.name}</legend>
          {c.options.map((o) => (
            <label key={o.value} className="inline" style={{ display: 'flex', alignItems: 'flex-start', margin: '0.35rem 0' }}>
              <input
                type="radio"
                name={`crit-${c.key}`}
                checked={picks[ci] === o.value}
                onChange={() => onChange(picks.map((p, i) => (i === ci ? o.value : p)))}
                style={{ width: 'auto', minHeight: 0, marginTop: 4 }}
              />
              <span>{o.text}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
