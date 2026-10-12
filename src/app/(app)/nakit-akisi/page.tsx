import Link from "next/link";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { ensureFreshRates } from "@/lib/finance/rates";
import { generateRecurring } from "@/lib/finance/recurring";
import { cashForecast, monthlyActuals } from "@/lib/finance/cashflow";
import { fmtDay, fmtShort, monthLabel } from "@/lib/finance/dates";
import { money, tl0 } from "@/lib/finance/money";
import { Amount, Kpi } from "@/components/finance/ui";
import { ColumnChart, LineChart } from "@/components/finance/charts";

export const dynamic = "force-dynamic";

const HORIZONS = [30, 60, 90, 180];
const DELAYS = [0, 15, 30, 60];

/** Nakit akışı: bugünkü nakit + vadeli alacak / borçlar + çek / senet + kart ekstresi; gün gün tahmin ve senaryo. */
export default async function NakitAkisi({ searchParams }: { searchParams: Promise<{ gun?: string; gecikme?: string; gecikmis?: string }> }) {
    await requireFinancePage();
    const sp = await searchParams;
    const days = HORIZONS.includes(Number(sp.gun)) ? Number(sp.gun) : 90;
    const delay = DELAYS.includes(Number(sp.gecikme)) ? Number(sp.gecikme) : 0;
    const overdue = sp.gecikmis === "haric" ? "exclude" : "include";
    const { ledger } = await activeLedger();
    await generateRecurring(ledger.id);
    const rates = await ensureFreshRates(600);
    const [f, past] = await Promise.all([cashForecast(ledger.id, rates, { days, delay, overdue }), monthlyActuals(ledger.id, rates, 12)]);
    const href = (o: Record<string, string | number>) => `/nakit-akisi?${new URLSearchParams({ gun: String(days), gecikme: String(delay), gecikmis: overdue === "exclude" ? "haric" : "dahil", ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])) })}`;
    const inflow = f.items.filter(i => i.amount > 0).reduce((s, i) => s + i.amount, 0);
    const outflow = -f.items.filter(i => i.amount < 0).reduce((s, i) => s + i.amount, 0);

    return (
        <div>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">Nakit akışı</h1>
                    <p className="adm-sub">Bugünkü nakit (banka + kasa + POS) üzerine vadeli alacak ve borçlar, açık çek / senetler ve kart son ödeme günleri eklenerek gün gün ilerletilir.</p>
                </div>
            </div>

            <div className="adm-filters">
                <span className="muted">Ufuk:</span>
                {HORIZONS.map(h => <Link key={h} href={href({ gun: h })} className={`adm-chip${days === h ? " active" : ""}`}>{h} gün</Link>)}
                <span className="muted" style={{ marginLeft: 12 }}>Tahsilatlar gecikirse:</span>
                {DELAYS.map(d => <Link key={d} href={href({ gecikme: d })} className={`adm-chip${delay === d ? " active" : ""}`}>{d === 0 ? "gecikmesin" : `+${d} gün`}</Link>)}
                <span className="muted" style={{ marginLeft: 12 }}>Gecikmişler:</span>
                <Link href={href({ gecikmis: "dahil" })} className={`adm-chip${overdue === "include" ? " active" : ""}`}>bugün sayılsın</Link>
                <Link href={href({ gecikmis: "haric" })} className={`adm-chip${overdue === "exclude" ? " active" : ""}`}>hariç</Link>
            </div>

            {f.missingRate.length > 0 && <div className="fin-warn">{f.missingRate.join(", ")} kuru yok; bu para birimindeki hesaplar başlangıç nakdine girmiyor.</div>}
            {f.low.balance < 0 && <div className="fin-warn bad">▲ Kasa <strong>{fmtDay(f.low.date)}</strong> tarihinde <strong>{money(f.low.balance, "TRY", 0)}</strong> ile eksiye düşüyor. O tarihten önce tahsilat hızlandırın, ödemeyi erteleyin ya da hesaba kaynak aktarın.</div>}

            <div className="adm-kpis">
                <Kpi accent label="Bugünkü nakit" value={money(f.start, "TRY", 0)} note="banka + kasa + POS" />
                <Kpi label={`${days} gün sonra tahmini`} value={money(f.end, "TRY", 0)} tone={f.end < 0 ? "neg" : undefined} note={delay ? `tahsilatlar ${delay} gün gecikirse` : undefined} />
                <Kpi label="En düşük nokta" value={money(f.low.balance, "TRY", 0)} tone={f.low.balance < 0 ? "neg" : undefined} note={fmtDay(f.low.date)} />
                <Kpi label="Beklenen giriş" value={tl0(inflow)} note={f.overdueIn ? `${tl0(f.overdueIn)} gecikmiş dahil` : undefined} />
                <Kpi label="Beklenen çıkış" value={tl0(outflow)} note={f.overdueOut ? `${tl0(f.overdueOut)} gecikmiş dahil` : undefined} />
            </div>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Günlük kasa tahmini</h2><span className="adm-card-note">Vadeli kayıtlar vade gününde gerçekleşir varsayılır</span></div>
                <LineChart label="Günlük kasa tahmini" name="Tahmini kasa" low points={f.days.map(d => ({ label: fmtShort(d.date), value: d.balance }))} />
            </section>

            <div className="fin-two">
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">Haftalık özet</h2></div>
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Hafta</th><th className="num">Giriş</th><th className="num">Çıkış</th><th className="num">Hafta sonu kasa</th></tr></thead>
                            <tbody>
                                {f.weeks.map(w => (
                                    <tr key={w.from.toISOString()}>
                                        <td>{fmtShort(w.from)} – {fmtShort(w.to)}</td>
                                        <td className="num">{w.in ? tl0(w.in) : "—"}</td><td className="num">{w.out ? tl0(w.out) : "—"}</td>
                                        <td className="num"><Amount value={w.balance} digits={0} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">Beklenen hareketler</h2><Link className="adm-link" href="/vadeler">Vadeler</Link></div>
                    {f.items.length === 0 ? <p className="adm-empty">Ufukta vadeli kayıt yok. Vadeler sayfasından alacak / borç ya da tekrarlayan ödeme girin.</p> : (
                        <div className="adm-table-wrap">
                            <table className="adm-table">
                                <thead><tr><th>Tarih</th><th>Kalem</th><th className="num">Tutar</th></tr></thead>
                                <tbody>
                                    {f.items.slice(0, 40).map((i, n) => (
                                        <tr key={n} className={i.overdue ? "late" : ""}>
                                            <td>{fmtShort(i.date)}{(i.overdue || i.originalDate.getTime() !== i.date.getTime()) && <span className="fin-sub">{i.overdue ? "gecikmiş, bugün sayıldı" : `vade ${fmtShort(i.originalDate)}`}</span>}</td>
                                            <td className="wrap">{i.href ? <Link className="adm-link" href={i.href}>{i.label}</Link> : i.label}</td>
                                            <td className="num"><Amount value={i.amount} digits={0} sign /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {f.items.length > 40 && <p className="fin-hint" style={{ padding: "0 20px 12px" }}>İlk 40 hareket gösteriliyor.</p>}
                        </div>
                    )}
                </section>
            </div>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Geçmiş: son 12 ay gelir ve gider</h2><span className="adm-card-note">Gerçekleşen, virman hariç</span></div>
                <ColumnChart label="Aylık gerçekleşen gelir ve gider" data={past.map(m => ({ label: monthLabel(m.month), a: m.income, b: m.expense }))} />
            </section>
            <p className="fin-hint">Varsayımlar: Vade günü ödeme / tahsilat gerçekleşir. Kredi kartı için güncel borç, son ödeme gününde tek çıkış sayılır; kart ödemesini ayrıca vadeli kayıt olarak girdiyseniz çift sayılır, birini silin. Dövizli hesaplar bugünkü alış kuruyla TL’ye çevrilir.</p>
        </div>
    );
}
