import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { ensureFreshRates } from "@/lib/finance/rates";
import { formOptions } from "@/lib/finance/options";
import { projectCosts, projectsOverview } from "@/lib/finance/reports";
import { PROJECT_STATUS, TX_TYPE } from "@/lib/finance/labels";
import { fmtDay, monthLabel, todayYmd } from "@/lib/finance/dates";
import { money, pct, tl0 } from "@/lib/finance/money";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { Amount, Kpi } from "@/components/finance/ui";
import ShareBars from "@/components/finance/ShareBars";
import { LineChart } from "@/components/finance/charts";
import TxForm from "@/components/finance/TxForm";
import ProjectQuickAdd from "@/components/finance/ProjectQuickAdd";
import { addProjectItem, deleteProject, saveBudgetLine, setProjectDelivered } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ProjeDetay({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kalem?: string }> }) {
    await requireFinancePage();
    const { id } = await params;
    const { kalem } = await searchParams;
    const { ledger } = await activeLedger();
    // Bağımsız sorgular birlikte: sırayla beklemek her biri için bir ağ turu ekler
    const [project, rates, used] = await Promise.all([
        prisma.finProject.findFirst({ where: { id, ledgerId: ledger.id }, include: { client: { select: { id: true, name: true } } } }),
        ensureFreshRates(600),
        prisma.finTransaction.groupBy({ by: ["categoryId"], where: { ledgerId: ledger.id, type: "EXPENSE", categoryId: { not: null } }, _count: true, orderBy: { _count: { categoryId: "desc" } }, take: 6 }),
    ]);
    if (!project) notFound();
    const [overview, costs, txs, opts] = await Promise.all([
        projectsOverview(ledger.id),
        projectCosts(ledger.id, id),
        prisma.finTransaction.findMany({
            where: { ledgerId: ledger.id, projectId: id, type: { in: ["INCOME", "EXPENSE"] } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 40,
            include: { contact: { select: { name: true } }, category: { select: { name: true, parent: { select: { name: true } } } } },
        }),
        formOptions(ledger.id, rates),
    ]);
    const p = overview.find(x => x.id === id)!;
    const expenseOpts = opts.categories.filter(c => c.kind === "EXPENSE");
    const favIds = used.map(u => u.categoryId!).filter(cid => expenseOpts.some(c => c.id === cid));
    const leafLabel = (l: string) => l.split(" › ").pop()!;
    // En çok kullanılanlar; eksik kalırsa şantiyede sık geçen kalemlerle tamamlanır
    const PREFERRED = ["Yapı malzemesi", "Boya", "Yemek", "Taşeron hakedişi", "Usta / işçilik", "Yakıt", "Nakliye ve montaj", "Seramik / kaplama", "Elektrik ve aydınlatma"];
    const projectItems = costs.compare.map(c => c.categoryId).filter((x): x is string => !!x && expenseOpts.some(c => c.id === x));
    const picked = [...new Set([...projectItems, ...favIds])].map(fid => expenseOpts.find(c => c.id === fid)!);
    for (const name of PREFERRED) {
        if (picked.length >= 8) break;
        const c = expenseOpts.find(o => leafLabel(o.label) === name);
        if (c && !picked.some(x => x.id === c.id)) picked.push(c);
    }
    const spentBy = new Map(costs.compare.map(c => [c.categoryId, c.actual]));
    const favorites = picked.slice(0, 8).map(c => ({ id: c.id, label: leafLabel(c.label), spent: spentBy.get(c.id) }));
    const status = PROJECT_STATUS[project.status];
    const expenseCats = opts.categories.filter(c => c.kind === "EXPENSE");
    const budgeted = new Set(costs.compare.filter(c => c.budget > 0).map(c => c.categoryId));

    return (
        <div>
            <Link href="/" className="adm-back">← Projeler</Link>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">{project.code ? `${project.code} · ` : ""}{project.name}</h1>
                    <p className="adm-sub"><span className={`adm-badge ${status.tone}`}>{status.label}</span> · {project.client ? <Link className="adm-link" href={`/cariler/${project.client.id}`}>{project.client.name}</Link> : "Müşteri belirtilmemiş"}
                        {project.startDate && <> · {fmtDay(project.startDate)}{project.endDate ? ` – ${fmtDay(project.endDate)}` : ""}</>}</p>
                </div>
                <div className="adm-actions"><Link className="btn btn-sm adm-btn-outline" href={`/projeler?duzenle=${id}#form`}>Projeyi düzenle</Link><Link className="btn btn-sm adm-btn-outline" href={`/hareketler?proje=${id}&donem=tumu`}>Tüm hareketler</Link></div>
            </div>

            <div id="ekle">
                {opts.accounts.length === 0 && <p className="fin-warn">Önce <Link className="adm-link" href="/hesaplar">bir hesap ekleyin</Link> (banka, kasa). Şimdilik yalnızca “vadeli” kaydedilir.</p>}
                <ProjectQuickAdd ledgerId={ledger.id} projectId={id} today={todayYmd()} accounts={opts.accounts} categories={expenseOpts.map(c => ({ id: c.id, label: c.label }))} favorites={favorites} initialCategoryId={kalem} key={kalem ?? "x"} />
            </div>

            <h2 className="sm-h">Son harcamalar <span>· toplam {tl0(p.expense)}</span></h2>
            {txs.filter(t => t.type === "EXPENSE").length === 0 ? <p className="muted" style={{ marginBottom: 18 }}>Henüz harcama girilmemiş.</p> : (
                <ul className="sm-recent">
                    {txs.filter(t => t.type === "EXPENSE").slice(0, 6).map(t => (
                        <li key={t.id}><Link href={`/hareketler/${t.id}`}><span>{t.title}</span><small>{fmtDay(t.date)} · {t.category?.name ?? "kalemsiz"}{t.status === "PLANNED" ? " · vadeli" : ""}</small></Link><b>{money(t.amount, t.currency)}</b></li>
                    ))}
                </ul>
            )}

            <details className="adm-fold">
                <summary>Özet, bütçeler ve grafikler</summary>
                <div className="adm-card-body">
            <div className="adm-kpis">
                <Kpi accent label="Sözleşme bedeli" value={p.contract != null ? tl0(p.contract) : "—"} note={p.contractLeft != null ? `faturalanmamış ${tl0(Math.max(0, p.contractLeft))}` : "bedel girilmemiş"} />
                <Kpi label="Gelir (KDV hariç)" value={tl0(p.income)} note={`tahsil edilen ${tl0(p.collected)} · alacak ${tl0(p.receivable)}`} />
                <Kpi label="Harcama (KDV hariç)" value={tl0(p.expense)} note={`ödenen ${tl0(p.paid)} · ödenecek ${tl0(p.payable)}`} />
                <Kpi label="Kâr" value={<Amount value={p.margin} digits={0} sign />} note={p.marginPct != null ? `marj ${pct(p.marginPct)}` : "henüz gelir yok"} />
                <Kpi label="Bütçe kullanımı" value={p.budget ? pct(p.budgetUsedPct) : "—"} note={p.budget ? `${tl0(p.expense)} / ${tl0(p.budget)}` : "bütçe girilmemiş"} tone={(p.budgetUsedPct ?? 0) > 100 ? "neg" : undefined} />
            </div>

            <div className="fin-two">
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">Neye ne kadar harcandı</h2><span className="adm-card-note">Kalem grupları, KDV hariç</span></div>
                    <ShareBars items={costs.groups.map(g => ({ label: g.group, amount: g.amount, share: g.share, sub: g.items.length > 1 ? g.items.slice(0, 3).map(i => `${i.label.split(" › ").pop()} ${tl0(i.amount)}`).join(" · ") : undefined, href: g.groupId ? `/hareketler?proje=${id}&donem=tumu&kalem=${g.groupId}` : undefined}))} tone="s2" empty="Bu projeye henüz gider girilmemiş." />
                </section>
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">Aylık harcama</h2></div>
                    {costs.monthly.length < 2 ? <p className="adm-empty">Grafik için en az iki aylık harcama gerekir.</p> : <LineChart label="Aylık proje harcaması" name="Harcama" points={costs.monthly.map(m => ({ label: monthLabel(m.month), value: m.amount }))} height={200} width={460} />}
                </section>
            </div>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Harcama kalemleri</h2><span className="adm-card-note">Bu projedeki kalemler, harcanan ve bütçe. ▲ aşılanları gösterir.</span></div>
                <div className="adm-card-body" style={{ borderBottom: "1px solid var(--cream-dim)" }}>
                    <AdminForm action={addProjectItem} className="adm-inline">
                        <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="projectId" value={id} />
                        <label className="adm-field"><span className="adm-label">Yeni kalem ekle (ör. Seramik, Elektrik, Marangoz)</span><input name="name" required /></label>
                        <label className="adm-field" style={{ maxWidth: 150 }}><span className="adm-label">Bütçe ₺ (isteğe bağlı)</span><input name="amountTL" inputMode="decimal" /></label>
                        <SubmitButton>Kalemi ekle</SubmitButton>
                    </AdminForm>
                </div>
                {costs.compare.length === 0 ? <p className="adm-empty">Bu projede henüz kalem yok. Yukarıdan ekleyin ya da doğrudan “Harcama ekle” ile girin.</p> : (
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Kalem</th><th className="num">Gerçekleşen</th><th>Kullanım</th><th className="num">Kalan</th><th>Bütçe (₺)</th></tr></thead>
                            <tbody>
                                {costs.compare.map(c => (
                                    <tr key={c.categoryId ?? "none"}>
                                        <td>{c.categoryId ? <Link className="adm-link" href={`/projeler/${id}?kalem=${c.categoryId}#ekle`}>+ {c.label}</Link> : c.label}</td>
                                        <td className="num">{tl0(c.actual)}</td>
                                        <td>{c.budget > 0 ? <><div className={`fin-meter${c.actual > c.budget ? " over" : ""}`}><span style={{ width: `${Math.min(100, (c.actual / c.budget) * 100)}%` }} /></div><span className={`fin-sub${c.actual > c.budget ? " fin-neg" : ""}`}>{c.actual > c.budget ? "▲ aşıldı " : ""}{pct(c.usedPct)}</span></> : <span className="muted">—</span>}</td>
                                        <td className="num">{c.budget > 0 ? <Amount value={c.diff} digits={0} /> : "—"}</td>
                                        <td>{c.categoryId ? (
                                            <AdminForm action={saveBudgetLine} className="adm-inline">
                                                <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="projectId" value={id} /><input type="hidden" name="categoryId" value={c.categoryId} />
                                                <label className="adm-field"><span className="adm-label" style={{ position: "absolute", left: -9999 }}>Bütçe</span><input name="amountTL" inputMode="decimal" defaultValue={c.budget ? String(c.budget).replace(".", ",") : ""} placeholder="0" style={{ maxWidth: 120 }} /></label>
                                                <SubmitButton className="btn btn-sm adm-btn-outline" pendingText="…">Kaydet</SubmitButton>
                                            </AdminForm>) : <span className="muted">kalemsiz</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot><tr><td>Toplam</td><td className="num">{tl0(costs.totalExpense)}</td><td /><td className="num">{costs.totalBudget ? <Amount value={costs.totalBudget - costs.totalExpense} digits={0} /> : "—"}</td><td className="num">{tl0(costs.totalBudget)}</td></tr></tfoot>
                        </table>
                    </div>
                )}
                <div className="adm-card-body">
                    <AdminForm action={saveBudgetLine} className="adm-inline">
                        <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="projectId" value={id} />
                        <label className="adm-field"><span className="adm-label">Kaleme bütçe ekle</span><select name="categoryId" required><option value="">— kalem seçin —</option>{expenseCats.filter(c => !budgeted.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
                        <label className="adm-field"><span className="adm-label">Bütçe (₺, KDV hariç)</span><input name="amountTL" inputMode="decimal" required /></label>
                        <SubmitButton>Ekle</SubmitButton>
                    </AdminForm>
                </div>
            </section>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Son hareketler</h2><Link className="adm-link" href={`/hareketler?proje=${id}&donem=tumu`}>Hepsi</Link></div>
                {txs.length === 0 ? <p className="adm-empty">Bu projeye bağlı hareket yok.</p> : (
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Tarih</th><th>Açıklama</th><th>Kalem</th><th className="num">Tutar</th></tr></thead>
                            <tbody>
                                {txs.map(t => (
                                    <tr key={t.id}>
                                        <td>{fmtDay(t.date)}{t.status === "PLANNED" && <span className="adm-badge warn" style={{ marginLeft: 6 }}>Vadeli</span>}</td>
                                        <td className="wrap"><Link className="adm-link" href={`/hareketler/${t.id}`}>{t.title}</Link><span className="fin-sub">{t.contact?.name}</span></td>
                                        <td className="wrap">{t.category ? (t.category.parent ? `${t.category.parent.name} › ${t.category.name}` : t.category.name) : "—"}</td>
                                        <td className="num"><Amount value={t.type === "INCOME" ? t.amount : -t.amount} currency={t.currency} sign /><span className="fin-sub">{TX_TYPE[t.type].label}{t.vatAmount > 0 ? ` · KDV ${money(t.vatAmount, t.currency)}` : ""}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

                </div>
            </details>

            <details className="adm-fold">
                <summary>Gelir (tahsilat) ya da ayrıntılı hareket ekle</summary>
                <div className="adm-card-body">
                    <TxForm ledgerId={ledger.id} today={todayYmd()} accounts={opts.accounts} categories={opts.categories} projects={opts.projects} contacts={opts.contacts} rates={opts.rates} initial={{ type: "EXPENSE", projectId: id, contactId: undefined }} />
                </div>
            </details>

            <section className="adm-card">
                <div className="adm-card-body">
                    <AdminForm action={setProjectDelivered} className="adm-inline">
                        <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={id} /><input type="hidden" name="delivered" value={project.status === "DONE" ? "0" : "1"} />
                        <SubmitButton className="btn btn-dark" confirm={project.status === "DONE" ? undefined : "Proje teslim edildi olarak işaretlensin mi? Ana ekranda “Teslim edilenler” altına geçer."}>{project.status === "DONE" ? "Yeniden aktif yap" : "Teslim edildi olarak işaretle"}</SubmitButton>
                    </AdminForm>
                </div>
            </section>

            <section className="adm-card">
                <div className="adm-card-body">
                    <AdminForm action={deleteProject} className="adm-inline">
                        <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={id} />
                        <SubmitButton className="btn btn-sm adm-btn-danger" confirm="Proje silinsin mi? Hareketi varsa silinemez.">Projeyi sil</SubmitButton>
                        <span className="adm-help">Hareketi olan proje silinemez; durumunu Tamamlandı ya da İptal yapın.</span>
                    </AdminForm>
                </div>
            </section>
        </div>
    );
}
