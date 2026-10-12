/**
 * Banka ekstresi (CSV) ayrıştırma: ayraç, kod çözme, tarih ve tutar biçimleri. Saf fonksiyonlar:
 * tarayıcıda (önizleme) ve sunucuda aynı kod çalışır. Excel dosyası için "CSV olarak kaydet" gerekir.
 */

/** UTF-8 olmayan (Windows-1254) dosyalar için yedekli kod çözme */
export function decodeBytes(buf: ArrayBuffer): string {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
    } catch {
        return new TextDecoder("windows-1254").decode(buf);
    }
}

export function detectDelimiter(text: string): string {
    const head = text.split(/\r?\n/).slice(0, 8).join("\n");
    const counts = [";", "\t", ",", "|"].map(d => [d, head.split(d).length - 1] as const);
    return counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts.sort((a, b) => b[1] - a[1])[0][0] : ";";
}

/** Tırnaklı alanları destekleyen CSV ayrıştırıcı */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
    const rows: string[][] = [];
    let row: string[] = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === delimiter) { row.push(field.trim()); field = ""; }
        else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") i++;
            row.push(field.trim()); field = "";
            if (row.some(Boolean)) rows.push(row);
            row = [];
        } else field += c;
    }
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
    return rows;
}

/** "12.10.2026", "12/10/26", "2026-10-12 14:30" → "2026-10-12"; tanınmazsa null */
export function parseDateCell(s: string): string | null {
    const t = s.trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
    let y: number, mo: number, d: number;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else {
        m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/.exec(t);
        if (!m) return null;
        d = +m[1]; mo = +m[2]; y = +m[3];
        if (y < 100) y += 2000;
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
    const date = new Date(Date.UTC(y, mo - 1, d, 12));
    if (date.getUTCMonth() !== mo - 1) return null;
    return date.toISOString().slice(0, 10);
}

/** "-1.234,56", "1,234.56", "(250,00)", "250,00-", "1.234,56 TL" → işaretli sayı; tanınmazsa null */
export function parseAmountCell(s: string): number | null {
    let t = s.trim().replace(/\s|TL|TRY|₺|\$|€|£/gi, "");
    if (!t) return null;
    let sign = 1;
    if (/^\(.*\)$/.test(t)) { sign = -1; t = t.slice(1, -1); }
    if (t.startsWith("-") || t.startsWith("−")) { sign *= -1; t = t.slice(1); }
    else if (t.startsWith("+")) t = t.slice(1);
    if (t.endsWith("-")) { sign *= -1; t = t.slice(0, -1); }
    if (!/^[\d.,]+$/.test(t)) return null;
    const dot = t.lastIndexOf("."), comma = t.lastIndexOf(",");
    if (dot >= 0 && comma >= 0) t = dot > comma ? t.replace(/,/g, "") : t.replace(/\./g, "").replace(",", ".");
    else if (comma >= 0) t = t.replace(",", ".");
    else if (dot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    const n = Number(t);
    return Number.isFinite(n) ? sign * n : null;
}

const TR_MAP: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
/** Küçük harf, Türkçe karakterler sadeleşir, boşluklar teke iner (kural eşleştirme) */
export function normalizeTR(s: string) {
    return s.toLocaleLowerCase("tr").replace(/[çğıöşüâîû]/g, c => TR_MAP[c] ?? c).replace(/\s+/g, " ").trim();
}

export interface ColumnGuess { date: number; desc: number; amount: number; debit: number; credit: number; hasHeader: boolean }

/** Başlık satırından sütunları tahmin eder (bulunamayan −1) */
export function guessColumns(rows: string[][]): ColumnGuess {
    const header = rows[0]?.map(normalizeTR) ?? [];
    const find = (...needles: string[]) => header.findIndex(h => needles.some(n => h.includes(n)));
    const date = find("tarih", "date");
    const desc = find("aciklama", "islem", "description", "detay");
    const amount = find("tutar", "miktar", "amount");
    const debit = find("borc", "cikis", "debit");
    const credit = find("alacak", "giris", "credit");
    const hasHeader = [date, desc, amount, debit, credit].filter(i => i >= 0).length >= 2;
    return hasHeader
        ? { date, desc: desc >= 0 ? desc : header.findIndex((_, i) => i !== date && i !== amount), amount, debit, credit, hasHeader }
        : { date: 0, desc: 1, amount: 2, debit: -1, credit: -1, hasHeader };
}

export interface ImportLine { date: string; title: string; amount: number }

/** Sütun eşlemesiyle satırları okur; geçersiz satırlar `skipped` sayısına eklenir */
export function extractLines(rows: string[][], cols: ColumnGuess): { lines: ImportLine[]; skipped: number } {
    const body = cols.hasHeader ? rows.slice(1) : rows;
    const lines: ImportLine[] = [];
    let skipped = 0;
    for (const r of body) {
        const date = cols.date >= 0 ? parseDateCell(r[cols.date] ?? "") : null;
        let amount: number | null = null;
        if (cols.amount >= 0) amount = parseAmountCell(r[cols.amount] ?? "");
        else if (cols.debit >= 0 || cols.credit >= 0) {
            const debit = cols.debit >= 0 ? parseAmountCell(r[cols.debit] ?? "") : null;
            const credit = cols.credit >= 0 ? parseAmountCell(r[cols.credit] ?? "") : null;
            if (credit) amount = Math.abs(credit);
            else if (debit) amount = -Math.abs(debit);
        }
        const title = (cols.desc >= 0 ? r[cols.desc] : "")?.trim() ?? "";
        if (!date || amount == null || amount === 0) { skipped++; continue; }
        lines.push({ date, title: title || "Banka hareketi", amount });
    }
    return { lines, skipped };
}

export interface RuleLike { match: string; categoryId: string | null; projectId: string | null; contactId: string | null; priority: number }

/** Açıklamaya uyan ilk kural (öncelik, sonra daha uzun ifade) */
export function matchRule<T extends RuleLike>(title: string, rules: T[]): T | null {
    const t = normalizeTR(title);
    return [...rules]
        .sort((a, b) => b.priority - a.priority || b.match.length - a.match.length)
        .find(r => r.match.trim() && t.includes(normalizeTR(r.match))) ?? null;
}
