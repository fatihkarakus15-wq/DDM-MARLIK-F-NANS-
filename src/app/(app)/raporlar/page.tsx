import { Fragment } from "react";
import Link from "next/link";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { formOptions } from "@/lib/finance/options";
import { ensureFreshRates } from "@/lib/finance/rates";
import { PERIODS, fmtDay, monthLabel, periodRange } from "@/lib/finance/dates";
import { aging, byContact, incomeStatement, projectsOverview, vatSummary, type Basis, type GroupRow, type ReportOpts, type VatMode } from "@/lib/finance/reports";
import { PROJECT_STATUS } from "@/lib/finance/labels";
import { pct, tl0 } from "@/lib/finance/money";
import { PrintButton } from "@/components/AdminForm";
import { Amount, Kpi } from "@/components/finance/ui";
import { ColumnChart } from "@/components/finance/charts";
import ShareBars from "@/components/finance/ShareBars";

export const dynamic = "force-dynamic";

const REPORTS = [["gelir-gider", "Gelir – gider"], ["kalem", "Kalem bazında"], ["proje", "Proje kârlılığı"], ["yaslandirma", "Alacak / borç yaşlandırma"], ["kdv", "KDV özeti"]] as const;

interface SP { rapor?: string; donem?: string; esas?: string; kdv?: string; proje?: string }

