import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { ensureFreshRates } from "@/lib/finance/rates";
import { formOptions } from "@/lib/finance/options";
import { TX_STATUS, TX_TYPE } from "@/lib/finance/labels";
import { dateTimeTR } from "@/lib/finance/dates";
import { diffDays, today, todayYmd, ymd } from "@/lib/finance/dates";
import { money } from "@/lib/finance/money";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import TxForm from "@/components/finance/TxForm";
import AttachmentUploader from "@/components/finance/AttachmentUploader";
import { DueBadge } from "@/components/finance/ui";
import { deleteAttachment, deleteTransaction, settleAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function HareketDetay({ params }: { params: Promise<{ id: string }> }) {
    const me = await requireFinancePage();
    const { id } = await params;
    const { ledger } = await activeLedger();
    const tx = await prisma.finTransaction.findFirst({
        where: { id, ledgerId: ledger.id },
        include: {
            attachments: { select: { id: true, name: true, mime: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" } },
            cheque: { select: { id: true, number: true, status: true } }, recurring: { select: { id: true, title: true } },
        },
    });
    if (!tx) notFound();
    const rates = await ensureFreshRates(600);
    const opts = await formOptions(ledger.id, rates);
    // Pasife alınmış hesabı seçili hareket düzenlenirken de göster
    const hasAccount = (aid: string | null) => !aid || opts.accounts.some(a => a.id === aid);
    const extra = [tx.accountId, tx.toAccountId].filter((a): a is string => !!a && !hasAccount(a));
    if (extra.length) {
        const inactive = await prisma.finAccount.findMany({ where: { id: { in: extra } }, select: { id: true, name: true, currency: true, kind: true } });
        opts.accounts.push(...inactive.map(a => ({ id: a.id, label: `${a.name} (pasif)`, currency: a.currency, kind: a.kind })));
    }
    const late = tx.status === "PLANNED" ? diffDays(tx.date, today()) : null;
    const sameCurrency = opts.accounts.filter(a => a.currency === tx.currency);

    return (
        <div>
            <Link href="/hareketler" className="adm-back">← Hareketler</Link>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">{tx.title}</h1>
                    <p className="adm-sub">
                        <span className={`adm-badge ${TX_TYPE[tx.type].tone}`}>{TX_TYPE[tx.type].label}</span>{" "}
                        <span className={`adm-badge ${tx.status === "PLANNED" ? "warn" : "ok"}`}>{TX_STATUS[tx.status]}</span>{" "}
                        {late != null && <DueBadge days={late} />} · {money(tx.amount, tx.currency)}{tx.currency !== "TRY" && ` (≈ ${money(tx.amountTRY)})`}
                        {tx.recurring && <> · tekrarlayan: {tx.recurring.title}</>}
                        {tx.cheque && <> · <Link className="adm-link" href="/cek-senet">çek / senet {tx.cheque.number ?? ""}</Link></>}
                    </p>
                </div>
            </div>

            {tx.status === "PLANNED" && tx.type !== "TRANSFER" && (
                <section className="adm-card fin-edit">
                    <div className="adm-card-head"><h2 className="adm-card-title">{tx.type === "INCOME" ? "Tahsil edildi olarak işle" : "Ödendi olarak işle"}</h2><span className="adm-card-note">Eksik tutar girerseniz kısmi {tx.type === "INCOME" ? "tahsilat" : "ödeme"} olur, kalan vadeli kalır.</span></div>
                    <div className="adm-card-body">
                        <AdminForm action={settleAction} className="adm-inline">
                            <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={tx.id} />
                            <label className="adm-field"><span className="adm-label">Hesap ({tx.currency})</span><select name="accountId" defaultValue={tx.accountId ?? sameCurrency[0]?.id} required>{sameCurrency.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Gün</span><input type="date" name="date" defaultValue={todayYmd()} required /></label>
                            <label className="adm-field"><span className="adm-label">Tutar</span><input name="amount" inputMode="decimal" defaultValue={String(tx.amount).replace(".", ",")} /></label>
                            <SubmitButton>{tx.type === "INCOME" ? "Tahsil edildi" : "Ödendi"}</SubmitButton>
                        </AdminForm>
                        {sameCurrency.length === 0 && <p className="fin-hint">{tx.currency} cinsinden hesap yok; önce hesap ekleyin.</p>}
                    </div>
                </section>
            )}

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Hareketi düzenle</h2><span className="adm-card-note">Kayıt: {tx.createdBy ?? "—"} · {dateTimeTR(tx.createdAt)}</span></div>
                <div className="adm-card-body">
                    <TxForm
                        ledgerId={ledger.id} today={todayYmd()} accounts={opts.accounts} categories={opts.categories} projects={opts.projects} contacts={opts.contacts} people={opts.people} meId={me.id} rates={opts.rates}
                        initial={{
                            id: tx.id, type: tx.type, status: tx.status, date: ymd(tx.date), docDate: tx.docDate ? ymd(tx.docDate) : undefined, docNo: tx.docNo ?? undefined, title: tx.title, note: tx.note ?? undefined,
                            amount: tx.amount, currency: tx.currency, fxRate: tx.fxRate, vatRate: tx.vatRate, vatAmount: tx.vatAmount, withholdingAmount: tx.withholdingAmount, rebillAmount: tx.rebillAmount, spenderId: tx.spenderId,
                            accountId: tx.accountId, toAccountId: tx.toAccountId, toAmount: tx.toAmount, categoryId: tx.categoryId, projectId: tx.projectId, contactId: tx.contactId,
                        }}
                    />
                </div>
            </section>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Belgeler (fiş, fatura, dekont)</h2></div>
                <div className="adm-card-body adm-form">
                    {tx.attachments.length > 0 && (
                        <div className="fin-files">
                            {tx.attachments.map(f => (
                                <div key={f.id} className="fin-file">
                                    <a className="adm-link" href={`/ek/${f.id}`} target="_blank" rel="noreferrer">{f.name}</a>
                                    <span className="muted">{Math.round(f.size / 1024)} KB</span>
                                    <AdminForm action={deleteAttachment}>
                                        <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={f.id} />
                                        <SubmitButton className="adm-btn-link" confirm="Dosya silinsin mi?" pendingText="…">Sil</SubmitButton>
                                    </AdminForm>
                                </div>
                            ))}
                        </div>
                    )}
                    <AttachmentUploader transactionId={tx.id} />
                </div>
            </section>

            <section className="adm-card">
                <div className="adm-card-body">
                    <AdminForm action={deleteTransaction} className="adm-inline">
                        <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={tx.id} /><input type="hidden" name="redirect" value="/hareketler" />
                        <SubmitButton className="btn btn-sm adm-btn-danger" confirm="Hareket silinsin mi? Hesap bakiyesi ve raporlar buna göre değişir.">Hareketi sil</SubmitButton>
                        {tx.recurringId && tx.status === "PLANNED" && <span className="adm-help">Tekrarlayan şablondan üretilmiş vade: silerseniz bu tarih atlanır, şablon sürer.</span>}
                    </AdminForm>
                </div>
            </section>
        </div>
    );
}
