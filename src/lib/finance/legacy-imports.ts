/**
 * Geçmiş işlerin (Excel defterlerinden) hazır aktarım paketleri. Her paket bir proje, müşteriden alınan paralar,
 * ilave işler ve harcamalardır; "İçe aktar > Geçmiş işler" sayfasından tek dokunuşla eklenir (hesap bakiyesi etkilenmez).
 */
export interface LegacyExpense { amount: number; title: string; category?: string; spender?: "Fatih" | "Semih"; date?: string }
export interface LegacyProject {
    key: string;
    name: string; client: string; status: "DONE" | "ACTIVE";
    contractAmount: number; startDate?: string; endDate?: string; stage?: string; note?: string;
    extras: { title: string; amount: number }[];
    collections: { date: string; amount: number; title: string }[];
    defaultDate: string; // tarihi belli olmayan harcamalar için
    expenses: LegacyExpense[];
}

const U = "Usta / işçilik", Y = "Yapı malzemesi", E = "Elektrik ve aydınlatma", M = "Mobilya ve dekorasyon", N = "Nakliye ve montaj";
const s = (amount: number, title: string, category?: string): LegacyExpense => ({ amount, title, category, spender: "Semih" });
const f = (amount: number, title: string, category?: string): LegacyExpense => ({ amount, title, category, spender: "Fatih" });

