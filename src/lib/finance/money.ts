/** Para yardımcıları: kuruşa yuvarlama ve biçim. Tutarlar Float; her yazımdan önce r2 ile yuvarlanır. */

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const CURRENCIES = ["TRY", "USD", "EUR", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const isCurrency = (c: string): c is Currency => (CURRENCIES as readonly string[]).includes(c);

export const SYMBOL: Record<string, string> = { TRY: "₺", USD: "$", EUR: "€", GBP: "£" };

/** 1.234,56 ₺ */
export function money(n: number, currency = "TRY", digits = 2) {
    const body = n.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return `${body} ${SYMBOL[currency] ?? currency}`;
}

/** Kuruşsuz TL (özet kartları): 1.235 ₺ */
export const tl0 = (n: number) => money(n, "TRY", 0);

/** +1.234 ₺ / −1.234 ₺ */
export function signedTl(n: number) {
    const body = Math.abs(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
    return `${n < 0 ? "−" : n > 0 ? "+" : ""}${body} ₺`;
}

/** Yüzde (0–100 ya da oran değil, doğrudan yüzde değeri) */
export const pct = (n: number | null | undefined, digits = 0) => (n == null || !Number.isFinite(n) ? "—" : `%${n.toLocaleString("tr-TR", { maximumFractionDigits: digits })}`);

/** KDV dahil tutardan KDV payı */
export const vatOf = (gross: number, rate: number | null | undefined) => (rate && rate > 0 ? r2(gross - gross / (1 + rate / 100)) : 0);

export const VAT_RATES = [0, 1, 10, 20] as const;
