/**
 * Nakit akışı tahmini: bugünkü nakit (banka + kasa + POS) üzerine vadeli alacak / borçlar, açık çek / senetler
 * ve kredi kartı son ödeme günü eklenerek gün gün ilerletilir. Gecikmiş kalemler "bugün" sayılır (ya da hariç tutulur).
 * "Tahsilatlar N gün gecikirse" senaryosu gelir kalemlerini kaydırır. Tutarlar TL karşılığıdır.
 */
import { prisma } from "@/lib/prisma";
import { r2 } from "./money";
import { accountBalances, cashTotals } from "./balances";
import { addDays, addMonths, diffDays, monthKey, today } from "./dates";
import { toTRY, type RateMap } from "./rates";

export interface FlowItem { date: Date; originalDate: Date; label: string; amount: number; kind: "tx" | "cheque" | "card"; overdue: boolean; href?: string }
export interface FlowDay { date: Date; in: number; out: number; balance: number }
export interface FlowWeek { from: Date; to: Date; in: number; out: number; balance: number }
export interface Forecast {
    start: number; missingRate: string[]; items: FlowItem[]; days: FlowDay[]; weeks: FlowWeek[];
    low: { date: Date; balance: number }; end: number; overdueIn: number; overdueOut: number; horizon: number;
}

export interface ForecastOpts { days?: number; delay?: number; overdue?: "include" | "exclude" }

/** Kart son ödeme gününün bir sonraki tarihi */
function nextDue(now: Date, dueDay: number) {
    const thisMonth = addMonths(now, 0, dueDay);
    return thisMonth >= now ? thisMonth : addMonths(now, 1, dueDay);
}

export async function cashForecast(ledgerId: string, rates: RateMap, opts: ForecastOpts = {}): Promise<Forecast> {
    const horizon = Math.min(Math.max(opts.days ?? 90, 14), 365);
    const delay = Math.min(Math.max(opts.delay ?? 0, 0), 180);
    const includeOverdue = (opts.overdue ?? "include") === "include";
    const now = today();
    const end = addDays(now, horizon);

    const [accounts, planned, cheques] = await Promise.all([
        accountBalances(ledgerId, rates),
        prisma.finTransaction.findMany({
            where: { ledgerId, status: "PLANNED", type: { in: ["INCOME", "EXPENSE"] }, date: { lte: end } },
            select: { id: true, type: true, title: true, date: true, amountTRY: true, contact: { select: { name: true } }, cheque: { select: { status: true } } },
        }),
        prisma.finCheque.findMany({
            where: { ledgerId, status: { in: ["OPEN", "DEPOSITED"] }, dueDate: { lte: end } },
            select: { id: true, direction: true, number: true, amount: true, currency: true, dueDate: true, contact: { select: { name: true } }, transactionId: true },
        }),
    ]);

    const totals = cashTotals(accounts);
    const items: FlowItem[] = [];
    const push = (date: Date, label: string, amount: number, kind: FlowItem["kind"], href?: string) => {
        const overdue = diffDays(date, now) > 0;
        if (overdue && !includeOverdue) return;
        let eff = overdue ? now : date;
        if (amount > 0 && delay) eff = addDays(eff, delay);
        if (eff > end) return;
        items.push({ date: eff, originalDate: date, label, amount: r2(amount), kind, overdue, href });
    };

    for (const t of planned) {
        // Çekle temsil edilen vadeli kayıt çek satırından sayılır (çift sayılmasın)
        if (t.cheque && (t.cheque.status === "OPEN" || t.cheque.status === "DEPOSITED")) continue;
        push(t.date, `${t.title}${t.contact ? ` · ${t.contact.name}` : ""}`, t.type === "INCOME" ? t.amountTRY : -t.amountTRY, "tx", `/hareketler/${t.id}`);
    }
    for (const c of cheques) {
        const tryAmount = toTRY(c.amount, c.currency, rates);
        if (tryAmount == null) continue;
        push(c.dueDate, `${c.direction === "RECEIVED" ? "Çek / senet tahsili" : "Çek / senet ödemesi"}${c.number ? ` ${c.number}` : ""}${c.contact ? ` · ${c.contact.name}` : ""}`, c.direction === "RECEIVED" ? tryAmount : -tryAmount, "cheque", "/cek-senet");
    }
    for (const a of accounts) {
        if (a.kind !== "CREDIT_CARD" || !a.dueDay || a.balanceTRY == null || a.balanceTRY >= 0) continue;
        push(nextDue(now, a.dueDay), `${a.name} ekstresi (tahmini)`, a.balanceTRY, "card", "/hesaplar");
    }
    items.sort((a, b) => a.date.getTime() - b.date.getTime());

    const days: FlowDay[] = [];
    let balance = totals.cash;
    let low = { date: now, balance };
    for (let i = 0; i <= horizon; i++) {
        const d = addDays(now, i);
        const todays = items.filter(x => diffDays(x.date, d) === 0);
        const inflow = todays.filter(x => x.amount > 0).reduce((s, x) => s + x.amount, 0);
        const outflow = -todays.filter(x => x.amount < 0).reduce((s, x) => s + x.amount, 0);
        balance = r2(balance + inflow - outflow);
        days.push({ date: d, in: r2(inflow), out: r2(outflow), balance });
        if (balance < low.balance) low = { date: d, balance };
    }
    const weeks: FlowWeek[] = [];
    for (let i = 0; i < days.length; i += 7) {
        const chunk = days.slice(i, i + 7);
        weeks.push({ from: chunk[0].date, to: chunk[chunk.length - 1].date, in: r2(chunk.reduce((s, d) => s + d.in, 0)), out: r2(chunk.reduce((s, d) => s + d.out, 0)), balance: chunk[chunk.length - 1].balance });
    }
    const overdueItems = items.filter(i => i.overdue);
    return {
        start: totals.cash, missingRate: totals.missingRate, items, days, weeks, low, end: balance, horizon,
        overdueIn: r2(overdueItems.filter(i => i.amount > 0).reduce((s, i) => s + i.amount, 0)),
        overdueOut: r2(-overdueItems.filter(i => i.amount < 0).reduce((s, i) => s + i.amount, 0)),
    };
}