/** Finans raporları. Esas: nakit (yalnızca gerçekleşen) ya da tahakkuk (vadeliler dahil); KDV hariç / dahil. */
export default async function Raporlar({ searchParams }: { searchParams: Promise<SP> }) {
    await requireFinancePage();
    const sp = await searchParams;
    const rapor = REPORTS.some(([k]) => k === sp.rapor) ? sp.rapor! : "gelir-gider";
    const range = periodRange(sp.donem);
    const basis: Basis = sp.esas === "nakit" ? "nakit" : "tahakkuk";
    const vat: VatMode = sp.kdv === "dahil" ? "dahil" : "haric";
    const { ledger } = await activeLedger();
    const rates = await ensureFreshRates(3600);
    const opts = await formOptions(ledger.id, rates);
    const o: ReportOpts = { from: range.from, to: range.to, basis, vat, projectId: sp.proje || null };
    const href = (over: Partial<SP>) => `/raporlar?${new URLSearchParams(Object.entries({ rapor, donem: range.key, esas: basis, kdv: vat, proje: sp.proje ?? "", ...over }).filter(([, v]) => v) as [string, string][])}`;
    const needsPeriod = rapor !== "proje" && rapor !== "yaslandirma";

    return (
        <div>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">Raporlar</h1>
                    <p className="adm-sub">{ledger.name} defteri · {needsPeriod ? `${fmtDay(range.from)} – ${range.to.getUTCFullYear() > 2090 ? "bugüne kadar" : fmtDay(range.to)}` : "güncel durum"}</p>
                </div>
                <div className="adm-actions no-print"><PrintButton /></div>
            </div>

            <div className="adm-filters no-print">{REPORTS.map(([k, l]) => <Link key={k} href={href({ rapor: k })} className={`adm-chip${rapor === k ? " active" : ""}`}>{l}</Link>)}</div>
            {needsPeriod && (
                <div className="adm-filters no-print">
                    {PERIODS.map(([k, l]) => <Link key={k} href={href({ donem: k })} className={`adm-chip${range.key === k ? " active" : ""}`}>{l}</Link>)}
                    <span className="muted">|</span>
                    {rapor !== "kdv" && <>
                        <Link href={href({ esas: "tahakkuk" })} className={`adm-chip${basis === "tahakkuk" ? " active" : ""}`} title="Ödenmemiş (vadeli) kayıtlar dahil, belge tarihine göre">Tahakkuk esaslı</Link>
                        <Link href={href({ esas: "nakit" })} className={`adm-chip${basis === "nakit" ? " active" : ""}`} title="Yalnızca gerçekleşen hareketler, işlem gününe göre">Nakit esaslı</Link>
                        <span className="muted">|</span>
                        <Link href={href({ kdv: "haric" })} className={`adm-chip${vat === "haric" ? " active" : ""}`}>KDV hariç</Link>
                        <Link href={href({ kdv: "dahil" })} className={`adm-chip${vat === "dahil" ? " active" : ""}`}>KDV dahil</Link>
                    </>}
                    {(rapor === "gelir-gider" || rapor === "kalem") && (
                        <form method="get" className="adm-inline">
                            {Object.entries({ rapor, donem: range.key, esas: basis, kdv: vat }).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                            <select name="proje" defaultValue={sp.proje ?? ""} className="adm-input" style={{ maxWidth: 220 }}><option value="">Bütün projeler</option>{opts.projects.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
                            <button className="btn btn-sm adm-btn-outline" type="submit">Süz</button>
                        </form>
                    )}
                </div>
            )}

            {rapor === "gelir-gider" && <IncomeExpense ledgerId={ledger.id} o={o} />}
            {rapor === "kalem" && <ByCategory ledgerId={ledger.id} o={o} />}
            {rapor === "proje" && <Projects ledgerId={ledger.id} />}
            {rapor === "yaslandirma" && <Aging ledgerId={ledger.id} />}
            {rapor === "kdv" && <Vat ledgerId={ledger.id} o={o} />}
        </div>
    );
}

const groupItems = (groups: GroupRow[], from: string, to: string, range: ReportOpts) => groups.map(g => ({
    label: g.group, amount: g.amount, share: g.share,
    sub: g.items.length > 1 ? g.items.slice(0, 3).map(i => `${i.label.split(" › ").pop()} ${tl0(i.amount)}`).join(" · ") : undefined,
    href: g.groupId ? `/hareketler?kalem=${g.groupId}&from=${from}&to=${to}${range.projectId ? `&proje=${range.projectId}` : ""}` : undefined,
}));
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function IncomeExpense({ ledgerId, o }: { ledgerId: string; o: ReportOpts }) {
    const [s, topCustomers, topSuppliers] = await Promise.all([incomeStatement(ledgerId, o), byContact(ledgerId, o, "INCOME", 8), byContact(ledgerId, o, "EXPENSE", 8)]);
    const from = iso(o.from), to = iso(o.to.getUTCFullYear() > 2090 ? new Date() : o.to);
    return (
        <>
            <div className="adm-kpis">
                <Kpi accent label="Gelir" value={tl0(s.income.total)} note={o.vat === "haric" ? "KDV hariç" : "KDV dahil"} />
                <Kpi label="Gider" value={tl0(s.expense.total)} />
                <Kpi label="Net kâr / zarar" value={<Amount value={s.net} digits={0} sign />} note={s.margin != null ? `marj ${pct(s.margin)}` : undefined} />
                <Kpi label="Aylık ortalama gider" value={tl0(s.series.length ? s.expense.total / s.series.length : 0)} note={`${s.series.length} ay`} />
            </div>
            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Aylık gelir ve gider</h2></div>
                <ColumnChart label="Aylık gelir ve gider" data={s.series.map(m => ({ label: monthLabel(m.month), a: m.income, b: m.expense }))} />
            </section>
            <div className="fin-two">
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">Gider dağılımı</h2><span className="adm-card-note">Kalem grupları</span></div>
                    <ShareBars tone="s2" items={groupItems(s.expense.groups, from, to, o).slice(0, 12)} empty="Bu dönemde gider yok." />
                </section>
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">Gelir dağılımı</h2></div>
                    <ShareBars items={groupItems(s.income.groups, from, to, o).slice(0, 12)} empty="Bu dönemde gelir yok." />
                </section>
            </div>
            <div className="fin-two">
                <section className="adm-card"><div className="adm-card-head"><h2 className="adm-card-title">En çok ödeme yapılan cariler</h2></div><ShareBars tone="s2" items={topSuppliers.map(c => ({ label: c.name, amount: c.amount, sub: `${c.count} kayıt`, href: c.contactId ? `/cariler/${c.contactId}` : undefined }))} empty="Cari bağlı gider yok." /></section>
                <section className="adm-card"><div className="adm-card-head"><h2 className="adm-card-title">En çok gelir getiren cariler</h2></div><ShareBars items={topCustomers.map(c => ({ label: c.name, amount: c.amount, sub: `${c.count} kayıt`, href: c.contactId ? `/cariler/${c.contactId}` : undefined }))} empty="Cari bağlı gelir yok." /></section>
            </div>
        </>
    );
}

async function ByCategory({ ledgerId, o }: { ledgerId: string; o: ReportOpts }) {
    const s = await incomeStatement(ledgerId, o);
    const from = iso(o.from), to = iso(o.to.getUTCFullYear() > 2090 ? new Date() : o.to);
    const table = (title: string, b: typeof s.expense) => (
        <section className="adm-card">
            <div className="adm-card-head"><h2 className="adm-card-title">{title}</h2><span className="adm-card-note">Toplam {tl0(b.total)}</span></div>
            {b.groups.length === 0 ? <p className="adm-empty">Kayıt yok.</p> : (
                <div className="adm-table-wrap">
                    <table className="adm-table">
                        <thead><tr><th>Kalem</th><th className="num">Kayıt</th><th className="num">Tutar</th><th className="num">Pay</th></tr></thead>
                        <tbody>
                            {b.groups.map(g => (
                                <Fragment key={g.group}>
                                    <tr><td><strong>{g.groupId ? <Link className="adm-link" href={`/hareketler?kalem=${g.groupId}&from=${from}&to=${to}${o.projectId ? `&proje=${o.projectId}` : ""}`}>{g.group}</Link> : g.group}</strong></td><td className="num">{g.items.reduce((s2, i) => s2 + i.count, 0)}</td><td className="num"><strong>{tl0(g.amount)}</strong></td><td className="num">{pct(g.share)}</td></tr>
                                    {g.items.filter(i => i.label !== g.group).map(i => (
                                        <tr key={`${g.group}-${i.id}`}><td style={{ paddingLeft: 28 }}>{i.id ? <Link className="adm-link" href={`/hareketler?kalem=${i.id}&from=${from}&to=${to}${o.projectId ? `&proje=${o.projectId}` : ""}`}>{i.label.split(" › ").pop()}</Link> : i.label}</td><td className="num">{i.count}</td><td className="num">{tl0(i.amount)}</td><td className="num muted">{pct(i.share)}</td></tr>
                                    ))}
                                </Fragment>
                            ))}
                        </tbody>
                        <tfoot><tr><td>Toplam</td><td /><td className="num">{tl0(b.total)}</td><td /></tr></tfoot>
                    </table>
                </div>
            )}
        </section>
    );
    return (
        <>
            <p className="fin-hint" style={{ marginBottom: 12 }}>“Boyaya ne kadar harcadım?” sorusunun yanıtı burada: kalem satırına tıklayınca o kaleme ait bütün hareketler açılır.</p>
            {table("Gider kalemleri", s.expense)}
            {table("Gelir kalemleri", s.income)}
        </>
    );
}

async function Projects({ ledgerId }: { ledgerId: string }) {
    const rows = await projectsOverview(ledgerId);
    const live = rows.filter(r => r.status !== "CANCELLED");
    const t = live.reduce((s, r) => ({ income: s.income + r.income, expense: s.expense + r.expense }), { income: 0, expense: 0 });
    return (
        <>
            <div className="adm-kpis">
                <Kpi accent label="Toplam proje geliri" value={tl0(t.income)} note="KDV hariç, tahakkuk, tüm zamanlar" />
                <Kpi label="Toplam proje gideri" value={tl0(t.expense)} />
                <Kpi label="Kâr" value={<Amount value={t.income - t.expense} digits={0} sign />} note={t.income ? `marj ${pct(((t.income - t.expense) / t.income) * 100)}` : undefined} />
            </div>
            <section className="adm-card">
                {live.length === 0 ? <p className="adm-empty">Proje yok.</p> : (
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Proje</th><th>Durum</th><th className="num">Sözleşme</th><th className="num">Gelir</th><th className="num">Gider</th><th className="num">Kâr</th><th className="num">Marj</th><th className="num">Bütçe</th></tr></thead>
                            <tbody>
                                {[...live].sort((a, b) => b.margin - a.margin).map(p => (
                                    <tr key={p.id}>
                                        <td><Link className="adm-link" href={`/projeler/${p.id}`}>{p.code ? `${p.code} · ` : ""}{p.name}</Link><span className="fin-sub">{p.client}</span></td>
                                        <td><span className={`adm-badge ${PROJECT_STATUS[p.status as keyof typeof PROJECT_STATUS].tone}`}>{PROJECT_STATUS[p.status as keyof typeof PROJECT_STATUS].label}</span></td>
                                        <td className="num">{p.contract != null ? tl0(p.contract) : "—"}</td><td className="num">{tl0(p.income)}</td><td className="num">{tl0(p.expense)}</td>
                                        <td className="num"><Amount value={p.margin} digits={0} sign /></td><td className="num">{pct(p.marginPct)}</td>
                                        <td className="num">{p.budget ? <span className={(p.budgetUsedPct ?? 0) > 100 ? "fin-neg" : ""}>{(p.budgetUsedPct ?? 0) > 100 ? "▲ " : ""}{pct(p.budgetUsedPct)}</span> : "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </>
    );
}

async function Aging({ ledgerId }: { ledgerId: string }) {
    const [recv, pay] = await Promise.all([aging(ledgerId, "INCOME"), aging(ledgerId, "EXPENSE")]);
    const table = (title: string, rows: typeof recv) => {
        const sum = (k: "notDue" | "d30" | "d60" | "d90" | "d90p" | "total") => rows.reduce((s, r) => s + r[k], 0);
        return (
            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">{title}</h2><span className="adm-card-note">Toplam {tl0(sum("total"))}</span></div>
                {rows.length === 0 ? <p className="adm-empty">Açık kalem yok.</p> : (
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Cari</th><th className="num">Vadesi gelmemiş</th><th className="num">1–30 gün</th><th className="num">31–60</th><th className="num">61–90</th><th className="num">90+ gün</th><th className="num">Toplam</th></tr></thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.contactId ?? "none"}>
                                        <td>{r.contactId ? <Link className="adm-link" href={`/cariler/${r.contactId}`}>{r.name}</Link> : r.name}</td>
                                        {(["notDue", "d30", "d60", "d90", "d90p"] as const).map(k => <td key={k} className={`num${k !== "notDue" && r[k] ? " fin-neg" : ""}`}>{r[k] ? tl0(r[k]) : "—"}</td>)}
                                        <td className="num"><strong>{tl0(r.total)}</strong></td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot><tr><td>Toplam</td>{(["notDue", "d30", "d60", "d90", "d90p", "total"] as const).map(k => <td key={k} className="num">{tl0(sum(k))}</td>)}</tr></tfoot>
                        </table>
                    </div>
                )}
            </section>
        );
    };
    return <>{table("Alacaklar (tahsil edilecek)", recv)}{table("Borçlar (ödenecek)", pay)}</>;
}

async function Vat({ ledgerId, o }: { ledgerId: string; o: ReportOpts }) {
    const v = await vatSummary(ledgerId, o.from, o.to);
    return (
        <>
            <div className="adm-kpis">
                <Kpi accent label="Hesaplanan KDV" value={tl0(v.total.collected)} note="gelir faturalarından" />
                <Kpi label="İndirilecek KDV" value={tl0(v.total.deductible)} note="gider faturalarından" />
                <Kpi label={v.total.payable >= 0 ? "Ödenecek KDV" : "Devreden KDV"} value={tl0(Math.abs(v.total.payable))} />
                <Kpi label="Stopaj (bilgi)" value={tl0(v.total.withholding)} />
            </div>
            <section className="adm-card">
                {v.months.length === 0 ? <p className="adm-empty">Bu dönemde KDV tutarı girilmiş hareket yok. Hareket eklerken KDV oranını seçin.</p> : (
                    <table className="adm-table">
                        <thead><tr><th>Ay</th><th className="num">Hesaplanan</th><th className="num">İndirilecek</th><th className="num">Ödenecek / devreden</th><th className="num">Stopaj</th></tr></thead>
                        <tbody>{v.months.map(m => <tr key={m.month}><td>{monthLabel(m.month)}</td><td className="num">{tl0(m.collected)}</td><td className="num">{tl0(m.deductible)}</td><td className="num"><Amount value={m.payable} digits={0} /></td><td className="num">{m.withholding ? tl0(m.withholding) : "—"}</td></tr>)}</tbody>
                        <tfoot><tr><td>Toplam</td><td className="num">{tl0(v.total.collected)}</td><td className="num">{tl0(v.total.deductible)}</td><td className="num"><Amount value={v.total.payable} digits={0} /></td><td className="num">{tl0(v.total.withholding)}</td></tr></tfoot>
                    </table>
                )}
            </section>
            <p className="fin-hint">Belge tarihine göre (yoksa vadeye göre), vadeli kayıtlar dahil. Bu tablo yönlendiricidir; beyan için mali müşavirinizin kayıtları esastır.</p>
        </>
    );
}
