import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { SOURCE_LABEL, loadRates, probeSources } from "@/lib/finance/rates";
import { formOptions } from "@/lib/finance/options";
import { ASSETS, FREQUENCY, TX_TYPE } from "@/lib/finance/labels";
import { occurrences } from "@/lib/finance/recurring";
import { addDays, fmtDay, today, ymd } from "@/lib/finance/dates";
import { money } from "@/lib/finance/money";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { changePassword, createLedger, deleteCategory, deleteRecurring, deleteRule, regenerateRecurring, renameLedger, saveCategory, saveManualRate, saveRecurring, saveRule, signOutOthers } from "../actions";
import InstallHint from "@/components/InstallHint";

export const dynamic = "force-dynamic";

/** Ayarlar: defter, kalemler, tekrarlayan ödemeler, ekstre kuralları, kur kaynağı. */
export default async function Ayarlar({ searchParams }: { searchParams: Promise<{ kalem?: string; tekrar?: string; sina?: string }> }) {
    await requireFinancePage();
    const sp = await searchParams;
    const { ledger } = await activeLedger();
    const rates = await loadRates();
    const [cats, recurrings, rules, opts, probes] = await Promise.all([
        prisma.finCategory.findMany({ where: { ledgerId: ledger.id }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { transactions: true } } } }),
        prisma.finRecurring.findMany({ where: { ledgerId: ledger.id }, orderBy: [{ isActive: "desc" }, { title: "asc" }], include: { _count: { select: { transactions: true } } } }),
        prisma.finRule.findMany({ where: { ledgerId: ledger.id }, orderBy: [{ priority: "desc" }, { match: "asc" }], include: { category: { select: { name: true } }, project: { select: { name: true } }, contact: { select: { name: true } } } }),
        formOptions(ledger.id, rates),
        sp.sina ? probeSources() : Promise.resolve(null),
    ]);
    const editCat = sp.kalem ? cats.find(c => c.id === sp.kalem) : undefined;
    const editRec = sp.tekrar ? recurrings.find(r => r.id === sp.tekrar) : undefined;
    const groups = cats.filter(c => !c.parentId);
    const now = today();

    return (
        <div>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">Ayarlar</h1>
                    <p className="adm-sub">{ledger.name} defterinin kalemleri, tekrarlayan ödemeleri ve ekstre kuralları. Kur kaynağı ve hesabınız bütün defterler için ortaktır.</p>
                </div>
            </div>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Defter</h2></div>
                <div className="adm-card-body">
                    <AdminForm action={renameLedger} className="adm-inline">
                        <input type="hidden" name="ledgerId" value={ledger.id} />
                        <label className="adm-field"><span className="adm-label">Defter adı</span><input name="name" defaultValue={ledger.name} required /></label>
                        <SubmitButton>Kaydet</SubmitButton>
                    </AdminForm>
                    <AdminForm action={createLedger} className="adm-inline" >
                        <label className="adm-field"><span className="adm-label">Yeni defter ekle (ör. Kişisel)</span><input name="name" required /></label>
                        <SubmitButton className="btn btn-sm adm-btn-outline">Defter ekle</SubmitButton>
                    </AdminForm>
                </div>
            </section>

            <section className="adm-card" id="kalemler">
                <div className="adm-card-head"><h2 className="adm-card-title">Gelir ve gider kalemleri</h2><span className="adm-card-note">Grup › kalem (en çok iki seviye). Kullanılan kalem silinmez, pasife alınır.</span></div>
                <div className="fin-two" style={{ padding: 20 }}>
                    {(["EXPENSE", "INCOME"] as const).map(kind => (
                        <div key={kind}>
                            <h3 className="adm-section-title" style={{ marginBottom: 8 }}>{kind === "EXPENSE" ? "Gider kalemleri" : "Gelir kalemleri"}</h3>
                            <table className="adm-table"><tbody>
                                {groups.filter(g => g.kind === kind).map(g => (
                                    <Fragment key={g.id}>
                                        <tr style={g.isActive ? undefined : { opacity: 0.5 }}><td><strong>{g.name}</strong></td><td className="num muted">{g._count.transactions}</td><td><div className="fin-row-actions"><Link className="adm-link" href={`/ayarlar?kalem=${g.id}#kalem-form`}>Düzenle</Link></div></td></tr>
                                        {cats.filter(c => c.parentId === g.id).map(c => (
                                            <tr key={c.id} style={c.isActive ? undefined : { opacity: 0.5 }}><td style={{ paddingLeft: 26 }}>{c.name}</td><td className="num muted">{c._count.transactions}</td><td><div className="fin-row-actions"><Link className="adm-link" href={`/ayarlar?kalem=${c.id}#kalem-form`}>Düzenle</Link></div></td></tr>
                                        ))}
                                    </Fragment>
                                ))}
                            </tbody></table>
                        </div>
                    ))}
                </div>
                <div className="adm-card-body" id="kalem-form">
                    <AdminForm action={saveCategory} className="adm-form" key={editCat?.id ?? "new"}>
                        <input type="hidden" name="ledgerId" value={ledger.id} />
                        {editCat && <input type="hidden" name="id" value={editCat.id} />}
                        <div className="adm-form-grid">
                            <label className="adm-field"><span className="adm-label">{editCat ? "Kalem adı" : "Yeni kalem / grup adı"}</span><input name="name" defaultValue={editCat?.name} required /></label>
                            <label className="adm-field"><span className="adm-label">Tür</span><select name="kind" defaultValue={editCat?.kind ?? "EXPENSE"}><option value="EXPENSE">Gider</option><option value="INCOME">Gelir</option></select></label>
                            <label className="adm-field"><span className="adm-label">Üst grup</span><select name="parentId" defaultValue={editCat?.parentId ?? ""}><option value="">— grup (en üst) —</option>{groups.map(g => <option key={g.id} value={g.id}>{g.kind === "INCOME" ? "Gelir" : "Gider"} · {g.name}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Sıra</span><input name="sortOrder" inputMode="numeric" defaultValue={editCat?.sortOrder ?? 0} /></label>
                        </div>
                        <div className="adm-form-foot">
                            {editCat && <label className="adm-check"><input type="checkbox" name="isActive" defaultChecked={editCat.isActive} />Aktif</label>}
                            <SubmitButton>{editCat ? "Kaydet" : "Kalem ekle"}</SubmitButton>
                            {editCat && <Link className="adm-link" href="/ayarlar#kalemler">Vazgeç</Link>}
                            <span className="adm-help">Üst grubun türü kalemle aynı olmalıdır.</span>
                        </div>
                    </AdminForm>
                    {editCat && (
                        <AdminForm action={deleteCategory} className="adm-inline">
                            <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={editCat.id} />
                            <SubmitButton className="btn btn-sm adm-btn-danger" confirm="Kalem silinsin mi? Kullanılıyorsa pasife alınır.">Sil / pasife al</SubmitButton>
                        </AdminForm>
                    )}
                </div>
            </section>

            <section className="adm-card" id="tekrarlayan">
                <div className="adm-card-head"><h2 className="adm-card-title">Tekrarlayan ödemeler ve tahsilatlar</h2>
                    <AdminForm action={regenerateRecurring}><input type="hidden" name="ledgerId" value={ledger.id} /><SubmitButton className="btn btn-sm adm-btn-outline" pendingText="…">Eksik vadeleri üret</SubmitButton></AdminForm></div>
                {recurrings.length === 0 ? <p className="adm-empty">Şablon yok. Kira, abonelik, maaş, kredi taksiti gibi düzenli kalemleri bir kez girin; ileriki vadeler kendiliğinden oluşur ve nakit akışına girer.</p> : (
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Şablon</th><th>Sıklık</th><th className="num">Tutar</th><th>Sıradaki vade</th><th /></tr></thead>
                            <tbody>
                                {recurrings.map(r => {
                                    const next = occurrences(r, now, addDays(now, 400), r.skipDays)[0];
                                    return (
                                        <tr key={r.id} style={r.isActive ? undefined : { opacity: 0.5 }}>
                                            <td>{r.title}<span className="fin-sub">{TX_TYPE[r.type].label}{!r.isActive ? " · pasif" : ""}{r.endDate ? ` · ${fmtDay(r.endDate)}'e kadar` : ""}</span></td>
                                            <td>{FREQUENCY[r.frequency]}</td>
                                            <td className="num"><span className={`fin-amount ${r.type === "INCOME" ? "fin-pos" : "fin-neg"}`}>{money(r.amount, r.currency)}</span></td>
                                            <td>{next ? fmtDay(next) : "—"}</td>
                                            <td><div className="fin-row-actions">
                                                <Link className="adm-link" href={`/ayarlar?tekrar=${r.id}#tekrar-form`}>Düzenle</Link>
                                                <AdminForm action={deleteRecurring}><input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={r.id} /><SubmitButton className="adm-btn-link fin-neg" confirm="Şablon ve gelecekteki vadeli kayıtları silinsin mi? Gerçekleşenler korunur." pendingText="…">Sil</SubmitButton></AdminForm>
                                            </div></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="adm-card-body" id="tekrar-form">
                    <AdminForm action={saveRecurring} className="adm-form" key={editRec?.id ?? "new"}>
                        <input type="hidden" name="ledgerId" value={ledger.id} />
                        {editRec && <input type="hidden" name="id" value={editRec.id} />}
                        <div className="adm-form-grid">
                            <label className="adm-field wide"><span className="adm-label">Başlık</span><input name="title" defaultValue={editRec?.title} placeholder="Ör. Ofis kirası" required /></label>
                            <label className="adm-field"><span className="adm-label">Tür</span><select name="type" defaultValue={editRec?.type ?? "EXPENSE"}><option value="EXPENSE">Ödeme (gider)</option><option value="INCOME">Tahsilat (gelir)</option></select></label>
                            <label className="adm-field"><span className="adm-label">Tutar (KDV dahil)</span><input name="amount" inputMode="decimal" defaultValue={editRec ? String(editRec.amount).replace(".", ",") : ""} required /></label>
                            <label className="adm-field"><span className="adm-label">Para birimi</span><select name="currency" defaultValue={editRec?.currency ?? "TRY"}>{["TRY", "USD", "EUR", "GBP"].map(c => <option key={c}>{c}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Sıklık</span><select name="frequency" defaultValue={editRec?.frequency ?? "MONTHLY"}>{Object.entries(FREQUENCY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">İlk vade</span><input type="date" name="startDate" defaultValue={editRec ? ymd(editRec.startDate) : ""} required /></label>
                            <label className="adm-field"><span className="adm-label">Bitiş (isteğe bağlı)</span><input type="date" name="endDate" defaultValue={editRec?.endDate ? ymd(editRec.endDate) : ""} /></label>
                            <label className="adm-field"><span className="adm-label">KDV %</span><select name="vatRate" defaultValue={editRec?.vatRate != null ? String(editRec.vatRate) : ""}><option value="">—</option>{[0, 1, 10, 20].map(r => <option key={r} value={r}>%{r}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Hesap (isteğe bağlı)</span><select name="accountId" defaultValue={editRec?.accountId ?? ""}><option value="">—</option>{opts.accounts.map(a => <option key={a.id} value={a.id}>{a.label} ({a.currency})</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Kalem</span><select name="categoryId" defaultValue={editRec?.categoryId ?? ""}><option value="">—</option>{opts.categories.map(c => <option key={c.id} value={c.id}>{c.kind === "INCOME" ? "Gelir · " : ""}{c.label}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Proje</span><select name="projectId" defaultValue={editRec?.projectId ?? ""}><option value="">—</option>{opts.projects.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Cari</span><select name="contactId" defaultValue={editRec?.contactId ?? ""}><option value="">—</option>{opts.contacts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
                            <label className="adm-field full"><span className="adm-label">Not</span><input name="note" defaultValue={editRec?.note ?? ""} /></label>
                        </div>
                        <div className="adm-form-foot">
                            {editRec && <label className="adm-check"><input type="checkbox" name="isActive" defaultChecked={editRec.isActive} />Aktif</label>}
                            <SubmitButton>{editRec ? "Kaydet (gelecek vadeler yenilenir)" : "Şablonu ekle"}</SubmitButton>
                            {editRec && <Link className="adm-link" href="/ayarlar#tekrarlayan">Vazgeç</Link>}
                        </div>
                    </AdminForm>
                </div>
            </section>

            <section className="adm-card" id="kurallar">
                <div className="adm-card-head"><h2 className="adm-card-title">Ekstre kuralları</h2><span className="adm-card-note">İçe aktarılan banka satırının açıklamasında metin geçerse kalem / proje / cari otomatik atanır</span></div>
                {rules.length > 0 && (
                    <table className="adm-table"><thead><tr><th>Metin</th><th>Atanır</th><th className="num">Öncelik</th><th /></tr></thead><tbody>
                        {rules.map(r => (
                            <tr key={r.id}><td>“{r.match}”</td><td>{[r.category?.name, r.project?.name, r.contact?.name].filter(Boolean).join(" · ")}</td><td className="num">{r.priority}</td>
                                <td><AdminForm action={deleteRule}><input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={r.id} /><SubmitButton className="adm-btn-link fin-neg" pendingText="…">Sil</SubmitButton></AdminForm></td></tr>
                        ))}
                    </tbody></table>
                )}
                <div className="adm-card-body">
                    <AdminForm action={saveRule} className="adm-inline">
                        <input type="hidden" name="ledgerId" value={ledger.id} />
                        <label className="adm-field"><span className="adm-label">Açıklamada geçen metin</span><input name="match" placeholder="Ör. MIGROS, SHELL, TURKCELL" required /></label>
                        <label className="adm-field"><span className="adm-label">Kalem</span><select name="categoryId" defaultValue=""><option value="">—</option>{opts.categories.map(c => <option key={c.id} value={c.id}>{c.kind === "INCOME" ? "Gelir · " : ""}{c.label}</option>)}</select></label>
                        <label className="adm-field"><span className="adm-label">Proje</span><select name="projectId" defaultValue=""><option value="">—</option>{opts.projects.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
                        <label className="adm-field"><span className="adm-label">Cari</span><select name="contactId" defaultValue=""><option value="">—</option>{opts.contacts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
                        <label className="adm-field" style={{ maxWidth: 90 }}><span className="adm-label">Öncelik</span><input name="priority" inputMode="numeric" defaultValue="0" /></label>
                        <SubmitButton>Kural ekle</SubmitButton>
                    </AdminForm>
                </div>
            </section>

            <section className="adm-card" id="kur">
                <div className="adm-card-head"><h2 className="adm-card-title">Kur kaynağı</h2><Link className="btn btn-sm adm-btn-outline" href="/ayarlar?sina=1#kur">Kaynakları şimdi sına</Link></div>
                <div className="adm-card-body adm-form">
                    <p className="adm-help">Önce Harem Altın (döviz + altın, gün içi), olmazsa TCMB (USD/EUR/GBP, günde bir). Harem Altın&apos;ın belgelenmiş resmî bir API&apos;si yoktur; panel verisi kullanılır, adres değişirse .env dosyasına <code>FX_HAREM_URL</code> yazılabilir. Kaynak çalışmadığında son bilinen fiyat kullanılır ve “güncel değil” uyarısı çıkar; fiyat elle de girilebilir. Fiyatlar her gün 08:00&apos;de ve sayfalar açıldıkça yenilenir.</p>
                    {probes && (
                        <div style={{ display: "grid", gap: 10 }}>
                            {probes.map(p => (
                                <div key={p.source} className={`fin-warn${p.ok ? "" : " bad"}`}>
                                    <strong>{SOURCE_LABEL[p.source] ?? p.source}</strong>: {p.ok ? `çalışıyor (${p.ms} ms, ${p.codes.join(", ")})` : `ÇALIŞMIYOR: ${p.error ?? "bilinmeyen hata"}`}{p.status != null && ` · HTTP ${p.status}`}
                                    {p.sample && <pre className="fin-probe">{p.sample}</pre>}
                                </div>
                            ))}
                        </div>
                    )}
                    <table className="adm-table">
                        <thead><tr><th>Varlık</th><th className="num">Alış</th><th className="num">Satış</th><th>Kaynak</th><th>Son güncelleme</th></tr></thead>
                        <tbody>
                            {ASSETS.map(a => { const r = rates[a.code]; return (
                                <tr key={a.code}><td>{a.name}</td><td className="num">{r ? money(r.buy) : "—"}</td><td className="num">{r ? money(r.sell) : "—"}</td><td>{r ? SOURCE_LABEL[r.source] ?? r.source : "—"}</td><td>{r ? r.fetchedAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—"}</td></tr>
                            ); })}
                        </tbody>
                    </table>
                    <AdminForm action={saveManualRate} className="adm-inline">
                        <label className="adm-field"><span className="adm-label">Elle fiyat gir</span><select name="code">{ASSETS.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</select></label>
                        <label className="adm-field"><span className="adm-label">Alış (₺)</span><input name="buy" inputMode="decimal" required /></label>
                        <label className="adm-field"><span className="adm-label">Satış (₺)</span><input name="sell" inputMode="decimal" /></label>
                        <SubmitButton>Kaydet</SubmitButton>
                    </AdminForm>
                </div>
            </section>

            <section className="adm-card" id="hesabim">
                <div className="adm-card-head"><h2 className="adm-card-title">Hesabım</h2></div>
                <div className="adm-card-body adm-form">
                    <InstallHint />
                    <AdminForm action={changePassword} className="adm-form">
                        <div className="adm-form-grid">
                            <label className="adm-field"><span className="adm-label">Mevcut şifre</span><input name="current" type="password" autoComplete="current-password" required /></label>
                            <label className="adm-field"><span className="adm-label">Yeni şifre (en az 10 karakter)</span><input name="next" type="password" autoComplete="new-password" minLength={10} required /></label>
                            <label className="adm-field"><span className="adm-label">Yeni şifre (tekrar)</span><input name="again" type="password" autoComplete="new-password" minLength={10} required /></label>
                        </div>
                        <div className="adm-form-foot"><SubmitButton>Şifreyi değiştir</SubmitButton><span className="adm-help">Değişince diğer cihazlardaki oturumlar kapanır.</span></div>
                    </AdminForm>
                    <AdminForm action={signOutOthers} className="adm-inline">
                        <SubmitButton className="btn btn-sm adm-btn-outline" confirm="Bu cihaz dışındaki bütün oturumlar kapatılsın mı?">Diğer cihazlardaki oturumları kapat</SubmitButton>
                    </AdminForm>
                </div>
            </section>
        </div>
    );
}
