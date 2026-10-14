/** Menü öğeleri ve ikon yolları (sunucu ve istemci bileşenleri ortak kullanır) */
export const ICONS: Record<string, string> = {
    ofis: "M5 21V5l7-2v18M12 7l7 2v12M3 21h18M8 8h1M8 12h1M8 16h1M15 12h1M15 16h1",
    ozet: "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10",
    hareketler: "M4 6h16M4 12h16M4 18h10",
    ekle: "M12 5v14M5 12h14",
    vadeler: "M5 6h14v13H5zM5 10h14M9 3.5V7M15 3.5V7",
    daha: "M5 12h.01M12 12h.01M19 12h.01",
    hesaplar: "M3.5 7.5h17v11h-17zM3.5 7.5l3-3h11l3 3M15.5 13h2",
    projeler: "M4 19V9l8-5 8 5v10zM9 19v-6h6v6",
    cariler: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M16 6.5a2.6 2.6 0 0 1 0 5M17 14.7c1.9.5 3 1.9 3.5 4.3",
    cek: "M4 7h16v10H4zM7 11h6M7 14h3",
    nakit: "M4 17l5-5 4 3 7-8M15 7h5v5",
    yatirim: "M12 4v16M16.5 8H10a2.5 2.5 0 0 0 0 5h4a2.5 2.5 0 0 1 0 5H7.5",
    raporlar: "M6 20V10M12 20V4M18 20v-7",
    iceaktar: "M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14",
    ayarlar: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.7 7.7 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.5z",
};

export interface Item { href: string; label: string; icon: keyof typeof ICONS; slot: "tab" | "more" | "desk"; match?: string[] }
export const ITEMS: Item[] = [
    { href: "/", label: "Projeler", icon: "projeler", slot: "tab", match: ["/projeler"] },
    { href: "/ofis", label: "Ofis", icon: "ofis", slot: "tab" },
    { href: "/vadeler", label: "Vadeler", icon: "vadeler", slot: "tab" },
    { href: "/daha-fazla", label: "Daha fazla", icon: "daha", slot: "more", match: ["/ozet", "/hareketler", "/hesaplar", "/cariler", "/ustalar", "/cek-senet", "/nakit-akisi", "/yatirimlar", "/raporlar", "/ice-aktar", "/ayarlar"] },
    { href: "/ozet", label: "Genel özet", icon: "ozet", slot: "desk" },
    { href: "/hareketler", label: "Hareketler", icon: "hareketler", slot: "desk" },
    { href: "/hesaplar", label: "Hesaplar", icon: "hesaplar", slot: "desk" },
    { href: "/cariler", label: "Cariler", icon: "cariler", slot: "desk" },
    { href: "/ustalar", label: "Ustalar", icon: "cariler", slot: "desk" },
    { href: "/cek-senet", label: "Çek / Senet", icon: "cek", slot: "desk" },
    { href: "/nakit-akisi", label: "Nakit akışı", icon: "nakit", slot: "desk" },
    { href: "/yatirimlar", label: "Yatırımlar", icon: "yatirim", slot: "desk" },
    { href: "/raporlar", label: "Raporlar", icon: "raporlar", slot: "desk" },
    { href: "/ice-aktar", label: "İçe aktar", icon: "iceaktar", slot: "desk" },
    { href: "/ayarlar", label: "Ayarlar", icon: "ayarlar", slot: "desk" },
];

export const MORE_LINKS = ITEMS.filter(i => i.slot === "desk");

