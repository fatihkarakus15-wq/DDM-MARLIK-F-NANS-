"use server";
/**
 * Finans Server Action'ları. Hepsi requireFinance() ile başlar; formdaki defter kimliği doğrulanır ve
 * güncellenen/silinen her kayıt o deftere ait olmalıdır (defterler birbirine karışmasın).
 * Hareket oluşturma / düzenleme dosya aldığı için API'dedir (/api/hareket).
 */
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FormError, bool, num, optNum, optStr, run, str, type ActionState } from "@/lib/form";
import { requireFinance } from "@/lib/finance/access";
import { LEDGER_COOKIE, assertOwned, ledgerById } from "@/lib/finance/ledger";
import { startSession, hashPassword, verifyPassword } from "@/lib/auth";
import { hashToken, newToken } from "@/lib/passkey";
import { isCurrency, r2 } from "@/lib/finance/money";
import { parseDay, ymd } from "@/lib/finance/dates";
import { loadRates, rateTRY, setManualRate } from "@/lib/finance/rates";
import { FIRST_LOOKBACK_DAYS, generateRecurring } from "@/lib/finance/recurring";
import { settleTransaction } from "@/lib/finance/transactions";
import { validTckn } from "@/lib/finance/tckn";
import { importLines } from "@/lib/finance/import";
import { ASSET } from "@/lib/finance/labels";
import type { FinAccountKind, FinCategoryKind, FinChequeDirection, FinChequeKind, FinContactKind, FinFrequency, FinProjectStatus } from "@prisma/client";

const refresh = () => revalidatePath("/", "layout");

const day = (fd: FormData, name: string, label: string) => {
    const d = parseDay(str(fd, name, label));
    if (!d) throw new FormError(`${label} geçersiz.`);
    return d;
};
const optDay = (fd: FormData, name: string, label: string) => (optStr(fd, name) ? day(fd, name, label) : null);
const oneOf = <T extends string>(v: string, allowed: readonly T[], label: string): T => {
    if (!(allowed as readonly string[]).includes(v)) throw new FormError(`${label} geçersiz.`);
    return v as T;
};
const dayOfMonth = (fd: FormData, name: string, label: string) => {
    const n = optNum(fd, name, label);
    if (n == null) return null;
    if (!Number.isInteger(n) || n < 1 || n > 31) throw new FormError(`${label} 1–31 arasında olmalı.`);
    return n;
};

async function ledgerOf(fd: FormData) {
    await requireFinance();
    return ledgerById(str(fd, "ledgerId", "Defter"));
}
/** Kaydın bu deftere ait olduğunu doğrular */
function must(count: number, what = "Kayıt") {
    if (count === 0) throw new FormError(`${what} bulunamadı.`);
}

// ── Defter ──────────────────────────────────────────────

export async function setLedger(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        await requireFinance();
        const ledger = await prisma.finLedger.findUnique({ where: { slug: str(fd, "slug") }, select: { slug: true, name: true } });
        if (!ledger) throw new FormError("Defter bulunamadı.");
        (await cookies()).set(LEDGER_COOKIE, ledger.slug, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production" });
        refresh();
        return `${ledger.name} defteri açıldı.`;
    });
}

export async function renameLedger(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        await prisma.finLedger.update({ where: { id: ledger.id }, data: { name: str(fd, "name", "Defter adı").slice(0, 60) } });
        refresh();
        return "Defter adı güncellendi.";
    });
}

// ── Hesaplar ────────────────────────────────────────────

export async function saveAccount(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = optStr(fd, "id");
        const kind = oneOf<FinAccountKind>(str(fd, "kind"), ["BANK", "CASH", "CREDIT_CARD", "POS", "OTHER"], "Hesap türü");
        const currency = str(fd, "currency", "Para birimi");
        if (!isCurrency(currency)) throw new FormError("Para birimi geçersiz.");
        const data = {
            name: str(fd, "name", "Hesap adı").slice(0, 80), kind, currency, bankName: optStr(fd, "bankName"), iban: optStr(fd, "iban")?.replace(/\s/g, "").toUpperCase() ?? null,
            openingBalance: r2(optNum(fd, "openingBalance", "Açılış bakiyesi") ?? 0), openingDate: optDay(fd, "openingDate", "Açılış tarihi") ?? parseDay(ymd(new Date()))!,
            creditLimit: kind === "CREDIT_CARD" ? optNum(fd, "creditLimit", "Kart limiti") : null,
            statementDay: kind === "CREDIT_CARD" ? dayOfMonth(fd, "statementDay", "Hesap kesim günü") : null,
            dueDay: kind === "CREDIT_CARD" ? dayOfMonth(fd, "dueDay", "Son ödeme günü") : null,
            isActive: bool(fd, "isActive") || !id, note: optStr(fd, "note"),
        };
        if (id) {
            const used = await prisma.finTransaction.count({ where: { ledgerId: ledger.id, OR: [{ accountId: id }, { toAccountId: id }] } });
            const current = await prisma.finAccount.findFirst({ where: { id, ledgerId: ledger.id }, select: { currency: true } });
            if (!current) throw new FormError("Hesap bulunamadı.");
            if (used > 0 && current.currency !== currency) throw new FormError("Hareketi olan hesabın para birimi değiştirilemez; yeni hesap açın.");
            await prisma.finAccount.update({ where: { id }, data });
        } else await prisma.finAccount.create({ data: { ...data, ledgerId: ledger.id } });
        refresh();
        return id ? "Hesap güncellendi." : "Hesap eklendi.";
    });
}

