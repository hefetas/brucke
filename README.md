# Brücke

İngilizce ve Almanca için kişisel çalışma sitesi. Tek dosya (`index.html`), sunucu gerekmez.
Veriler tarayıcıda saklanır; yazma/sohbet için yapay zekâ isteğe bağlıdır (kendi ücretsiz Gemini anahtarın).

## Günlük içerik
`.github/workflows/daily.yml` her sabah (06:23 TR) `scripts/generate.mjs` çalıştırır: Gemini ile 8 yeni kelime,
bir okuma metni ve iki dikte cümlesi üretir (İngilizce ve Almanca için ayrı), `daily.json`'a ekler ve kaydeder.
Site açılırken `daily.json`'u okuyup içeriğe katar. Okuma metinlerinde "AI" etiketi görünür; içerik yapay zekâ ürettiği için hata olabilir.

Kurulum: Settings → Secrets and variables → Actions → New repository secret → `GEMINI_API_KEY`.
İsteğe bağlı: aynı yerde Variables sekmesinden `GEMINI_MODEL` (varsayılan `gemini-2.5-flash`).
Elle denemek için: Actions → "Günlük içerik" → Run workflow.
