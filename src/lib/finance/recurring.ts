/**
 * Tekrarlayan ödeme / tahsilat şablonlarından ileri tarihli vadeli (PLANNED) hareketler üretir.
 * Aynı vade ikinci kez üretilmez (externalRef "rec:<id>:<gün>" + (ledgerId, externalRef) tekilliği).
 * Üretilmiş bir vade silinirse günü şablonun `skipDays` listesine yazılır (silme eylemi), yeniden doğmaz.
 * Çağrıldığı yerler: Vadeler / Nakit akışı sayfaları, şablon kaydı ve günlük zamanlayıcı.
 */
import type { FinFrequency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { r2, vatOf } from "./money";
import { addDays, addMonths, parseDay, today, ymd } from "./dates";
import { loadRates, rateTRY } from "./rates";

export const RECURRING_HORIZON_DAYS = 120;
/** Sayfa açılışlarında geriye bu kadar gün bakılır; şablon ilk kaydedilirken 62 gün (gecikmiş vadeler görünsün) */
const LOOKBACK_DAYS = 5;
export const FIRST_LOOKBACK_DAYS = 62;

export function occurrences(r: { startDate: Date; endDate: Date | null; frequency: FinFrequency }, from: Date, to: Date, skip?: string[]): Date[] {
    const out: Date[] = [];
    const startDay = r.startDate.getUTCDate();
    for (let n = 0; n < 2000; n++) {
        const d = r.frequency === "WEEKLY" ? addDays(r.startDate, 7 * n)
            : addMonths(r.startDate, (r.frequency === "MONTHLY" ? 1 : r.frequency === "QUARTERLY" ? 3 : 12) * n, startDay);
        if (d > to || (r.endDate && d > r.endDate)) break;
        if (d >= from && !skip?.includes(ymd(d))) out.push(d);
    }
    return out;
}

/** Defterdeki aktif şablonların eksik vadelerini üretir; üretilen adedi döndürür */
export async function generateRecurring(ledgerId: string, horizonDays = RECURRING_HORIZON_DAYS, lookbackDays = LOOKBACK_DAYS) {
    const recurrings = await prisma.finRecurring.findMany({ where: { ledgerId, isActive: true } });
    if (recurrings.length === 0) return 0;
    const rates = await loadRates();
    const now = today();
    const to = addDays(now, horizonDays);
    const data = recurrings.flatMap(r => {
        const fx = rateTRY(r.currency, rates);
        if (fx == null) return []; // Kuru bilinmeyen para biriminde üretme (yanlış TL karşılığı yazılmasın)
        const vatAmount = vatOf(r.amount, r.vatRate);
        return occurrences(r, addDays(now, -lookbackDays), to, r.skipDays).map(date => ({
            ledgerId, type: r.type, status: "PLANNED" as const, date, title: r.title, note: r.note,
            amount: r.amount, currency: r.currency, fxRate: fx, amountTRY: r2(r.amount * fx),
            vatRate: r.vatRate, vatAmount, accountId: r.accountId, categoryId: r.categoryId, projectId: r.projectId, contactId: r.contactId,
            recurringId: r.id, externalRef: `rec:${r.id}:${ymd(date)}`,
        }));
    });
    if (data.length === 0) return 0;
    return (await prisma.finTransaction.createMany({ data, skipDuplicates: true })).count;
}

export { parseDay };
