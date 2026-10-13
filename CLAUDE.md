# Ofis Finans

Mimarlık ofisi finansı için telefona kurulan uygulama (PWA, Next.js 16 App Router + Prisma 6 + PostgreSQL/Supabase). **Dolap Burada'dan bağımsız**: ayrı depo, veritabanı, giriş. Kod aslen Dolap Burada yönetim paneline yazıldı, kullanıcı isteğiyle buraya taşındı.

## Kurallar
- Arayüz metinleri ve yorumlar Türkçe; tanımlayıcılar İngilizce. TS: 4 boşluk, çift tırnak, noktalı virgül. `@/` = `src/`.
- Next.js bu sürümde farklı olabilir: `node_modules/next/dist/docs/` altına bak.
- Her sayfa `requireFinancePage()`, her Server Action / route `requireFinance()` çağırır (`lib/finance/access.ts`).
- Tutarlar Float, `r2` ile yuvarlanır. Hesap mantığı `lib/finance/`; görünüm ve toplamlar aynı kaynaktan hesaplanır.
- Veritabanı değişikliği: `src/lib/migrations.ts`'e yeni göç (yalnızca ekleme; eskileri değiştirme). `prisma db push` kullanılmaz; tablolar /kurulum ekranından kurulur.
- Finans verisi service worker ile önbelleğe alınmaz (`public/sw.js` yalnızca `/_next/static`, `/icons`).
- Ortam değişkenleri: `DATABASE_URL`, `JWT_SECRET`, `SETUP_KEY` (+ isteğe bağlı `CRON_SECRET`, `FX_*`). `.env` içeriğini okuma/yazdırma.

