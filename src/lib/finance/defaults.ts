/** Varsayılan gelir / gider kalemleri (grup › kalem) */

type Tree = Record<string, string[]>;

const OFFICE_EXPENSE: Tree = {
    "Malzeme": ["Boya", "Yapı malzemesi", "Seramik / kaplama", "Elektrik ve aydınlatma", "Mobilya ve dekorasyon", "Maket / numune"],
    "Yemek ve ikram": ["Yemek", "Kahve / ikram"],
    "Ulaşım ve seyahat": ["Yakıt", "Otopark / geçiş", "Taksi / uçak / otel"],
    "Taşeron ve usta": ["Taşeron hakedişi", "Usta / işçilik", "Nakliye ve montaj"],
    "Ofis": ["Kira", "Aidat ve faturalar", "Kırtasiye", "Baskı ve plot", "Temizlik ve bakım", "Ekipman"],
    "Yazılım ve abonelik": [],
    "Personel": ["Maaş", "SGK primi", "Yemek / yol yardımı", "Avans"],
    "Vergi ve harçlar": ["KDV ödemesi", "Muhtasar", "Gelir / kurumlar vergisi", "Harç ve belediye", "Oda aidatı"],
    "Danışmanlık ve dış hizmet": ["Statik / mekanik / elektrik projesi", "Mali müşavir", "Hukuk", "Ölçüm / harita"],
    "Pazarlama": ["Reklam", "Fuar / etkinlik"],
    "Finansman": ["Banka masrafı", "Faiz ve komisyon", "Kredi taksiti"],
    "Sigorta": [],
    "Diğer gider": [],
};
const OFFICE_INCOME: Tree = {
    "Proje bedeli": ["Mimari proje", "İç mimari proje", "Uygulama projesi"],
    "Uygulama / taahhüt": [],
    "Kontrollük ve danışmanlık": [],
    "Mobilya / ürün satışı": [],
    "Müşteri avansı": [],
    "Faiz ve kur geliri": [],
    "Diğer gelir": [],
};

/** Yeni defterin varsayılan kalemleri (Ayarlar > Kalemler'den değişir) */
export function defaultCategories(): { expense: Tree; income: Tree } {
    return { expense: OFFICE_EXPENSE, income: OFFICE_INCOME };
}

export const DEFAULT_LEDGERS = [{ slug: "mimarlik", name: "Mimarlık Ofisi", sortOrder: 0 }];
