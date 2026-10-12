import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { projectsOverview } from "@/lib/finance/reports";
import { PROJECT_STATUS } from "@/lib/finance/labels";
import { ymd } from "@/lib/finance/dates";
import { pct, tl0 } from "@/lib/finance/money";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { Amount, Kpi } from "@/components/finance/ui";
import { saveProject } from "../actions";

export const dynamic = "force-dynamic";

const STATUSES = Object.entries(PROJECT_STATUS);

/** Projeler: her gelir ve gider bir projeye bağlanır; kâr, bütçe kullanımı ve alacak burada görünür. */
export default async function Projeler({ searchParams }: { searchParams: Promise<{ durum?: string; duzenle?: string }> }) {
    await requireFinancePage();
    const { durum, duzenle } = await searchParams;
    const { ledger } = await activeLedger();
    const [all, clients, editRow] = await Promise.all([
        projectsOverview(ledger.id),
        prisma.finContact.findMany({ where: { ledgerId: ledger.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        duzenle ? prisma.finProject.findFirst({ where: { id: duzenle, ledgerId: ledger.id } }) : null,
    ]);
    const rows = durum ? all.filter(p => p.status === durum) : all;
    const open = all.filter(p => ["ACTIVE", "ON_HOLD"].includes(p.status));
    const totals = open.reduce((s, p) => ({ income: s.income + p.income, expense: s.expense + p.expense, receivable: s.receivable + p.receivable, payable: s.payable + p.payable }), { income: 0, expense: 0, receivable: 0, payable: 0 });

    return (
        <div>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">Projeler</h1>
                    <p className="adm-sub">Proje bazında gelir, harcama ve kâr. Hesaplar KDV hariç ve tahakkuk esaslıdır: ödenmemiş fatura da maliyete sayılır.</p>
                </div>
            </div>

            <div className="adm-kpis">
                <Kpi accent label="Açık projelerde gelir" value={tl0(totals.income)} note={`${open.length} devam eden / bekleyen proje`} />
                <Kpi label="Açık projelerde harcama" value={tl0(totals.expense)} />
                <Kpi label="Kâr" value={<Amount value={totals.income - totals.expense} digits={0} sign />} note={totals.income ? `marj ${pct(((totals.income - totals.expense) / totals.income) * 100)}` : undefined} />
                <Kpi label="Tahsil edilecek" value={tl0(totals.receivable)} note={`ödenecek ${tl0(totals.payable)}`} />
            </div>

            <div className="adm-filters">
                <Link href="/projeler" className={`adm-chip${!durum ? " active" : ""}`}>Hepsi <span>{all.length}</span></Link>
                {STATUSES.map(([k, v]) => <Link key={k} href={`/projeler?durum=${k}`} className={`adm-chip${durum === k ? " active" : ""}`}>{v.label} <span>{all.filter(p => p.status === k).length}</span></Link>)}
            </div>

            <section className="adm-card">
                {rows.length === 0 ? <p className="adm-empty">Proje yok. Aşağıdan ekleyin.</p> : (
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Proje</th><th>Durum</th><th className="num">Sözleşme</th><th className="num">Gelir</th><th className="num">Alacak</th><th className="num">Gider</th><th className="num">Kâr</th><th>Bütçe</th><th /></tr></thead>
                            <tbody>
                                {rows.map(p => (
                                    <tr key={p.id}>
                                        <td className="wrap"><Link className="adm-link" href={`/projeler/${p.id}`}>{p.code ? `${p.code} · ` : ""}{p.name}</Link><span className="fin-sub">{p.client ?? "Müşteri belirtilmemiş"}</span></td>
                                        <td><span className={`adm-badge ${PROJECT_STATUS[p.status as keyof typeof PROJECT_STATUS].tone}`}>{PROJECT_STATUS[p.status as keyof typeof PROJECT_STATUS].label}</span></td>
                                        <td className="num">{p.contract != null ? tl0(p.contract) : "—"}</td>
                                        <td className="num">{tl0(p.income)}</td>
                                        <td className="num">{p.receivable > 0 ? tl0(p.receivable) : "—"}</td>
                                        <td className="num">{tl0(p.expense)}{p.payable > 0 && <span className="fin-sub">ödenecek {tl0(p.payable)}</span>}</td>
                                        <td className="num"><Amount value={p.margin} digits={0} sign />{p.marginPct != null && <span className="fin-sub">{pct(p.marginPct)}</span>}</td>
                                        <td>{p.budget > 0 ? (
                                            <div title={`${tl0(p.expense)} / ${tl0(p.budget)}`}>
                                                <div className={`fin-meter${(p.budgetUsedPct ?? 0) > 100 ? " over" : ""}`}><span style={{ width: `${Math.min(100, p.budgetUsedPct ?? 0)}%` }} /></div>
                                                <span className={`fin-sub${(p.budgetUsedPct ?? 0) > 100 ? " fin-neg" : ""}`}>{(p.budgetUsedPct ?? 0) > 100 ? "▲ aşıldı " : ""}{pct(p.budgetUsedPct)} / {tl0(p.budget)}</span>
                                            </div>) : <span className="muted">bütçe yok</span>}</td>
                                        <td><Link className="adm-link" href={`/projeler?duzenle=${p.id}#form`}>Düzenle</Link></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className={`adm-card${editRow ? " fin-edit" : ""}`} id="form">
                <div className="adm-card-head"><h2 className="adm-card-title">{editRow ? `Projeyi düzenle: ${editRow.name}` : "Yeni proje"}</h2>{editRow && <Link className="adm-link" href="/projeler">Vazgeç</Link>}</div>
                <div className="adm-card-body">
                    <AdminForm action={saveProject} className="adm-form" key={editRow?.id ?? "new"}>
                        <input type="hidden" name="ledgerId" value={ledger.id} />
                        {editRow && <input type="hidden" name="id" value={editRow.id} />}
                        <div className="adm-form-grid">
                            <label className="adm-field"><span className="adm-label">Proje kodu</span><input name="code" defaultValue={editRow?.code ?? ""} placeholder="2026-014" /></label>
                            <label className="adm-field wide"><span className="adm-label">Proje adı</span><input name="name" defaultValue={editRow?.name} placeholder="Ör. Yıldız Apt. daire tadilatı" required /></label>
                            <label className="adm-field"><span className="adm-label">Müşteri</span><select name="clientId" defaultValue={editRow?.clientId ?? ""}><option value="">— belirtilmedi —</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Durum</span><select name="status" defaultValue={editRow?.status ?? "ACTIVE"}>{STATUSES.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Sözleşme bedeli (KDV hariç, ₺)</span><input name="contractAmount" inputMode="decimal" defaultValue={editRow?.contractAmount ?? ""} /></label>
                            <label className="adm-field"><span className="adm-label">Başlangıç</span><input type="date" name="startDate" defaultValue={editRow?.startDate ? ymd(editRow.startDate) : ""} /></label>
                            <label className="adm-field"><span className="adm-label">Bitiş (tahmini)</span><input type="date" name="endDate" defaultValue={editRow?.endDate ? ymd(editRow.endDate) : ""} /></label>
                            <label className="adm-field full"><span className="adm-label">Not</span><input name="note" defaultValue={editRow?.note ?? ""} /></label>
                        </div>
                        <div className="adm-form-foot"><SubmitButton>{editRow ? "Kaydet" : "Projeyi ekle"}</SubmitButton><span className="adm-help">Müşteri listede yoksa önce Cariler&apos;den ekleyin. Maliyet bütçesini proje sayfasından kalem kalem girersiniz.</span></div>
                    </AdminForm>
                </div>
            </section>
        </div>
    );
}
