/** Hareket listesi süzgeci (sayfa ve CSV dışa aktarma ortak kullanır) */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseDay, periodRange } from "./dates";

export interface TxFilter {
    donem?: string; from?: string; to?: string; tur?: string; durum?: string; hesap?: string; proje?: string; kalem?: string; cari?: string; q?: string; sayfa?: string;
}
export const TX_PAGE_SIZE = 100;

export function filterRange(f: TxFilter) {
    const from = parseDay(f.from), to = parseDay(f.to);
    if (from || to) return { key: "ozel", from: from ?? new Date(Date.UTC(2000, 0, 1, 12)), to: to ?? new Date(Date.UTC(2100, 0, 1, 12)) };
    return periodRange(f.donem ?? "3ay");
}

export async function txWhere(ledgerId: string, f: TxFilter): Promise<Prisma.FinTransactionWhereInput> {
    const range = filterRange(f);
    const where: Prisma.FinTransactionWhereInput = { ledgerId, date: { gte: range.from, lte: range.to } };
    const and: Prisma.FinTransactionWhereInput[] = [];
    if (f.tur === "gelir") where.type = "INCOME";
    else if (f.tur === "gider") where.type = "EXPENSE";
    else if (f.tur === "virman") where.type = "TRANSFER";
    if (f.durum === "vadeli") where.status = "PLANNED";
    else if (f.durum === "gerceklesen") where.status = "DONE";
    if (f.hesap) and.push({ OR: [{ accountId: f.hesap }, { toAccountId: f.hesap }] });
    if (f.proje === "yok") where.projectId = null;
    else if (f.proje) where.projectId = f.proje;
    if (f.cari) where.contactId = f.cari;
    if (f.kalem) {
        const children = await prisma.finCategory.findMany({ where: { ledgerId, parentId: f.kalem }, select: { id: true } });
        where.categoryId = { in: [f.kalem, ...children.map(c => c.id)] };
    }
    const q = f.q?.trim();
    if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { docNo: { contains: q, mode: "insensitive" } }, { note: { contains: q, mode: "insensitive" } }, { contact: { name: { contains: q, mode: "insensitive" } } }] });
    if (and.length) where.AND = and;
    return where;
}
