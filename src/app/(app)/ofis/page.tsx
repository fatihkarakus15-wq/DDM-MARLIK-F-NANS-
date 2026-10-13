import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { ensureFreshRates } from "@/lib/finance/rates";
import { formOptions } from "@/lib/finance/options";
import { generateRecurring } from "@/lib/finance/recurring";
import { FREQUENCY } from "@/lib/finance/labels";
import { fmtDay, today, todayYmd, ymd } from "@/lib/finance/dates";
import { money, tl0 } from "@/lib/finance/money";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { addSalary, deleteRecurring, saveRecurring, settleAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ofis giderleri" };

/** Aylık sabit değeri (yıllık / 3 aylık / haftalık giderleri aya çevirir) */
const perMonth = (amount: number, f: string) => (f === "YEARLY" ? amount / 12 : f === "QUARTERLY" ? amount / 3 : f === "WEEKLY" ? (amount * 52) / 12 : amount);

/** Sabit ofis giderleri: kira, maaş, fatura, abonelik… Tekrarlayan giderler her dönem otomatik vadeli kayıt üretir. */
export default async function OfisGiderleri() {
    await requireFinancePage();
    const { ledger } = await activeLedger();
    await generateRecurring(ledger.id);
    const now = today();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 12));
    const rates = await ensureFreshRates(600);
    const [recs, opts] = await Promise.all([
        prisma.finRecurring.findMany({ where: { ledgerId: ledger.id, type: "EXPENSE", projectId: null }, orderBy: [{ isActive: "desc" }, { title: "asc" }], include: { category: { select: { name: true } } } }),
        formOptions(ledger.id, rates),
    ]);
    const txs = recs.length ? await prisma.finTransaction.findMany({
        where: { ledgerId: ledger.id, recurringId: { in: recs.map(r => r.id) }, date: { gte: monthStart } }, orderBy: { date: "asc" },
        select: { id: true, recurringId: true, status: true, date: true, amount: true, currency: true },
    }) : [];
    const byRec = new Map<string, typeof txs>();
    for (const t of txs) byRec.set(t.recurringId!, [...(byRec.get(t.recurringId!) ?? []), t]);

    const isSalary = (r: (typeof recs)[number]) => r.category?.name === "Maaş" || r.title.startsWith("Maaş");
    const salaries = recs.filter(isSalary);
    const fixed = recs.filter(r => !isSalary(r));
    const salaryMonthly = salaries.filter(r => r.isActive).reduce((a, r) => a + perMonth(r.amount, r.frequency), 0);
    const active = recs.filter(r => r.isActive);
    const monthly = active.reduce((a, r) => a + perMonth(r.amount, r.frequency), 0);
    const thisMonth = txs.filter(t => t.date <= monthEnd);
    const paid = thisMonth.filter(t => t.status === "DONE").reduce((a, t) => a + t.amount, 0);
    const left = thisMonth.filter(t => t.status === "PLANNED").reduce((a, t) => a + t.amount, 0);
    const todayDay = todayYmd();
    const expenseCats = opts.categories.filter(c => c.kind === "EXPENSE");

    const renderItem = (r: (typeof recs)[number]) => {
                            const mine = byRec.get(r.id) ?? [];
                            const cur = mine.find(t => t.date <= monthEnd);
                            const next = mine.find(t => t.date > monthEnd);
                            const late = !!cur && cur.status === "PLANNED" && ymd(cur.date) < todayDay;
                            return (
                                <li key={r.id} className={!r.isActive ? "done" : cur?.status === "DONE" ? "done" : late ? "late" : ""}>
                                    <div className="pay-row">
                                        <span><b>{r.title}</b><small>{FREQUENCY[r.frequency]}{r.category ? ` · ${r.category.name}` : ""}{!r.isActive ? " · durduruldu" : ""}</small></span>
                                        <span className="pay-amt"><b>{money(r.amount, r.currency)}</b>
                                            {r.isActive && (cur
                                                ? <em className={`adm-badge ${cur.status === "DONE" ? "ok" : late ? "bad" : "warn"}`}>{cur.status === "DONE" ? "Bu ay ödendi" : `${late ? "Gecikmiş" : "Bekliyor"} · ${fmtDay(cur.date)}`}</em>
                                                : next ? <em className="adm-badge muted">Sonraki {fmtDay(next.date)}</em> : null)}
                                        </span>
                                    </div>
                                    <details className="pay-act">
                                        <summary>{cur?.status === "PLANNED" ? "Ödendi işle / düzenle" : "Düzenle"}</summary>
                                        {cur?.status === "PLANNED" && (
                                            <AdminForm action={settleAction} className="adm-inline">
                                                <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={cur.id} />
                                                <label className="adm-field"><span className="adm-label">Hangi hesaptan</span><select name="accountId" required>{opts.accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
                                                <label className="adm-field"><span className="adm-label">Tarih</span><input type="date" name="date" defaultValue={todayDay} required /></label>
                                                <label className="adm-field"><span className="adm-label">Tutar</span><input name="amount" inputMode="decimal" defaultValue={String(cur.amount).replace(".", ",")} /></label>
                                                <SubmitButton>Ödendi</SubmitButton>
                                            </AdminForm>
                                        )}
                                        <p className="adm-help"><Link className="adm-link" href={`/ayarlar?tekrar=${r.id}#tekrarlayan`}>Tutarı, tarihi ya da hesabı değiştir</Link></p>
                                        <AdminForm action={deleteRecurring} className="adm-inline">
                                            <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={r.id} />
                                            <SubmitButton className="btn btn-sm adm-btn-danger" pendingText="…" confirm="Sabit gider ve gelecek vadeleri silinsin mi? Ödenmiş kayıtlar korunur.">Sil</SubmitButton>
                                        </AdminForm>
                                    </details>
                                </li>
                            );
                        };

    return (
        <div>
            <div className="adm-head">
                <div><h1 className="adm-title">Ofis giderleri</h1><p className="adm-sub">Her ay sabit çıkan giderler: kira, maaş, fatura, abonelik. Bir kez tanımlayın, vadeleri kendisi üretilir.</p></div>
            </div>

            <div className="pay-sum" style={{ border: 0, padding: 0, marginBottom: 14 }}>
                <div><small>Aylık sabit gider</small><b>{tl0(monthly)}</b></div>
                <div><small>Yıllık karşılığı</small><b>{tl0(monthly * 12)}</b></div>
                <div><small>Bu ay ödenen</small><b className="fin-pos">{tl0(paid)}</b></div>
                <div><small>Bu ay ödenecek</small><b>{tl0(left)}</b></div>
            </div>

            <section className="adm-card" id="maaslar">
                <div className="adm-card-head"><h2 className="adm-card-title">Maaşlar</h2><span className="adm-card-note">Aylık {tl0(salaryMonthly)}</span></div>
                {salaries.length === 0 ? <p className="adm-empty">Henüz maaş yok. Aşağıdan kişi adı ve tutarla ekleyin.</p> : <ul className="pay-list">{salaries.map(renderItem)}</ul>}
                <div className="adm-card-body">
                    <AdminForm action={addSalary} className="adm-form">
                        <input type="hidden" name="ledgerId" value={ledger.id} />
                        <div className="adm-form-grid">
                            <label className="adm-field"><span className="adm-label">Kişi</span><input name="person" list="kisiler" placeholder="Ör. Semih Bey" required maxLength={80} autoComplete="off" /></label>
                            <datalist id="kisiler">{opts.people.map(p => <option key={p.id} value={p.label} />)}</datalist>
                            <label className="adm-field"><span className="adm-label">Aylık maaş (₺)</span><input name="amount" inputMode="decimal" placeholder="0" required /></label>
                            <label className="adm-field"><span className="adm-label">Maaş günü (ilk ödeme)</span><input type="date" name="startDate" defaultValue={todayDay} required /></label>
                        </div>
                        <div className="adm-form-foot"><SubmitButton>Maaş ekle</SubmitButton><span className="adm-help">Her ay aynı günü vadeli “Maaş” gideri olur; ödeyince “Ödendi” işlersiniz.</span></div>
                    </AdminForm>
                </div>
            </section>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Sabit giderler</h2><span className="adm-card-note">{fixed.filter(r => r.isActive).length} aktif</span></div>
                {fixed.length === 0 ? <p className="adm-empty">Henüz sabit gider yok. Aşağıdan ekleyin (ör. Ofis kirası, Maaşlar, İnternet).</p> : (
                    <ul className="pay-list">{fixed.map(renderItem)}</ul>
                )}
            </section>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Yeni sabit gider</h2></div>
                <div className="adm-card-body">
                    <AdminForm action={saveRecurring} className="adm-form">
                        <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="type" value="EXPENSE" /><input type="hidden" name="currency" value="TRY" />
                        <label className="adm-field"><span className="adm-label">Gider adı</span><input name="title" placeholder="Ör. Ofis kirası" required maxLength={120} /></label>
                        <div className="adm-form-grid">
                            <label className="adm-field"><span className="adm-label">Tutar (₺)</span><input name="amount" inputMode="decimal" placeholder="0" required /></label>
                            <label className="adm-field"><span className="adm-label">Sıklık</span><select name="frequency" defaultValue="MONTHLY">{Object.entries(FREQUENCY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">İlk ödeme tarihi</span><input type="date" name="startDate" defaultValue={todayDay} required /></label>
                            <label className="adm-field"><span className="adm-label">Kalem</span><select name="categoryId" defaultValue=""><option value="">— seçin —</option>{expenseCats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
                        </div>
                        <div className="adm-form-foot"><SubmitButton>Sabit gideri ekle</SubmitButton><span className="adm-help">Sonraki ayların aynı günü otomatik vadeli kayıt olur; ödediğinizde “Ödendi” işlersiniz.</span></div>
                    </AdminForm>
                </div>
            </section>
        </div>
    );
}
