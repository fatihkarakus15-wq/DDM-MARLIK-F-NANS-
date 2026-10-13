import Link from "next/link";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { projectsOverview } from "@/lib/finance/reports";
import { PROJECT_STATUS } from "@/lib/finance/labels";
import { pct, tl0 } from "@/lib/finance/money";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import InstallHint from "@/components/InstallHint";
import { saveProject } from "./actions";

export const dynamic = "force-dynamic";

/** Ana ekran: projeler. Her projede tek dokunuşla harcama girişi ve o ana kadarki toplam. */
export default async function Projelerim() {
    await requireFinancePage();
    const { ledger } = await activeLedger();
    const all = await projectsOverview(ledger.id);
    const live = all.filter(p => p.status === "ACTIVE" || p.status === "ON_HOLD" || p.status === "LEAD");
    const done = all.filter(p => p.status === "DONE");

    return (
        <div>
            <div className="adm-head">
                <div><h1 className="adm-title">Projeler</h1><p className="adm-sub">Bir projeye dokunun, harcamayı hemen girin.</p></div>
                <Link className="btn btn-sm adm-btn-outline" href="/ozet">Genel özet</Link>
            </div>
            <InstallHint />

            {live.length === 0 ? (
                <section className="adm-card"><p className="adm-empty">Henüz proje yok. Aşağıdan ilk projeyi ekleyin (ör. “Yıldız Apt. tadilat”).</p></section>
            ) : (
                <ul className="proj-list">
                    {live.map(p => {
                        const st = PROJECT_STATUS[p.status as keyof typeof PROJECT_STATUS];
                        const over = (p.budgetUsedPct ?? 0) > 100;
                        return (
                            <li key={p.id}>
                                <Link href={`/projeler/${p.id}`} className="proj-card">
                                    <div className="proj-top">
                                        <div><strong className="proj-name">{p.code ? `${p.code} · ` : ""}{p.name}</strong><span className="proj-client">{p.client ?? "Müşteri belirtilmemiş"}</span></div>
                                        <span className={`adm-badge ${st.tone}`}>{st.label}</span>
                                    </div>
                                    <div className="proj-nums">
                                        <div><small>Harcanan</small><b>{tl0(p.expense)}</b></div>
                                        <div><small>Gelen</small><b>{tl0(p.income)}</b></div>
                                        <div><small>Kâr</small><b className={p.margin < 0 ? "fin-neg" : "fin-pos"}>{p.margin < 0 ? "−" : ""}{tl0(Math.abs(p.margin))}</b></div>
                                    </div>
                                    {p.budget > 0 && (
                                        <div>
                                            <div className={`fin-meter${over ? " over" : ""}`}><span style={{ width: `${Math.min(100, p.budgetUsedPct ?? 0)}%` }} /></div>
                                            <small className={over ? "fin-neg" : "muted"}>{over ? "▲ bütçe aşıldı · " : "bütçe kullanımı "}{pct(p.budgetUsedPct)} ({tl0(p.expense)} / {tl0(p.budget)})</small>
                                        </div>
                                    )}
                                    <span className="proj-add">+ Harcama ekle</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}

            <details className="adm-fold" open={live.length === 0}>
                <summary>Yeni proje ekle</summary>
                <div className="adm-card-body">
                    <AdminForm action={saveProject} className="adm-form">
                        <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="status" value="ACTIVE" />
                        <label className="adm-field"><span className="adm-label">Proje adı</span><input name="name" placeholder="Ör. Yıldız Apt. tadilat" required /></label>
                        <label className="adm-field"><span className="adm-label">Sözleşme bedeli (₺, isteğe bağlı)</span><input name="contractAmount" inputMode="decimal" /></label>
                        <div className="adm-form-foot"><SubmitButton>Projeyi ekle</SubmitButton><span className="adm-help">Müşteri, bütçe ve tarihleri sonra proje sayfasından girersiniz.</span></div>
                    </AdminForm>
                </div>
            </details>

            {done.length > 0 && <p className="muted"><Link className="adm-link" href="/projeler?durum=DONE">{done.length} tamamlanan proje</Link> · <Link className="adm-link" href="/projeler">Tüm projeler ve düzenleme</Link></p>}
        </div>
    );
}