export async function deleteAccount(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = str(fd, "id");
        const acc = await prisma.finAccount.findFirst({ where: { id, ledgerId: ledger.id }, select: { name: true } });
        if (!acc) throw new FormError("Hesap bulunamadı.");
        const used = await prisma.finTransaction.count({ where: { ledgerId: ledger.id, OR: [{ accountId: id }, { toAccountId: id }] } });
        if (used > 0) {
            await prisma.finAccount.update({ where: { id }, data: { isActive: false } });
            refresh();
            return `${acc.name} hesabında ${used} hareket var; silinmedi, pasife alındı (listeden gizlenir, geçmiş korunur).`;
        }
        await prisma.finAccount.delete({ where: { id } });
        refresh();
        return "Hesap silindi.";
    });
}

// ── Cariler ─────────────────────────────────────────────

export async function saveContact(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = optStr(fd, "id");
        const data = {
            name: str(fd, "name", "Cari adı").slice(0, 120),
            kind: oneOf<FinContactKind>(str(fd, "kind"), ["CUSTOMER", "SUPPLIER", "SUBCONTRACTOR", "EMPLOYEE", "OTHER"], "Cari türü"),
            taxNo: optStr(fd, "taxNo"), taxOffice: optStr(fd, "taxOffice"), phone: optStr(fd, "phone"), email: optStr(fd, "email"), address: optStr(fd, "address"), note: optStr(fd, "note"),
            openingBalance: r2(optNum(fd, "openingBalance", "Açılış bakiyesi") ?? 0), isActive: bool(fd, "isActive") || !id,
        };
        if (id) must((await prisma.finContact.updateMany({ where: { id, ledgerId: ledger.id }, data })).count, "Cari");
        else await prisma.finContact.create({ data: { ...data, ledgerId: ledger.id } });
        refresh();
        return id ? "Cari güncellendi." : "Cari eklendi.";
    });
}

export async function deleteContact(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = str(fd, "id");
        const c = await prisma.finContact.findFirst({ where: { id, ledgerId: ledger.id }, select: { name: true, _count: { select: { transactions: true, cheques: true, projects: true } } } });
        if (!c) throw new FormError("Cari bulunamadı.");
        if (c._count.transactions + c._count.cheques + c._count.projects > 0) {
            await prisma.finContact.update({ where: { id }, data: { isActive: false } });
            refresh();
            return `${c.name} carisinin kayıtları var; silinmedi, pasife alındı.`;
        }
        await prisma.finContact.delete({ where: { id } });
        refresh();
        return "Cari silindi.";
    });
}

// ── Projeler ────────────────────────────────────────────

export async function saveProject(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = optStr(fd, "id");
        const clientId = optStr(fd, "clientId");
        await assertOwned(ledger.id, { contactId: clientId });
        const data = {
            code: optStr(fd, "code"), name: str(fd, "name", "Proje adı").slice(0, 120), clientId,
            status: oneOf<FinProjectStatus>(str(fd, "status"), ["LEAD", "ACTIVE", "ON_HOLD", "DONE", "CANCELLED"], "Durum"),
            startDate: optDay(fd, "startDate", "Başlangıç"), endDate: optDay(fd, "endDate", "Bitiş"),
            contractAmount: optNum(fd, "contractAmount", "Sözleşme bedeli"), note: optStr(fd, "note"),
        };
        if (id) must((await prisma.finProject.updateMany({ where: { id, ledgerId: ledger.id }, data })).count, "Proje");
        else await prisma.finProject.create({ data: { ...data, ledgerId: ledger.id } });
        refresh();
        return id ? "Proje güncellendi." : "Proje eklendi.";
    });
}

/** Proje bilgileri: ad, müşteri, T.C., adres, aşama, durum, iş bedeli, tarihler, not */
export async function saveProjectDetails(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = str(fd, "id");
        const clientName = optStr(fd, "clientName");
        let clientId: string | null = null;
        if (clientName) {
            const found = await prisma.finContact.findFirst({ where: { ledgerId: ledger.id, name: { equals: clientName, mode: "insensitive" } }, select: { id: true } });
            clientId = found?.id ?? (await prisma.finContact.create({ data: { ledgerId: ledger.id, name: clientName.slice(0, 120), kind: "CUSTOMER" }, select: { id: true } })).id;
        }
        const tckn = (optStr(fd, "clientTckn") ?? "").replace(/\s/g, "");
        if (tckn && !validTckn(tckn)) throw new FormError("T.C. kimlik numarası geçersiz (11 hane, rakam).");
        const start = optDay(fd, "startDate", "İş başlangıç tarihi");
        const end = optDay(fd, "endDate", "İş bitiş tarihi");
        if (start && end && end < start) throw new FormError("Bitiş tarihi başlangıçtan önce olamaz.");
        const upd = await prisma.finProject.updateMany({
            where: { id, ledgerId: ledger.id },
            data: {
                name: str(fd, "name", "Proje adı").slice(0, 120), clientId, clientTckn: tckn || null,
                address: optStr(fd, "address")?.slice(0, 300) ?? null, stage: optStr(fd, "stage")?.slice(0, 60) ?? null,
                status: oneOf<FinProjectStatus>(str(fd, "status"), ["LEAD", "ACTIVE", "ON_HOLD", "DONE", "CANCELLED"], "Durum"),
                contractAmount: optNum(fd, "contractAmount", "İş bedeli"), startDate: start, endDate: end, note: optStr(fd, "note"),
            },
        });
        must(upd.count, "Proje");
        refresh();
        return "Proje bilgileri kaydedildi.";
    });
}

