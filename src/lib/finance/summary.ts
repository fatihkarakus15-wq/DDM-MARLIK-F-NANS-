/** Özet sayfası ve yatırımlar için ortak hesaplar */
import { prisma } from "@/lib/prisma";
import { r2 } from "./money";
import { accountBalances, cashTotals, type AccountRow, type CashTotals } from "./balances";
import { addDays, diffDays, today } from "./dates";
import { rateTRY, type RateMap } from "./rates";

export interface PositionView {
    id: string; asset: string; quantity: number; unitCost: number; boughtAt: Date; targetPrice: number | null; note: string | null;
    cost: number; price: number | null; value: number | null; pnl: number | null; pnlPct: number | null; targetHit: boolean;
}

/** Açık pozisyonların anlık değeri (alış fiyatıyla) */
export function valuePositions(rows: { id: string; asset: string; quantity: number; unitCost: number; boughtAt: Date; targetPrice: number | null; note: string | null }[], rates: RateMap): PositionView[] {
    return rows.map(p => {
        const price = rateTRY(p.asset, rates);
        const cost = r2(p.quantity * p.unitCost);
        const value = price == null ? null : r2(p.quantity * price);
        const pnl = value == null ? null : r2(value - cost);
        return { ...p, cost, price, value, pnl, pnlPct: pnl != null && cost ? (pnl / cost) * 100 : null, targetHit: !!p.targetPrice && price != null && price >= p.targetPrice };
    });
}

export interface Dashboard {
    accounts: AccountRow[]; totals: CashTotals;
    invest: { cost: number; value: number; count: number; missing: string[] };
    receivable: { total: number; overdue: number; count: number; overdueCount: number };
    payable: { total: number; overdue: number; count: number; overdueCount: number };
    month: { income: number; expense: number; net: number };
    soon: { cheques: number; chequeAmount: number };
    netWorth: number;
    ignored: number;
}

export async function loadDashboard(ledgerId: string, rates: RateMap): Promise<Dashboard> {
    const now = today();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 12));
    const [accounts, positions, planned, done, cheques] = await Promise.all([
        accountBalances(ledgerId, rates),
        prisma.finInvestment.findMany({ where: { ledgerId, status: "OPEN" } }),
        prisma.finTransaction.findMany({ where: { ledgerId, status: "PLANNED", type: { in: ["INCOME", "EXPENSE"] } }, select: { type: true, date: true, amountTRY: true, cheque: { select: { status: true } } } }),
        prisma.finTransaction.findMany({ where: { ledgerId, status: "DONE", type: { in: ["INCOME", "EXPENSE"] }, date: { gte: monthStart, lte: monthEnd } }, select: { type: true, amountTRY: true } }),
        prisma.finCheque.findMany({ where: { ledgerId, status: { in: ["OPEN", "DEPOSITED"] }, dueDate: { lte: addDays(now, 7) } }, select: { amount: true, currency: true, direction: true } }),
    ]);
    const totals = cashTotals(accounts);
    const views = valuePositions(positions, rates);
    const invest = {
        cost: r2(views.reduce((s, v) => s + v.cost, 0)), value: r2(views.reduce((s, v) => s + (v.value ?? 0), 0)), count: views.length,
        missing: [...new Set(views.filter(v => v.value == null).map(v => v.asset))],
    };
    const side = (type: "INCOME" | "EXPENSE") => {
        const rows = planned.filter(t => t.type === type);
        const late = rows.filter(t => diffDays(t.date, now) > 0);
        return { total: r2(rows.reduce((s, t) => s + t.amountTRY, 0)), overdue: r2(late.reduce((s, t) => s + t.amountTRY, 0)), count: rows.length, overdueCount: late.length };
    };
    const income = done.filter(t => t.type === "INCOME").reduce((s, t) => s + t.amountTRY, 0);
    const expense = done.filter(t => t.type === "EXPENSE").reduce((s, t) => s + t.amountTRY, 0);
    return {
        accounts, totals, invest, receivable: side("INCOME"), payable: side("EXPENSE"),
        month: { income: r2(income), expense: r2(expense), net: r2(income - expense) },
        soon: { cheques: cheques.length, chequeAmount: r2(cheques.reduce((s, c) => s + (c.direction === "RECEIVED" ? 1 : -1) * c.amount * (rateTRY(c.currency, rates) ?? 1), 0)) },
        netWorth: r2(totals.cash - totals.cardDebt + totals.other + invest.value),
        ignored: accounts.reduce((s, a) => s + a.ignored, 0),
    };
}
