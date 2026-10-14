/** Hazır geçmiş iş paketini deftere yazar: proje (müşteri cariyle), ilave işler, tahsilatlar, harcamalar. Tek işlemde; aynı adlı proje varsa eklemez. */
import { prisma } from "@/lib/prisma";
import { FormError } from "@/lib/form";
import { parseDay } from "./dates";
import { r2 } from "./money";
import type { LegacyProject } from "./legacy-imports";
import { ustaOf } from "./ustalar";

const norm = (v: string) => v.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();

export async function importLegacyProject(ledgerId: string, p: LegacyProject) {
    if (await prisma.finProject.findFirst({ where: { ledgerId, name: { equals: p.name, mode: "insensitive" } }, select: { id: true } })) throw new FormError(`“${p.name}” projesi zaten var; tekrar eklenmedi.`);
    const [cats, users] = await Promise.all([
        prisma.finCategory.findMany({ where: { ledgerId, kind: "EXPENSE" }, select: { id: true, name: true } }),
        prisma.appUser.findMany({ select: { id: true, name: true, email: true } }),
    ]);
    const catId = (name?: string) => (name ? cats.find(c => norm(c.name) === norm(name))?.id ?? null : null);
    const userId = (who?: string) => (who ? users.find(u => norm(`${u.name ?? ""} ${u.email}`).includes(norm(who)))?.id ?? null : null);
    const day = (s: string) => { const d = parseDay(s); if (!d) throw new FormError(`Tarih geçersiz: ${s}`); return d; };

    const missingCats = [...new Set(p.expenses.map(e => e.category).filter((c): c is string => !!c && !catId(c)))];
    const missingUsers = [...new Set(p.expenses.map(e => e.spender).filter((w): w is "Fatih" | "Semih" => !!w && !userId(w)))];

    const result = await prisma.$transaction(async tx => {
        const contact = (await tx.finContact.findFirst({ where: { ledgerId, name: { equals: p.client, mode: "insensitive" } }, select: { id: true } }))
            ?? (await tx.finContact.create({ data: { ledgerId, name: p.client, kind: "CUSTOMER" }, select: { id: true } }));
        const ustaIds = new Map<string, string>();
        for (const n of new Set(p.expenses.map(e => ustaOf(e.title)).filter((x): x is string => !!x))) {
            const c = (await tx.finContact.findFirst({ where: { ledgerId, name: { equals: n, mode: "insensitive" } }, select: { id: true } }))
                ?? (await tx.finContact.create({ data: { ledgerId, name: n, kind: "SUBCONTRACTOR" }, select: { id: true } }));
            ustaIds.set(n, c.id);
        }
        const project = await tx.finProject.create({
            data: { ledgerId, name: p.name, clientId: contact.id, status: p.status, contractAmount: p.contractAmount, startDate: p.startDate ? day(p.startDate) : null, endDate: p.endDate ? day(p.endDate) : null, stage: p.stage ?? null, note: p.note ?? null },
            select: { id: true },
        });
        await tx.finProjectExtra.createMany({ data: p.extras.map(e => ({ projectId: project.id, title: e.title, amount: e.amount, date: day(p.endDate ?? p.defaultDate) })) });
        const base = { ledgerId, status: "DONE" as const, currency: "TRY", fxRate: 1, vatAmount: 0, withholdingAmount: 0, projectId: project.id, createdBy: "Excel aktarımı" };
        await tx.finTransaction.createMany({ data: p.collections.map(c => ({ ...base, type: "INCOME" as const, date: day(c.date), title: c.title, amount: c.amount, amountTRY: c.amount, contactId: contact.id })) });
        await tx.finTransaction.createMany({
            data: p.expenses.map(e => ({
                ...base, type: "EXPENSE" as const, date: day(e.date ?? p.defaultDate), title: e.title, amount: e.amount, amountTRY: e.amount,
                categoryId: catId(e.category), spenderId: userId(e.spender), contactId: ustaIds.get(ustaOf(e.title) ?? "") ?? null,
            })),
        });
        return project.id;
    }, { timeout: 60_000 });

    const spent = r2(p.expenses.reduce((a, e) => a + e.amount, 0));
    return { projectId: result, expenses: p.expenses.length, spent, collected: r2(p.collections.reduce((a, c) => a + c.amount, 0)), missingCats, missingUsers };
}
