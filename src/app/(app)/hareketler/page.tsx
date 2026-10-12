import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { ensureFreshRates } from "@/lib/finance/rates";
import { formOptions } from "@/lib/finance/options";
import { TX_TYPE } from "@/lib/finance/labels";
import { TX_PAGE_SIZE, filterRange, txWhere, type TxFilter } from "@/lib/finance/tx-query";
import { PERIODS, fmtDay, todayYmd } from "@/lib/finance/dates";
import { money, tl0 } from "@/lib/finance/money";
import { Amount, Kpi } from "@/components/finance/ui";
import TxForm from "@/components/finance/TxForm";

export const dynamic = "force-dynamic";

/** Hareketler: gelir, gider ve virman defteri. Süz, ara, CSV indir; yeni hareket ekle. */
export default async function Hareketler({ searchParams }: { searchParams: Promise<TxFilter & { yeni?: string }> }) {
    await requireFinancePage();
    const sp = await searchParams;
    const { ledger } = await activeLedger();
    const rates = await ensureFreshRates(600);
    const opts = await formOptions(ledger.id, rates);
    const where = await txWhere(ledger.id, sp);
    const page = Math.max(1, Number(sp.sayfa) || 1);
    const range = filterRange(sp);
    const [rows, count, sums] = await Promise.all([
        prisma.finTransaction.findMany({
            where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * TX_PAGE_SIZE, take: TX_PAGE_SIZE,
            include: { account: { select: { name: true } }, toAccount: { select: { name: true } }, project: { select: { code: true, name: true } }, contact: { select: { name: true } }, category: { select: { name: true, parent: { select: { name: true } } } }, _count: { select: { attachments: true } } },
        }),
        prisma.finTransaction.count({ where }),
        prisma.finTransaction.groupBy({ by: ["type"], where, _sum: { amountTRY: true } }),
    ]);
    const income = sums.find(s => s.type === "INCOME")?._sum.amountTRY ?? 0;
    const expense = sums.find(s => s.type === "EXPENSE")?._sum.amountTRY ?? 0;
    const pages = Math.max(1, Math.ceil(count / TX_PAGE_SIZE));
    const qs = (over: Record<string, string>) => {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries({ ...sp, ...over })) if (v && k !== "yeni") p.set(k, String(v));
        return p.toString();
    };
    const hasFilter = Object.entries(sp).some(([k, v]) => v && !["sayfa", "yeni"].includes(k));

    return (
        <div>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">Hareketler</h1>
                    <p className="adm-sub">Gelir, gider ve virmanların defteri. Vadeli kayıtlar (ödenecek / tahsil edilecek) ödenince gerçekleşmiş olur.</p>
                </div>
                <div className="adm-actions">
                    <a className="btn btn-sm adm-btn-outline" href={`/hareketler/csv?${qs({ sayfa: "" })}`}>CSV indir</a>
                    <Link className="btn btn-sm adm-btn-outline" href="/ice-aktar">Ekstre içe aktar</Link>
                </div>
            </div>

            <details className="adm-fold" open={!!sp.yeni || count === 0}>
                <summary>Yeni hareket ekle</summary>
                <div className="adm-card-body">
                    {opts.accounts.length === 0
                        ? <p className="adm-empty">Önce <Link className="adm-link" href="/hesaplar">bir hesap ekleyin</Link>. Hesapsız yalnızca vadeli kayıt girilebilir.</p>
                        : null}
                    <TxForm ledgerId={ledger.id} today={todayYmd()} accounts={opts.accounts} categories={opts.categories} projects={opts.projects} contacts={opts.contacts} rates={opts.rates} />
                </div>
            </details>

            <section className="adm-card">
                <form method="get" className="fin-filter">
                    <label className="adm-field"><span className="adm-label">Dönem</span>
                        <select name="donem" defaultValue={range.key === "ozel" ? "" : range.key}><option value="">Özel aralık</option>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                    <label className="adm-field"><span className="adm-label">Başlangıç</span><input type="date" name="from" defaultValue={sp.from ?? ""} /></label>
                    <label className="adm-field"><span className="adm-label">Bitiş</span><input type="date" name="to" defaultValue={sp.to ?? ""} /></label>
                    <label className="adm-field"><span className="adm-label">Tür</span><select name="tur" defaultValue={sp.tur ?? ""}><option value="">Hepsi</option><option value="gelir">Gelir</option><option value="gider">Gider</option><option value="virman">Virman</option></select></label>
                    <label className="adm-field"><span className="adm-label">Durum</span><select name="durum" defaultValue={sp.durum ?? ""}><option value="">Hepsi</option><option value="gerceklesen">Gerçekleşen</option><option value="vadeli">Vadeli</option></select></label>
                    <label className="adm-field"><span className="adm-label">Hesap</span><select name="hesap" defaultValue={sp.hesap ?? ""}><option value="">Hepsi</option>{opts.accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
                    <label className="adm-field"><span className="adm-label">Proje</span><select name="proje" defaultValue={sp.proje ?? ""}><option value="">Hepsi</option><option value="yok">Projesiz</option>{opts.projects.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
                    <label className="adm-field"><span className="adm-label">Kalem</span><select name="kalem" defaultValue={sp.kalem ?? ""}><option value="">Hepsi</option>{opts.categories.map(c => <option key={c.id} value={c.id}>{c.kind === "INCOME" ? "Gelir · " : ""}{c.label}</option>)}</select></label>
                    <label className="adm-field"><span className="adm-label">Cari</span><select name="cari" defaultValue={sp.cari ?? ""}><option value="">Hepsi</option>{opts.contacts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
                    <label className="adm-field"><span className="adm-label">Ara</span><input name="q" defaultValue={sp.q ?? ""} placeholder="Açıklama, belge no, cari…" /></label>
                    <div className="adm-inline"><button className="btn btn-dark btn-sm" type="submit">Süz</button>{hasFilter && <Link className="adm-link" href="/hareketler">Temizle</Link>}</div>
                </form>
            </section>

            <div className="adm-kpis">
                <Kpi label="Gelir" value={tl0(income)} note="süzülen hareketler, KDV dahil" />
                <Kpi label="Gider" value={tl0(expense)} note="süzülen hareketler, KDV dahil" />
                <Kpi label="Fark" value={<Amount value={income - expense} digits={0} sign />} note={`${count} hareket · ${fmtDay(range.from)} – ${range.to.getUTCFullYear() > 2090 ? "…" : fmtDay(range.to)}`} />
            </div>

            <section className="adm-card">
                {rows.length === 0 ? <p className="adm-empty">Bu süzgeçte hareket yok.</p> : (
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Tarih</th><th>Açıklama</th><th className="hide-sm">Kalem</th><th className="hide-sm">Proje</th><th className="hide-sm">Hesap</th><th className="num">Tutar</th></tr></thead>
                            <tbody>
                                {rows.map(t => {
                                    const cat = t.category ? (t.category.parent ? `${t.category.parent.name} › ${t.category.name}` : t.category.name) : null;
                                    return (
                                        <tr key={t.id}>
                                            <td>{fmtDay(t.date)}{t.status === "PLANNED" && <span className="adm-badge warn" style={{ marginLeft: 6 }}>Vadeli</span>}</td>
                                            <td className="wrap">
                                                <Link className="adm-link" href={`/hareketler/${t.id}`}>{t.title}</Link>{t._count.attachments > 0 && <span title="Ekli dosya var"> 📎</span>}
                                                <span className="fin-sub">{[cat, t.project?.name, t.contact?.name, t.docNo && `Belge ${t.docNo}`].filter(Boolean).join(" · ")}</span>
                                            </td>
                                            <td className="wrap hide-sm">{t.type === "TRANSFER" ? <span className="adm-badge muted">Virman</span> : cat ?? <span className="muted">—</span>}</td>
                                            <td className="wrap hide-sm">{t.project ? `${t.project.code ? `${t.project.code} · ` : ""}${t.project.name}` : <span className="muted">—</span>}</td>
                                            <td className="hide-sm">{t.type === "TRANSFER" ? `${t.account?.name ?? "?"} → ${t.toAccount?.name ?? "?"}` : t.account?.name ?? <span className="muted">—</span>}</td>
                                            <td className="num">
                                                {t.type === "TRANSFER" ? <span className="fin-amount">{money(t.amount, t.currency)}</span> : <Amount value={t.type === "INCOME" ? t.amount : -t.amount} currency={t.currency} sign />}
                                                {t.currency !== "TRY" && <span className="fin-sub">≈ {tl0(t.amountTRY)}</span>}
                                                <span className="fin-sub">{TX_TYPE[t.type].label}{t.vatAmount > 0 ? ` · KDV ${money(t.vatAmount, t.currency)}` : ""}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {pages > 1 && (
                    <div className="fin-pager">
                        {page > 1 && <Link className="adm-link" href={`/hareketler?${qs({ sayfa: String(page - 1) })}`}>← Önceki</Link>}
                        <span>Sayfa {page} / {pages}</span>
                        {page < pages && <Link className="adm-link" href={`/hareketler?${qs({ sayfa: String(page + 1) })}`}>Sonraki →</Link>}
                    </div>
                )}
            </section>
        </div>
    );
}

