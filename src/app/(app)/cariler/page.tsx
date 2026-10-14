import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { contactBalances } from "@/lib/finance/balances";
import { receivablesReport } from "@/lib/finance/receivables";
import { monthLabel, fmtDay } from "@/lib/finance/dates";
import { CONTACT_KIND } from "@/lib/finance/labels";
import { tl0 } from "@/lib/finance/money";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { Amount, Kpi } from "@/components/finance/ui";
import { saveContact } from "../actions";

export const dynamic = "force-dynamic";

const KINDS = Object.entries(CONTACT_KIND);

/** Cariler: müşteri, tedarikçi, taşeron, personel. Bakiye = açılış + açık (vadeli) alacak − borç. */
export default async function Cariler({ searchParams }: { searchParams: Promise<{ tur?: string; duzenle?: string; pasif?: string; q?: string }> }) {
    await requireFinancePage();
    const { tur, duzenle, pasif, q } = await searchParams;
    const { ledger } = await activeLedger();
    const [contacts, balances, rec] = await Promise.all([
        prisma.finContact.findMany({ where: { ledgerId: ledger.id }, orderBy: { name: "asc" } }),
        contactBalances(ledger.id),
        receivablesReport(ledger.id),
    ]);
    const edit = duzenle ? contacts.find(c => c.id === duzenle) : undefined;
    const needle = q?.trim().toLocaleLowerCase("tr");
    const rows = contacts.filter(c => (pasif || c.isActive) && (!tur || c.kind === tur) && (!needle || c.name.toLocaleLowerCase("tr").includes(needle)));
    const totals = [...balances.values()].reduce((s, b) => ({ r: s.r + b.receivable + Math.max(0, b.opening), p: s.p + b.payable + Math.max(0, -b.opening) }), { r: 0, p: 0 });

    return (
        <div>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">Cariler</h1>
                    <p className="adm-sub">Müşteri, tedarikçi, taşeron ve personel hesapları. Pozitif bakiye size borçlu (alacak), negatif bakiye sizin borcunuzdur.</p>
                </div>
            </div>
            <div className="adm-kpis">
                <Kpi accent label="Toplam alacağımız (işlerden)" value={tl0(rec.remaining)} note={`anlaşılan ${tl0(rec.agreed)} − alınan ${tl0(rec.received)}`} />
                <Kpi label="Plana girilmiş (vadeli)" value={tl0(rec.planned)} note={rec.overdue > 0 ? `geciken ${tl0(rec.overdue)}` : "geciken yok"} tone={rec.overdue > 0 ? "neg" : undefined} />
                <Kpi label="Plana girilmemiş" value={tl0(rec.unplanned)} note="tarihi belli olmayan alacak" />
                <Kpi label="Bu ay alınacak" value={tl0(rec.thisMonth)} note="bu aya planlı tahsilat" />
            </div>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Aylara göre alacak</h2><span className="adm-card-note">planlı tahsilatlar · aya dokunun</span></div>
                {rec.months.length === 0 ? <p className="adm-empty">Planlı tahsilat yok. Proje sayfasındaki Tahsilat planından ekleyin.</p> : (
                    <ul className="pay-list">
                        {rec.months.map(m => (
                            <li key={m.key} className={m.late ? "late" : ""}>
                                <details className="pay-item">
                                    <summary className="pay-row"><span><b>{m.late ? "Geciken (geçmiş aylar)" : monthLabel(m.key)}</b><small>{m.items.length} tahsilat</small></span><span className="pay-amt"><b>{tl0(m.total)}</b></span></summary>
                                    <div className="pay-body"><div className="adm-table-wrap"><table className="adm-table"><tbody>
                                        {m.items.map(i => <tr key={i.id}><td>{fmtDay(new Date(`${i.date}T12:00:00Z`))}</td><td className="wrap">{i.project ?? i.contact ?? i.title}</td><td className="num">{tl0(i.amount)}</td></tr>)}
                                    </tbody></table></div></div>
                                </details>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">İşlere göre alacak</h2><span className="adm-card-note">toplam {tl0(rec.remaining)}</span></div>
                {rec.projects.length === 0 ? <p className="adm-empty">Alacak yok.</p> : (
                    <div className="adm-table-wrap"><table className="adm-table">
                        <thead><tr><th>İş</th><th className="num">Anlaşılan</th><th className="num">Alınan</th><th className="num">Kalan</th><th className="num">Planlı</th><th className="num">Plansız</th></tr></thead>
                        <tbody>{rec.projects.map(p => <tr key={p.id}><td className="wrap"><Link className="adm-link" href={`/projeler/${p.id}#tahsilat`}>{p.name}</Link>{p.client && <span className="fin-sub">{p.client}</span>}</td><td className="num">{tl0(p.agreed)}</td><td className="num">{tl0(p.received)}</td><td className="num"><b>{tl0(p.remaining)}</b></td><td className="num">{tl0(p.planned)}</td><td className="num">{p.unplanned ? tl0(p.unplanned) : "—"}</td></tr>)}</tbody>
                        <tfoot><tr><td>Toplam</td><td className="num">{tl0(rec.agreed)}</td><td className="num">{tl0(rec.received)}</td><td className="num">{tl0(rec.remaining)}</td><td className="num">{tl0(rec.planned)}</td><td className="num">{tl0(rec.unplanned)}</td></tr></tfoot>
                    </table></div>
                )}
            </section>

            <div className="adm-kpis">
                <Kpi label="Toplam alacak (cari bakiyeleri)" value={tl0(totals.r)} note="carilerden tahsil edilecek" />
                <Kpi label="Toplam borç" value={tl0(totals.p)} note="carilere ödenecek" />
                <Kpi label="Net" value={<Amount value={totals.r - totals.p} digits={0} sign />} />
            </div>

            <div className="adm-filters">
                <Link href="/cariler" className={`adm-chip${!tur ? " active" : ""}`}>Hepsi</Link>
                {KINDS.map(([k, l]) => <Link key={k} href={`/cariler?tur=${k}`} className={`adm-chip${tur === k ? " active" : ""}`}>{l}</Link>)}
                <form method="get" className="adm-inline" style={{ marginLeft: "auto" }}>
                    {tur && <input type="hidden" name="tur" value={tur} />}
                    <input name="q" defaultValue={q ?? ""} placeholder="Cari ara…" className="adm-input" style={{ maxWidth: 200 }} />
                    <button className="btn btn-sm adm-btn-outline" type="submit">Ara</button>
                </form>
            </div>

            <section className="adm-card">
                {rows.length === 0 ? <p className="adm-empty">Cari yok. Aşağıdan ekleyin.</p> : (
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Cari</th><th>Tür</th><th className="num">Alacak</th><th className="num">Borç</th><th className="num">Bakiye</th><th /></tr></thead>
                            <tbody>
                                {rows.map(c => {
                                    const b = balances.get(c.id);
                                    return (
                                        <tr key={c.id} style={c.isActive ? undefined : { opacity: 0.55 }}>
                                            <td><Link className="adm-link" href={`/cariler/${c.id}`}>{c.name}</Link>{!c.isActive && <span className="adm-badge muted" style={{ marginLeft: 6 }}>Pasif</span>}<span className="fin-sub">{[c.phone, c.email].filter(Boolean).join(" · ")}</span></td>
                                            <td>{CONTACT_KIND[c.kind]}</td>
                                            <td className="num">{b && b.receivable > 0 ? tl0(b.receivable) : "—"}{b && b.overdueReceivable > 0 && <span className="fin-sub fin-neg">▲ {tl0(b.overdueReceivable)} gecikmiş</span>}</td>
                                            <td className="num">{b && b.payable > 0 ? tl0(b.payable) : "—"}{b && b.overduePayable > 0 && <span className="fin-sub fin-neg">▲ {tl0(b.overduePayable)} gecikmiş</span>}</td>
                                            <td className="num">{b ? <Amount value={b.net} digits={0} sign /> : "—"}{b && b.opening !== 0 && <span className="fin-sub">açılış {tl0(b.opening)}</span>}</td>
                                            <td><Link className="adm-link" href={`/cariler?duzenle=${c.id}#form`}>Düzenle</Link></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {contacts.some(c => !c.isActive) && <div className="fin-pager"><Link className="adm-link" href={pasif ? "/cariler" : "/cariler?pasif=1"}>{pasif ? "Pasifleri gizle" : "Pasifleri göster"}</Link></div>}
            </section>

            <section className={`adm-card${edit ? " fin-edit" : ""}`} id="form">
                <div className="adm-card-head"><h2 className="adm-card-title">{edit ? `Cariyi düzenle: ${edit.name}` : "Yeni cari"}</h2>{edit && <Link className="adm-link" href="/cariler">Vazgeç</Link>}</div>
                <div className="adm-card-body">
                    <AdminForm action={saveContact} className="adm-form" key={edit?.id ?? "new"}>
                        <input type="hidden" name="ledgerId" value={ledger.id} />
                        {edit && <input type="hidden" name="id" value={edit.id} />}
                        <div className="adm-form-grid">
                            <label className="adm-field"><span className="adm-label">Ad / unvan</span><input name="name" defaultValue={edit?.name} required /></label>
                            <label className="adm-field"><span className="adm-label">Tür</span><select name="kind" defaultValue={edit?.kind ?? "CUSTOMER"}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Vergi no / TC</span><input name="taxNo" defaultValue={edit?.taxNo ?? ""} /></label>
                            <label className="adm-field"><span className="adm-label">Vergi dairesi</span><input name="taxOffice" defaultValue={edit?.taxOffice ?? ""} /></label>
                            <label className="adm-field"><span className="adm-label">Telefon</span><input name="phone" defaultValue={edit?.phone ?? ""} /></label>
                            <label className="adm-field"><span className="adm-label">E-posta</span><input name="email" defaultValue={edit?.email ?? ""} /></label>
                            <label className="adm-field"><span className="adm-label">Açılış bakiyesi (₺)</span><input name="openingBalance" inputMode="decimal" defaultValue={edit ? String(edit.openingBalance).replace(".", ",") : "0"} /><span className="adm-help">+ size borçlu · − siz borçlusunuz (kayda başlamadan önceki durum)</span></label>
                            <label className="adm-field full"><span className="adm-label">Adres</span><input name="address" defaultValue={edit?.address ?? ""} /></label>
                            <label className="adm-field full"><span className="adm-label">Not</span><input name="note" defaultValue={edit?.note ?? ""} /></label>
                        </div>
                        <div className="adm-form-foot">{edit && <label className="adm-check"><input type="checkbox" name="isActive" defaultChecked={edit.isActive} />Aktif</label>}<SubmitButton>{edit ? "Kaydet" : "Cariyi ekle"}</SubmitButton></div>
                    </AdminForm>
                </div>
            </section>
        </div>
    );
}
