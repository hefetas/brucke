# Brücke

İngilizce ve Almanca için kişisel çalışma sitesi. Tek dosya (`index.html`), sunucu gerekmez.
Veriler tarayıcıda saklanır; yazma/sohbet için yapay zekâ isteğe bağlıdır (kendi ücretsiz Gemini anahtarın).

## Günlük içerik
`.github/workflows/daily.yml` her sabah (06:23 TR) `scripts/generate.mjs` çalıştırır: Gemini ile 8 yeni kelime,
bir okuma metni ve iki dikte cümlesi üretir (İngilizce ve Almanca için ayrı), `daily.json`'a ekler ve kaydeder.
Site açılırken `daily.json`'u okuyup içeriğe katar. Okuma metinlerinde "AI" etiketi görünür; içerik yapay zekâ ürettiği için hata olabilir.

Kurulum: Settings → Secrets and variables → Actions → New repository secret → `GEMINI_API_KEY`.
İsteğe bağlı: aynı yerde Variables sekmesinden `GEMINI_MODEL` (varsayılan: sırayla `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` denenir).
Elle denemek için: Actions → "Günlük içerik" → Run workflow.

## Erişim izni
Giriş Google ile yapılır (Supabase). İzni olmayan hesap "Erişim iste" gönderir; sahip İlerleme sayfasındaki **Hesap** bölümünden onaylar.
Veritabanı kuralları (RLS) ilerleme verisini hesaba bağlar. Not: sayfanın kendisi herkese açık bir statik dosyadır; giriş ekranı uygulamayı kimin kullanabileceğini ve eşitlemeyi belirler, kaynak kodunu gizlemez.
