/**
 * Aktif defter: çerez `ofisfinans_defter` (defter kısa adı). Defterler ilk açılışta oluşur,
 * defterin varsayılan kalemleri ilk kullanımda yazılır. Her finans sorgusu `ledgerId` ile sınırlanır.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import type { FinCategoryKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FormError } from "@/lib/form";
import { DEFAULT_LEDGERS, defaultCategories } from "./defaults";

export const LEDGER_COOKIE = "ofisfinans_defter";

export interface LedgerInfo { id: string; slug: string; name: string }

let ledgersSeen = false;
const seededLedgers = new Set<string>();

async function ensureLedgers() {
    if (ledgersSeen) return;
    ledgersSeen = true;
    if ((await prisma.finLedger.count()) === 0) await prisma.finLedger.createMany({ data: DEFAULT_LEDGERS, skipDuplicates: true });
}

/** Aynı anda iki istek ilk kez açılırsa kalemler ikilenmesin diye işlem kilidi (pg advisory) altında yazılır */
async function ensureCategories(ledger: LedgerInfo) {
    if (seededLedgers.has(ledger.id)) return;
    seededLedgers.add(ledger.id);
    if ((await prisma.finCategory.count({ where: { ledgerId: ledger.id } })) > 0) return;
    const trees = defaultCategories();
    await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fin-seed:${ledger.id}`}))`;
        if ((await tx.finCategory.count({ where: { ledgerId: ledger.id } })) > 0) return;
        for (const [kind, tree] of [["EXPENSE", trees.expense], ["INCOME", trees.income]] as [FinCategoryKind, Record<string, string[]>][]) {
            let order = 0;
            for (const [group, items] of Object.entries(tree)) {
                const parent = await tx.finCategory.create({ data: { ledgerId: ledger.id, name: group, kind, sortOrder: order++ }, select: { id: true } });
                if (items.length) await tx.finCategory.createMany({ data: items.map((name, i) => ({ ledgerId: ledger.id, name, kind, parentId: parent.id, sortOrder: i })) });
            }
        }
    }, { timeout: 30_000, maxWait: 15_000 });
}

/** Aktif defter ve defter listesi (sayfalar ve eylemler için) */
export const activeLedger = cache(async () => {
    await ensureLedgers();
    const ledgers = await prisma.finLedger.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true } });
    const slug = (await cookies()).get(LEDGER_COOKIE)?.value;
    const ledger = ledgers.find(l => l.slug === slug) ?? ledgers[0];
    if (!ledger) throw new FormError("Defter bulunamadı.");
    await ensureCategories(ledger);
    return { ledger, ledgers };
});

/** Eylemlerde: formdan gelen defter kimliğinin gerçekten var olduğunu doğrular */
export async function ledgerById(id: string) {
    const ledger = await prisma.finLedger.findUnique({ where: { id }, select: { id: true, slug: true, name: true } });
    if (!ledger) throw new FormError("Defter bulunamadı.");
    return ledger;
}

/** Kalem listesi: "Malzeme › Boya" biçimli, seçim kutuları için */
export async function categoryOptions(ledgerId: string, kind?: FinCategoryKind) {
    const rows = await prisma.finCategory.findMany({
        where: { ledgerId, isActive: true, ...(kind && { kind }) },
        orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, kind: true, parentId: true },
    });
    const byId = new Map(rows.map(r => [r.id, r]));
    return rows
        .map(r => ({ id: r.id, kind: r.kind, parentId: r.parentId, name: r.name, label: r.parentId && byId.get(r.parentId) ? `${byId.get(r.parentId)!.name} › ${r.name}` : r.name }))
        .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "EXPENSE" ? -1 : 1));
}

/** Formdan gelen kimliklerin bu deftere ait olduğunu doğrular (defterler birbirine karışmasın) */
export async function assertOwned(ledgerId: string, refs: { accountId?: string | null; toAccountId?: string | null; categoryId?: string | null; projectId?: string | null; contactId?: string | null }) {
    const checks: Promise<number>[] = [];
    const acc = [refs.accountId, refs.toAccountId].filter((x): x is string => !!x);
    if (acc.length) checks.push(prisma.finAccount.count({ where: { ledgerId, id: { in: acc } } }).then(n => (n === new Set(acc).size ? 1 : 0)));
    if (refs.categoryId) checks.push(prisma.finCategory.count({ where: { ledgerId, id: refs.categoryId } }));
    if (refs.projectId) checks.push(prisma.finProject.count({ where: { ledgerId, id: refs.projectId } }));
    if (refs.contactId) checks.push(prisma.finContact.count({ where: { ledgerId, id: refs.contactId } }));
    if ((await Promise.all(checks)).some(n => n === 0)) throw new FormError("Seçilen hesap, kalem, proje ya da cari bu deftere ait değil.");
}
