/** Finans enum'larının Türkçe adları ve rozet renkleri (tek kaynak) */
import type { FinAccountKind, FinChequeDirection, FinChequeKind, FinChequeStatus, FinContactKind, FinFrequency, FinProjectStatus, FinTxStatus, FinTxType } from "@prisma/client";

export const ACCOUNT_KIND: Record<FinAccountKind, string> = { BANK: "Banka hesabı", CASH: "Kasa (nakit)", CREDIT_CARD: "Kredi kartı", POS: "POS / sanal pos", OTHER: "Diğer" };

export const CONTACT_KIND: Record<FinContactKind, string> = { CUSTOMER: "Müşteri", SUPPLIER: "Tedarikçi", SUBCONTRACTOR: "Taşeron / usta", EMPLOYEE: "Personel", OTHER: "Diğer" };

export const PROJECT_STATUS: Record<FinProjectStatus, { label: string; tone: string }> = {
    LEAD: { label: "Teklif", tone: "muted" },
    ACTIVE: { label: "Devam ediyor", tone: "info" },
    ON_HOLD: { label: "Beklemede", tone: "warn" },
    DONE: { label: "Tamamlandı", tone: "ok" },
    CANCELLED: { label: "İptal", tone: "bad" },
};

export const TX_TYPE: Record<FinTxType, { label: string; tone: string }> = {
    INCOME: { label: "Gelir", tone: "ok" },
    EXPENSE: { label: "Gider", tone: "bad" },
    TRANSFER: { label: "Virman", tone: "muted" },
};

export const TX_STATUS: Record<FinTxStatus, string> = { PLANNED: "Vadeli", DONE: "Gerçekleşti" };

export const FREQUENCY: Record<FinFrequency, string> = { WEEKLY: "Haftalık", MONTHLY: "Aylık", QUARTERLY: "3 aylık", YEARLY: "Yıllık" };

export const CHEQUE_KIND: Record<FinChequeKind, string> = { CHECK: "Çek", NOTE: "Senet" };
export const CHEQUE_DIRECTION: Record<FinChequeDirection, string> = { RECEIVED: "Aldığımız", ISSUED: "Verdiğimiz" };
export const CHEQUE_STATUS: Record<FinChequeStatus, { label: string; tone: string }> = {
    OPEN: { label: "Portföyde", tone: "info" },
    DEPOSITED: { label: "Tahsile verildi", tone: "warn" },
    ENDORSED: { label: "Ciro edildi", tone: "muted" },
    SETTLED: { label: "Tahsil edildi / ödendi", tone: "ok" },
    BOUNCED: { label: "Karşılıksız", tone: "bad" },
    CANCELLED: { label: "İptal", tone: "muted" },
};

/** Yatırım varlıkları (FinRate.code) */
export const ASSETS: { code: string; name: string; unit: string; group: "fx" | "gold" }[] = [
    { code: "USD", name: "Amerikan doları", unit: "USD", group: "fx" },
    { code: "EUR", name: "Euro", unit: "EUR", group: "fx" },
    { code: "GBP", name: "İngiliz sterlini", unit: "GBP", group: "fx" },
    { code: "GRAM_ALTIN", name: "Gram altın (24 ayar)", unit: "gram", group: "gold" },
    { code: "CEYREK", name: "Çeyrek altın", unit: "adet", group: "gold" },
    { code: "YARIM", name: "Yarım altın", unit: "adet", group: "gold" },
    { code: "TAM", name: "Tam altın", unit: "adet", group: "gold" },
    { code: "ATA", name: "Ata (Cumhuriyet) altını", unit: "adet", group: "gold" },
];
export const ASSET = Object.fromEntries(ASSETS.map(a => [a.code, a])) as Record<string, (typeof ASSETS)[number]>;