export const LEGACY_IMPORTS: LegacyProject[] = [
    {
        key: "kose-ailesi",
        name: "Fatma Hanım ve Volkan Bey Köse ailesi", client: "Fatma Hanım ve Volkan Bey Köse", status: "DONE",
        contractAmount: 600_000, startDate: "2026-01-14", endDate: "2026-02-18", stage: "Teslim",
        note: "Excel defterinden aktarıldı. Toplam teklif 849.000 ₺ (iş bedeli 600.000 + ilave işler 249.000). Harcama tarihleri defterde yoktu: 18.02.2026 olarak girildi; 65.000 ₺'lik son tahsilatın tarihi de belli değildi (18.02.2026 varsayıldı). Fatih'e verilen: 100.000 + 75.000 + 5.000 = 180.000 ₺. Defterdeki kâr paylaşımı: Semih 115.273,75 ₺, Fatih −55.765,25 ₺.",
        extras: [{ title: "Boya", amount: 50_000 }, { title: "Banyo", amount: 24_000 }, { title: "Mutfak tezgâh", amount: 60_000 }, { title: "Süpürgelik", amount: 15_000 }, { title: "Kapılar", amount: 100_000 }],
        collections: [
            { date: "2026-01-14", amount: 100_000, title: "Tahsilat" }, { date: "2026-01-23", amount: 100_000, title: "Tahsilat" }, { date: "2026-02-04", amount: 100_000, title: "Tahsilat" },
            { date: "2026-02-06", amount: 34_000, title: "Tahsilat" }, { date: "2026-02-17", amount: 150_000, title: "Tahsilat" }, { date: "2026-02-18", amount: 185_000, title: "Tahsilat" },
            { date: "2026-02-18", amount: 65_000, title: "Tahsilat (tarihi belli değil)" },
        ],
        defaultDate: "2026-02-18",
        expenses: [
            s(1400, "Harcama"), s(550, "Harcama"), s(130, "Yemek", "Yemek"), s(81.5, "Harcama"), s(5000, "Raşit abi", U), s(225, "Anahtar", Y), s(4500, "Raşit abi", U),
            s(1000, "Elektrik", E), s(2750, "İzolasyon", Y), s(2400, "Harcama"), s(1200, "Elektrik", E), f(225, "Yemek", "Yemek"), s(4800, "Boru", Y), s(40000, "Hayrettin abi", U),
            s(2795, "Yutong", Y), s(200, "Boru", Y), s(75, "Harcama"), s(260, "Çimento", Y), f(570, "Kalekim", Y), s(1500, "Harcama"), s(110, "Harcama"), f(892, "Harcama"), f(534, "Kurna", Y),
            s(15000, "Hasan abi", U), s(80000, "Emrah", U), s(3500, "Moloz", N), s(30000, "Atilla", U), s(5000, "Sadaka", "Diğer gider"), s(40000, "Ercan", U), s(80000, "Hayrettin abi", U),
            s(15000, "Alçıpan", Y), s(150000, "Ekol", M), s(10000, "Raşit abi", U), s(20000, "Tezgâh", M), s(20000, "Hasan abi", U), f(3500, "Elektrik", E), f(190, "Nalbur", Y), f(1500, "Boya", "Boya"),
            s(29000, "Tezgâh", M), s(185, "Harcama"), s(630, "Harcama"), s(10200, "Ercan", U), s(17000, "Erdem", U), s(6000, "Temizlik", "Temizlik ve bakım"), f(1550, "Kapı stoper", Y), s(9000, "Hayrettin abi", U),
        ],
    },
    {
        key: "gulay-hanim",
        name: "Gülay Hanım", client: "Gülay Hanım", status: "DONE",
        contractAmount: 2_428_000, stage: "Teslim",
        note: "Excel defterinden aktarıldı. Teklif 2.428.000 ₺, kalan alacak 48.000 ₺ (tahsil edilen 2.380.000 ₺). Defterde tarih yoktu: harcamalar ve tahsilat 30.06.2026 olarak girildi, iş başlangıç/bitiş tarihi boş. Defterdeki kâr: 476.143 ₺.",
        extras: [],
        collections: [{ date: "2026-06-30", amount: 2_380_000, title: "Tahsilat (toplam; tarihleri belli değil)" }],
        defaultDate: "2026-06-30",
        expenses: [
            f(440, "Harcama"), s(70000, "Kadir abi", U), s(50000, "Atilla", U), s(20000, "Raşit abi", U), s(12375, "Elektrik", E), s(90, "Harcama"), s(25, "Harcama"),
            s(27, "Harcama"), s(2500, "Yasir", U), s(2785, "Tesisat", Y), s(795, "Harcama"), s(4300, "Yutong", Y), s(35000, "Çelik kapı", Y), s(1100, "Yutong", Y),
            s(225, "Harcama"), s(160, "Harcama"), s(44000, "Hasan abi", U), s(800, "Kanal", Y), s(28000, "Alçıpan", Y), s(350, "Harcama"), s(50, "Harcama"),
            s(185, "Harcama"), s(750, "Harcama"), s(40000, "Raşit abi", U), s(1410, "Harcama"), s(800, "Harcama"), s(10000, "Moloz", N), s(1000, "Nakliye", N),
            s(80000, "Hayrettin", U), s(20000, "Çelik kapı", Y), s(70000, "Atilla", U), s(50000, "Alçıpan", Y), s(100000, "Emrah", U), s(4250, "Kasa", Y),
            s(50000, "Deniz boya", U), s(340, "Harcama"), s(26400, "Alçıpan", Y), s(20000, "Raşit abi", U), s(40000, "Kadir abi", U), s(30000, "Erdem", U),
            f(4490, "Harcama"), s(30000, "Kadir abi", U), s(24000, "Deniz boya", U), f(10166, "Vana", Y), s(1450, "Karton", Y), s(75000, "Atilla", U),
            s(13000, "Elektrik", E), s(60000, "Hasan abi", U), s(4550, "Elektrik", E), s(15000, "Selami", U), s(200, "Harcama"), s(3000, "Karot", U),
            s(2000, "Payölçer", "Diğer gider"), s(1650, "Boya", "Boya"), s(350, "Elektrik", E), s(40000, "Tezgah", M), s(5000, "Moloz", N), s(20000, "Atilla", U),
            s(4400, "Boya", "Boya"), s(125, "Harcama"), f(11800, "Kapı kolu", Y), s(100000, "Hayrettin", U), f(11900, "Evye", Y), s(6250, "Raşit abi", U),
            s(1600, "Termosifon", Y), s(350, "Buat", Y), s(1750, "Harcama"), s(690, "Harcama"), s(954, "Harcama"), s(20000, "Deniz boya", U), s(350, "Harcama"),
            s(1100, "Harcama"), s(60, "Harcama"), f(250, "Harcama"), s(135, "Harcama"), s(15000, "Kumaş", M), s(85000, "Hayrettin", U), s(40000, "Raşit abi", U),
            s(570, "Harcama"), s(23000, "Petek körleme", U), s(40, "Harcama"), s(1300, "Lavabo", Y), s(200, "Harcama"), s(60000, "Hayrettin", U),
            s(1200, "Yemek", "Yemek"), s(750, "Menfez", Y), f(3100, "Kapı stoperi", Y), s(10000, "Temizlik", "Temizlik ve bakım"), f(10000, "Çelik kapı", Y),
            f(130000, "Emrah", U), s(100000, "Atilla", U), s(40000, "Tezgah", M), s(10000, "Alçıpan", Y), s(30000, "Berjel", M), f(290, "Harcama"), f(1680, "Harcama"),
            s(100000, "Hayrettin", U),
        ],
    },
    {
        key: "selvin-hanim",
        name: "Selvin Hanım", client: "Selvin Hanım", status: "DONE",
        contractAmount: 1_050_000, stage: "Teslim",
        note: "Excel defterinden aktarıldı. Toplam teklif 1.230.600 ₺ (iş bedeli 1.050.000 + ilave işler 180.600; ilaveler tek kalem). Kalan alacak 122.600 ₺ (tahsil edilen 1.108.000 ₺). Defterde tarih yoktu: harcamalar ve tahsilat 30.09.2026 olarak girildi, iş başlangıç/bitiş tarihi boş. 1.300 ₺ boya iadesi boya harcamasından düşüldü. Defterdeki kâr: 34.930 ₺.",
        extras: [{ title: "İlave işler (defterde ayrıntısız)", amount: 180_600 }],
        collections: [{ date: "2026-09-30", amount: 1_108_000, title: "Tahsilat (toplam; tarihleri belli değil)" }],
        defaultDate: "2026-09-30",
        expenses: [
            s(6000, "Hasan abi", U), s(12725, "Elektrik malzeme", E), s(150, "Anahtar", Y), f(770, "Karton", Y), s(1500, "Çuval", Y), s(10000, "Kartela", Y),
            s(20000, "Hasan abi", U), s(1430, "Raşit abi", U), s(7125, "Elektrik malzeme", E), s(20000, "Kadir abi", U), s(15000, "Raşit abi", U), s(60000, "Erdem", U),
            s(50000, "Hayrettin abi", U), s(25000, "Atilla abi", U), s(1900, "Harcama"), s(3250, "Harcama"), s(860, "Harcama"), s(35000, "Mahmut abi", U),
            s(40000, "Raşit abi", U), s(100000, "Hayrettin abi", U), s(150000, "Ekol", M), s(4680, "Boya (1.300 ₺ iade düşüldü)", "Boya"), s(2390, "Harcama"),
            s(90, "Harcama"), s(50, "Harcama"), s(550, "Harcama"), f(70000, "Emrah", U), s(10000, "Mahmut abi", U), s(650, "Harcama"), s(8400, "Elektrik malzeme", E),
            s(80000, "Erdem", U), s(40000, "Tezgah", M), s(60000, "Hayrettin abi", U), s(40000, "Hasan abi", U), s(20000, "Deniz", U), s(200000, "Ekol", M),
            s(325, "Harcama"), s(4400, "Harcama"), s(1300, "Harcama"), s(125, "Harcama"), s(10000, "Temizlik", "Temizlik ve bakım"), s(25000, "Tezgah", M),
            s(33000, "Kadir abi", U), s(14000, "Deniz", U), s(10000, "Erdem", U),
        ],
    },
];