/** Tahsilat planı: projeye müşteriden "şu tarihte şu kadar alınacak" kaydı (vadeli gelir) */
export async function addCollection(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const project = await prisma.finProject.findFirst({ where: { id: str(fd, "projectId"), ledgerId: ledger.id }, select: { id: true, name: true, clientId: true } });
        if (!project) throw new FormError("Proje bulunamadı.");
        const amount = r2(num(fd, "amount", "Tutar"));
        if (!(amount > 0)) throw new FormError("Tutar sıfırdan büyük olmalı.");
        await prisma.finTransaction.create({
            data: {
                ledgerId: ledger.id, type: "INCOME", status: "PLANNED", date: day(fd, "date", "Tahsilat tarihi"), title: (optStr(fd, "title") ?? "Tahsilat").slice(0, 200),
                amount, currency: "TRY", fxRate: 1, amountTRY: amount, vatAmount: 0, withholdingAmount: 0, projectId: project.id, contactId: project.clientId,
            },
        });
        refresh();
        return "Tahsilat planına eklendi.";
    });
}

/** Planlanan tahsilatı revize eder: tarih, tutar, açıklama (yalnızca henüz alınmamış plan) */
export async function updateCollection(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const amount = r2(num(fd, "amount", "Tutar"));
        if (!(amount > 0)) throw new FormError("Tutar sıfırdan büyük olmalı.");
        const upd = await prisma.finTransaction.updateMany({
            where: { id: str(fd, "id"), ledgerId: ledger.id, type: "INCOME", status: "PLANNED" },
            data: { date: day(fd, "date", "Tahsilat tarihi"), amount, amountTRY: amount, title: (optStr(fd, "title") ?? "Tahsilat").slice(0, 200) },
        });
        must(upd.count, "Tahsilat planı");
        refresh();
        return "Plan güncellendi.";
    });
}

/** İlave iş: projeye sonradan gelen iş ve tutarı (iş bedeline eklenir) */
export async function addExtra(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const project = await prisma.finProject.findFirst({ where: { id: str(fd, "projectId"), ledgerId: ledger.id }, select: { id: true } });
        if (!project) throw new FormError("Proje bulunamadı.");
        const amount = r2(num(fd, "amount", "Tutar"));
        if (!(amount > 0)) throw new FormError("Tutar sıfırdan büyük olmalı.");
        await prisma.finProjectExtra.create({ data: { projectId: project.id, title: str(fd, "title", "İlave iş").slice(0, 200), amount, date: optDay(fd, "date", "Tarih"), note: optStr(fd, "note") } });
        refresh();
        return "İlave iş eklendi.";
    });
}

export async function deleteExtra(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const del = await prisma.finProjectExtra.deleteMany({ where: { id: str(fd, "id"), project: { ledgerId: ledger.id } } });
        must(del.count, "İlave iş");
        refresh();
        return "İlave iş silindi.";
    });
}

/** Harcamadan müşteriden ekstra alınacak tutarı tahsilat planına (vadeli gelir) ekler */
export async function planRebill(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const tx = await prisma.finTransaction.findFirst({ where: { id: str(fd, "id"), ledgerId: ledger.id, type: "EXPENSE", rebillAmount: { gt: 0 }, rebillPlanned: false }, select: { id: true, title: true, rebillAmount: true, projectId: true, project: { select: { clientId: true } } } });
        if (!tx || !tx.projectId || !tx.rebillAmount) throw new FormError("Kayıt bulunamadı ya da zaten plana eklenmiş.");
        await prisma.$transaction([
            prisma.finTransaction.create({
                data: {
                    ledgerId: ledger.id, type: "INCOME", status: "PLANNED", date: day(fd, "date", "Tahsilat tarihi"), title: `Ekstra: ${tx.title}`.slice(0, 200),
                    amount: tx.rebillAmount, currency: "TRY", fxRate: 1, amountTRY: tx.rebillAmount, vatAmount: 0, withholdingAmount: 0, projectId: tx.projectId, contactId: tx.project?.clientId ?? null,
                },
            }),
            prisma.finTransaction.update({ where: { id: tx.id }, data: { rebillPlanned: true } }),
        ]);
        refresh();
        return "Tahsilat planına eklendi.";
    });
}

/** Projeyi "Teslim edildi" (DONE) ya da yeniden "Aktif" yapar (ana ekrandaki iki başlık) */
export async function setProjectDelivered(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const delivered = fd.get("delivered") === "1";
        const upd = await prisma.finProject.updateMany({ where: { id: str(fd, "id"), ledgerId: ledger.id }, data: { status: delivered ? "DONE" : "ACTIVE", ...(delivered && { endDate: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 12)) }) } });
        must(upd.count, "Proje");
        refresh();
        return delivered ? "Proje teslim edildi olarak işaretlendi." : "Proje yeniden aktif.";
    });
}

export async function deleteProject(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = str(fd, "id");
        const p = await prisma.finProject.findFirst({ where: { id, ledgerId: ledger.id }, select: { name: true, _count: { select: { transactions: true, cheques: true } } } });
        if (!p) throw new FormError("Proje bulunamadı.");
        if (p._count.transactions + p._count.cheques > 0) throw new FormError(`${p.name} projesinde ${p._count.transactions} hareket var; silinemez. Durumunu "Tamamlandı" ya da "İptal" yapın.`);
        await prisma.finProject.delete({ where: { id } });
        refresh();
        return "Proje silindi.";
    });
}

