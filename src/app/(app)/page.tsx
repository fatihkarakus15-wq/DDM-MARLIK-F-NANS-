import Link from "next/link";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { projectsOverview } from "@/lib/finance/reports";
import { tl0 } from "@/lib/finance/money";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import InstallHint from "@/components/InstallHint";
import { saveProject } from "./actions";

export const dynamic = "force-dynamic";

/** Ana ekran: projelerin adları. Üstte "Aktif" ve "Teslim edilenler"; bir projeye dokununca harcama girişi açılır. */
export default async function Projelerim({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
    await requireFinancePage();
    const { durum } = await searchParams;
    const { ledger } = await activeLedger();
    const all = await projectsOverview(ledger.id);
    const active = all.filter(p => p.status === "ACTIVE" || p.status === "ON_HOLD" || p.status === "LEAD");
    const delivered = all.filter(p => p.status === "DONE");
    const showDelivered = durum === "teslim";
    const list = showDelivered ? delivered : active;

    return (
        <div>
            <InstallHint />
            <nav className="pl-tabs" aria-label="Proje durumu">
                <Link href="/" replace className={`pl-tab${!showDelivered ? " on" : ""}`} aria-current={!showDelivered ? "page" : undefined}>Aktif <span>{active.length}</span></Link>
                <Link href="/?durum=teslim" replace className={`pl-tab${showDelivered ? " on" : ""}`} aria-current={showDelivered ? "page" : undefined}>Teslim edilenler <span>{delivered.length}</span></Link>
            </nav>

            {list.length === 0 ? (
                <p className="pl-empty">{showDelivered ? "Henüz teslim edilen proje yok." : "Aktif proje yok. Aşağıdan yeni proje ekleyin."}</p>
            ) : (
                <ul className="pl-list">
                    {list.map(p => (
                        <li key={p.id}>
                            <Link href={`/projeler/${p.id}`} className="pl-item">
                                <span className="pl-main">
                                    <strong>{p.code ? `${p.code} · ` : ""}{p.name}</strong>
                                    <small>{p.client ?? "Müşteri belirtilmemiş"} · harcanan {tl0(p.expense)}</small>
                                </span>
                                <span className="pl-go" aria-hidden="true">›</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            <details className="adm-fold" open={all.length === 0}>
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
        </div>
    );
}
