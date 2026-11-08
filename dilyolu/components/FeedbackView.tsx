'use client';

import type { Feedback } from '@/lib/feedback';

const TYPE_TR: Record<string, string> = {
  tense: 'Zaman', preposition: 'Edat', article: 'Artikel', agreement: 'Uyum', word_order: 'Kelime sırası',
  word_choice: 'Kelime seçimi', spelling: 'Yazım', naturalness: 'Doğallık', unclear_speech: 'Belirsiz telaffuz', other: 'Diğer',
};

interface Props {
  feedback: Feedback;
  provider: string;
  limited?: boolean;
  /** Hata kartı olarak kaydet */
  onSaveError?: (index: number) => void;
  saved?: Set<number>;
}

export function FeedbackView({ feedback: f, provider, limited, onSaveError, saved }: Props) {
  const tone = f.score >= 80 ? 'good' : f.score >= 60 ? 'accent' : 'warm';
  return (
    <div className="stack" aria-live="polite">
      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Geri bildirim</h2>
          <span className={`tag ${tone}`}>{f.score}/100 · {f.cefr_estimate}</span>
        </div>
        <p style={{ marginTop: 8 }}>{f.summary_tr}</p>
        {provider === 'rules' && (
          <p className="notice">
            {limited
              ? 'Günlük yapay zekâ sınırına ulaşıldı; basit kontrol gösteriliyor.'
              : 'Yapay zekâ kullanılamadı; yalnızca uzunluk ve hedef ifade kontrolü yapıldı.'}
          </p>
        )}
        {f.strengths_tr.length > 0 && (
          <>
            <h3>İyi giden</h3>
            <ul>{f.strengths_tr.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </>
        )}
      </div>

      {f.errors.length > 0 && (
        <div className="card">
          <h3>Düzeltmeler</h3>
          <table>
            <tbody>
              {f.errors.map((e, i) => (
                <tr key={i}>
                  <td style={{ width: '40%' }}>
                    <span className="tag">{TYPE_TR[e.type] ?? e.type}</span>
                    <div className="missing">{e.original}</div>
                    <div className="ok">{e.corrected}</div>
                  </td>
                  <td>
                    {e.explanation_tr}
                    {onSaveError && (
                      <div style={{ marginTop: 6 }}>
                        <button className="btn small" disabled={saved?.has(i)} onClick={() => onSaveError(i)}>
                          {saved?.has(i) ? 'Kartlara eklendi' : 'Hata kartı yap'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {f.corrected_text && f.errors.length > 0 && (
        <div className="card">
          <h3>Düzeltilmiş metin</h3>
          <p>{f.corrected_text}</p>
          {f.natural_version && f.natural_version !== f.corrected_text && (
            <>
              <h3>Daha doğal söylenişi</h3>
              <p>{f.natural_version}</p>
            </>
          )}
        </div>
      )}

      {f.used_phrases.length > 0 && (
        <p>
          Kullandığın hedef ifadeler: {f.used_phrases.map((p) => <span key={p} className="tag good" style={{ marginRight: 4 }}>{p}</span>)}
        </p>
      )}
      {f.next_focus_tr && <p className="notice good">Sıradaki odak: {f.next_focus_tr}</p>}
    </div>
  );
}
