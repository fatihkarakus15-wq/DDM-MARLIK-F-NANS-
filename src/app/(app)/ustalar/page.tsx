import Link from "next/link";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { prisma } from "@/lib/prisma";
import { syncUstalar, ustaReport, USTALAR } from "@/lib/finance/ustalar";
import { fmtDay } from "@/lib/finance/dates";
import { tl0 } from "@/lib/finance/money";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { Kpi } from "@/components/finance/ui";
import { saveContact, syncUstalarAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ustalar" };

/** Ustalar: kime ne kadar ödenmiş, ne kadar hakediş bekliyor; usta ekle */
export default async function Ustalar() {
    await requireFinancePage();
    const { ledger } = await activeLedger();
    if (!(await prisma.finContact.count({ where: { ledgerId: ledger.id, kind: "SUBCONTRACTOR" } }))) await syncUstalar(ledger.id);
    const rows = await ustaReport(ledger.id);
    const paid = rows.reduce((s, r) => s + r.paid, 0), pending = rows.reduce((s, r) => s + r.pending, 0);
    const missing = USTALAR.filter(u => !rows.some(r => r.name.toLocaleLowerCase("tr") === u.name.toLocaleLowerCase("tr"))).length;
    return (
        <div>
            <div className="adm-head">
                <div><h1 className="adm-title">Ustalar</h1><p className="adm-sub">Kime ne kadar ödediniz, ne kadar hakediş yapıldı. Harcama girerken ustayı seçince buraya işlenir.</p></div>
                <div className="adm-actions"><a className="btn btn-sm btn-gold" href="#ekle">+ Usta ekle</a></div>
            </div>
            <div className="adm-kpis">
                <Kpi accent label="Ustalara ödenen" value={tl0(paid)} note={`${rows.length} usta`} />
                <Kpi label="Bekleyen hakediş" value={tl0(pending)} note="vadeli, henüz ödenmemiş" />
                <Kpi label="Toplam hakediş" value={tl0(paid + pending)} note="ödenen + bekleyen" />
            </div>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Usta bazında</h2><span className="adm-card-note">ustaya dokunun: işlere göre ödemeler</span></div>
                {rows.length === 0 ? <p className="adm-empty">Henüz usta yok. Aşağıdan ekleyin ya da defterlerdeki ustaları ekleyin.</p> : (
                    <ul className="pay-list">
                        {rows.map(r => (
                            <li key={r.id} className={r.isActive ? "" : "done"}>
                                <details className="pay-item">
                                    <summary className="pay-row"><span><b>{r.name}</b><small>{r.count} ödeme · {r.projects.length} iş{r.pending > 0 ? ` · bekleyen ${tl0(r.pending)}` : ""}</small></span><span className="pay-amt"><b>{tl0(r.paid)}</b><small>ödenen</small></span></summary>
                                    <div className="pay-body">
                                        <div className="pay-sum" style={{ border: 0, padding: 0 }}>
                                            <div><small>Ödenen</small><b className="fin-pos">{tl0(r.paid)}</b></div>
                                            <div><small>Bekleyen hakediş</small><b>{tl0(r.pending)}</b></div>
                                            <div><small>Toplam hakediş</small><b>{tl0(r.total)}</b></div>
                                        </div>
                                        {r.projects.map(p => (
                                            <details key={p.id} className="adm-fold">
                                                <summary>{p.name} · ödenen {tl0(p.paid)}{p.pending > 0 ? ` · bekleyen ${tl0(p.pending)}` : ""}</summary>
                                                <div className="adm-table-wrap"><table className="adm-table"><tbody>
                                                    {p.items.map(i => <tr key={i.id}><td>{fmtDay(new Date(`${i.date}T12:00:00Z`))}</td><td className="wrap">{i.title}{i.status === "PLANNED" ? " (vadeli)" : ""}</td><td className="num">{tl0(i.amount)}</td></tr>)}
                                                </tbody></table></div>
                                            </details>
                                        ))}
                                        <p className="adm-help"><Link className="adm-link" href={`/cariler/${r.id}`}>Ekstre</Link> · <Link className="adm-link" href={`/cariler?duzenle=${r.id}#form`}>Düzenle</Link>{r.phone ? ` · ${r.phone}` : ""}</p>
                                    </div>
                                </details>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="adm-card" id="ekle">
                <div className="adm-card-head"><h2 className="adm-card-title">Usta ekle</h2></div>
                <div className="adm-card-body">
                    <AdminForm action={saveContact} className="adm-form">
                        <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="kind" value="SUBCONTRACTOR" />
                        <div className="adm-form-grid">
                            <label className="adm-field"><span className="adm-label">Usta adı</span><input name="name" required maxLength={120} placeholder="Ör. Hasan usta" autoComplete="off" /></label>
                            <label className="adm-field"><span className="adm-label">Telefon</span><input name="phone" inputMode="tel" autoComplete="off" /></label>
                            <label className="adm-field full"><span className="adm-label">Not (işi: boya, elektrik…)</span><input name="note" maxLength={200} autoComplete="off" /></label>
                        </div>
                        <div className="adm-form-foot"><SubmitButton>Usta ekle</SubmitButton></div>
                    </AdminForm>
                </div>
            </section>

            {missing > 0 && (
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">Defterlerdeki ustalar</h2><span className="adm-card-note">{USTALAR.length} usta</span></div>
                    <div className="adm-card-body">
                        <p className="adm-help">Excel defterlerinde (PDF) geçen ustalar: {USTALAR.map(u => u.name).join(", ")}. Düğme ustaları ekler ve geçmiş harcamaları adlarına göre ustayla eşler.</p>
                        <AdminForm action={syncUstalarAction} className="adm-form"><input type="hidden" name="ledgerId" value={ledger.id} /><div className="adm-form-foot"><SubmitButton pendingText="Ekleniyor…">Defterlerdeki ustaları ekle ve eşle</SubmitButton></div></AdminForm>
                    </div>
                </section>
            )}
            {missing === 0 && rows.length > 0 && (
                <p className="adm-help">Yeni içe aktarılan işlerde usta adı harcama başlığıyla eşleşirse otomatik bağlanır. Eski harcamaları yeniden eşlemek için:</p>
            )}
            {missing === 0 && (
                <AdminForm action={syncUstalarAction} className="adm-form"><input type="hidden" name="ledgerId" value={ledger.id} /><div className="adm-form-foot"><SubmitButton pendingText="Eşleniyor…">Harcamaları ustalarla yeniden eşle</SubmitButton></div></AdminForm>
            )}
        </div>
    );
}
