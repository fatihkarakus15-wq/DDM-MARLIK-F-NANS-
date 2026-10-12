# Ofis Finans

Mimarlık ofisi (ve isterseniz kişisel) finansı için **telefona kurulan uygulama** (PWA): gelir-gider, proje bazlı harcama, cariler, vadeler, çek/senet, nakit akışı tahmini, döviz ve altın yatırımları.

Dolap Burada'dan tamamen bağımsızdır: kendi veritabanı, kendi girişi, kendi adresi.

## Kurulum (bir kerelik, ~15 dakika)

### 1. Veritabanı: Supabase (ücretsiz)

1. [supabase.com](https://supabase.com) › **New project**. Bir ad ve güçlü bir veritabanı şifresi verin, bölgeyi size yakın seçin (ör. Frankfurt).
2. Proje açılınca **Connect** › **Transaction pooler** (port 6543) bağlantı adresini kopyalayın. `postgresql://postgres.xxxx:[ŞİFRE]@aws-0-….pooler.supabase.com:6543/postgres` biçimindedir. `[ŞİFRE]` yerine az önceki veritabanı şifresini yazın.

### 2. Yayın: Vercel (ücretsiz)

1. [vercel.com](https://vercel.com) › **Add New › Project** › bu depoyu (`ofis-finans`) seçin.
2. **Environment Variables** bölümüne üç değişken ekleyin:

   | Ad | Değer |
   |---|---|
   | `DATABASE_URL` | Supabase bağlantı adresi (yukarıda) |
   | `JWT_SECRET` | Uzun rastgele bir metin (en az 16, örn. 40 karakter) |
   | `SETUP_KEY` | Yalnızca sizin bileceğiniz kurulum anahtarı (en az 12 karakter) |

3. **Deploy**. Birkaç dakika sonra `https://ofis-finans-….vercel.app` gibi bir adres verir.

> Bu değerleri kimseyle (sohbet dahil) paylaşmayın. Yalnızca Vercel'e yazılır.

### 3. İlk açılış

Adresi telefonunuzda açın. Uygulama sizi **Kurulum** ekranına götürür:

1. `SETUP_KEY` değerinizi yazıp **Tabloları oluştur**'a basın (tek adım, hata olursa geri alınır).
2. Adınız, e-posta ve şifrenizle (en az 10 karakter) hesabınızı oluşturun. Uygulamaya yalnızca bu hesapla girilir.

### 4. Telefona uygulama olarak ekleyin

- **iPhone:** Safari'de açın › Paylaş düğmesi › **Ana Ekrana Ekle**.
- **Android:** Chrome'da açın › menü (⋮) › **Uygulamayı yükle** (ya da Daha fazla sayfasındaki düğme).

İkon ana ekrana gelir, tam ekran açılır. İsterseniz kendi alan adınızı Vercel'de (Settings › Domains) bağlayabilirsiniz.

## Kullanım

- **Önce:** Daha fazla › Hesaplar: banka, kasa, kredi kartı ekleyin (açılış bakiyesiyle).
- **Ekle (+):** şantiyede hızlı gider: tutar, açıklama, kalem, proje, fiş fotoğrafı.
- **Vadeler:** alacak ve borçları vadesiyle girin; **Nakit akışı** bunlardan gün gün kasa tahmini çıkarır.
- **Projeler:** her harcamayı bir projeye bağlayın; proje sayfasında kalem kalem bütçe ↔ gerçekleşen görünür.
- **Ayarlar:** kalemler (boya, yemek, mobilya…), tekrarlayan ödemeler (kira, maaş), ekstre kuralları, şifre, yeni defter.
- **İçe aktar:** banka ekstresini CSV olarak yükleyin (Excel'den "CSV olarak kaydet").

### Döviz ve altın fiyatları

Kaynak sırası: Harem Altın panel verisi (gün içi döviz + altın) › yedek TCMB (USD/EUR/GBP) › elle girilen fiyat. Harem Altın'ın resmî bir API'si yoktur; **Ayarlar › Kur kaynağı › "Kaynakları şimdi sına"** ile çalıştığını doğrulayın. Çalışmazsa fiyat elle girilir. Adres değişirse `FX_HAREM_URL` ortam değişkeniyle güncellenir.

## Yedekleme ve güvenlik

- Veriler Supabase'dedir (ücretsiz planda günlük yedek yoktur; **Database › Backups** ya da aylık `pg_dump` önerilir).
- Giriş: e-posta + şifre, 90 günlük oturum çerezi. Şifre değişince / "diğer cihazları çıkar" ile diğer oturumlar kapanır.
- Service worker yalnızca sabit dosyaları saklar; **finans verisi telefonda önbelleğe alınmaz**.
- Uygulama arama motorlarına kapalıdır (`noindex`).
- Kurulum ekranı yalnızca `SETUP_KEY` ile çalışır; hesap oluştuktan sonra kapanır.

## Geliştirme

```bash
npm install
cp .env.example .env     # DATABASE_URL, JWT_SECRET, SETUP_KEY
npm run dev              # http://localhost:3000 → /kurulum
npm run lint && npx tsc --noEmit
```

### Şema değişikliği

`prisma/schema.prisma`'yı değiştirince `src/lib/migrations.ts`'e **yeni** bir göç ekleyin (yalnızca ekleme yapan SQL, yeni bir `id` ile; eski göçleri değiştirmeyin). Uygulama bir sonraki açılışta "Veritabanı güncellemesi bekliyor" gösterir, `SETUP_KEY` ile uygulanır. `npm run sql`, yalnızca sıfırdan başlangıç şemasını (`baseline-sql.ts`) yeniden üretir.

### Yapı

```
src/app/(app)/        sayfalar (özet, hareketler, hesaplar, projeler, cariler, vadeler, cek-senet, nakit-akisi, yatirimlar, raporlar, ayarlar, ice-aktar, yeni, daha-fazla)
src/app/giris|kurulum giriş ve ilk kurulum
src/app/api/          hareket (dosyalı kayıt), ek, kur, cron/finans (günlük 05:00 UTC: kurlar + tekrarlayan vadeler)
src/lib/finance/      hesap çekirdeği (bakiye, vade, nakit akışı, rapor, kur, ekstre ayrıştırma)
src/lib/auth.ts       giriş (bcrypt + JWT çerezi)   ·   src/lib/migrations.ts  veritabanı göçleri
public/sw.js          service worker   ·   src/app/manifest.ts  uygulama bildirimi
```
