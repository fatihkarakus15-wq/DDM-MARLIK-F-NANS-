/**
 * Hareket kaydı (form → doğrulama → veritabanı). Route Handler `/api/hareket` kullanır;
 * dosya (fiş / fatura) aynı istekte gelir. Hesaba bağlı hareketin para birimi hesabınkidir.
 */
import type { FinTxType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FormError } from "@/lib/form";
import { readInvoiceFile } from "@/lib/files";
import { assertOwned } from "./ledger";
import { isCurrency, r2, vatOf } from "./money";
import { parseDay } from "./dates";
import { loadRates, rateTRY } from "./rates";

const MAX_FILES = 5;

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => text(fd, k) || null;
function number(fd: FormData, k: string, label: string, { required = false, min = 0 } = {}): number | null {
    const raw = text(fd, k).replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    if (raw === "") { if (required) throw new FormError(`${label} yazın.`); return null; }
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new FormError(`${label} geçerli bir sayı olmalı.`);
    if (n < min) throw new FormError(`${label} en az ${min} olmalı.`);
    return n;
}

export interface ParsedTx {
    id: string | null; ledgerId: string;
    data: Omit<Prisma.FinTransactionUncheckedCreateInput, "id" | "ledgerId" | "createdBy" | "externalRef" | "recurringId">;
}

/** Form alanlarını doğrulayıp yazılacak veriye çevirir */
export async function parseTxForm(fd: FormData): Promise<ParsedTx> {
    const ledgerId = text(fd, "ledgerId");
    if (!ledgerId) throw new FormError("Defter seçilmemiş.");
    const type = text(fd, "type") as FinTxType;
    if (!["INCOME", "EXPENSE", "TRANSFER"].includes(type)) throw new FormError("Hareket türü seçin.");
    let status = text(fd, "status") === "PLANNED" ? "PLANNED" as const : "DONE" as const;
    const date = parseDay(text(fd, "date"));
    if (!date) throw new FormError(status === "PLANNED" ? "Vade tarihini seçin." : "Tarihi seçin.");
    const docDateRaw = text(fd, "docDate");
    const docDate = docDateRaw ? parseDay(docDateRaw) : null;
    if (docDateRaw && !docDate) throw new FormError("Belge tarihi geçersiz.");
    const title = text(fd, "title");
    if (!title) throw new FormError("Açıklama yazın.");
    const amount = r2(number(fd, "amount", "Tutar", { required: true })!);
    if (!(amount > 0)) throw new FormError("Tutar sıfırdan büyük olmalı.");

    const accountId = opt(fd, "accountId");
    const toAccountId = type === "TRANSFER" ? opt(fd, "toAccountId") : null;
    const categoryId = type === "TRANSFER" ? null : opt(fd, "categoryId");
    const projectId = type === "TRANSFER" ? null : opt(fd, "projectId");
    const contactId = type === "TRANSFER" ? null : opt(fd, "contactId");
    await assertOwned(ledgerId, { accountId, toAccountId, categoryId, projectId, contactId });

    if (type === "TRANSFER") {
        status = "DONE";
        if (!accountId || !toAccountId) throw new FormError("Virman için çıkış ve giriş hesabını seçin.");
        if (accountId === toAccountId) throw new FormError("Çıkış ve giriş hesabı aynı olamaz.");
    } else if (status === "DONE" && !accountId && text(fd, "noAccount") !== "1") {
        throw new FormError("Gerçekleşen harekette hesabı seçin. Hesap yoksa 'Vadeli' kaydedin.");
    }

    if (categoryId) {
        const c = await prisma.finCategory.findUnique({ where: { id: categoryId }, select: { kind: true } });
        if (c && c.kind !== (type === "INCOME" ? "INCOME" : "EXPENSE")) throw new FormError(type === "INCOME" ? "Gelir için bir gelir kalemi seçin." : "Gider için bir gider kalemi seçin.");
    }

    // Para birimi: hesap varsa hesabın, yoksa formdaki
    const [account, toAccount] = await Promise.all([
        accountId ? prisma.finAccount.findUnique({ where: { id: accountId }, select: { currency: true } }) : null,
        toAccountId ? prisma.finAccount.findUnique({ where: { id: toAccountId }, select: { currency: true } }) : null,
    ]);
    const currency = account?.currency ?? (text(fd, "currency") || "TRY");
    if (!isCurrency(currency)) throw new FormError("Para birimi geçersiz.");
    let fxRate = 1;
    if (currency !== "TRY") {
        fxRate = number(fd, "fxRate", "Kur") ?? 0;
        if (!(fxRate > 0)) fxRate = rateTRY(currency, await loadRates()) ?? 0;
        if (!(fxRate > 0)) throw new FormError(`${currency} kurunu yazın (1 ${currency} kaç TL).`);
    }

    let toAmount: number | null = null;
    if (type === "TRANSFER" && account && toAccount) {
        if (account.currency === toAccount.currency) toAmount = amount;
        else {
            toAmount = number(fd, "toAmount", "Giriş tutarı", { required: true })!;
            if (!(toAmount > 0)) throw new FormError("Giriş tutarı sıfırdan büyük olmalı.");
            toAmount = r2(toAmount);
        }
    }

    const vatRate = type === "TRANSFER" ? null : number(fd, "vatRate", "KDV oranı");
    if (vatRate != null && vatRate > 100) throw new FormError("KDV oranı en çok 100 olabilir.");
    const vatAmount = type === "TRANSFER" ? 0 : r2(number(fd, "vatAmount", "KDV tutarı") ?? vatOf(amount, vatRate));
    if (vatAmount > amount) throw new FormError("KDV tutarı toplam tutardan büyük olamaz.");
    const withholdingAmount = type === "TRANSFER" ? 0 : r2(number(fd, "withholdingAmount", "Stopaj") ?? 0);

    // Gider projeye bağlıysa: müşteriden ekstra alınacak tutar (isteğe bağlı)
    const rebill = type === "EXPENSE" && projectId ? number(fd, "rebillAmount", "Müşteriden alınacak tutar") : null;
    const rebillAmount = rebill != null && rebill > 0 ? r2(rebill) : null;

    // Harcamayı yapan kişi (kim ne harcadı): yalnızca gider; geçerli bir kullanıcı olmalı
    let spenderId = type === "EXPENSE" ? opt(fd, "spenderId") : null;
    if (spenderId && !(await prisma.appUser.findUnique({ where: { id: spenderId }, select: { id: true } }))) spenderId = null;

    return {
        id: opt(fd, "id"), ledgerId,
        data: {
            type, status, date, docDate, docNo: opt(fd, "docNo"), title, note: opt(fd, "note"),
            amount, currency, fxRate, amountTRY: r2(amount * fxRate), vatRate, vatAmount, withholdingAmount,
            accountId, toAccountId, toAmount, categoryId, projectId, contactId, rebillAmount, spenderId,
        },
    };
}

