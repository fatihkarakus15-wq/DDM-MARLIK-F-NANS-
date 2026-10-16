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
- Her gider `FinTransaction.spenderId` (AppUser.id) taşır: yeni giderde varsayılan giriş yapan kişi (`/api/hareket`), giriş yapan kişi otomatik yazılır (seçim yok); yalnızca mevcut harcama düzenlenirken TxForm'da "Harcamayı yapan" seçiminden değişir. Proje sayfasında **Kim ne harcadı**: kişi başı toplam, eşit paylaşım ve "kim kime ne kadar ödemeli" (`#kimharcadi`); kimin yaptığı belirtilmemiş eski harcamalar hesaba girmez. Göç `005-harcayan-kisi`.
- Ofis sayfasında **Maaşlar** (`addSalary`): kişi adı + aylık maaş → "Maaş · Kişi" aylık tekrarlayan gider (kalem "Maaş"); sabit giderlerden ayrı listelenir.

## Geçmiş işleri aktarma (2026-10-13)
- Excel defterlerinden hazırlanan işler `lib/finance/legacy-imports.ts` içinde paket olarak durur (proje, müşteri, iş bedeli, ilave işler, tahsilatlar, harcamalar + kim harcadı); **Daha fazla > İçe aktar > Geçmiş işler** sayfasında "Teslim edilenlere ekle" ile `importLegacyProject` yazar (tek işlem, aynı adlı proje varsa eklemez). Kayıtlar hesapsız (DONE, accountId boş): hesap bakiyeleri değişmez. Yeni iş eklemek için pakete bir kayıt ekle. İlk paket: Köse ailesi (toplam teklif 849.000 = 600.000 + 249.000 ilave; harcama 618.452,50; tahsilat 734.000; tarihsiz harcamalar 18.02.2026).

## Yıllık özet (2026-10-14)
- **Genel özet** (`/ozet`) üstünde yıl seçici (2026, … ve Tümü) + `lib/finance/yearly.ts` / `components/finance/YearlyOverview.tsx`: yıl içindeki gerçekleşen gelir (tahsilat), gider (işler / ofis), net kalan, kişi başı net (kullanıcı sayısına bölünür), aylık gelir-gider grafiği, "hangi işten ne kadar kazandık" çubukları, **işlere göre tablo** (anlaşılan = iş bedeli + ilaveler, tahsil edilen, harcama, kâr = anlaşılan − harcama, kişi başı, alacak; rakamlar işin başından bugüne, yılda hareketi olan işler) ve ofis giderleri dağılımı. Altında eski "Güncel durum" bölümleri.

## Bilinen / yapılmadı
Banka API'si, Excel (.xlsx) ekstre, çok kullanıcılı rol, kur hedef bildirimleri, e-Fatura, parmak izi/PIN kilidi, yıl sonu kapanışı.

## Ustalar (2026-10-14)
- Usta = `FinContact` (`kind: SUBCONTRACTOR`, "Taşeron / usta"); harcama `contactId` ile ustaya bağlanır. `/ustalar` (`lib/finance/ustalar.ts`): usta başına ödenen (gerçekleşen), bekleyen hakediş (vadeli), işe göre kırılım, "Usta ekle". Harcama tuş takımında (proje sayfası) "Usta" seçimi + "+ Usta ekle". Defterlerdeki 20 usta adı `USTALAR`'da; `syncUstalar` ("Defterlerdeki ustaları ekle ve eşle" düğmesi) cari açar ve başlığı usta adıyla eşleşen eski harcamaları bağlar; yeni içe aktarmalar otomatik bağlar. Göç yok.

## Ortak takvim (2026-10-16)
- `/takvim` (alt çubukta sekme): bütün kullanıcıların gördüğü ortak takvim. `FinEvent` (`fin_events`; başlık, tür KESIF/TOPLANTI/TESLIM/GOREV/DIGER, gün, başlangıç/bitiş saati, yer, not, proje, kimin: boşsa "İkimiz", tamamlandı). Ay ızgarası + "Önümüzdeki 7 gün" + seçili günün programı + ekleme/düzenleme formu; yer için Google Haritalar bağlantısı. Mantık `lib/finance/events.ts`, işlemler `saveEvent/toggleEvent/deleteEvent`. Göç `007-takvim`: yayından sonra /kurulum "Veritabanını güncelle".
- **Bildirimler** (2026-10-16, Web Push; `lib/push.ts`, `components/PushToggle.tsx`, `/api/push/*`, `public/sw.js` push işleyicisi): Takvim sayfasında "Bildirimleri aç" (telefon başına abonelik, `PushSub`); sunucunun VAPID anahtarı ilk kullanımda üretilip veritabanında (`PushConfig`), ortam değişkeni gerekmez. Etkinlikte "Hatırlat" (zamanında / 15 dk / 30 dk / 1 sa / 2 sa / 1 gün önce; saat yoksa 09:00 sayılır, İstanbul UTC+3): `runReminders` zamanı gelenleri ilgili kişiye (boşsa ikisine) gönderir, ayrıca sabah 08:00'dan sonra günün programı (günde bir). Tetikleyici: günlük Vercel cron'u (`/api/cron/finans`, 08:00) günün programını yollar; tam zamanında hatırlatma için `/api/cron/hatirlat` her 5–10 dakikada `Authorization: Bearer $CRON_SECRET` ile çağrılmalı (Vercel Hobby günde bir; ücretsiz cron-job.org ya da GitHub Actions kullanılır). iPhone'da uygulama ana ekrana eklenmiş olmalı. Göç `008-bildirimler`.
