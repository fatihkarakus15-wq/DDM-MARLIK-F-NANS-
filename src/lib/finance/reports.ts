/**
 * Finans raporları. Hepsi TL karşılığıyla (amountTRY) ve virmansız çalışır.
 *  - Esas: "nakit" = yalnızca gerçekleşen hareketler, hareket gününe göre ·
 *          "tahakkuk" = vadeli (ödenmemiş) kayıtlar dahil, belge tarihine (yoksa vadeye) göre.
 *  - KDV: "haric" (varsayılan; kâr zarar için doğru) ya da "dahil".
 * Proje maliyeti ve kârlılığı her zaman tahakkuk esaslıdır (ödenmemiş fatura da maliyettir).
 */
import { prisma } from "@/lib/prisma";
import { r2 } from "./money";
import { diffDays, monthKey, monthRange, today } from "./dates";

export type Basis = "nakit" | "tahakkuk";
export type VatMode = "haric" | "dahil";
export interface ReportOpts { from: Date; to: Date; basis: Basis; vat: VatMode; projectId?: string | null }

interface Row {
    id: string; type: "INCOME" | "EXPENSE"; status: "PLANNED" | "DONE"; date: Date; eff: Date; title: string;
    value: number; vat: number; withholding: number; categoryId: string | null; projectId: string | null; contactId: string | null;
}

async function loadRows(ledgerId: string, o: { from: Date; to: Date; basis: Basis; vat: VatMode; projectId?: string | null }): Promise<Row[]> {
    const range = { gte: o.from, lte: o.to };
    const txs = await prisma.finTransaction.findMany({
        where: {
            ledgerId, type: { in: ["INCOME", "EXPENSE"] }, ...(o.projectId && { projectId: o.projectId }),
            ...(o.basis === "nakit"
                ? { status: "DONE", date: range }
                : { OR: [{ docDate: range }, { docDate: null, date: range }] }),
        },
        select: { id: true, type: true, status: true, date: true, docDate: true, title: true, amountTRY: true, fxRate: true, vatAmount: true, withholdingAmount: true, categoryId: true, projectId: true, contactId: true },
    });
    return txs.map(t => {
        const vat = r2(t.vatAmount * t.fxRate);
        return {
            id: t.id, type: t.type as "INCOME" | "EXPENSE", status: t.status, date: t.date, eff: o.basis === "nakit" ? t.date : (t.docDate ?? t.date), title: t.title,
            value: o.vat === "haric" ? r2(t.amountTRY - vat) : t.amountTRY, vat, withholding: r2(t.withholdingAmount * t.fxRate),
            categoryId: t.categoryId, projectId: t.projectId, contactId: t.contactId,
        };
    });
}

export interface CategoryInfo { id: string; name: string; kind: "INCOME" | "EXPENSE"; parentId: string | null; parentName: string | null; label: string }

export async function loadCategoryInfo(ledgerId: string): Promise<Map<string, CategoryInfo>> {
    const rows = await prisma.finCategory.findMany({ where: { ledgerId }, select: { id: true, name: true, kind: true, parentId: true } });
    const byId = new Map(rows.map(r => [r.id, r]));
    return new Map(rows.map(r => {
        const parent = r.parentId ? byId.get(r.parentId) : undefined;
        return [r.id, { id: r.id, name: r.name, kind: r.kind, parentId: r.parentId, parentName: parent?.name ?? null, label: parent ? `${parent.name} › ${r.name}` : r.name }];
    }));
}

export interface MonthRow { month: string; income: number; expense: number; net: number }
export interface CategoryRow { id: string | null; label: string; group: string; groupId: string | null; amount: number; count: number; share: number }
export interface GroupRow { group: string; groupId: string | null; amount: number; share: number; items: CategoryRow[] }

