/**
 * Geçmiş işlerin (Excel defterlerinden) hazır aktarım paketleri. Her paket bir proje, müşteriden alınan paralar,
 * ilave işler ve harcamalardır; "İçe aktar > Geçmiş işler" sayfasından tek dokunuşla eklenir (hesap bakiyesi etkilenmez).
 */
export interface LegacyExpense { amount: number; title: string; category?: string; spender?: "Fatih" | "Semih"; date?: string }
export interface LegacyProject {
    key: string;
    name: string; client: string; status: "DONE" | "ACTIVE";
    contractAmount: number; startDate: string; endDate: string; stage?: string; note?: string;
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
];