export interface MonthActual { month: string; income: number; expense: number; net: number; cash: number | null }

/**
 * Son N ayın gerçekleşen gelir / gideri (virman hariç) ve ay sonu nakit seyri.
 * Ay sonu nakit, bugünkü nakitten sonraki hareketler geri alınarak hesaplanır (döviz hesapları bugünkü kurla; tahmini).
 */
export async function monthlyActuals(ledgerId: string, rates: RateMap, months = 12): Promise<MonthActual[]> {
    const now = today();
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1, 12));
    const [accounts, txs] = await Promise.all([
        accountBalances(ledgerId, rates),
        prisma.finTransaction.findMany({
            where: { ledgerId, status: "DONE", date: { gte: first } },
            select: { type: true, date: true, amountTRY: true, accountId: true, toAccountId: true, amount: true, toAmount: true, currency: true },
        }),
    ]);
    const cashIds = new Map(accounts.filter(a => a.kind === "BANK" || a.kind === "CASH" || a.kind === "POS").map(a => [a.id, a]));
    const current = cashTotals(accounts).cash;
    const keys: string[] = [];
    for (let i = 0; i < months; i++) keys.push(monthKey(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1, 12))));
    const byMonth = new Map(keys.map(k => [k, { income: 0, expense: 0, cashDelta: 0 }]));
    for (const t of txs) {
        const m = byMonth.get(monthKey(t.date));
        if (!m) continue;
        if (t.type === "INCOME") m.income += t.amountTRY; else if (t.type === "EXPENSE") m.expense += t.amountTRY;
        const from = t.accountId ? cashIds.get(t.accountId) : undefined;
        const into = t.toAccountId ? cashIds.get(t.toAccountId) : undefined;
        const tryOf = (cur: string, amt: number) => toTRY(amt, cur, rates) ?? 0;
        if (t.type === "INCOME" && from) m.cashDelta += tryOf(from.currency, t.amount);
        else if (t.type === "EXPENSE" && from) m.cashDelta -= tryOf(from.currency, t.amount);
        else if (t.type === "TRANSFER") {
            if (from) m.cashDelta -= tryOf(from.currency, t.amount);
            if (into) m.cashDelta += tryOf(into.currency, t.toAmount ?? t.amount);
        }
    }
    // Sondan başa: ay sonu nakit = bugünkü nakit − sonraki ayların net nakit hareketi
    let running = current;
    const out: MonthActual[] = [];
    for (const k of [...keys].reverse()) {
        const m = byMonth.get(k)!;
        out.unshift({ month: k, income: r2(m.income), expense: r2(m.expense), net: r2(m.income - m.expense), cash: cashIds.size ? r2(running) : null });
        running -= m.cashDelta;
    }
    return out;
}
