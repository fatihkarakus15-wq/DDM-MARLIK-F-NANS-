import Link from "next/link";
import { tl0 } from "@/lib/finance/money";
import { monthLabel } from "@/lib/finance/dates";
import type { YearlyReport } from "@/lib/finance/yearly";
import { ColumnChart } from "@/components/finance/charts";
import ShareBars from "@/components/finance/ShareBars";
import { Amount, Kpi } from "@/components/finance/ui";

/** Genel özetin üstü: yıl seçici, yıllık gelir-gider, aylık grafik ve işlere göre kâr tablosu */
export default function YearlyOverview({ r }: { r: YearlyReport }) {
    const label = r.year == null ? "Tüm zamanlar" : String(r.year);
    const totalExpense = r.projectExpense + r.officeExpense;
    // İş tabloları ve çubuklar yalnızca biten (teslim edilen) işleri gösterir; devam edenler dışarıda
    const done = r.projects.filter(p => p.status === "DONE");
    const ongoing = r.projects.length - done.length;
    const topProfit = done.filter(p => p.profit > 0).slice(0, 8);
    const sumOf = (f: (p: (typeof done)[number]) => number) => done.reduce((s, p) => s + f(p), 0);
    return (
        <section className="yr" aria-label="Yıllık özet">
            <nav className="pl-years" aria-label="Yıl">
                {r.years.map(y => <Link key={y} href={`/ozet?yil=${y}`} replace className={`pl-year${r.year === y ? " on" : ""}`}>{y}</Link>)}
                <Link href="/ozet?yil=tumu" replace className={`pl-year${r.year == null ? " on" : ""}`}>Tümü</Link>
            </nav>

            <div className="adm-kpis">
                <Kpi accent label={`${label}: kazanç (tahsilat)`} value={tl0(r.income)} note="gerçekleşen gelir" />
                <Kpi label={`${label}: toplam gider`} value={tl0(totalExpense)} note={`işler ${tl0(r.projectExpense)} · ofis ${tl0(r.officeExpense)}`} />
                <Kpi label="Net kalan" value={<Amount value={r.net} digits={0} sign />} note={r.income ? `marj %${Math.round((r.net / r.income) * 100)}` : undefined} />
                <Kpi label={`Kişi başı net (${r.people} kişi)`} value={<Amount value={r.net / r.people} digits={0} sign />} note="eşit paylaşımda" />
            </div>

            <div className="fin-two">
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">{label}: aylık gelir ve gider</h2></div>
                    <ColumnChart label="Aylık gelir ve gider" data={r.monthly.map(m => ({ label: monthLabel(m.month), a: m.income, b: m.expense }))} />
                </section>
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">Hangi işten ne kadar kazandık</h2><span className="adm-card-note">anlaşılan − harcama</span></div>
                    <ShareBars items={topProfit.map(p => ({ label: p.name, amount: p.profit, href: `/projeler/${p.id}` }))} tone="s3" empty="Bu dönemde iş yok." />
                    {topProfit.length > 0 && <div className="fin-share-total"><span>Toplam ({done.length} iş)</span><b>{tl0(sumOf(p => p.profit))}</b></div>}
                </section>
            </div>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Biten işler ({label})</h2><span className="adm-card-note">{done.length} iş · rakamlar işin başından bugüne</span></div>
                {done.length === 0 ? <p className="adm-empty">Bu dönemde biten iş yok.</p> : (
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>İş</th><th className="num">Anlaşılan</th><th className="num">Tahsil edilen</th><th className="num">Harcama</th><th className="num">Kâr</th><th className="num">Kişi başı</th><th className="num">Alacak</th></tr></thead>
                            <tbody>
                                {done.map(p => (
                                    <tr key={p.id}>
                                        <td className="wrap"><Link className="adm-link" href={`/projeler/${p.id}`}>{p.name}</Link></td>
                                        <td className="num">{tl0(p.agreed)}</td><td className="num">{tl0(p.collected)}</td><td className="num">{tl0(p.expense)}</td>
                                        <td className="num"><Amount value={p.profit} digits={0} /></td><td className="num">{tl0(p.profit / r.people)}</td><td className="num">{p.receivable ? tl0(p.receivable) : "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot><tr><td>Toplam</td><td className="num">{tl0(sumOf(p => p.agreed))}</td><td className="num">{tl0(sumOf(p => p.collected))}</td><td className="num">{tl0(sumOf(p => p.expense))}</td><td className="num">{tl0(sumOf(p => p.profit))}</td><td className="num">{tl0(sumOf(p => p.profit) / r.people)}</td><td className="num">{sumOf(p => p.receivable) ? tl0(sumOf(p => p.receivable)) : "—"}</td></tr></tfoot>
                        </table>
                    </div>
                )}
                {ongoing > 0 && <p className="adm-help" style={{ padding: "10px 14px 14px" }}>Devam eden {ongoing} iş bu tabloda yok; tahsilat ve harcamaları yukarıdaki kazanç ve gider toplamlarında sayılıyor.</p>}
            </section>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Kazanç detayı ({label})</h2><span className="adm-card-note">işe dokunun: bedel, tahsilat, harcama kalemleri</span></div>
                {done.length === 0 ? <p className="adm-empty">Bu dönemde biten iş yok.</p> : (
                    <ul className="pay-list">
                        {done.map(p => (
                            <li key={p.id}>
                                <details className="pay-item">
                                    <summary className="pay-row"><span><b>{p.name}</b><small>anlaşılan {tl0(p.agreed)} · harcama {tl0(p.expense)}</small></span><span className="pay-amt"><b><Amount value={p.profit} digits={0} /></b><small>kâr · kişi başı {tl0(p.profit / r.people)}</small></span></summary>
                                    <div className="pay-body">
                                        <div className="adm-table-wrap"><table className="adm-table">
                                            <thead><tr><th>Kalem</th><th className="num">Tutar</th></tr></thead>
                                            <tbody>
                                                <tr><td>İş bedeli</td><td className="num">{tl0(p.contract)}</td></tr>
                                                {p.extras.map((e, i) => <tr key={`e${i}`}><td className="wrap">İlave: {e.title}</td><td className="num">{tl0(e.amount)}</td></tr>)}
                                                <tr><td><b>Anlaşılan toplam</b></td><td className="num"><b>{tl0(p.agreed)}</b></td></tr>
                                                {p.collections.map((c, i) => <tr key={`c${i}`}><td>Tahsilat · {c.date.split("-").reverse().join(".")}</td><td className="num">{tl0(c.amount)}</td></tr>)}
                                                <tr><td><b>Tahsil edilen</b></td><td className="num"><b>{tl0(p.collected)}</b></td></tr>
                                                {p.spend.map(x => <tr key={x.label}><td className="wrap">Harcama · {x.label}</td><td className="num">−{tl0(x.amount)}</td></tr>)}
                                                <tr><td><b>Toplam harcama</b></td><td className="num"><b>−{tl0(p.expense)}</b></td></tr>
                                                <tr><td><b>Kâr (anlaşılan − harcama)</b></td><td className="num"><b><Amount value={p.profit} digits={0} /></b></td></tr>
                                                <tr><td>Alacak</td><td className="num">{p.receivable ? tl0(p.receivable) : "—"}</td></tr>
                                            </tbody>
                                        </table></div>
                                    </div>
                                </details>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Ofis giderleri ({label})</h2><span className="adm-card-note">toplam {tl0(r.officeExpense)}</span></div>
                <ShareBars items={r.office.map(o => ({ label: o.label, amount: o.amount, share: r.officeExpense ? (o.amount / r.officeExpense) * 100 : 0 }))} tone="s2" empty="Bu dönemde ofis gideri yok." />
            </section>
        </section>
    );
}
