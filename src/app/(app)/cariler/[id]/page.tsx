import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { ensureFreshRates } from "@/lib/finance/rates";
import { formOptions } from "@/lib/finance/options";
import { contactBalances } from "@/lib/finance/balances";
import { CHEQUE_DIRECTION, CHEQUE_KIND, CHEQUE_STATUS, CONTACT_KIND, TX_TYPE } from "@/lib/finance/labels";
import { diffDays, fmtDay, today, todayYmd } from "@/lib/finance/dates";
import { money, tl0 } from "@/lib/finance/money";
import { PrintButton } from "@/components/AdminForm";
import { Amount, DueBadge, Kpi } from "@/components/finance/ui";
import TxForm from "@/components/finance/TxForm";

export const dynamic = "force-dynamic";

/** Cari ekstresi: açık kalemler (kalan bakiye), kapanmış işlemler ve çek / senetler. Yazdırılabilir. */
export default async function CariDetay({ params }: { params: Promise<{ id: string }> }) {
    await requireFinancePage();
    const { id } = await params;
    const { ledger } = await activeLedger();
    const contact = await prisma.finContact.findFirst({ where: { id, ledgerId: ledger.id } });
    if (!contact) notFound();
    const rates = await ensureFreshRates(600);
    const [txs, cheques, balances, opts] = await Promise.all([
        prisma.finTransaction.findMany({
            where: { ledgerId: ledger.id, contactId: id, type: { in: ["INCOME", "EXPENSE"] } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }],
            include: { project: { select: { code: true, name: true } }, account: { select: { name: true } } },
        }),
        prisma.finCheque.findMany({ where: { ledgerId: ledger.id, contactId: id }, orderBy: { dueDate: "asc" } }),
        contactBalances(ledger.id),
        formOptions(ledger.id, rates),
    ]);
    const b = balances.get(id)!;
    const now = today();
    const open = txs.filter(t => t.status === "PLANNED");
    const closed = txs.filter(t => t.status === "DONE").reverse();
    const withBalance = open.reduce<{ t: (typeof open)[number]; bal: number }[]>((acc, t) => {
        const prev = acc.length ? acc[acc.length - 1].bal : contact.openingBalance;
        acc.push({ t, bal: prev + (t.type === "INCOME" ? t.amountTRY : -t.amountTRY) });
        return acc;
    }, []);

    return (
        <div>
            <Link href="/cariler" className="adm-back no-print">← Cariler</Link>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">{contact.name}</h1>
                    <p className="adm-sub">{CONTACT_KIND[contact.kind]}{contact.taxNo ? ` · Vergi no ${contact.taxNo}` : ""}{contact.taxOffice ? ` (${contact.taxOffice})` : ""}{contact.phone ? ` · ${contact.phone}` : ""}{contact.email ? ` · ${contact.email}` : ""}</p>
                </div>
                <div className="adm-actions no-print"><PrintButton>Ekstreyi yazdır</PrintButton><Link className="btn btn-sm adm-btn-outline" href={`/cariler?duzenle=${id}#form`}>Düzenle</Link></div>
            </div>

            <div className="adm-kpis">
                <Kpi label="Açılış bakiyesi" value={<Amount value={contact.openingBalance} digits={0} sign />} />
                <Kpi label="Tahsil edilecek" value={tl0(b.receivable)} note={b.overdueReceivable ? `${tl0(b.overdueReceivable)} gecikmiş` : undefined} tone={b.overdueReceivable ? "warn" : undefined} />
                <Kpi label="Ödenecek" value={tl0(b.payable)} note={b.overduePayable ? `${tl0(b.overduePayable)} gecikmiş` : undefined} tone={b.overduePayable ? "neg" : undefined} />
                <Kpi accent label="Net bakiye" value={<Amount value={b.net} digits={0} sign />} note={b.net > 0 ? "size borçlu" : b.net < 0 ? "siz borçlusunuz" : "kapalı"} />
            </div>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Açık kalemler</h2><span className="adm-card-note">Vade sırasıyla; kalan bakiye açılıştan başlar</span></div>
                {open.length === 0 && contact.openingBalance === 0 ? <p className="adm-empty">Açık kalem yok.</p> : (
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Vade</th><th>Açıklama</th><th>Proje</th><th className="num">Alacak</th><th className="num">Borç</th><th className="num">Kalan bakiye</th></tr></thead>
                            <tbody>
                                {contact.openingBalance !== 0 && <tr><td>—</td><td>Açılış bakiyesi</td><td /><td className="num">{contact.openingBalance > 0 ? tl0(contact.openingBalance) : ""}</td><td className="num">{contact.openingBalance < 0 ? tl0(-contact.openingBalance) : ""}</td><td className="num"><Amount value={contact.openingBalance} digits={0} sign /></td></tr>}
                                {withBalance.map(({ t, bal }) => {
                                    const late = diffDays(t.date, now);
                                    return (
                                        <tr key={t.id} className={late > 0 ? "late" : ""}>
                                            <td>{fmtDay(t.date)}<span className="fin-sub"><DueBadge days={late} /></span></td>
                                            <td className="wrap"><Link className="adm-link" href={`/hareketler/${t.id}`}>{t.title}</Link>{t.docNo && <span className="fin-sub">Belge {t.docNo}</span>}</td>
                                            <td className="wrap">{t.project ? t.project.name : "—"}</td>
                                            <td className="num">{t.type === "INCOME" ? money(t.amount, t.currency) : ""}</td>
                                            <td className="num">{t.type === "EXPENSE" ? money(t.amount, t.currency) : ""}</td>
                                            <td className="num"><Amount value={bal} digits={0} sign /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot><tr><td colSpan={5}>Güncel net bakiye</td><td className="num"><Amount value={b.net} digits={0} sign /></td></tr></tfoot>
                        </table>
                    </div>
                )}
            </section>

            {cheques.length > 0 && (
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">Çek / senetler</h2></div>
                    <table className="adm-table"><tbody>
                        {cheques.map(c => (
                            <tr key={c.id}><td>{fmtDay(c.dueDate)}</td><td>{CHEQUE_KIND[c.kind]} {c.number ?? ""} · {CHEQUE_DIRECTION[c.direction]}</td><td><span className={`adm-badge ${CHEQUE_STATUS[c.status].tone}`}>{CHEQUE_STATUS[c.status].label}</span></td><td className="num">{money(c.amount, c.currency)}</td></tr>
                        ))}
                    </tbody></table>
                </section>
            )}

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Kapanmış işlemler</h2><Link className="adm-link no-print" href={`/hareketler?cari=${id}&donem=tumu`}>Hepsi</Link></div>
                {closed.length === 0 ? <p className="adm-empty">Henüz tahsilat ya da ödeme yok.</p> : (
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Tarih</th><th>Açıklama</th><th>Hesap</th><th className="num">Tutar</th></tr></thead>
                            <tbody>
                                {closed.slice(0, 60).map(t => (
                                    <tr key={t.id}><td>{fmtDay(t.date)}</td><td className="wrap"><Link className="adm-link" href={`/hareketler/${t.id}`}>{t.title}</Link><span className="fin-sub">{TX_TYPE[t.type].label}{t.project ? ` · ${t.project.name}` : ""}</span></td><td>{t.account?.name ?? "—"}</td><td className="num"><Amount value={t.type === "INCOME" ? t.amount : -t.amount} currency={t.currency} sign /></td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <details className="adm-fold no-print">
                <summary>Bu cariye hareket ekle</summary>
                <div className="adm-card-body">
                    <TxForm ledgerId={ledger.id} today={todayYmd()} accounts={opts.accounts} categories={opts.categories} projects={opts.projects} contacts={opts.contacts} rates={opts.rates} initial={{ type: contact.kind === "CUSTOMER" ? "INCOME" : "EXPENSE", status: "PLANNED", contactId: id }} />
                </div>
            </details>
        </div>
    );
}
