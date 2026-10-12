/** Hareket formu ve süzgeçler için seçenek listeleri */
import { prisma } from "@/lib/prisma";
import { categoryOptions } from "./ledger";
import type { RateMap } from "./rates";

export async function formOptions(ledgerId: string, rates: RateMap) {
    const [accounts, categories, projects, contacts] = await Promise.all([
        prisma.finAccount.findMany({ where: { ledgerId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, currency: true, kind: true } }),
        categoryOptions(ledgerId),
        prisma.finProject.findMany({ where: { ledgerId, status: { not: "CANCELLED" } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], select: { id: true, code: true, name: true } }),
        prisma.finContact.findMany({ where: { ledgerId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    return {
        accounts: accounts.map(a => ({ id: a.id, label: a.name, currency: a.currency, kind: a.kind })),
        categories: categories.map(c => ({ id: c.id, label: c.label, kind: c.kind })),
        projects: projects.map(p => ({ id: p.id, label: `${p.code ? `${p.code} · ` : ""}${p.name}` })),
        contacts: contacts.map(c => ({ id: c.id, label: c.name })),
        rates: Object.fromEntries(Object.values(rates).filter(r => ["USD", "EUR", "GBP"].includes(r.code)).map(r => [r.code, r.buy])) as Record<string, number>,
    };
}
export type FormOptions = Awaited<ReturnType<typeof formOptions>>;