function breakdown(rows: Row[], cats: Map<string, CategoryInfo>): { total: number; items: CategoryRow[]; groups: GroupRow[] } {
    const total = rows.reduce((s, r) => s + r.value, 0);
    const by = new Map<string | null, CategoryRow>();
    for (const r of rows) {
        const key = r.categoryId;
        const info = key ? cats.get(key) : undefined;
        const cur = by.get(key) ?? { id: key, label: info?.label ?? "Kalemsiz", group: info ? (info.parentName ?? info.name) : "Kalemsiz", groupId: info ? (info.parentId ?? info.id) : null, amount: 0, count: 0, share: 0 };
        cur.amount += r.value; cur.count++;
        by.set(key, cur);
    }
    const items = [...by.values()].map(i => ({ ...i, amount: r2(i.amount), share: total ? (i.amount / total) * 100 : 0 })).sort((a, b) => b.amount - a.amount);
    const groups = new Map<string, GroupRow>();
    for (const i of items) {
        const g = groups.get(i.group) ?? { group: i.group, groupId: i.groupId, amount: 0, share: 0, items: [] };
        g.amount += i.amount; g.items.push(i);
        groups.set(i.group, g);
    }
    return { total: r2(total), items, groups: [...groups.values()].map(g => ({ ...g, amount: r2(g.amount), share: total ? (g.amount / total) * 100 : 0 })).sort((a, b) => b.amount - a.amount) };
}

export async function incomeStatement(ledgerId: string, o: ReportOpts) {
    const [rows, cats] = await Promise.all([loadRows(ledgerId, o), loadCategoryInfo(ledgerId)]);
    const bounds = rows.length ? [new Date(Math.min(...rows.map(r => r.eff.getTime()))), new Date(Math.max(...rows.map(r => r.eff.getTime())))] : [o.from, o.from];
    const months = monthRange(o.from > bounds[0] ? o.from : bounds[0], o.to < bounds[1] ? o.to : bounds[1]);
    const series: MonthRow[] = months.map(m => ({ month: m, income: 0, expense: 0, net: 0 }));
    const idx = new Map(series.map(s => [s.month, s]));
    for (const r of rows) {
        const s = idx.get(monthKey(r.eff));
        if (!s) continue;
        if (r.type === "INCOME") s.income += r.value; else s.expense += r.value;
    }
    for (const s of series) { s.income = r2(s.income); s.expense = r2(s.expense); s.net = r2(s.income - s.expense); }
    const income = rows.filter(r => r.type === "INCOME"), expense = rows.filter(r => r.type === "EXPENSE");
    const inc = breakdown(income, cats), exp = breakdown(expense, cats);
    return { series, income: inc, expense: exp, net: r2(inc.total - exp.total), margin: inc.total ? ((inc.total - exp.total) / inc.total) * 100 : null };
}

export interface ProjectRow {
    id: string; code: string | null; name: string; status: string; client: string | null;
    contract: number | null; income: number; collected: number; receivable: number; expense: number; paid: number; payable: number;
    budget: number; margin: number; marginPct: number | null; budgetUsedPct: number | null; contractLeft: number | null;
}

