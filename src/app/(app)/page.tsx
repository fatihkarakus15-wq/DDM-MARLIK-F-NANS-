import Link from "next/link";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { projectsOverview } from "@/lib/finance/reports";
import { prisma } from "@/lib/prisma";
import { fmtDay, today } from "@/lib/finance/dates";
import { money, tl0 } from "@/lib/finance/money";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import InstallHint from "@/components/InstallHint";
import { saveProject } from "./actions";
import { importLegacy } from "./ice-aktar/gecmis/actions";
import { LEGACY_IMPORTS } from "@/lib/finance/legacy-imports";

export const dynamic = "force-dynamic";

/** Ana ekran: projelerin adları. Üstte "Aktif" ve "Teslim edilenler"; bir projeye dokununca harcama girişi açılır. */
export default async function Projelerim({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
    await requireFinancePage();
    const { durum } = await searchParams;
    const { ledger } = await activeLedger();
    const now = today();
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 12));
    const [all, due] = await Promise.all([
        projectsOverview(ledger.id),
        prisma.finTransaction.findMany({
            where: { ledgerId: ledger.id, type: "INCOME", status: "PLANNED", projectId: { not: null }, date: { lte: monthEnd }, project: { status: { notIn: ["CANCELLED"] } } },
            orderBy: { date: "asc" }, take: 30,
            select: { id: true, title: true, amount: true, currency: true, amountTRY: true, date: true, projectId: true, project: { select: { name: true, client: { select: { name: true } } } }, contact: { select: { name: true } } },
        }),
    ]);
    const dueTotal = due.reduce((a, t) => a + t.amountTRY, 0);
    const active = all.filter(p => p.status === "ACTIVE" || p.status === "ON_HOLD" || p.status === "LEAD");
    const delivered = all.filter(p => p.status === "DONE");
    const showDelivered = durum === "teslim";
    const list = showDelivered ? delivered : active;
    // Excel defterinden hazırlanmış, henüz eklenmemiş geçmiş işler (Teslim edilenler sekmesinde tek dokunuşla eklenir)
    const pending = LEGACY_IMPORTS.filter(l => !all.some(p => p.name.toLocaleLowerCase("tr") === l.name.toLocaleLowerCase("tr")));

    return (
        <div>
            <InstallHint />
            <nav className="pl-tabs" aria-label="Proje durumu">
                <Link href="/" replace className={`pl-tab${!showDelivered ? " on" : ""}`} aria-current={!showDelivered ? "page" : undefined}>Aktif <span>{active.length}</span></Link>
                <Link href="/?durum=teslim" replace className={`pl-tab${showDelivered ? " on" : ""}`} aria-current={showDelivered ? "page" : undefined}>Teslim edilenler <span>{delivered.length}</span></Link>
            </nav>

            {!showDelivered && due.length > 0 && (
                <section className="due-card" aria-label="Bu ay alınacaklar">
                    <h2>Bu ay alınacaklar</h2>
                    <div className="due-total">{tl0(dueTotal)}</div>
                    <ul>
                        {due.map(t => (
                            <li key={t.id} className={t.date < now ? "late" : ""}>
                                <Link href={`/projeler/${t.projectId}#tahsilat`}>
                                    <span>{t.contact?.name ?? t.project?.client?.name ?? t.project?.name}<small>{t.project?.name} · {fmtDay(t.date)}{t.date < now ? " · gecikmiş" : ""}</small></span>
                                    <b>{money(t.amount, t.currency)}</b>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {showDelivered && pending.map(l => {
                const total = l.contractAmount + l.extras.reduce((a, e) => a + e.amount, 0);
                return (
                    <section className="due-card" key={l.key} aria-label="Aktarılmaya hazır geçmiş iş">
                        <h2>Aktarılmaya hazır geçmiş iş</h2>
                        <div className="due-total" style={{ fontSize: "1.15rem" }}>{l.name}</div>
                        <p style={{ margin: "6px 0 10px", fontSize: ".85rem", color: "#a7c9bd" }}>Toplam iş {tl0(total)} · {l.collections.length} tahsilat · {l.expenses.length} harcama (Excel defterinden)</p>
                        <AdminForm action={importLegacy} className="adm-form">
                            <input type="hidden" name="key" value={l.key} />
                            <SubmitButton confirm={`“${l.name}” teslim edilenlere eklensin mi?`} pendingText="Ekleniyor…">Teslim edilenlere aktar</SubmitButton>
                        </AdminForm>
                    </section>
                );
            })}

            {list.length === 0 && !(showDelivered && pending.length) ? (
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
