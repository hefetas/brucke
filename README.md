# DilYolu

Kişisel, tamamen ücretsiz İngilizce ve Almanca çalışma alanı (ana dil Türkçe). Tek kullanıcı için tasarlandı: ödeme, abonelik, premium katman yok.

**Yığın:** Next.js 15 (App Router) · React 19 · TypeScript · Supabase (Postgres + Auth + Storage) · düz CSS · PWA.
Tasarım dokümanındaki 17 bölümlük planın çalışan karşılığıdır.

## Neler var?

| Alan | İçerik |
| --- | --- |
| Günlük ders | 10 / 20 / 40 / 60 dk planı; haftanın gününe göre dinleme+konuşma, okuma+yazma, pazar günü gerçek hayat görevi; zayıf beceriye öncelik; bekleyen kart çoksa tekrara daha çok süre |
| Kart tekrarı | SM-2 benzeri aralıklı tekrar (10 dk → 1 g → 3 g → 8 g → 20 g…), kısayollar (Boşluk, 1–4), çevrimdışıyken cevap kuyruğu, zor kart (leech) işareti |
| Dinleme / Okuma | Tarayıcı sesiyle okuma (hız ayarlı), metin gizle/göster, tıklanır kelimeler, soru çözme, kelimeleri karta ekleme |
| Konuşma | Mikrofon + konuşma tanıma (Chrome/Edge/Safari), örnekle kelime kelime karşılaştırma, yapay zekâ geri bildirimi, isteğe bağlı kayıt saklama |
| Yazma | Kelime sayacı, hedef ifade takibi, taslak otomatik saklama, yapay zekâ geri bildirimi, hatalardan kart |
| Dilbilgisi | Kısa anlatım, örnekler, alıştırma; yanlışlar “hata” listesine düşer |
| Seviye | Seviye testi (CEFR A1–B2), beceri başına seviye, seviye atlama/düşürme önerisi (onayını sen verirsin) |
| Motivasyon | Seri (7 günde bir dondurma hakkı), XP, 15 rozet, haftalık özet |
| Diğer | İlerleme grafikleri, hata türü analizi, JSON yedek indirme, koyu tema, tarayıcı bildirimi (isteğe bağlı) |

Başlangıç içeriği: her dil için 32 seviye testi sorusu, 4 dinleme, 4 okuma, 5 konuşma, 5 yazma, 3 dilbilgisi konusu, 30 kelime. Daha fazlasını `content/*.json` dosyalarına ekleyip `npm run seed:build` ile üretebilirsin.

## Kurulum (yaklaşık 20 dakika, hepsi ücretsiz)

### 1. Supabase projesi
1. <https://supabase.com> → New project (ücretsiz plan).
2. **SQL Editor**’de sırasıyla çalıştır:
   1. `supabase/migrations/0001_schema.sql` (tablolar, güvenlik kuralları, ses kayıtları için özel depo)
   2. `supabase/seed.sql` (diller, rozetler, başlangıç içeriği)
3. **Authentication → Users → Add user**: kendi e-posta ve parolanla bir kullanıcı oluştur (“Auto confirm” açık).
4. **Authentication → Providers → Email** altında “Allow new users to sign up” seçeneğini **kapat**: siteyi yalnızca sen kullanırsın.
5. **Project Settings → API**: `Project URL`, `anon public` ve `service_role` anahtarlarını not et.

### 2. Yerelde çalıştır
```bash
npm install
cp .env.example .env.local   # değerleri doldur
npm run dev                  # http://localhost:3000
```
`.env.local` içinde en az şunlar gerekir: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
`SUPABASE_SERVICE_ROLE_KEY` yalnızca hatırlatma/bakım görevleri içindir; **asla** `NEXT_PUBLIC_` ile başlatma.

### 3. Yapay zekâ geri bildirimi (isteğe bağlı, ücretsiz katman)
Konuşma ve yazma geri bildirimi için en az birini tanımla; hiçbiri yoksa yalnızca uzunluk ve hedef ifade kontrolü yapılır.
- **Gemini:** <https://aistudio.google.com/apikey> → `GEMINI_API_KEY`
- **Groq:** <https://console.groq.com/keys> → `GROQ_API_KEY`
- **Ollama:** kendi bilgisayarında çalışıyorsa `OLLAMA_URL`

Sağlayıcılar sırayla denenir (Gemini → Groq → Ollama → kural tabanlı). `FEEDBACK_DAILY_LIMIT` günlük istek sayısını sınırlar.
Ücretsiz katman koşulları değişebilir; güncel sınırları sağlayıcıların sayfalarından kontrol et.

