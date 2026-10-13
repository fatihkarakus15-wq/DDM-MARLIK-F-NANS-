/** Hareket formu ve süzgeçler için seçenek listeleri */
import { prisma } from "@/lib/prisma";
import { categoryOptions } from "./ledger";
import type { RateMap } from "./rates";

/** Kullanıcının görünen adı: ad soyad, yoksa e-postanın başı */
export const personName = (u: { name: string | null; email: string }) => u.name?.trim() || (u.email.split("@")[0].charAt(0).toLocaleUpperCase("tr") + u.email.split("@")[0].slice(1));

export async function formOptions(ledgerId: string, rates: RateMap) {
    const [accounts, categories, projects, contacts, users] = await Promise.all([
        prisma.finAccount.findMany({ where: { ledgerId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, currency: true, kind: true } }),
        categoryOptions(ledgerId),
        prisma.finProject.findMany({ where: { ledgerId, status: { not: "CANCELLED" } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], select: { id: true, code: true, name: true } }),
        prisma.finContact.findMany({ where: { ledgerId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        prisma.appUser.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true } }),
    ]);
    return {
        accounts: accounts.map(a => ({ id: a.id, label: a.name, currency: a.currency, kind: a.kind })),
        categories: categories.map(c => ({ id: c.id, label: c.label, kind: c.kind })),
        projects: projects.map(p => ({ id: p.id, label: `${p.code ? `${p.code} · ` : ""}${p.name}` })),
        contacts: contacts.map(c => ({ id: c.id, label: c.name })),
        people: users.map(u => ({ id: u.id, label: personName(u) })),
        rates: Object.fromEntries(Object.values(rates).filter(r => ["USD", "EUR", "GBP"].includes(r.code)).map(r => [r.code, r.buy])) as Record<string, number>,
    };
}
export type FormOptions = Awaited<ReturnType<typeof formOptions>>;