/** Projelerin gelir / gider / kâr özeti (tahakkuk, KDV hariç, tüm zamanlar) */
export async function projectsOverview(ledgerId: string): Promise<ProjectRow[]> {
    const [projects, txs] = await Promise.all([
        prisma.finProject.findMany({ where: { ledgerId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { client: { select: { name: true } }, budgetLines: { select: { amountTL: true } } } }),
        prisma.finTransaction.findMany({
            where: { ledgerId, projectId: { not: null }, type: { in: ["INCOME", "EXPENSE"] } },
            select: { projectId: true, type: true, status: true, amountTRY: true, fxRate: true, vatAmount: true },
        }),
    ]);
    const sums = new Map<string, { inc: number; incDone: number; exp: number; expDone: number }>();
    for (const t of txs) {
        const net = t.amountTRY - t.vatAmount * t.fxRate;
        const s = sums.get(t.projectId!) ?? { inc: 0, incDone: 0, exp: 0, expDone: 0 };
        if (t.type === "INCOME") { s.inc += net; if (t.status === "DONE") s.incDone += net; }
        else { s.exp += net; if (t.status === "DONE") s.expDone += net; }
        sums.set(t.projectId!, s);
    }
    return projects.map(p => {
        const s = sums.get(p.id) ?? { inc: 0, incDone: 0, exp: 0, expDone: 0 };
        const budget = p.budgetLines.reduce((a, b) => a + b.amountTL, 0);
        return {
            id: p.id, code: p.code, name: p.name, status: p.status, client: p.client?.name ?? null, contract: p.contractAmount,
            income: r2(s.inc), collected: r2(s.incDone), receivable: r2(s.inc - s.incDone),
            expense: r2(s.exp), paid: r2(s.expDone), payable: r2(s.exp - s.expDone),
            budget: r2(budget), margin: r2(s.inc - s.exp), marginPct: s.inc ? ((s.inc - s.exp) / s.inc) * 100 : null,
            budgetUsedPct: budget ? (s.exp / budget) * 100 : null,
            contractLeft: p.contractAmount != null ? r2(p.contractAmount - s.inc) : null,
        };
    });
}

export interface BudgetCompareRow { categoryId: string | null; label: string; group: string; budget: number; actual: number; diff: number; usedPct: number | null }

/** Tek proje: kalem bazında bütçe ↔ gerçekleşen gider (tahakkuk, KDV hariç) */
export async function projectCosts(ledgerId: string, projectId: string) {
    const [rows, cats, lines] = await Promise.all([
        loadRows(ledgerId, { from: new Date(Date.UTC(2000, 0, 1, 12)), to: new Date(Date.UTC(2100, 0, 1, 12)), basis: "tahakkuk", vat: "haric", projectId }),
        loadCategoryInfo(ledgerId),
        prisma.finBudgetLine.findMany({ where: { projectId }, select: { categoryId: true, amountTL: true } }),
    ]);
    const expense = rows.filter(r => r.type === "EXPENSE");
    const actual = new Map<string | null, number>();
    for (const r of expense) actual.set(r.categoryId, (actual.get(r.categoryId) ?? 0) + r.value);
    const budget = new Map(lines.map(l => [l.categoryId as string | null, l.amountTL]));
    const keys = new Set<string | null>([...actual.keys(), ...budget.keys()]);
    const compare: BudgetCompareRow[] = [...keys].map(k => {
        const info = k ? cats.get(k) : undefined;
        const b = budget.get(k) ?? 0, a = r2(actual.get(k) ?? 0);
        return { categoryId: k, label: info?.label ?? "Kalemsiz", group: info ? (info.parentName ?? info.name) : "Kalemsiz", budget: b, actual: a, diff: r2(b - a), usedPct: b ? (a / b) * 100 : null };
    }).sort((x, y) => y.actual - x.actual || y.budget - x.budget);
    const bd = breakdown(expense, cats);
    const monthly = new Map<string, number>();
    for (const r of expense) monthly.set(monthKey(r.eff), (monthly.get(monthKey(r.eff)) ?? 0) + r.value);
    return {
        compare, groups: bd.groups, totalExpense: bd.total, totalBudget: r2([...budget.values()].reduce((s, v) => s + v, 0)),
        monthly: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount: r2(amount) })),
    };
}

export interface AgingRow { contactId: string | null; name: string; notDue: number; d30: number; d60: number; d90: number; d90p: number; total: number }