/** Projeyi bütün hareketleriyle (harcama, tahsilat, ilave iş, bütçe) siler. Geri alınamaz; çek / senede bağlı hareket varsa silmez. */
export async function deleteProjectWithData(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = str(fd, "id");
        const p = await prisma.finProject.findFirst({ where: { id, ledgerId: ledger.id }, select: { name: true } });
        if (!p) throw new FormError("Proje bulunamadı.");
        const linked = await prisma.finCheque.count({ where: { OR: [{ projectId: id }, { transaction: { projectId: id } }] } });
        if (linked > 0) throw new FormError(`${p.name} projesine bağlı ${linked} çek / senet var; önce onları silin.`);
        await prisma.$transaction([
            prisma.finTransaction.deleteMany({ where: { ledgerId: ledger.id, projectId: id } }),
            prisma.finProject.delete({ where: { id } }),
        ]);
        refresh();
        redirect("/");
    });
}

export async function saveBudgetLine(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const projectId = str(fd, "projectId"), categoryId = str(fd, "categoryId", "Kalem");
        await assertOwned(ledger.id, { projectId, categoryId });
        const amountTL = r2(num(fd, "amountTL", "Bütçe"));
        if (amountTL <= 0) {
            await prisma.finBudgetLine.deleteMany({ where: { projectId, categoryId } });
            refresh();
            return "Bütçe satırı kaldırıldı.";
        }
        await prisma.finBudgetLine.upsert({ where: { projectId_categoryId: { projectId, categoryId } }, create: { projectId, categoryId, amountTL }, update: { amountTL } });
        refresh();
        return "Bütçe kaydedildi.";
    });
}

/** Projeye harcama kalemi ekler: aynı adlı gider kalemi yoksa oluşturur, projeye bağlar (bütçe isteğe bağlı) */
export async function addProjectItem(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const projectId = str(fd, "projectId");
        await assertOwned(ledger.id, { projectId });
        const name = str(fd, "name", "Kalem adı").slice(0, 80);
        const budget = r2(optNum(fd, "amountTL", "Bütçe") ?? 0);
        const same = await prisma.finCategory.findMany({ where: { ledgerId: ledger.id, kind: "EXPENSE", name: { equals: name, mode: "insensitive" } }, select: { id: true, isActive: true }, orderBy: { parentId: "asc" } });
        let categoryId = same[0]?.id;
        if (categoryId && !same[0].isActive) await prisma.finCategory.update({ where: { id: categoryId }, data: { isActive: true } });
        if (!categoryId) categoryId = (await prisma.finCategory.create({ data: { ledgerId: ledger.id, name, kind: "EXPENSE" }, select: { id: true } })).id;
        await prisma.finBudgetLine.upsert({ where: { projectId_categoryId: { projectId, categoryId } }, create: { projectId, categoryId, amountTL: budget }, update: budget > 0 ? { amountTL: budget } : {} });
        refresh();
        return `${name} kalemi projeye eklendi. Şimdi altındaki “+ harcama” ile tutar girebilirsiniz.`;
    });
}

export async function deleteBudgetLine(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = str(fd, "id");
        const line = await prisma.finBudgetLine.findFirst({ where: { id, project: { ledgerId: ledger.id } }, select: { id: true } });
        if (!line) throw new FormError("Satır bulunamadı.");
        await prisma.finBudgetLine.delete({ where: { id } });
        refresh();
        return "Bütçe satırı silindi.";
    });
}

// ── Kalemler ────────────────────────────────────────────

export async function saveCategory(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = optStr(fd, "id");
        const kind = oneOf<FinCategoryKind>(str(fd, "kind"), ["INCOME", "EXPENSE"], "Tür");
        const parentId = optStr(fd, "parentId");
        if (parentId) {
            const parent = await prisma.finCategory.findFirst({ where: { id: parentId, ledgerId: ledger.id }, select: { kind: true, parentId: true } });
            if (!parent) throw new FormError("Üst grup bulunamadı.");
            if (parent.parentId) throw new FormError("Kalemler en çok iki seviye olabilir (grup › kalem).");
            if (parent.kind !== kind) throw new FormError("Üst grubun türü (gelir / gider) aynı olmalı.");
            if (id === parentId) throw new FormError("Bir kalem kendi altına taşınamaz.");
        }
        const data = { name: str(fd, "name", "Kalem adı").slice(0, 80), kind, parentId, sortOrder: Math.round(optNum(fd, "sortOrder", "Sıra") ?? 0), isActive: bool(fd, "isActive") || !id };
        if (id) {
            const hasChildren = await prisma.finCategory.count({ where: { parentId: id } });
            if (hasChildren && parentId) throw new FormError("Altında kalem olan grup başka bir grubun altına taşınamaz.");
            must((await prisma.finCategory.updateMany({ where: { id, ledgerId: ledger.id }, data })).count, "Kalem");
        } else await prisma.finCategory.create({ data: { ...data, ledgerId: ledger.id } });
        refresh();
        return id ? "Kalem güncellendi." : "Kalem eklendi.";
    });
}

