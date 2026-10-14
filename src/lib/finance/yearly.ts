/** Yıllık özet: bir yılda (ya da tüm zamanlarda) gelir, gider, ofis giderleri, işlere göre kâr. Hesapsız (geçmiş) kayıtlar dahil, KDV'siz değil: girilen tutarlarla. */
import { prisma } from "@/lib/prisma";
import { r2 } from "./money";

export interface YearlyProject { id: string; name: string; status: string; agreed: number; collected: number; expense: number; profit: number; cashProfit: number; receivable: number; contract: number; extras: { title: string; amount: number }[]; collections: { date: string; amount: number }[]; spend: { label: string; amount: number }[] }
export interface YearlyReport {
    years: number[]; year: number | null; people: number;
    income: number; projectExpense: number; officeExpense: number; net: number;
    agreed: number; collected: number; receivable: number; projectProfit: number;
    monthly: { month: string; income: number; expense: number }[];
    office: { label: string; amount: number }[];
    projects: YearlyProject[];
    incomeDetail: { id: string | null; name: string; status: string | null; total: number; items: { date: string; title: string; amount: number }[] }[];
}

export async function yearlyReport(ledgerId: string, year: number | null): Promise<YearlyReport> {
    const [projects, txs, users] = await Promise.all([
        prisma.finProject.findMany({ where: { ledgerId, status: { not: "CANCELLED" } }, select: { id: true, name: true, status: true, contractAmount: true, startDate: true, createdAt: true, extras: { select: { title: true, amount: true } } } }),
        prisma.finTransaction.findMany({
            where: { ledgerId, status: "DONE", type: { in: ["INCOME", "EXPENSE"] } },
            select: { type: true, date: true, amountTRY: true, projectId: true, title: true, category: { select: { name: true, parent: { select: { name: true } } } } },
        }),
        prisma.appUser.count(),
    ]);
    const thisYear = new Date().getUTCFullYear();
    const years = [...new Set([thisYear, ...txs.map(t => t.date.getUTCFullYear())])].sort((a, b) => b - a);
    const inYear = (d: Date) => year == null || d.getUTCFullYear() === year;
    const sel = txs.filter(t => inYear(t.date));

    const sum = (f: (t: (typeof txs)[number]) => boolean) => r2(sel.filter(f).reduce((s, t) => s + t.amountTRY, 0));
    const income = sum(t => t.type === "INCOME");
    const projectExpense = sum(t => t.type === "EXPENSE" && !!t.projectId);
    const officeExpense = sum(t => t.type === "EXPENSE" && !t.projectId);

    const mm = new Map<string, { income: number; expense: number }>();
    for (const t of sel) {
        const k = t.date.toISOString().slice(0, 7);
        const m = mm.get(k) ?? { income: 0, expense: 0 };
        if (t.type === "INCOME") m.income += t.amountTRY; else m.expense += t.amountTRY;
        mm.set(k, m);
    }
    if (year != null) for (let i = 1; i <= 12; i++) { const k = `${year}-${String(i).padStart(2, "0")}`; if (!mm.has(k)) mm.set(k, { income: 0, expense: 0 }); }
    const monthly = [...mm.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, income: r2(v.income), expense: r2(v.expense) }));

    const off = new Map<string, number>();
    for (const t of sel) if (t.type === "EXPENSE" && !t.projectId) {
        const label = t.category?.parent?.name ?? t.category?.name ?? "Kalemsiz";
        off.set(label, (off.get(label) ?? 0) + t.amountTRY);
    }
    const office = [...off.entries()].map(([label, amount]) => ({ label, amount: r2(amount) })).sort((a, b) => b.amount - a.amount);

    // İşlere göre (ömür boyu rakamlar; yıl seçiliyse o yılda hareketi olan işler)
    const life = new Map<string, { collected: number; expense: number; inYear: boolean }>();
    for (const t of txs) {
        if (!t.projectId) continue;
        const l = life.get(t.projectId) ?? { collected: 0, expense: 0, inYear: false };
        if (t.type === "INCOME") l.collected += t.amountTRY; else l.expense += t.amountTRY;
        if (inYear(t.date)) l.inYear = true;
        life.set(t.projectId, l);
    }
    const rows: YearlyProject[] = projects.flatMap(p => {
        const l = life.get(p.id) ?? { collected: 0, expense: 0, inYear: false };
        // Hareketi olmasa da: devam eden iş, başladığı yıldan itibaren; yeni eklenen iş hemen görünür
        const startYear = (p.startDate ?? p.createdAt).getUTCFullYear();
        const ongoing = p.status !== "DONE" && (year == null || year >= startYear);
        const started = year == null || startYear === year;
        if (!l.inYear && (p.status === "LEAD" || (!ongoing && !started))) return [];
        const agreed = (p.contractAmount ?? 0) + p.extras.reduce((s, e) => s + e.amount, 0);
        const base = agreed > 0 ? agreed : l.collected;
        const mine = txs.filter(t => t.projectId === p.id);
        const sp = new Map<string, number>();
        for (const t of mine) if (t.type === "EXPENSE") { const k = t.category?.name ?? "Kalemsiz"; sp.set(k, (sp.get(k) ?? 0) + t.amountTRY); }
        const detail = {
            contract: r2(p.contractAmount ?? 0), extras: p.extras.map(e => ({ title: e.title, amount: r2(e.amount) })),
            collections: mine.filter(t => t.type === "INCOME").sort((a, b) => a.date.getTime() - b.date.getTime()).map(t => ({ date: t.date.toISOString().slice(0, 10), amount: r2(t.amountTRY) })),
            spend: [...sp.entries()].map(([label, amount]) => ({ label, amount: r2(amount) })).sort((a, b) => b.amount - a.amount),
        };
        return [{ ...detail, id: p.id, name: p.name, status: p.status, agreed: r2(agreed), collected: r2(l.collected), expense: r2(l.expense), profit: r2(base - l.expense), cashProfit: r2(l.collected - l.expense), receivable: r2(Math.max(0, agreed - l.collected)) }];
    }).sort((a, b) => b.profit - a.profit);

    // Kazanç (tahsilat) detayı: seçili dönemdeki gelirler işe göre, tek tek
    const inc = new Map<string, { id: string | null; name: string; status: string | null; total: number; items: { date: string; title: string; amount: number }[] }>();
    for (const t of sel.filter(t => t.type === "INCOME").sort((a, b) => a.date.getTime() - b.date.getTime())) {
        const pr = t.projectId ? projects.find(p => p.id === t.projectId) : null;
        const k = t.projectId ?? "-";
        const g = inc.get(k) ?? { id: pr?.id ?? null, name: pr?.name ?? "İş dışı gelirler", status: pr?.status ?? null, total: 0, items: [] };
        g.total += t.amountTRY; g.items.push({ date: t.date.toISOString().slice(0, 10), title: t.title, amount: r2(t.amountTRY) });
        inc.set(k, g);
    }
    const incomeDetail = [...inc.values()].map(g => ({ ...g, total: r2(g.total) })).sort((a, b) => b.total - a.total);

    return {
        incomeDetail, years, year, people: Math.max(1, users), income, projectExpense, officeExpense, net: r2(income - projectExpense - officeExpense),
        agreed: r2(rows.reduce((s, r) => s + r.agreed, 0)), collected: r2(rows.reduce((s, r) => s + r.collected, 0)), receivable: r2(rows.reduce((s, r) => s + r.receivable, 0)),
        projectProfit: r2(rows.reduce((s, r) => s + r.profit, 0)), monthly, office, projects: rows,
    };
}
