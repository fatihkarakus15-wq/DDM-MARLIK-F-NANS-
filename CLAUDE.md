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

## Bilinen / yapılmadı
Banka API'si, Excel (.xlsx) ekstre, çok kullanıcılı rol, kur hedef bildirimleri, e-Fatura, parmak izi/PIN kilidi, yıl sonu kapanışı.