export async function deleteCategory(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = str(fd, "id");
        const c = await prisma.finCategory.findFirst({ where: { id, ledgerId: ledger.id }, select: { name: true, _count: { select: { transactions: true, children: true, budgetLines: true, recurrings: true } } } });
        if (!c) throw new FormError("Kalem bulunamadı.");
        if (c._count.children > 0) throw new FormError(`${c.name} grubunun altında kalemler var; önce onları taşıyın ya da silin.`);
        if (c._count.transactions + c._count.budgetLines + c._count.recurrings > 0) {
            await prisma.finCategory.update({ where: { id }, data: { isActive: false } });
            refresh();
            return `${c.name} kalemi kullanıldığı için silinmedi, pasife alındı (yeni kayıtlarda görünmez).`;
        }
        await prisma.finCategory.delete({ where: { id } });
        refresh();
        return "Kalem silindi.";
    });
}

// ── Hareketler: silme, ödendi, dosya ────────────────────

export async function deleteTransaction(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = str(fd, "id");
        const tx = await prisma.finTransaction.findFirst({ where: { id, ledgerId: ledger.id }, select: { recurringId: true, externalRef: true, cheque: { select: { id: true } } } });
        if (!tx) throw new FormError("Hareket bulunamadı.");
        if (tx.cheque) throw new FormError("Bu hareket bir çek / senede bağlı; önce çek / senet kaydını silin.");
        // Şablondan üretilmiş vade silinirse yeniden üretilmesin
        const skip = tx.recurringId && /^rec:[^:]+:(\d{4}-\d{2}-\d{2})$/.exec(tx.externalRef ?? "")?.[1];
        await prisma.$transaction([
            ...(tx.recurringId && skip ? [prisma.finRecurring.update({ where: { id: tx.recurringId }, data: { skipDays: { push: skip } } })] : []),
            prisma.finTransaction.delete({ where: { id } }),
        ]);
        refresh();
        const back = optStr(fd, "redirect");
        if (back?.startsWith("/")) redirect(back);
        return "Hareket silindi.";
    });
}

export async function settleAction(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const r = await settleTransaction(ledger.id, str(fd, "id"), {
            accountId: str(fd, "accountId", "Hesap"), date: day(fd, "date", "Tarih"), amount: optNum(fd, "amount", "Tutar"),
        });
        refresh();
        return r.partial ? `Kısmi ödeme işlendi. Kalan vadeli tutar: ${r.left.toLocaleString("tr-TR")}.` : "Gerçekleşti olarak işlendi.";
    });
}

export async function deleteAttachment(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = str(fd, "id");
        const f = await prisma.finAttachment.findFirst({ where: { id, transaction: { ledgerId: ledger.id } }, select: { id: true } });
        if (!f) throw new FormError("Dosya bulunamadı.");
        await prisma.finAttachment.delete({ where: { id } });
        refresh();
        return "Dosya silindi.";
    });
}

// ── Tekrarlayan ödemeler ────────────────────────────────

/** Aylık maaş gideri: kişi adı + tutar + maaş günü; her ay vadeli "Maaş" gideri üretir */
export async function addSalary(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const person = str(fd, "person", "Kişi").slice(0, 80);
        const amount = r2(num(fd, "amount", "Maaş tutarı"));
        if (!(amount > 0)) throw new FormError("Maaş tutarı sıfırdan büyük olmalı.");
        const cat = await prisma.finCategory.findFirst({ where: { ledgerId: ledger.id, kind: "EXPENSE", name: "Maaş" }, select: { id: true } });
        await prisma.finRecurring.create({ data: { ledgerId: ledger.id, title: `Maaş · ${person}`, type: "EXPENSE", amount, currency: "TRY", frequency: "MONTHLY", startDate: day(fd, "startDate", "Maaş günü"), categoryId: cat?.id ?? null } });
        const made = await generateRecurring(ledger.id, undefined, FIRST_LOOKBACK_DAYS);
        refresh();
        return `${person} maaşı eklendi; ${made} vade üretildi.`;
    });
}

export async function saveRecurring(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = optStr(fd, "id");
        const type = oneOf(str(fd, "type"), ["INCOME", "EXPENSE"] as const, "Tür");
        const currency = str(fd, "currency", "Para birimi");
        if (!isCurrency(currency)) throw new FormError("Para birimi geçersiz.");
        const amount = r2(num(fd, "amount", "Tutar"));
        if (!(amount > 0)) throw new FormError("Tutar sıfırdan büyük olmalı.");
        const accountId = optStr(fd, "accountId"), categoryId = optStr(fd, "categoryId"), projectId = optStr(fd, "projectId"), contactId = optStr(fd, "contactId");
        await assertOwned(ledger.id, { accountId, categoryId, projectId, contactId });
        if (accountId) {
            const acc = await prisma.finAccount.findUnique({ where: { id: accountId }, select: { currency: true } });
            if (acc && acc.currency !== currency) throw new FormError(`Seçilen hesap ${acc.currency}; para birimini ona eşitleyin ya da hesabı boş bırakın.`);
        }
        if (rateTRY(currency, await loadRates()) == null) throw new FormError(`${currency} kuru yok; önce Ayarlar'dan kur girin.`);
        const data = {
            title: str(fd, "title", "Başlık").slice(0, 120), type, amount, currency,
            frequency: oneOf<FinFrequency>(str(fd, "frequency"), ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"], "Sıklık"),
            startDate: day(fd, "startDate", "İlk vade"), endDate: optDay(fd, "endDate", "Bitiş"), vatRate: optNum(fd, "vatRate", "KDV oranı"),
            accountId, categoryId, projectId, contactId, note: optStr(fd, "note"), isActive: bool(fd, "isActive") || !id,
        };
        if (data.vatRate != null && (data.vatRate < 0 || data.vatRate > 100)) throw new FormError("KDV oranı 0–100 olmalı.");
        if (data.endDate && data.endDate < data.startDate) throw new FormError("Bitiş, ilk vadeden önce olamaz.");
        if (id) {
            must((await prisma.finRecurring.updateMany({ where: { id, ledgerId: ledger.id }, data })).count, "Şablon");
            // Planlanan ama henüz gerçekleşmemiş gelecek vadeleri yeni tutarla yenile
            await prisma.finTransaction.deleteMany({ where: { ledgerId: ledger.id, recurringId: id, status: "PLANNED", date: { gte: parseDay(ymd(new Date()))! } } });
        } else await prisma.finRecurring.create({ data: { ...data, ledgerId: ledger.id } });
        const made = await generateRecurring(ledger.id, undefined, FIRST_LOOKBACK_DAYS);
        refresh();
        return `${id ? "Şablon güncellendi" : "Şablon eklendi"}; ${made} vade üretildi.`;
    });
}

