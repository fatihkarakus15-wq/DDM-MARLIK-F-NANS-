/**
 * Finans tarihleri: günler öğlen 12:00 UTC olarak saklanır (saat dilimi kaymasın), "bugün" İstanbul takvimine göredir.
 * Biçim ve girdi her yerde UTC gün anahtarıyla ("2026-10-12") yapılır.
 */

const DAY = 86_400_000;

/** "2026-10-12" → o günün öğlen 12:00 UTC'si; geçersizse null */
export function parseDay(s: string | null | undefined): Date | null {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** İstanbul'daki bugünün gün anahtarı */
export function todayYmd(now = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Bugün (öğlen 12:00 UTC) */
export const today = () => parseDay(todayYmd())!;

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** Gün farkı: b − a (tam gün) */
export const diffDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);

/** n ay sonrası; hedef ayda o gün yoksa ayın son günü ("31 Ocak" + 1 ay = 28/29 Şubat) */
export function addMonths(d: Date, n: number, day = d.getUTCDate()) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + n;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(day, last), 12));
}

export const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/** "2026-10" → "Eki 2026" */
export function monthLabel(key: string) {
    const d = new Date(`${key}-15T12:00:00Z`);
    return d.toLocaleDateString("tr-TR", { month: "short", year: "numeric", timeZone: "UTC" });
}

export const fmtDay = (d: Date) => d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
export const dateTimeTR = (d: Date) => d.toLocaleString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
export const fmtShort = (d: Date) => d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", timeZone: "UTC" });

/** [başlangıç, bitiş] ay anahtarları arasındaki ayların listesi */
export function monthRange(from: Date, to: Date) {
    const out: string[] = [];
    let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1, 12));
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1, 12));
    while (d <= end) { out.push(monthKey(d)); d = addMonths(d, 1, 1); }
    return out;
}

/** Dönem seçenekleri (raporlar): ?donem=bu-ay|gecen-ay|3ay|yil|12ay|tumu */
export const PERIODS = [
    ["bu-ay", "Bu ay"], ["gecen-ay", "Geçen ay"], ["3ay", "Son 3 ay"], ["yil", "Bu yıl"], ["12ay", "Son 12 ay"], ["tumu", "Tümü"],
] as const;

export function periodRange(key: string | undefined): { key: string; from: Date; to: Date } {
    const t = today();
    const y = t.getUTCFullYear(), m = t.getUTCMonth();
    const first = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 1, 12));
    const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm + 1, 0, 12));
    switch (key) {
        case "gecen-ay": return { key, from: first(y, m - 1), to: last(y, m - 1) };
        case "3ay": return { key, from: first(y, m - 2), to: last(y, m) };
        case "yil": return { key, from: first(y, 0), to: last(y, 11) };
        case "12ay": return { key, from: first(y, m - 11), to: last(y, m) };
        case "tumu": return { key, from: new Date(Date.UTC(2000, 0, 1, 12)), to: new Date(Date.UTC(2100, 0, 1, 12)) };
        default: return { key: "bu-ay", from: first(y, m), to: last(y, m) };
    }
}
