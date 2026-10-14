/** Alacaklar: işlerden toplam alınacak, plana girilmiş (vadeli) tahsilatlar ay ay ve plana girilmemiş kısım. */
import { prisma } from "@/lib/prisma";
import { r2 } from "./money";
import { today } from "./dates";

export interface ReceivableItem { id: string; date: string; title: string; project: string | null; contact: string | null; amount: number }
export interface ReceivableMonth { key: string; label: string; late: boolean; total: number; items: ReceivableItem[] }
export interface ReceivablesReport {
    agreed: number; received: number; remaining: number; planned: number; unplanned: number; overdue: number; thisMonth: number;
    months: ReceivableMonth[];
    projects: { id: string; name: string; client: string | null; agreed: number; received: number; remaining: number; planned: number; unplanned: number }[];
}

export async function receivablesReport(ledgerId: string): Promise<ReceivablesReport> {
    const [projects, txs] = await Promise.all([
        prisma.finProject.findMany({ where: { ledgerId, status: { notIn: ["CANCELLED", "LEAD"] } }, select: { id: true, name: true, contractAmount: true, client: { select: { name: true } }, extras: { select: { amount: true } } } }),
        prisma.finTransaction.findMany({
            where: { ledgerId, OR: [{ type: "INCOME" }, { type: "EXPENSE", rebillAmount: { gt: 0 } }] },
            select: { id: true, type: true, status: true, date: true, title: true, amountTRY: true, fxRate: true, rebillAmount: true, projectId: true, contact: { select: { name: true } }, project: { select: { name: true } } },
            orderBy: { date: "asc" },
        }),
    ]);
    const per = new Map(projects.map(p => [p.id, { id: p.id, name: p.name, client: p.client?.name ?? null, agreed: (p.contractAmount ?? 0) + p.extras.reduce((s, e) => s + e.amount, 0), received: 0, planned: 0 }]));
    const now = today();
    const nowKey = now.toISOString().slice(0, 7);
    const mm = new Map<string, ReceivableMonth>();
    let overdue = 0, thisMonth = 0;
    for (const t of txs) {
        const p = t.projectId ? per.get(t.projectId) : undefined;
        if (t.type === "EXPENSE") { if (p) p.agreed += t.rebillAmount ?? 0; continue; }
        if (t.status === "DONE") { if (p) p.received += t.amountTRY; continue; }
        if (t.status !== "PLANNED") continue;
        if (p) p.planned += t.amountTRY;
        const real = t.date.toISOString().slice(0, 7);
        const late = real < nowKey;
        const key = late ? "gecikmis" : real;
        const m = mm.get(key) ?? { key, label: key, late, total: 0, items: [] };
        m.total += t.amountTRY;
        m.items.push({ id: t.id, date: t.date.toISOString().slice(0, 10), title: t.title, project: t.project?.name ?? null, contact: t.contact?.name ?? null, amount: r2(t.amountTRY) });
        mm.set(key, m);
        if (late) overdue += t.amountTRY; else if (real === nowKey) thisMonth += t.amountTRY;
    }
    const rows = [...per.values()].map(p => {
        const remaining = Math.max(0, p.agreed - p.received);
        return { id: p.id, name: p.name, client: p.client, agreed: r2(p.agreed), received: r2(p.received), remaining: r2(remaining), planned: r2(p.planned), unplanned: r2(Math.max(0, remaining - p.planned)) };
    }).filter(p => p.remaining > 0 || p.planned > 0).sort((a, b) => b.remaining - a.remaining);
    const months = [...mm.values()].map(m => ({ ...m, total: r2(m.total) })).sort((a, b) => (a.late ? "" : a.key).localeCompare(b.late ? "" : b.key));
    return {
        agreed: r2(rows.reduce((s, p) => s + p.agreed, 0)), received: r2(rows.reduce((s, p) => s + p.received, 0)),
        remaining: r2(rows.reduce((s, p) => s + p.remaining, 0)), planned: r2(rows.reduce((s, p) => s + p.planned, 0)), unplanned: r2(rows.reduce((s, p) => s + p.unplanned, 0)),
        overdue: r2(overdue), thisMonth: r2(thisMonth), months, projects: rows,
    };
}