### 4. Yayına al (Vercel, ücretsiz Hobby planı)
1. Kodu bir GitHub deposuna it, <https://vercel.com> → Add New → Project → depoyu seç.
2. Environment Variables: `.env.local`’deki değerleri gir (`NEXT_PUBLIC_ALLOW_SIGNUP=false` kalsın).
3. Deploy. Sonra telefonda/bilgisayarda siteyi açıp “Ana ekrana ekle / Uygulamayı yükle” ile kur.

### 5. Hatırlatmalar (isteğe bağlı)
```bash
npm run vapid     # çıktıdaki 3 satırı Vercel ortam değişkenlerine ekle
```
Vercel ücretsiz planı saatlik cron’a izin vermez; bu yüzden `.github/workflows/cron.yml` kullanılır.
Depoda **Settings → Secrets and variables → Actions** altında `APP_URL` (ör. `https://dilyolu.vercel.app`) ve `CRON_SECRET` (aynı değer Vercel’de de olmalı) tanımla. Sonra uygulamada **Bildirimler → Aç**.
iPhone’da bildirim için siteyi önce Ana Ekrana eklemelisin. GitHub zamanlanmış görevleri birkaç dakika gecikebilir.

## Komutlar
| Komut | Ne yapar |
| --- | --- |
| `npm run dev` / `build` / `start` | Geliştirme / üretim derlemesi / üretim sunucusu |
| `npm test` | Birim testleri (tekrar motoru, seviye, plan, geri bildirim, içerik doğrulaması) |
| `npm run typecheck` | TypeScript denetimi |
| `npm run seed:build` | `content/*.json` → `supabase/seed.sql` |
| `npm run icons` / `npm run vapid` | Uygulama simgeleri / bildirim anahtarları |

## Yapı
```
app/            sayfalar ve API rotaları (feedback, vocabulary/lookup, export, cron/*)
components/     ortak arayüz (kart oturumu, sorular, kelime baloncuğu, geri bildirim)
lib/            saf mantık (srs, levels, planner, feedback, align) + Supabase katmanı (db, lesson)
content/        başlangıç içeriği (JSON)
supabase/       şema ve tohum verisi
tests/          node:test ile testler
```
Sunucu tarafı yalnızca üç iş yapar: oturum yenileme (middleware), yapay zekâ çağrıları (anahtarlar gizli kalsın) ve cron. Diğer her şey tarayıcıdan Supabase’e gider; tüm tablolarda satır düzeyi güvenlik (`user_id = auth.uid()`) açıktır.

## Tasarım dokümanından sapmalar (bilerek)
- “İyi” aralığı `max(önceki + 1, önceki × ease)`; böylece aralık hiç yerinde saymaz.
- Dört ders süresi (10/20/40/60) baştan açık; MVP’de yalnızca 20 dk planlanmıştı.
- Çevrimdışı cevap kuyruğu IndexedDB yerine `localStorage` kullanır (tek kullanıcı için yeterli, daha az kod).
- Sunucuda konuşma tanıma (Whisper) yedeği yok; tarayıcı tanımayı desteklemiyorsa söylediğini elle yazarsın.
- Seviye atlama otomatik değil, “Evet, geç” onayıyla olur.
- Bildirim aboneliği ayrı tablo yerine `user_profile.push_subscription` alanında tutulur.
- Dinleme sesleri tarayıcının sesiyle üretilir; ses kalitesi cihaza göre değişir. İstersen `audio_url` alanına kendi ses dosyalarının adresini yazabilirsin.

## Sorun giderme
- **Giriş yaptım ama “Henüz bir hedef dil seçilmedi”:** Kurulum sayfasını tamamla (`/setup`).
- **Kurulumda “violates foreign key” hatası:** `supabase/seed.sql` çalıştırılmamış; önce onu çalıştır.
- **Konuşma kaydı çalışmıyor:** Mikrofon izni ver; site `https` (ya da `localhost`) üzerinde olmalı.
- **Ses sentezi sessiz:** Cihazında ilgili dil sesi yüklü olmayabilir (Windows/Android ayarlarından dil paketini ekle).
- **Geri bildirim “basit kontrol”:** Yapay zekâ anahtarı yok, hatalı ya da günlük sınır dolmuş.

## Gizlilik
Veriler yalnızca kendi Supabase projende durur. Ses kaydı, “Kaydı özel alanımda sakla” kutusunu işaretlemediğin sürece yüklenmez. Yapay zekâ geri bildirimi istediğinde, yazdığın/söylediğin metin seçtiğin sağlayıcıya (Gemini/Groq/Ollama) gönderilir; kimlik bilgin gönderilmez.