/** Yüklenen dosyaları doğrular (PDF / görsel, ≤ 5 MB, en çok 5) */
export async function readFiles(fd: FormData) {
    const raw = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, MAX_FILES);
    const out: { name: string; mime: string; size: number; bytes: Uint8Array }[] = [];
    for (const f of raw) {
        const file = await readInvoiceFile(f);
        if (file && "error" in file) throw new FormError(`${f.name}: ${file.error}`);
        if (file) out.push({ name: file.name, mime: file.mime, size: file.bytes.length, bytes: file.bytes });
    }
    return out;
}

/** Hareketi oluşturur ya da günceller; dosyaları ekler. Kimliği döndürür. */
export async function saveTransaction(fd: FormData, actor: string) {
    const parsed = await parseTxForm(fd);
    const files = await readFiles(fd);
    const { id, ledgerId, data } = parsed;
    let txId: string;
    if (id) {
        const existing = await prisma.finTransaction.findFirst({ where: { id, ledgerId }, select: { id: true } });
        if (!existing) throw new FormError("Hareket bulunamadı.");
        await prisma.finTransaction.update({ where: { id }, data });
        txId = id;
    } else {
        txId = (await prisma.finTransaction.create({ data: { ...data, ledgerId, createdBy: actor }, select: { id: true } })).id;
    }
    if (files.length) {
        await prisma.finAttachment.createMany({ data: files.map(f => ({ transactionId: txId, name: f.name, mime: f.mime, size: f.size, data: Buffer.from(f.bytes) })) });
    }
    return txId;
}

/**
 * Vadeli hareketi gerçekleştirir (ödendi / tahsil edildi). `amount` kalandan azsa kısmi ödeme:
 * ödenen kısım yeni gerçekleşen kayıt olur, vadeli kayıt kalan tutara iner.
 */
export async function settleTransaction(ledgerId: string, id: string, input: { accountId: string; date: Date; amount?: number | null }) {
    const tx = await prisma.finTransaction.findFirst({ where: { id, ledgerId } });
    if (!tx) throw new FormError("Hareket bulunamadı.");
    if (tx.status !== "PLANNED") throw new FormError("Bu hareket zaten gerçekleşmiş.");
    if (tx.type === "TRANSFER") throw new FormError("Virman vadeli olamaz.");
    await assertOwned(ledgerId, { accountId: input.accountId });
    const account = await prisma.finAccount.findUniqueOrThrow({ where: { id: input.accountId }, select: { currency: true, name: true } });
    if (account.currency !== tx.currency) {
        throw new FormError(`${account.name} hesabı ${account.currency}, bu kayıt ${tx.currency}. Hareketi açıp para birimini ve kuru düzenleyin ya da ${tx.currency} hesabı seçin.`);
    }
    const pay = r2(input.amount ?? tx.amount);
    if (!(pay > 0)) throw new FormError("Ödenen tutarı yazın.");
    if (pay > tx.amount + 0.001) throw new FormError(`Ödenen tutar kalan tutardan (${tx.amount.toLocaleString("tr-TR")} ${tx.currency}) fazla olamaz.`);

    if (pay >= tx.amount - 0.001) {
        await prisma.finTransaction.update({ where: { id }, data: { status: "DONE", accountId: input.accountId, date: input.date } });
        return { partial: false, left: 0 };
    }
    const ratio = pay / tx.amount;
    const left = r2(tx.amount - pay);
    await prisma.$transaction([
        prisma.finTransaction.create({
            data: {
                ledgerId, type: tx.type, status: "DONE", date: input.date, docDate: tx.docDate, docNo: tx.docNo, title: tx.title, note: tx.note ? `${tx.note} · kısmi ödeme` : "Kısmi ödeme",
                amount: pay, currency: tx.currency, fxRate: tx.fxRate, amountTRY: r2(pay * tx.fxRate), vatRate: tx.vatRate, vatAmount: r2(tx.vatAmount * ratio), withholdingAmount: r2(tx.withholdingAmount * ratio),
                accountId: input.accountId, categoryId: tx.categoryId, projectId: tx.projectId, contactId: tx.contactId, recurringId: null, createdBy: tx.createdBy,
            },
        }),
        prisma.finTransaction.update({
            where: { id },
            data: { amount: left, amountTRY: r2(left * tx.fxRate), vatAmount: r2(tx.vatAmount * (1 - ratio)), withholdingAmount: r2(tx.withholdingAmount * (1 - ratio)) },
        }),
    ]);
    return { partial: true, left };
}
