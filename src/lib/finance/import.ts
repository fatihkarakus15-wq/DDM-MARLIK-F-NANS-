/** Banka ekstresi satırlarını hareket olarak yazar (kurallarla kalem / proje / cari atanır, tekrar yüklemede çift kayıt olmaz) */
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { FormError } from "@/lib/form";
import { assertOwned } from "./ledger";
import { matchRule, normalizeTR, type ImportLine } from "./csv";
import { r2 } from "./money";
import { loadRates, rateTRY } from "./rates";

export const IMPORT_MAX_ROWS = 3000;

export async function importLines(ledgerId: string, accountId: string, lines: ImportLine[], actor: string) {
    if (lines.length === 0) throw new FormError("İçe aktarılacak satır yok.");
    if (lines.length > IMPORT_MAX_ROWS) throw new FormError(`En fazla ${IMPORT_MAX_ROWS} satır aktarılabilir; dosyayı bölün.`);
    await assertOwned(ledgerId, { accountId });
    const account = await prisma.finAccount.findUniqueOrThrow({ where: { id: accountId }, select: { currency: true } });
    const fx = rateTRY(account.currency, await loadRates());
    if (fx == null) throw new FormError(`${account.currency} kuru yok; önce Ayarlar'dan kur girin.`);
    const [rules, categories] = await Promise.all([
        prisma.finRule.findMany({ where: { ledgerId } }),
        prisma.finCategory.findMany({ where: { ledgerId }, select: { id: true, kind: true } }),
    ]);
    const kind = new Map(categories.map(c => [c.id, c.kind]));

    const seen = new Map<string, number>();
    const data = lines.map(l => {
        const amount = r2(Math.abs(l.amount));
        const type = l.amount > 0 ? "INCOME" as const : "EXPENSE" as const;
        const base = `${l.date}:${Math.round(amount * 100)}:${createHash("sha1").update(normalizeTR(l.title)).digest("hex").slice(0, 10)}`;
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        const rule = matchRule(l.title, rules);
        const categoryId = rule?.categoryId && kind.get(rule.categoryId) === (type === "INCOME" ? "INCOME" : "EXPENSE") ? rule.categoryId : null;
        return {
            ledgerId, type, status: "DONE" as const, date: new Date(`${l.date}T12:00:00Z`), title: l.title.slice(0, 200),
            amount, currency: account.currency, fxRate: fx, amountTRY: r2(amount * fx), accountId,
            categoryId, projectId: rule?.projectId ?? null, contactId: rule?.contactId ?? null,
            externalRef: `imp:${accountId}:${base}:${n}`, createdBy: actor,
        };
    });
    const created = (await prisma.finTransaction.createMany({ data, skipDuplicates: true })).count;
    return { created, duplicates: data.length - created, categorized: data.filter(d => d.categoryId).length };
}
