import Link from "next/link";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { ensureFreshRates, isStale, toDTO } from "@/lib/finance/rates";
import { generateRecurring } from "@/lib/finance/recurring";
import { loadDashboard } from "@/lib/finance/summary";
import { cashForecast, monthlyActuals } from "@/lib/finance/cashflow";
import { projectsOverview } from "@/lib/finance/reports";
import { addDays, diffDays, fmtDay, fmtShort, monthLabel, today } from "@/lib/finance/dates";
import { money, tl0 } from "@/lib/finance/money";
import { Amount, Kpi } from "@/components/finance/ui";
import { ColumnChart, LineChart } from "@/components/finance/charts";
import { RateStrip } from "@/components/finance/LiveRates";
import InstallHint from "@/components/InstallHint";
import YearlyOverview from "@/components/finance/YearlyOverview";
import { yearlyReport } from "@/lib/finance/yearly";

export const dynamic = "force-dynamic";

/** Finans özeti: nakit, alacak / borç, bu ay, 30 gün tahmini, uyarılar, kurlar, açık projeler */
export default async function FinanceHome({ searchParams }: { searchParams: Promise<{ yil?: string }> }) {
    await requireFinancePage();
    const { yil } = await searchParams;
    const { ledger } = await activeLedger();
    await generateRecurring(ledger.id);
    const rates = await ensureFreshRates(300);
    const reportYear = yil === "tumu" ? null : Number.isInteger(Number(yil)) && Number(yil) > 2000 ? Number(yil) : new Date().getUTCFullYear();
    const [yearly, dash, forecast, months, projects] = await Promise.all([
        yearlyReport(ledger.id, reportYear),
        loadDashboard(ledger.id, rates),
        cashForecast(ledger.id, rates, { days: 30 }),
        monthlyActuals(ledger.id, rates, 12),
        projectsOverview(ledger.id),
    ]);
    const now = today();
    const soon = forecast.items.filter(i => diffDays(now, i.date) <= 14);
    const cards = dash.accounts.filter(a => a.kind === "CREDIT_CARD" && a.dueDay && (a.balanceTRY ?? 0) < 0);
    const staleRates = ["USD", "EUR", "GRAM_ALTIN"].filter(c => rates[c] && isStale(rates[c]));

    const alerts: { tone: "bad" | "warn"; text: React.ReactNode }[] = [];
    if (forecast.low.balance < 0) alerts.push({ tone: "bad", text: <>Kasa <strong>{fmtDay(forecast.low.date)}</strong> tarihinde <strong>{money(forecast.low.balance, "TRY", 0)}</strong> ile eksiye düşebilir. <Link className="adm-link" href="/nakit-akisi">Nakit akışına bak</Link></> });
    if (dash.payable.overdueCount) alerts.push({ tone: "bad", text: <><strong>{dash.payable.overdueCount}</strong> gecikmiş ödeme var ({tl0(dash.payable.overdue)}). <Link className="adm-link" href="/vadeler?tur=borc">Ödemeler</Link></> });
    if (dash.receivable.overdueCount) alerts.push({ tone: "warn", text: <><strong>{dash.receivable.overdueCount}</strong> gecikmiş tahsilat var ({tl0(dash.receivable.overdue)}). <Link className="adm-link" href="/vadeler?tur=alacak">Tahsilatlar</Link></> });
    if (dash.soon.cheques) alerts.push({ tone: "warn", text: <>7 gün içinde vadesi gelen <strong>{dash.soon.cheques}</strong> çek / senet var. <Link className="adm-link" href="/cek-senet">Çek / senet</Link></> });
    for (const c of cards) {
        const dueIn = diffDays(now, addDays(now, 0)) + (((c.dueDay! - now.getUTCDate()) + 31) % 31);
        if (dueIn <= 5) alerts.push({ tone: "warn", text: <><strong>{c.name}</strong> son ödeme günü {dueIn === 0 ? "bugün" : `${dueIn} gün sonra`}; borç {money(Math.abs(c.balanceTRY ?? 0), "TRY", 0)}.</> });
    }
    if (dash.totals.missingRate.length) alerts.push({ tone: "warn", text: <>{dash.totals.missingRate.join(", ")} kuru yok; bu para birimindeki hesaplar toplamlara girmiyor. <Link className="adm-link" href="/ayarlar">Kur gir</Link></> });
    if (staleRates.length) alerts.push({ tone: "warn", text: <>{staleRates.join(", ")} kuru güncel değil; kur kaynağı yanıt vermiyor olabilir. <Link className="adm-link" href="/ayarlar">Kaynağı sına</Link></> });
    if (dash.ignored) alerts.push({ tone: "warn", text: <>{dash.ignored} hareket hesabın açılış tarihinden önce olduğu için bakiyeye girmiyor. <Link className="adm-link" href="/hesaplar">Hesaplar</Link></> });

    const empty = dash.accounts.length === 0;
    const active = projects.filter(p => p.status === "ACTIVE").slice(0, 6);

    return (
        <div>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">{ledger.name}</h1>
                    <p className="adm-sub">Nakit, alacak ve borçlar, vadeler, projeler ve yatırımlar tek bakışta. Tutarlar TL karşılığıdır.</p>
                </div>
                <div className="adm-actions">
                    <Link href="/yeni" className="btn btn-dark btn-sm">Hızlı gider</Link>
                    <Link href="/ice-aktar" className="btn btn-sm adm-btn-outline">Ekstre içe aktar</Link>
                </div>
            </div>

            <YearlyOverview r={yearly} />

            <h2 className="pl-head" style={{ marginTop: 26 }}>Güncel durum</h2>

            <InstallHint />

            {empty && (
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">Başlamak için</h2></div>
                    <div className="adm-card-body">
                        <ol style={{ paddingLeft: 20, display: "grid", gap: 8, fontSize: "0.9rem" }}>
                            <li><Link className="adm-link" href="/hesaplar">Banka hesaplarınızı, kasanızı ve kredi kartlarınızı ekleyin</Link> (açılış bakiyesiyle).</li>
                            <li><Link className="adm-link" href="/projeler">Projelerinizi</Link> ve <Link className="adm-link" href="/cariler">carilerinizi</Link> ekleyin (müşteri, tedarikçi, taşeron).</li>
                            <li>Harcamaları <Link className="adm-link" href="/hareketler">Hareketler</Link>den girin ya da banka ekstresini <Link className="adm-link" href="/ice-aktar">CSV olarak içe aktarın</Link>.</li>
                            <li>Alacak ve borçlarınızı <Link className="adm-link" href="/vadeler">Vadeler</Link>de vadesiyle girin; nakit akışı tahmini kendiliğinden çıkar.</li>
                        </ol>
                    </div>
                </section>
            )}

            <RateStrip codes={["USD", "EUR", "GBP", "GRAM_ALTIN", "CEYREK"]} initial={Object.values(rates).map(toDTO)} />

            {alerts.length > 0 && <div className="fin-alerts">{alerts.map((a, i) => <div key={i} className={`fin-warn${a.tone === "bad" ? " bad" : ""}`}>{a.tone === "bad" ? "▲ " : "● "}{a.text}</div>)}</div>}

            <div className="adm-kpis">
                <Kpi accent label="Toplam nakit" value={money(dash.totals.cash, "TRY", 0)} note="banka + kasa + POS" href="/hesaplar" />
                <Kpi label="Net varlık" value={money(dash.netWorth, "TRY", 0)} note={`nakit − kart borcu${dash.invest.count ? " + yatırım" : ""}`} />
                <Kpi label="Alacaklar (tahsil edilecek)" value={tl0(dash.receivable.total)} note={dash.receivable.overdueCount ? `${tl0(dash.receivable.overdue)} gecikmiş` : `${dash.receivable.count} kalem`} tone={dash.receivable.overdueCount ? "warn" : undefined} href="/vadeler?tur=alacak" />
                <Kpi label="Borçlar (ödenecek)" value={tl0(dash.payable.total)} note={dash.payable.overdueCount ? `${tl0(dash.payable.overdue)} gecikmiş` : `${dash.payable.count} kalem`} tone={dash.payable.overdueCount ? "neg" : undefined} href="/vadeler?tur=borc" />
            </div>
            <div className="adm-kpis">
                <Kpi label="Bu ay gelir" value={tl0(dash.month.income)} note="gerçekleşen" />
                <Kpi label="Bu ay gider" value={tl0(dash.month.expense)} note="gerçekleşen" />
                <Kpi label="Bu ay net" value={<Amount value={dash.month.net} digits={0} sign />} note={dash.month.income ? `marj %${Math.round((dash.month.net / dash.month.income) * 100)}` : "—"} />
                <Kpi label="30 gün sonra tahmini kasa" value={money(forecast.end, "TRY", 0)} note={`en düşük ${money(forecast.low.balance, "TRY", 0)} (${fmtShort(forecast.low.date)})`} tone={forecast.low.balance < 0 ? "neg" : undefined} href="/nakit-akisi" />
                {dash.invest.count > 0 && <Kpi label="Yatırımlar" value={tl0(dash.invest.value)} note={<>K/Z <Amount value={dash.invest.value - dash.invest.cost} digits={0} sign /></>} href="/yatirimlar" />}
                {dash.totals.cardDebt > 0 && <Kpi label="Kredi kartı borcu" value={tl0(dash.totals.cardDebt)} note="güncel bakiye" />}
            </div>

            <div className="adm-cols">
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">Önümüzdeki 14 gün</h2><Link className="adm-link" href="/vadeler">Tüm vadeler</Link></div>
                    {soon.length === 0 ? <p className="adm-empty">14 gün içinde vadesi gelen kayıt yok.</p> : (
                        <div className="adm-table-wrap">
                            <table className="adm-table">
                                <thead><tr><th>Tarih</th><th>Kalem</th><th className="num">Tutar</th></tr></thead>
                                <tbody>
                                    {soon.slice(0, 12).map((i, n) => (
                                        <tr key={n} className={i.overdue ? "late" : ""}>
                                            <td>{fmtShort(i.originalDate)}{i.overdue && <span className="fin-sub fin-neg">▲ gecikmiş</span>}</td>
                                            <td className="wrap">{i.href ? <Link className="adm-link" href={i.href}>{i.label}</Link> : i.label}</td>
                                            <td className="num"><Amount value={i.amount} digits={0} sign /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">Hesaplar</h2><Link className="adm-link" href="/hesaplar">Yönet</Link></div>
                    {dash.accounts.length === 0 ? <p className="adm-empty">Hesap yok.</p> : (
                        <table className="adm-table">
                            <tbody>
                                {dash.accounts.map(a => (
                                    <tr key={a.id}><td>{a.name}<span className="fin-sub">{a.currency}{a.kind === "CREDIT_CARD" ? " · kart" : ""}</span></td>
                                        <td className="num"><Amount value={a.balance} currency={a.currency} digits={0} />{a.currency !== "TRY" && a.balanceTRY != null && <span className="fin-sub">≈ {tl0(a.balanceTRY)}</span>}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </section>
            </div>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Son 12 ay: gelir ve gider</h2><span className="adm-card-note">Gerçekleşen hareketler (virman hariç)</span></div>
                <ColumnChart label="Aylık gelir ve gider" data={months.map(m => ({ label: monthLabel(m.month), a: m.income, b: m.expense }))} />
            </section>
            {months.some(m => m.cash != null) && (
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">Ay sonu nakit seyri</h2><span className="adm-card-note">Bugünkü nakitten geriye hesaplanır (döviz hesapları bugünkü kurla, tahmini)</span></div>
                    <LineChart label="Ay sonu nakit" name="Nakit" points={months.map(m => ({ label: monthLabel(m.month), value: m.cash ?? 0 }))} />
                </section>
            )}

            {active.length > 0 && (
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">Devam eden projeler</h2><Link className="adm-link" href="/projeler">Tüm projeler</Link></div>
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Proje</th><th className="num">Gelir</th><th className="num">Gider</th><th className="num">Kâr</th><th className="num">Bütçe kullanımı</th></tr></thead>
                            <tbody>
                                {active.map(p => (
                                    <tr key={p.id}>
                                        <td><Link className="adm-link" href={`/projeler/${p.id}`}>{p.name}</Link><span className="fin-sub">{p.client ?? "Müşteri belirtilmemiş"}</span></td>
                                        <td className="num">{tl0(p.income)}</td><td className="num">{tl0(p.expense)}</td>
                                        <td className="num"><Amount value={p.margin} digits={0} sign /></td>
                                        <td className="num">{p.budgetUsedPct == null ? "—" : <span className={p.budgetUsedPct > 100 ? "fin-neg" : ""}>{p.budgetUsedPct > 100 ? "▲ " : ""}%{Math.round(p.budgetUsedPct)}</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

        </div>
    );
}
