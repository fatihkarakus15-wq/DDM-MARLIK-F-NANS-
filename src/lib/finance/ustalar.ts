/** Ustalar: Excel defterlerindeki (PDF) ustaların adları, harcama başlığından usta eşleme ve usta başına ödenen / bekleyen hakediş. */
import { prisma } from "@/lib/prisma";
import { r2 } from "./money";

/** Görünen ad → defterlerde geçen yazımlar (küçük harf, Türkçe) */
export const USTALAR: { name: string; aliases: string[] }[] = [
    { name: "Hayrettin abi", aliases: ["hayrettin abi", "hayrettin"] },
    { name: "Atilla abi", aliases: ["atilla abi", "atilla"] },
    { name: "Emrah", aliases: ["emrah"] },
    { name: "Raşit abi", aliases: ["raşit abi"] },
    { name: "Kadir abi", aliases: ["kadir abi"] },
    { name: "Hasan abi", aliases: ["hasan abi"] },
    { name: "Mahmut abi", aliases: ["mahmut abi"] },
    { name: "Erdem", aliases: ["erdem"] },
    { name: "Mehmet usta (boya)", aliases: ["mehmet usta boya", "mehmet usta", "mehmet boya"] },
    { name: "Deniz (boya)", aliases: ["deniz boya", "deniz"] },
    { name: "Kenan usta", aliases: ["kenan usta", "kenan abi", "kenan"] },
    { name: "İbrahim", aliases: ["ibrahim", "i̇brahim"] },
    { name: "Ercan", aliases: ["ercan"] },
    { name: "Boran", aliases: ["boran"] },
    { name: "Ali Gündüz", aliases: ["ali gündüz"] },
    { name: "Selami", aliases: ["selami"] },
    { name: "İdris", aliases: ["idris", "i̇dris"] },
    { name: "İzzet", aliases: ["izzet", "i̇zzet"] },
    { name: "Eyüp usta", aliases: ["eyüp usta", "eyüp"] },
    { name: "Yasir", aliases: ["yasir"] },
];

const key = (v: string) => v.toLocaleLowerCase("tr").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
const BY_ALIAS = new Map(USTALAR.flatMap(u => u.aliases.map(a => [key(a), u.name] as const)));
/** Harcama başlığından usta adı (yoksa null) */
export const ustaOf = (title: string) => BY_ALIAS.get(key(title)) ?? null;

/** Ustaları cari olarak ekler (yoksa) ve usta adıyla yazılmış, cariye bağlanmamış harcamaları bağlar. */
export async function syncUstalar(ledgerId: string) {
    const existing = await prisma.finContact.findMany({ where: { ledgerId }, select: { id: true, name: true, kind: true } });
    const idOf = new Map<string, string>();
    let created = 0;
    for (const u of USTALAR) {
        let c = existing.find(e => key(e.name) === key(u.name));
        if (!c) { c = await prisma.finContact.create({ data: { ledgerId, name: u.name, kind: "SUBCONTRACTOR" }, select: { id: true, name: true, kind: true } }); created++; }
        idOf.set(u.name, c.id);
    }
    const txs = await prisma.finTransaction.findMany({ where: { ledgerId, type: "EXPENSE", contactId: null, projectId: { not: null } }, select: { id: true, title: true } });
    const groups = new Map<string, string[]>();
    for (const t of txs) { const n = ustaOf(t.title); if (n) groups.set(n, [...(groups.get(n) ?? []), t.id]); }
    let linked = 0;
    for (const [n, ids] of groups) { linked += (await prisma.finTransaction.updateMany({ where: { id: { in: ids } }, data: { contactId: idOf.get(n)! } })).count; }
    return { created, linked };
}

export interface UstaRow {
    id: string; name: string; phone: string | null; isActive: boolean; paid: number; pending: number; total: number; count: number;
    projects: { id: string; name: string; paid: number; pending: number; items: { id: string; date: string; title: string; amount: number; status: string }[] }[];
}

/** Usta başına: ödenen (gerçekleşen gider), bekleyen hakediş (vadeli gider), işlere göre kırılım */
export async function ustaReport(ledgerId: string): Promise<UstaRow[]> {
    const contacts = await prisma.finContact.findMany({ where: { ledgerId, kind: "SUBCONTRACTOR" }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, isActive: true } });
    const txs = await prisma.finTransaction.findMany({
        where: { ledgerId, type: "EXPENSE", contactId: { in: contacts.map(c => c.id) } }, orderBy: { date: "asc" },
        select: { id: true, contactId: true, status: true, date: true, title: true, amountTRY: true, projectId: true, project: { select: { name: true } } },
    });
    return contacts.map(c => {
        const mine = txs.filter(t => t.contactId === c.id);
        const pm = new Map<string, UstaRow["projects"][number]>();
        for (const t of mine) {
            const k = t.projectId ?? "-";
            const p = pm.get(k) ?? { id: k, name: t.project?.name ?? "Projesiz", paid: 0, pending: 0, items: [] };
            if (t.status === "DONE") p.paid += t.amountTRY; else p.pending += t.amountTRY;
            p.items.push({ id: t.id, date: t.date.toISOString().slice(0, 10), title: t.title, amount: r2(t.amountTRY), status: t.status });
            pm.set(k, p);
        }
        const projects = [...pm.values()].map(p => ({ ...p, paid: r2(p.paid), pending: r2(p.pending) })).sort((a, b) => b.paid + b.pending - (a.paid + a.pending));
        const paid = r2(projects.reduce((s, p) => s + p.paid, 0)), pending = r2(projects.reduce((s, p) => s + p.pending, 0));
        return { ...c, paid, pending, total: r2(paid + pending), count: mine.length, projects };
    }).sort((a, b) => b.total - a.total);
}
