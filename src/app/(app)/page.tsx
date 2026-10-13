import Link from "next/link";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { projectsOverview } from "@/lib/finance/reports";
import { money, tl0 } from "@/lib/finance/money";
import { fmtDay, todayYmd } from "@/lib/finance/dates";
import { loadQuick } from "@/lib/finance/quick";
import ProjectQuickAdd from "@/components/finance/ProjectQuickAdd";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import InstallHint from "@/components/InstallHint";
import { saveProject } from "./actions";

export const dynamic = "force-dynamic";

/** Ana ekran: projeler. Her projede tek dokunuşla harcama girişi ve o ana kadarki toplam. */
export default async function Projelerim({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
    await requireFinancePage();
    const { p: pid } = await searchParams;
    const { ledger } = await activeLedger();
    const all = await projectsOverview(ledger.id);
    const live = all.filter(p => p.status === "ACTIVE" || p.status === "ON_HOLD" || p.status === "LEAD");
    const done = all.filter(p => p.status === "DONE");
    const current = live.find(p => p.id === pid) ?? live[0];
    const quick = current ? await loadQuick(ledger.id, current.id) : null;

    return (
        <div>
            <InstallHint />
            {current && quick ? (
                <>
                    <nav className="sm-chips" aria-label="Proje seç">
                        {live.map(p => <Link key={p.id} href={`/?p=${p.id}`} replace className={`sm-chip${p.id === current.id ? " on" : ""}`}>{p.code ? `${p.code} · ` : ""}{p.name}</Link>)}
                    </nav>
                    <p className="sm-sub"><Link className="adm-link" href={`/projeler/${current.id}`}>{current.name} ayrıntısı</Link> · toplam harcanan <b>{tl0(quick.totalExpense)}</b>{current.budget > 0 ? ` / bütçe ${tl0(current.budget)}` : ""}</p>
                    {quick.accounts.length === 0 && <p className="fin-warn">Önce <Link className="adm-link" href="/hesaplar">bir hesap ekleyin</Link> (banka, kasa). Şimdilik yalnızca “vadeli” kaydedilir.</p>}
                    <ProjectQuickAdd key={current.id} ledgerId={ledger.id} projectId={current.id} today={todayYmd()} accounts={quick.accounts} categories={quick.categories} favorites={quick.favorites} />
                    <h2 className="sm-h">Son harcamalar</h2>
                    {quick.recent.length === 0 ? <p className="muted" style={{ marginBottom: 18 }}>Bu projede henüz harcama yok.</p> : (
                        <ul className="sm-recent">
                            {quick.recent.map(t => (
                                <li key={t.id}><Link href={`/hareketler/${t.id}`}><span>{t.title}</span><small>{fmtDay(t.date)} · {t.category?.name ?? "kalemsiz"}{t.status === "PLANNED" ? " · vadeli" : ""}</small></Link><b>{money(t.amount, t.currency)}</b></li>
                            ))}
                        </ul>
                    )}
                </>
            ) : (
                <section className="adm-card"><div className="adm-card-body"><p className="adm-empty">Henüz proje yok. Aşağıdan ilk projeyi ekleyin (ör. “Yıldız Apt. tadilat”).</p></div></section>
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

            <p className="muted"><Link className="adm-link" href="/projeler">Tüm projeler ve düzenleme</Link>{done.length > 0 ? <> · <Link className="adm-link" href="/projeler?durum=DONE">{done.length} tamamlanan proje</Link></> : null} · <Link className="adm-link" href="/ozet">Genel özet</Link></p>
        </div>
    );
}