## Mimari özet
- **Defterler** (`FinLedger`): her şey bir deftere aittir; aktif defter çerezi `ofisfinans_defter`. Varsayılan tek defter "Mimarlık Ofisi"; Ayarlar'dan eklenir. Formdan gelen kimlikler `assertOwned` ile doğrulanır.
- **Hareket** (`FinTransaction`): INCOME / EXPENSE / TRANSFER; DONE (hesap bakiyesini değiştirir) / PLANNED (vadeli alacak-borç; cari ve nakit akışı tahmini; `settleTransaction` ile gerçekleşir, kısmi ödeme bölünür). Tutar KDV dahil, kendi para biriminde; `fxRate` + `amountTRY` kayıt anında yazılır.
- **Rapor** (`lib/finance/reports.ts`): tahakkuk / nakit esaslı, KDV hariç / dahil; proje maliyeti her zaman tahakkuk + KDV hariç.
- **Kur** (`lib/finance/rates.ts`): Harem Altın (resmî olmayan; Ayarlar'dan sınanır) → TCMB → elle. Değerleme alış fiyatıyla.
- **Giriş** (`lib/auth.ts`): tek kullanıcı mantığı, bcrypt + JWT çerezi (`epoch` ile toplu oturum kapatma). İlk kurulum ve hesap oluşturma `SETUP_KEY` ister.
- **Telefon arayüzü**: alt sekme çubuğu (<900 px), yan menü (≥900 px) `components/AppNav.tsx`; "Ekle" `/yeni` (hızlı gider); `daha-fazla` diğer bölümler. Stil tek dosya `app/globals.css`.
- Zamanlayıcı `/api/cron/finans` (günlük 05:00 UTC, `vercel.json`): kurları yeniler, tekrarlayan vadeleri üretir.

## Arayüz (2026-10-13, "Şantiye modu")
- Ana ekran projeler: satırda harcanan tutar + büyük **+** (`/projeler/<id>#ekle`). Proje sayfasının en üstü koyu tuş takımı (`components/finance/ProjectQuickAdd.tsx`, stiller `.sm*`): tutar, kalem düğmeleri (projede harcanan tutarla), Kaydet; not/hesap/tarih/fiş katlanır. Özet, bütçe ve grafikler katlı.
- Hız: `ensureFreshRates` kur eskiyse sayfayı bekletmez (yenileme `after()` ile yanıttan sonra; `wait=true` yalnızca `/api/kur`). `(app)/loading.tsx` iskelet gösterir.

## Kullanıcılar ve yüzle giriş (2026-10-13)
- Birden çok kullanıcı (en çok 5), hepsi aynı defterleri görür. **Yüz tanıma / parmak izi** WebAuthn geçiş anahtarıyla (`lib/passkey.ts`, `app/api/passkey/*`, `components/PasskeyButtons.tsx`): telefon yüzü kendisi doğrular, sunucuya yalnızca açık anahtar gelir; giriş ekranında e-posta yazmadan tek dokunuş. Şifre yedek olarak kalır ("Şifremi unuttum" SETUP_KEY ister).
- Ayarlar > Kullanıcılar: bu cihazı kaydet, cihaz sil, davet bağlantısı (`inviteUser`, 7 gün, `/davet/<anahtar>`; davetli şifresiz hesap açılır, bağlantıyı açıp yüzünü kaydeder). Kayıtlı e-postaya yeni bağlantı = yeni telefon ekleme. Geçiş anahtarı alan adına bağlıdır: site adresi değişirse yeniden kaydedilmeli.
- Göç `002-gecis-anahtarlari` (`app_passkeys`, `app_users.inviteHash/inviteExpires`): yayından sonra /kurulum "Veritabanını güncelle" (SETUP_KEY) çalıştırılmalı.

## Proje ayrıntıları ve tahsilat planı (2026-10-13)
- Proje sayfasında "Proje bilgileri" (ad, müşteri adı → cari kaydı yoksa açılır, T.C. no doğrulamalı, adres + harita bağlantısı, durum, aşama, iş bedeli, başlangıç/bitiş) ve "Tahsilat planı" (müşteriden hangi tarihte ne kadar: vadeli gelir kaydı, projeye ve müşteriye bağlı; "Alındı" hesaba işler). Ana ekranda "Bu ay alınacaklar" (bu ay ve geçmişte kalan planlı tahsilatlar). Göç `003-proje-ayrintilari` (`address`, `clientTckn`, `stage`): yayından sonra /kurulum "Veritabanını güncelle".

## Ofis giderleri, ilave işler, ekstra alınacak (2026-10-13)
- Alt çubukta **Ofis** sekmesi (`/ofis`): sabit ofis giderleri (kira, maaş, fatura, abonelik) = `FinRecurring` (EXPENSE, projesiz); aylık/yıllık toplam, bu ay ödenen/ödenecek, "Ödendi işle". Hareketler "Daha fazla"ya taşındı.
- Projede **İlave işler** (`FinProjectExtra`: sonradan gelen iş + tutar, iş bedeline eklenir) ve **Müşteriden ekstra alınacaklar**: harcama girerken (tuş takımı ya da TxForm) "Müşteriden ekstra alınacak" → `FinTransaction.rebillAmount`; projede listelenir, "Tahsilat planına ekle" (`planRebill`) vadeli gelir üretir (`rebillPlanned`). Tahsilat özeti: iş bedeli + ilaveler + ekstralar − alınan − planlı = plana girilmemiş. Göç `004-ilave-isler-ekstra-alinacak`: yayından sonra /kurulum "Veritabanını güncelle".

## Kim ne harcadı, maaşlar (2026-10-13)
- Her gider `FinTransaction.spenderId` (AppUser.id) taşır: yeni giderde varsayılan giriş yapan kişi (`/api/hareket`), tuş takımında "Harcayan" düğmeleriyle, TxForm'da "Harcamayı yapan" seçiminden değişir. Proje sayfasında **Kim ne harcadı**: kişi başı toplam, eşit paylaşım ve "kim kime ne kadar ödemeli" (`#kimharcadi`); kimin yaptığı belirtilmemiş eski harcamalar hesaba girmez. Göç `005-harcayan-kisi`.
- Ofis sayfasında **Maaşlar** (`addSalary`): kişi adı + aylık maaş → "Maaş · Kişi" aylık tekrarlayan gider (kalem "Maaş"); sabit giderlerden ayrı listelenir.

## Bilinen / yapılmadı
Banka API'si, Excel (.xlsx) ekstre, çok kullanıcılı rol, kur hedef bildirimleri, e-Fatura, parmak izi/PIN kilidi, yıl sonu kapanışı.