export async function deleteRecurring(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = str(fd, "id");
        must((await prisma.finRecurring.count({ where: { id, ledgerId: ledger.id } })), "Şablon");
        // Henüz gerçekleşmemiş gelecek vadeler de kalkar; gerçekleşenler korunur
        const removed = await prisma.finTransaction.deleteMany({ where: { ledgerId: ledger.id, recurringId: id, status: "PLANNED" } });
        await prisma.finRecurring.delete({ where: { id } });
        refresh();
        return `Şablon silindi (${removed.count} vadeli kayıt kaldırıldı, gerçekleşenler korundu).`;
    });
}

// ── Çek / senet ─────────────────────────────────────────

export async function saveCheque(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = optStr(fd, "id");
        const direction = oneOf<FinChequeDirection>(str(fd, "direction"), ["RECEIVED", "ISSUED"], "Yön");
        const currency = str(fd, "currency", "Para birimi");
        if (!isCurrency(currency)) throw new FormError("Para birimi geçersiz.");
        const amount = r2(num(fd, "amount", "Tutar"));
        if (!(amount > 0)) throw new FormError("Tutar sıfırdan büyük olmalı.");
        const contactId = optStr(fd, "contactId"), projectId = optStr(fd, "projectId"), accountId = optStr(fd, "accountId");
        await assertOwned(ledger.id, { contactId, projectId, accountId });
        const linkId = optStr(fd, "transactionId");
        if (linkId) {
            const tx = await prisma.finTransaction.findFirst({ where: { id: linkId, ledgerId: ledger.id }, select: { status: true, type: true, cheque: { select: { id: true } } } });
            if (!tx || tx.status !== "PLANNED") throw new FormError("Bağlanacak vadeli kayıt bulunamadı.");
            if (tx.type !== (direction === "RECEIVED" ? "INCOME" : "EXPENSE")) throw new FormError("Vadeli kaydın yönü çek / senetle uyuşmuyor (aldığımız = alacak, verdiğimiz = borç).");
            if (tx.cheque && tx.cheque.id !== id) throw new FormError("Bu vadeli kayıt başka bir çek / senede bağlı.");
        }
        const data = {
            kind: oneOf<FinChequeKind>(str(fd, "kind"), ["CHECK", "NOTE"], "Tür"), direction, number: optStr(fd, "number"), bankName: optStr(fd, "bankName"),
            contactId, projectId, accountId, amount, currency, issueDate: optDay(fd, "issueDate", "Düzenleme tarihi"), dueDate: day(fd, "dueDate", "Vade"), note: optStr(fd, "note"),
            ...(linkId && { transactionId: linkId }),
        };
        if (id) must((await prisma.finCheque.updateMany({ where: { id, ledgerId: ledger.id }, data })).count, "Çek / senet");
        else await prisma.finCheque.create({ data: { ...data, ledgerId: ledger.id } });
        refresh();
        return id ? "Çek / senet güncellendi." : "Çek / senet eklendi.";
    });
}

