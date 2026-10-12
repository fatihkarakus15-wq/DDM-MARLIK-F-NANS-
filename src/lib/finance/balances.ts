/**
 * Hesap ve cari bakiyeleri.
 * Hesap bakiyesi = açılış + açılış tarihinden sonraki GERÇEKLEŞEN hareketler (gelir +, gider −, virman çıkış −/giriş +).
 * Cari bakiyesi = açılış + AÇIK (vadeli) hareketler: alacak (gelir) +, borç (gider) −; ödenince cariden düşer.
 */
import type { FinAccountKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { r2 } from "./money";
import { diffDays, today } from "./dates";
import { toTRY, type RateMap } from "./rates";

export interface AccountRow {
    id: string; name: string; kind: FinAccountKind; currency: string; bankName: string | null; iban: string | null;
    openingBalance: number; openingDate: Date; creditLimit: number | null; statementDay: number | null; dueDay: number | null;
    isActive: boolean; note: string | null;
    balance: number; balanceTRY: number | null; txCount: number; ignored: number;
}

export async function accountBalances(ledgerId: string, rates: RateMap, { inactive = false } = {}): Promise<AccountRow[]> {
    const accounts = await prisma.finAccount.findMany({ where: { ledgerId, ...(inactive ? {} : { isActive: true }) }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const ids = accounts.map(a => a.id);
    const txs = ids.length
        ? await prisma.finTransaction.findMany({
            where: { ledgerId, status: "DONE", OR: [{ accountId: { in: ids } }, { toAccountId: { in: ids } }] },
            select: { type: true, amount: true, toAmount: true, accountId: true, toAccountId: true, date: true },
        })
        : [];
    return accounts.map(a => {
        let balance = a.openingBalance, count = 0, ignored = 0;
        for (const t of txs) {
            const out = t.accountId === a.id, into = t.toAccountId === a.id;
            if (!out && !into) continue;
            if (t.date < a.openingDate) { ignored++; continue; }
            count++;
            if (t.type === "TRANSFER") { if (out) balance -= t.amount; if (into) balance += t.toAmount ?? t.amount; }
            else if (out) balance += t.type === "INCOME" ? t.amount : -t.amount;
        }
        balance = r2(balance);
        return { ...a, balance, balanceTRY: toTRY(balance, a.currency, rates), txCount: count, ignored };
    });
}

export interface CashTotals {
    cash: number; // BANK + CASH + POS (TL karşılığı)
    cardDebt: number; // Kredi kartı borcu (pozitif sayı)
    other: number;
    missingRate: string[]; // Kuru olmayan para birimleri
}

export function cashTotals(accounts: AccountRow[]): CashTotals {
    const t: CashTotals = { cash: 0, cardDebt: 0, other: 0, missingRate: [] };
    for (const a of accounts) {
        if (a.balanceTRY == null) { if (a.balance !== 0 && !t.missingRate.includes(a.currency)) t.missingRate.push(a.currency); continue; }
        if (a.kind === "CREDIT_CARD") t.cardDebt += Math.max(0, -a.balanceTRY);
        else if (a.kind === "OTHER") t.other += a.balanceTRY;
        else t.cash += a.balanceTRY;
    }
    return { ...t, cash: r2(t.cash), cardDebt: r2(t.cardDebt), other: r2(t.other) };
}

export interface ContactBalance { receivable: number; payable: number; overdueReceivable: number; overduePayable: number; opening: number; net: number; openCount: number }

/** Cari başına açık alacak / borç (TL). Anahtar: contactId */
export async function contactBalances(ledgerId: string): Promise<Map<string, ContactBalance>> {
    const now = today();
    const [contacts, open] = await Promise.all([
        prisma.finContact.findMany({ where: { ledgerId }, select: { id: true, openingBalance: true } }),
        prisma.finTransaction.findMany({
            where: { ledgerId, status: "PLANNED", contactId: { not: null }, type: { in: ["INCOME", "EXPENSE"] } },
            select: { contactId: true, type: true, amountTRY: true, date: true },
        }),
    ]);
    const map = new Map<string, ContactBalance>(contacts.map(c => [c.id, { receivable: 0, payable: 0, overdueReceivable: 0, overduePayable: 0, opening: c.openingBalance, net: c.openingBalance, openCount: 0 }]));
    for (const t of open) {
        const b = map.get(t.contactId!);
        if (!b) continue;
        const late = diffDays(t.date, now) > 0;
        b.openCount++;
        if (t.type === "INCOME") { b.receivable += t.amountTRY; if (late) b.overdueReceivable += t.amountTRY; }
        else { b.payable += t.amountTRY; if (late) b.overduePayable += t.amountTRY; }
    }
    for (const b of map.values()) {
        b.receivable = r2(b.receivable); b.payable = r2(b.payable);
        b.overdueReceivable = r2(b.overdueReceivable); b.overduePayable = r2(b.overduePayable);
        b.net = r2(b.opening + b.receivable - b.payable);
    }
    return map;
}