/** Yaşlandırma: vadeli (açık) alacak ve borçlar, gecikme gününe göre. direction: INCOME = alacak, EXPENSE = borç */
export async function aging(ledgerId: string, direction: "INCOME" | "EXPENSE"): Promise<AgingRow[]> {
    const now = today();
    const txs = await prisma.finTransaction.findMany({
        where: { ledgerId, status: "PLANNED", type: direction },
        select: { date: true, amountTRY: true, contact: { select: { id: true, name: true } } },
    });
    const by = new Map<string | null, AgingRow>();
    for (const t of txs) {
        const key = t.contact?.id ?? null;
        const row = by.get(key) ?? { contactId: key, name: t.contact?.name ?? "Cari belirtilmemiş", notDue: 0, d30: 0, d60: 0, d90: 0, d90p: 0, total: 0 };
        const late = diffDays(t.date, now);
        if (late <= 0) row.notDue += t.amountTRY; else if (late <= 30) row.d30 += t.amountTRY; else if (late <= 60) row.d60 += t.amountTRY; else if (late <= 90) row.d90 += t.amountTRY; else row.d90p += t.amountTRY;
        row.total += t.amountTRY;
        by.set(key, row);
    }
    return [...by.values()].map(r => ({ ...r, notDue: r2(r.notDue), d30: r2(r.d30), d60: r2(r.d60), d90: r2(r.d90), d90p: r2(r.d90p), total: r2(r.total) })).sort((a, b) => b.total - a.total);
}

export interface VatMonth { month: string; collected: number; deductible: number; payable: number; withholding: number }

/** KDV özeti: hesaplanan (gelir faturaları) − indirilecek (gider faturaları); belge tarihine göre, vadeliler dahil */
export async function vatSummary(ledgerId: string, from: Date, to: Date): Promise<{ months: VatMonth[]; total: VatMonth }> {
    const rows = await loadRows(ledgerId, { from, to, basis: "tahakkuk", vat: "dahil" });
    const months = new Map<string, VatMonth>();
    for (const r of rows) {
        if (!r.vat && !r.withholding) continue;
        const key = monthKey(r.eff);
        const m = months.get(key) ?? { month: key, collected: 0, deductible: 0, payable: 0, withholding: 0 };
        if (r.type === "INCOME") m.collected += r.vat; else m.deductible += r.vat;
        m.withholding += r.withholding;
        months.set(key, m);
    }
    const list = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map(m => ({ ...m, collected: r2(m.collected), deductible: r2(m.deductible), withholding: r2(m.withholding), payable: r2(m.collected - m.deductible) }));
    const total = list.reduce((s, m) => ({ month: "Toplam", collected: s.collected + m.collected, deductible: s.deductible + m.deductible, payable: s.payable + m.payable, withholding: s.withholding + m.withholding }), { month: "Toplam", collected: 0, deductible: 0, payable: 0, withholding: 0 });
    return { months: list, total: { ...total, collected: r2(total.collected), deductible: r2(total.deductible), payable: r2(total.payable), withholding: r2(total.withholding) } };
}

export interface ContactSpend { contactId: string | null; name: string; amount: number; count: number }

/** Cariye göre harcama / gelir (en büyükten) */
export async function byContact(ledgerId: string, o: ReportOpts, type: "INCOME" | "EXPENSE", limit = 15): Promise<ContactSpend[]> {
    const [rows, contacts] = await Promise.all([loadRows(ledgerId, o), prisma.finContact.findMany({ where: { ledgerId }, select: { id: true, name: true } })]);
    const names = new Map(contacts.map(c => [c.id, c.name]));
    const by = new Map<string | null, ContactSpend>();
    for (const r of rows.filter(r => r.type === type)) {
        const cur = by.get(r.contactId) ?? { contactId: r.contactId, name: r.contactId ? names.get(r.contactId) ?? "Silinmiş cari" : "Cari belirtilmemiş", amount: 0, count: 0 };
        cur.amount += r.value; cur.count++;
        by.set(r.contactId, cur);
    }
    return [...by.values()].map(c => ({ ...c, amount: r2(c.amount) })).sort((a, b) => b.amount - a.amount).slice(0, limit);
}
