// GET /hareketler/csv?… — süzülmüş hareketleri CSV olarak indirir (Excel için UTF-8 BOM, ayraç ;)
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFinance } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { txWhere, type TxFilter } from "@/lib/finance/tx-query";
import { categoryOptions } from "@/lib/finance/ledger";
import { TX_STATUS, TX_TYPE } from "@/lib/finance/labels";

export const dynamic = "force-dynamic";

const cell = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const num = (n: number) => String(n).replace(".", ",");
const day = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(request: NextRequest) {
    try {
        await requireFinance();
    } catch {
        return new Response("Yetkisiz", { status: 401 });
    }
    const { ledger } = await activeLedger();
    const sp = Object.fromEntries(request.nextUrl.searchParams.entries()) as TxFilter;
    const [rows, cats] = await Promise.all([
        prisma.finTransaction.findMany({
            where: await txWhere(ledger.id, sp), orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 20000,
            include: { account: { select: { name: true } }, toAccount: { select: { name: true } }, project: { select: { code: true, name: true } }, contact: { select: { name: true } } },
        }),
        categoryOptions(ledger.id),
    ]);
    const catName = new Map(cats.map(c => [c.id, c.label]));
    const head = ["Tarih", "Belge tarihi", "Tür", "Durum", "Açıklama", "Belge no", "Kalem", "Proje", "Cari", "Hesap", "Karşı hesap", "Para birimi", "Tutar", "Kur", "TL tutar", "KDV", "Stopaj", "Not"];
    const lines = [head.join(";")];
    for (const t of rows) {
        lines.push([
            day(t.date), t.docDate ? day(t.docDate) : "", TX_TYPE[t.type].label, TX_STATUS[t.status], t.title, t.docNo, t.categoryId ? catName.get(t.categoryId) : "",
            t.project ? `${t.project.code ? `${t.project.code} · ` : ""}${t.project.name}` : "", t.contact?.name, t.account?.name, t.toAccount?.name, t.currency,
            num(t.amount), num(t.fxRate), num(t.amountTRY), num(t.vatAmount), num(t.withholdingAmount), t.note,
        ].map(cell).join(";"));
    }
    return new Response("﻿" + lines.join("\r\n"), {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${ledger.slug}-hareketler-${day(new Date())}.csv"`,
            "Cache-Control": "private, no-store",
        },
    });
}