export async function chequeAction(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = str(fd, "id");
        const op = oneOf(str(fd, "op"), ["deposit", "endorse", "settle", "bounce", "cancel", "reopen", "delete"] as const, "İşlem");
        const c = await prisma.finCheque.findFirst({ where: { id, ledgerId: ledger.id } });
        if (!c) throw new FormError("Çek / senet bulunamadı.");
        const what = c.kind === "CHECK" ? "Çek" : "Senet";
        if (op === "delete") {
            if (c.status === "SETTLED" && c.transactionId) throw new FormError("Tahsil edilmiş / ödenmiş kayıt silinemez; önce bağlı hareketi silin.");
            await prisma.finCheque.delete({ where: { id } });
            refresh();
            return `${what} silindi.`;
        }
        if (op === "settle") {
            if (c.status === "SETTLED") throw new FormError("Zaten tahsil edilmiş / ödenmiş.");
            const accountId = str(fd, "accountId", "Hesap");
            const date = day(fd, "date", "Tarih");
            await assertOwned(ledger.id, { accountId });
            const acc = await prisma.finAccount.findUniqueOrThrow({ where: { id: accountId }, select: { currency: true, name: true } });
            if (acc.currency !== c.currency) throw new FormError(`${acc.name} hesabı ${acc.currency}; çek / senet ${c.currency}. ${c.currency} hesabı seçin.`);
            let txId = c.transactionId;
            if (txId) await settleTransaction(ledger.id, txId, { accountId, date });
            else {
                const fx = rateTRY(c.currency, await loadRates());
                if (fx == null) throw new FormError(`${c.currency} kuru yok; önce Ayarlar'dan kur girin.`);
                txId = (await prisma.finTransaction.create({
                    data: {
                        ledgerId: ledger.id, type: c.direction === "RECEIVED" ? "INCOME" : "EXPENSE", status: "DONE", date, title: `${what}${c.number ? ` ${c.number}` : ""} ${c.direction === "RECEIVED" ? "tahsilatı" : "ödemesi"}`,
                        amount: c.amount, currency: c.currency, fxRate: fx, amountTRY: r2(c.amount * fx), accountId, projectId: c.projectId, contactId: c.contactId,
                        externalRef: `cheque:${c.id}`, createdBy: "çek / senet",
                    }, select: { id: true },
                })).id;
            }
            await prisma.finCheque.update({ where: { id }, data: { status: "SETTLED", settledAt: date, accountId, transactionId: txId } });
            refresh();
            return `${what} ${c.direction === "RECEIVED" ? "tahsil edildi" : "ödendi"}, hesaba işlendi.`;
        }
        if (c.status === "SETTLED") throw new FormError("Tahsil edilmiş / ödenmiş kaydın durumu değiştirilemez.");
        const status = { deposit: "DEPOSITED", endorse: "ENDORSED", bounce: "BOUNCED", cancel: "CANCELLED", reopen: "OPEN" }[op] as "DEPOSITED" | "ENDORSED" | "BOUNCED" | "CANCELLED" | "OPEN";
        await prisma.finCheque.update({ where: { id }, data: { status } });
        refresh();
        return "Durum güncellendi.";
    });
}

// ── Yatırımlar ──────────────────────────────────────────

export async function saveInvestment(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = optStr(fd, "id");
        const asset = str(fd, "asset", "Varlık");
        if (!ASSET[asset]) throw new FormError("Varlık geçersiz.");
        const quantity = num(fd, "quantity", "Miktar");
        const unitCost = num(fd, "unitCost", "Alış fiyatı");
        if (!(quantity > 0) || !(unitCost > 0)) throw new FormError("Miktar ve alış fiyatı sıfırdan büyük olmalı.");
        const data = { asset, quantity, unitCost, boughtAt: day(fd, "boughtAt", "Alış tarihi"), targetPrice: optNum(fd, "targetPrice", "Hedef fiyat"), note: optStr(fd, "note") };
        if (id) must((await prisma.finInvestment.updateMany({ where: { id, ledgerId: ledger.id }, data })).count, "Pozisyon");
        else await prisma.finInvestment.create({ data: { ...data, ledgerId: ledger.id } });
        refresh();
        return id ? "Pozisyon güncellendi." : "Pozisyon eklendi.";
    });
}

export async function sellInvestment(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const id = str(fd, "id");
        const soldPrice = num(fd, "soldPrice", "Satış fiyatı");
        if (!(soldPrice > 0)) throw new FormError("Satış fiyatı sıfırdan büyük olmalı.");
        must((await prisma.finInvestment.updateMany({ where: { id, ledgerId: ledger.id, status: "OPEN" }, data: { status: "SOLD", soldAt: day(fd, "soldAt", "Satış tarihi"), soldPrice } })).count, "Açık pozisyon");
        refresh();
        return "Pozisyon satıldı olarak işaretlendi.";
    });
}

export async function deleteInvestment(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        must((await prisma.finInvestment.deleteMany({ where: { id: str(fd, "id"), ledgerId: ledger.id } })).count, "Pozisyon");
        refresh();
        return "Pozisyon silindi.";
    });
}

export async function saveManualRate(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        await requireFinance();
        const code = str(fd, "code", "Varlık");
        if (!ASSET[code]) throw new FormError("Varlık geçersiz.");
        const buy = num(fd, "buy", "Alış"), sell = optNum(fd, "sell", "Satış") ?? buy;
        if (!(buy > 0) || !(sell > 0)) throw new FormError("Fiyatlar sıfırdan büyük olmalı.");
        await setManualRate(code, buy, sell);
        refresh();
        return `${ASSET[code].name} fiyatı elle kaydedildi. Kaynak çalışınca yenisiyle değişir.`;
    });
}

// ── Ekstre kuralları, içe aktarma ───────────────────────

export async function saveRule(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const categoryId = optStr(fd, "categoryId"), projectId = optStr(fd, "projectId"), contactId = optStr(fd, "contactId");
        if (!categoryId && !projectId && !contactId) throw new FormError("Kural için en az bir kalem, proje ya da cari seçin.");
        await assertOwned(ledger.id, { categoryId, projectId, contactId });
        await prisma.finRule.create({ data: { ledgerId: ledger.id, match: str(fd, "match", "Eşleşecek metin").slice(0, 80), categoryId, projectId, contactId, priority: Math.round(optNum(fd, "priority", "Öncelik") ?? 0) } });
        refresh();
        return "Kural eklendi.";
    });
}

export async function deleteRule(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        must((await prisma.finRule.deleteMany({ where: { id: str(fd, "id"), ledgerId: ledger.id } })).count, "Kural");
        refresh();
        return "Kural silindi.";
    });
}

