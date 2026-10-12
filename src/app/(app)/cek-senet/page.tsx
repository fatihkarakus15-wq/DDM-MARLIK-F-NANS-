import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { ensureFreshRates, toTRY } from "@/lib/finance/rates";
import { formOptions } from "@/lib/finance/options";
import { CHEQUE_DIRECTION, CHEQUE_KIND, CHEQUE_STATUS } from "@/lib/finance/labels";
import { diffDays, fmtDay, today, todayYmd, ymd } from "@/lib/finance/dates";
import { money, tl0 } from "@/lib/finance/money";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { DueBadge, Kpi } from "@/components/finance/ui";
import { chequeAction, saveCheque } from "../actions";

export const dynamic = "force-dynamic";

function Op({ ledgerId, id, op, label, confirm, danger }: { ledgerId: string; id: string; op: string; label: string; confirm?: string; danger?: boolean }) {
    return (
        <AdminForm action={chequeAction}>
            <input type="hidden" name="ledgerId" value={ledgerId} /><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={op} />
            <SubmitButton className={`adm-btn-link${danger ? " fin-neg" : ""}`} confirm={confirm} pendingText="…">{label}</SubmitButton>
        </AdminForm>
    );
}

/** Çek / senet portföyü: aldıklarımız ve verdiklerimiz, vade, tahsil / ödeme. Tahsil edilince hesaba işlenir. */
export default async function CekSenet({ searchParams }: { searchParams: Promise<{ durum?: string; yon?: string; duzenle?: string }> }) {
    await requireFinancePage();
    const { durum = "aktif", yon, duzenle } = await searchParams;
    const { ledger } = await activeLedger();
    const rates = await ensureFreshRates(600);
    const [all, opts, linkable] = await Promise.all([
        prisma.finCheque.findMany({ where: { ledgerId: ledger.id }, orderBy: { dueDate: "asc" }, include: { contact: { select: { name: true } }, project: { select: { name: true } }, account: { select: { name: true } } } }),
        formOptions(ledger.id, rates),
        prisma.finTransaction.findMany({
            where: { ledgerId: ledger.id, status: "PLANNED", type: { in: ["INCOME", "EXPENSE"] }, cheque: null }, orderBy: { date: "asc" }, take: 150,
            select: { id: true, type: true, title: true, date: true, amount: true, currency: true, contact: { select: { name: true } } },
        }),
    ]);
    const now = today();
    const live = (s: string) => s === "OPEN" || s === "DEPOSITED";
    const tryAmt = (c: (typeof all)[number]) => toTRY(c.amount, c.currency, rates) ?? 0;
    const received = all.filter(c => c.direction === "RECEIVED" && live(c.status));
    const issued = all.filter(c => c.direction === "ISSUED" && live(c.status));
    const due30 = all.filter(c => live(c.status) && diffDays(now, c.dueDate) <= 30);
    const rows = all.filter(c => (durum === "hepsi" || (durum === "aktif" ? live(c.status) : !live(c.status))) && (!yon || c.direction === yon));
    const edit = duzenle ? all.find(c => c.id === duzenle) : undefined;
    const sameCur = (cur: string) => opts.accounts.filter(a => a.currency === cur);

    return (
        <div>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">Çek / Senet</h1>
                    <p className="adm-sub">Aldığınız ve verdiğiniz çek / senetler. Vadesi gelenler nakit akışı tahminine girer; tahsil edildiğinde ya da ödendiğinde hesaba işlenir.</p>
                </div>
            </div>
            <div className="adm-kpis">
                <Kpi accent label="Portföydeki (alınan)" value={tl0(received.reduce((s, c) => s + tryAmt(c), 0))} note={`${received.length} adet · tahsil edilecek`} />
                <Kpi label="Verilen (ödenecek)" value={tl0(issued.reduce((s, c) => s + tryAmt(c), 0))} note={`${issued.length} adet`} />
                <Kpi label="30 gün içinde vadesi gelen" value={String(due30.length)} note={tl0(due30.reduce((s, c) => s + (c.direction === "RECEIVED" ? 1 : -1) * tryAmt(c), 0)) + " net"} />
                <Kpi label="Karşılıksız" value={String(all.filter(c => c.status === "BOUNCED").length)} tone={all.some(c => c.status === "BOUNCED") ? "neg" : undefined} />
            </div>

            <div className="adm-filters">
                {[["aktif", "Aktif"], ["tamam", "Sonuçlanan"], ["hepsi", "Hepsi"]].map(([k, l]) => <Link key={k} href={`/cek-senet?durum=${k}${yon ? `&yon=${yon}` : ""}`} className={`adm-chip${durum === k ? " active" : ""}`}>{l}</Link>)}
                <span className="muted">|</span>
                {[["", "Alınan + verilen"], ["RECEIVED", "Alınan"], ["ISSUED", "Verilen"]].map(([k, l]) => <Link key={k} href={`/cek-senet?durum=${durum}${k ? `&yon=${k}` : ""}`} className={`adm-chip${(yon ?? "") === k ? " active" : ""}`}>{l}</Link>)}
            </div>

            <section className="adm-card">
                {rows.length === 0 ? <p className="adm-empty">Kayıt yok.</p> : (
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Vade</th><th>Çek / senet</th><th>Cari</th><th className="num">Tutar</th><th>Durum</th><th>İşlem</th></tr></thead>
                            <tbody>
                                {rows.map(c => {
                                    const accounts = sameCur(c.currency);
                                    const received = c.direction === "RECEIVED";
                                    return (
                                        <tr key={c.id} className={live(c.status) && diffDays(c.dueDate, now) > 0 ? "late" : ""}>
                                            <td>{fmtDay(c.dueDate)}{live(c.status) && <span className="fin-sub"><DueBadge days={diffDays(c.dueDate, now)} /></span>}</td>
                                            <td>{CHEQUE_KIND[c.kind]} {c.number ?? ""}<span className="fin-sub">{CHEQUE_DIRECTION[c.direction]}{c.bankName ? ` · ${c.bankName}` : ""}{c.project ? ` · ${c.project.name}` : ""}</span></td>
                                            <td>{c.contact?.name ?? "—"}</td>
                                            <td className="num"><span className={`fin-amount ${received ? "fin-pos" : "fin-neg"}`}>{received ? "+" : "−"}{money(c.amount, c.currency)}</span></td>
                                            <td><span className={`adm-badge ${CHEQUE_STATUS[c.status].tone}`}>{CHEQUE_STATUS[c.status].label}</span>{c.settledAt && <span className="fin-sub">{fmtDay(c.settledAt)}{c.account ? ` · ${c.account.name}` : ""}</span>}</td>
                                            <td>
                                                <div className="fin-row-actions">
                                                    {c.status !== "SETTLED" && c.status !== "CANCELLED" && c.status !== "ENDORSED" && (
                                                        <details>
                                                            <summary className="adm-link" style={{ cursor: "pointer" }}>{received ? "Tahsil edildi" : "Ödendi"}</summary>
                                                            {accounts.length === 0 ? <p className="fin-hint">{c.currency} hesabı yok.</p> : (
                                                                <AdminForm action={chequeAction} className="adm-inline">
                                                                    <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="op" value="settle" />
                                                                    <label className="adm-field"><span className="adm-label">Hesap</span><select name="accountId" defaultValue={c.accountId ?? accounts[0].id}>{accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
                                                                    <label className="adm-field"><span className="adm-label">Gün</span><input type="date" name="date" defaultValue={todayYmd()} /></label>
                                                                    <SubmitButton pendingText="…">İşle</SubmitButton>
                                                                </AdminForm>
                                                            )}
                                                        </details>
                                                    )}
                                                    {received && c.status === "OPEN" && <Op ledgerId={ledger.id} id={c.id} op="deposit" label="Tahsile ver" />}
                                                    {received && live(c.status) && <Op ledgerId={ledger.id} id={c.id} op="endorse" label="Ciro et" confirm="Ciro edildi olarak işaretlensin mi? Nakit hareketi oluşmaz; ilgili borcu ayrıca kapatın." />}
                                                    {received && live(c.status) && <Op ledgerId={ledger.id} id={c.id} op="bounce" label="Karşılıksız" danger confirm="Karşılıksız çıktı olarak işaretlensin mi?" />}
                                                    {c.status === "BOUNCED" && <Op ledgerId={ledger.id} id={c.id} op="reopen" label="Yeniden aç" />}
                                                    {live(c.status) && <Op ledgerId={ledger.id} id={c.id} op="cancel" label="İptal" confirm="Çek / senet iptal edilsin mi?" />}
                                                    <Link className="adm-link" href={`/cek-senet?duzenle=${c.id}#form`}>Düzenle</Link>
                                                    {c.status !== "SETTLED" && <Op ledgerId={ledger.id} id={c.id} op="delete" label="Sil" danger confirm="Kayıt silinsin mi?" />}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className={`adm-card${edit ? " fin-edit" : ""}`} id="form">
                <div className="adm-card-head"><h2 className="adm-card-title">{edit ? "Çek / senedi düzenle" : "Yeni çek / senet"}</h2>{edit && <Link className="adm-link" href="/cek-senet">Vazgeç</Link>}</div>
                <div className="adm-card-body">
                    <AdminForm action={saveCheque} className="adm-form" key={edit?.id ?? "new"}>
                        <input type="hidden" name="ledgerId" value={ledger.id} />
                        {edit && <input type="hidden" name="id" value={edit.id} />}
                        <div className="adm-form-grid">
                            <label className="adm-field"><span className="adm-label">Yön</span><select name="direction" defaultValue={edit?.direction ?? "RECEIVED"}><option value="RECEIVED">Aldığımız (tahsil edeceğiz)</option><option value="ISSUED">Verdiğimiz (ödeyeceğiz)</option></select></label>
                            <label className="adm-field"><span className="adm-label">Tür</span><select name="kind" defaultValue={edit?.kind ?? "CHECK"}><option value="CHECK">Çek</option><option value="NOTE">Senet</option></select></label>
                            <label className="adm-field"><span className="adm-label">Çek / senet no</span><input name="number" defaultValue={edit?.number ?? ""} /></label>
                            <label className="adm-field"><span className="adm-label">Banka</span><input name="bankName" defaultValue={edit?.bankName ?? ""} /></label>
                            <label className="adm-field"><span className="adm-label">Tutar</span><input name="amount" inputMode="decimal" defaultValue={edit ? String(edit.amount).replace(".", ",") : ""} required /></label>
                            <label className="adm-field"><span className="adm-label">Para birimi</span><select name="currency" defaultValue={edit?.currency ?? "TRY"}>{["TRY", "USD", "EUR", "GBP"].map(c => <option key={c}>{c}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Düzenleme tarihi</span><input type="date" name="issueDate" defaultValue={edit?.issueDate ? ymd(edit.issueDate) : ""} /></label>
                            <label className="adm-field"><span className="adm-label">Vade</span><input type="date" name="dueDate" defaultValue={edit ? ymd(edit.dueDate) : ""} required /></label>
                            <label className="adm-field"><span className="adm-label">Cari (keşideci / lehtar)</span><select name="contactId" defaultValue={edit?.contactId ?? ""}><option value="">— belirtilmedi —</option>{opts.contacts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Proje</span><select name="projectId" defaultValue={edit?.projectId ?? ""}><option value="">— projesiz —</option>{opts.projects.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Tahsil / ödeme hesabı</span><select name="accountId" defaultValue={edit?.accountId ?? ""}><option value="">— sonra seçilecek —</option>{opts.accounts.map(a => <option key={a.id} value={a.id}>{a.label} ({a.currency})</option>)}</select></label>
                            <label className="adm-field wide"><span className="adm-label">Kapatılacak vadeli kayıt (isteğe bağlı)</span>
                                <select name="transactionId" defaultValue=""><option value="">— yok (tahsilatta yeni hareket oluşur) —</option>{linkable.map(t => <option key={t.id} value={t.id}>{fmtDay(t.date)} · {t.type === "INCOME" ? "alacak" : "borç"} · {t.title}{t.contact ? ` · ${t.contact.name}` : ""} · {money(t.amount, t.currency)}</option>)}</select>
                                <span className="adm-help">Çek, mevcut bir alacak / borç karşılığıysa seçin: nakit akışında çift sayılmaz, tahsilatta o kayıt gerçekleşir.</span></label>
                            <label className="adm-field full"><span className="adm-label">Not</span><input name="note" defaultValue={edit?.note ?? ""} /></label>
                        </div>
                        <div className="adm-form-foot"><SubmitButton>{edit ? "Kaydet" : "Ekle"}</SubmitButton></div>
                    </AdminForm>
                </div>
            </section>
        </div>
    );
}