/** Ekstre önizlemesinden gelen satırlar (JSON) */
export async function importStatement(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        let raw: unknown;
        try { raw = JSON.parse(str(fd, "lines", "Satırlar")); } catch { throw new FormError("Satırlar okunamadı."); }
        if (!Array.isArray(raw)) throw new FormError("Satırlar okunamadı.");
        const lines = raw.flatMap(l => {
            const o = l as { date?: unknown; title?: unknown; amount?: unknown };
            const d = typeof o.date === "string" ? parseDay(o.date) : null;
            return d && typeof o.title === "string" && typeof o.amount === "number" && Number.isFinite(o.amount) && o.amount !== 0 ? [{ date: ymd(d), title: o.title, amount: o.amount }] : [];
        });
        const admin = await requireFinance();
        const r = await importLines(ledger.id, str(fd, "accountId", "Hesap"), lines, admin.name ?? admin.email);
        refresh();
        return `${r.created} hareket aktarıldı${r.duplicates ? `, ${r.duplicates} tanesi zaten vardı (atlandı)` : ""}; ${r.categorized} tanesine kural kalem atadı.`;
    });
}

export async function regenerateRecurring(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const ledger = await ledgerOf(fd);
        const n = await generateRecurring(ledger.id, undefined, FIRST_LOOKBACK_DAYS);
        refresh();
        return n ? `${n} yeni vade üretildi.` : "Eksik vade yok.";
    });
}

// ── Hesap ve defter ─────────────────────────────────────

export async function createLedger(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        await requireFinance();
        const name = str(fd, "name", "Defter adı").slice(0, 60);
        const base = name.toLocaleLowerCase("tr").replace(/[çğıöşü]/g, c => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "defter";
        let slug = base;
        for (let i = 2; await prisma.finLedger.count({ where: { slug } }); i++) slug = `${base}-${i}`;
        const last = await prisma.finLedger.aggregate({ _max: { sortOrder: true } });
        await prisma.finLedger.create({ data: { slug, name, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
        refresh();
        return `${name} defteri eklendi. Üstteki seçiciden geçiş yapabilirsiniz; varsayılan kalemler ilk açılışta oluşur.`;
    });
}

export async function changePassword(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const me = await requireFinance();
        const user = await prisma.appUser.findUniqueOrThrow({ where: { id: me.id } });
        if (!(await verifyPassword(str(fd, "current", "Mevcut şifre"), user.passwordHash))) throw new FormError("Mevcut şifre hatalı.");
        const next = str(fd, "next", "Yeni şifre");
        if (next.length < 10) throw new FormError("Yeni şifre en az 10 karakter olmalı.");
        if (next !== str(fd, "again", "Yeni şifre (tekrar)")) throw new FormError("Yeni şifreler aynı değil.");
        const updated = await prisma.appUser.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(next), epoch: { increment: 1 } }, select: { id: true, epoch: true } });
        await startSession(updated); // bu cihaz açık kalır, diğerleri kapanır
        return "Şifre değişti; diğer cihazlardaki oturumlar kapandı.";
    });
}

export async function signOutOthers(): Promise<ActionState> {
    return run(async () => {
        const me = await requireFinance();
        const updated = await prisma.appUser.update({ where: { id: me.id }, data: { epoch: { increment: 1 } }, select: { id: true, epoch: true } });
        await startSession(updated);
        return "Diğer cihazlardaki oturumlar kapatıldı.";
    });
}

/** Yeni kullanıcı davet et (ya da var olan kullanıcıya yeni telefon eklemek için yeni bağlantı üret). Bağlantı 7 gün geçerli. */
export async function inviteUser(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        await requireFinance();
        const email = str(fd, "email", "E-posta").toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FormError("Geçerli bir e-posta yazın.");
        const name = String(fd.get("name") ?? "").trim() || null;
        const token = newToken();
        const data = { inviteHash: hashToken(token), inviteExpires: new Date(Date.now() + 7 * 24 * 3600 * 1000) };
        const existing = await prisma.appUser.findUnique({ where: { email }, select: { id: true } });
        if (existing) await prisma.appUser.update({ where: { id: existing.id }, data });
        else {
            if ((await prisma.appUser.count()) >= 5) throw new FormError("En fazla 5 kullanıcı eklenebilir.");
            // Şifre belirlenmemiş hesap: rastgele şifre, kimse bilmez; giriş yalnızca yüz/parmak iziyle (ya da "Şifremi unuttum")
            await prisma.appUser.create({ data: { email, name, passwordHash: await hashPassword(newToken()), ...data } });
        }
        const h = await headers();
        const host = h.get("x-forwarded-host") ?? h.get("host");
        const proto = h.get("x-forwarded-proto") ?? "https";
        revalidatePath("/ayarlar");
        return `Davet bağlantısı (7 gün geçerli, yalnızca ${email} için telefonuna gönderin): ${proto}://${host}/davet/${token}`;
    });
}

export async function deletePasskey(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const me = await requireFinance();
        const n = await prisma.appPasskey.count({ where: { userId: me.id } });
        const del = await prisma.appPasskey.deleteMany({ where: { id: str(fd, "id"), userId: me.id } });
        if (!del.count) throw new FormError("Kayıt bulunamadı.");
        revalidatePath("/ayarlar");
        return n <= 1 ? "Kayıt silindi. Artık şifreyle girmeniz gerekir." : "Kayıt silindi.";
    });
}
