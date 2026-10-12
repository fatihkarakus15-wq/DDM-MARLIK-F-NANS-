import Link from "next/link";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { accountBalances, cashTotals } from "@/lib/finance/balances";
import { ensureFreshRates } from "@/lib/finance/rates";
import { ACCOUNT_KIND } from "@/lib/finance/labels";
import { money, tl0 } from "@/lib/finance/money";
import { fmtDay, ymd } from "@/lib/finance/dates";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { Amount, Kpi } from "@/components/finance/ui";
import { deleteAccount, saveAccount } from "../actions";

export const dynamic = "force-dynamic";

/** Hesaplar: banka, kasa, kredi kartı, POS. Bakiye = açılış + gerçekleşen hareketler. */
export default async function Hesaplar({ searchParams }: { searchParams: Promise<{ duzenle?: string; pasif?: string }> }) {
    await requireFinancePage();
    const { duzenle, pasif } = await searchParams;
    const { ledger } = await activeLedger();
    const rates = await ensureFreshRates(600);
    const accounts = await accountBalances(ledger.id, rates, { inactive: true });
    const shown = accounts.filter(a => a.isActive || pasif);
    const totals = cashTotals(accounts.filter(a => a.isActive));
    const edit = duzenle ? accounts.find(a => a.id === duzenle) : undefined;
    const hiddenCount = accounts.filter(a => !a.isActive).length;

    return (
        <div>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">Hesaplar</h1>
                    <p className="adm-sub">Banka, kasa, kredi kartı ve POS bakiyeleri. Bakiye, açılış bakiyesi artı o tarihten sonraki gerçekleşen hareketlerdir; bankanın ekranıyla farkı varsa hareketleri kontrol edin ya da ekstreyi içe aktarın.</p>
                </div>
            </div>

            <div className="adm-kpis">
                <Kpi accent label="Toplam nakit" value={money(totals.cash, "TRY", 0)} note="banka + kasa + POS (TL karşılığı)" />
                <Kpi label="Kredi kartı borcu" value={tl0(totals.cardDebt)} note="kartlardaki güncel borç" />
                <Kpi label="Hesap sayısı" value={String(accounts.filter(a => a.isActive).length)} note={hiddenCount ? `${hiddenCount} pasif` : undefined} />
            </div>
            {totals.missingRate.length > 0 && <div className="fin-warn">{totals.missingRate.join(", ")} kuru yok; bu hesaplar toplama girmiyor. <Link className="adm-link" href="/ayarlar">Kur gir</Link></div>}

            <section className="adm-card">
                <div className="adm-card-head">
                    <h2 className="adm-card-title">Hesap listesi</h2>
                    {hiddenCount > 0 && <Link className="adm-link" href={pasif ? "/hesaplar" : "/hesaplar?pasif=1"}>{pasif ? "Pasifleri gizle" : `Pasifleri göster (${hiddenCount})`}</Link>}
                </div>
                {shown.length === 0 ? <p className="adm-empty">Henüz hesap yok. Aşağıdan ekleyin.</p> : (
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Hesap</th><th>Tür</th><th className="num">Bakiye</th><th className="num">TL karşılığı</th><th>Kart</th><th className="num">Hareket</th><th /></tr></thead>
                            <tbody>
                                {shown.map(a => (
                                    <tr key={a.id} style={a.isActive ? undefined : { opacity: 0.55 }}>
                                        <td>{a.name}{!a.isActive && <span className="adm-badge muted" style={{ marginLeft: 6 }}>Pasif</span>}<span className="fin-sub">{[a.bankName, a.iban].filter(Boolean).join(" · ")}</span></td>
                                        <td>{ACCOUNT_KIND[a.kind]}<span className="fin-sub">{a.currency}</span></td>
                                        <td className="num"><Amount value={a.balance} currency={a.currency} /></td>
                                        <td className="num">{a.currency === "TRY" ? "—" : a.balanceTRY == null ? <span className="adm-badge warn">Kur yok</span> : tl0(a.balanceTRY)}</td>
                                        <td>{a.kind === "CREDIT_CARD" ? <>
                                            {a.creditLimit != null && <>Limit {money(a.creditLimit, a.currency, 0)}<span className="fin-sub">kullanılabilir {money(Math.max(0, a.creditLimit + a.balance), a.currency, 0)}</span></>}
                                            <span className="fin-sub">{a.statementDay ? `kesim ${a.statementDay}.` : ""} {a.dueDay ? `son ödeme ${a.dueDay}.` : ""}</span></> : ""}</td>
                                        <td className="num">{a.txCount}{a.ignored > 0 && <span className="fin-sub fin-neg" title="Hesabın açılış tarihinden önceki hareketler bakiyeye girmez">▲ {a.ignored} dışarıda</span>}</td>
                                        <td><div className="fin-row-actions">
                                            <Link className="adm-link" href={`/hareketler?hesap=${a.id}`}>Hareketler</Link>
                                            <Link className="adm-link" href={`/hesaplar?duzenle=${a.id}#form`}>Düzenle</Link>
                                        </div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className={`adm-card${edit ? " fin-edit" : ""}`} id="form">
                <div className="adm-card-head"><h2 className="adm-card-title">{edit ? `Hesabı düzenle: ${edit.name}` : "Yeni hesap"}</h2>{edit && <Link className="adm-link" href="/hesaplar">Vazgeç</Link>}</div>
                <div className="adm-card-body">
                    <AdminForm action={saveAccount} className="adm-form" key={edit?.id ?? "new"}>
                        <input type="hidden" name="ledgerId" value={ledger.id} />
                        {edit && <input type="hidden" name="id" value={edit.id} />}
                        <div className="adm-form-grid">
                            <label className="adm-field"><span className="adm-label">Hesap adı</span><input name="name" defaultValue={edit?.name} placeholder="Ör. Garanti Vadesiz TL" required /></label>
                            <label className="adm-field"><span className="adm-label">Tür</span><select name="kind" defaultValue={edit?.kind ?? "BANK"}>{Object.entries(ACCOUNT_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Para birimi</span><select name="currency" defaultValue={edit?.currency ?? "TRY"}>{["TRY", "USD", "EUR", "GBP"].map(c => <option key={c}>{c}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Banka</span><input name="bankName" defaultValue={edit?.bankName ?? ""} /></label>
                            <label className="adm-field"><span className="adm-label">IBAN</span><input name="iban" defaultValue={edit?.iban ?? ""} placeholder="TR00 0000 …" /></label>
                            <label className="adm-field"><span className="adm-label">Açılış bakiyesi</span><input name="openingBalance" inputMode="decimal" defaultValue={edit ? String(edit.openingBalance).replace(".", ",") : "0"} /><span className="adm-help">Kredi kartında mevcut borcu eksi yazın (−12.500).</span></label>
                            <label className="adm-field"><span className="adm-label">Açılış tarihi</span><input type="date" name="openingDate" defaultValue={ymd(edit?.openingDate ?? new Date())} /><span className="adm-help">Bu tarihten önceki hareketler bakiyeye girmez.</span></label>
                            <label className="adm-field"><span className="adm-label">Kart limiti</span><input name="creditLimit" inputMode="decimal" defaultValue={edit?.creditLimit ?? ""} /></label>
                            <label className="adm-field"><span className="adm-label">Hesap kesim günü</span><input name="statementDay" inputMode="numeric" defaultValue={edit?.statementDay ?? ""} placeholder="1–31" /></label>
                            <label className="adm-field"><span className="adm-label">Son ödeme günü</span><input name="dueDay" inputMode="numeric" defaultValue={edit?.dueDay ?? ""} placeholder="1–31" /></label>
                            <label className="adm-field full"><span className="adm-label">Not</span><input name="note" defaultValue={edit?.note ?? ""} /></label>
                        </div>
                        <div className="adm-form-foot">
                            {edit && <label className="adm-check"><input type="checkbox" name="isActive" defaultChecked={edit.isActive} />Aktif</label>}
                            <SubmitButton>{edit ? "Kaydet" : "Hesabı ekle"}</SubmitButton>
                            <span className="adm-help">Kart bilgileri yalnızca kredi kartı türünde kullanılır. Hesaplar arası para geçişi için Hareketler&apos;de “Virman” seçin.</span>
                        </div>
                    </AdminForm>
                    {edit && (
                        <AdminForm action={deleteAccount} className="adm-inline" >
                            <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={edit.id} />
                            <SubmitButton className="btn btn-sm adm-btn-danger" confirm="Hesap silinsin mi? Hareketi varsa silinmez, pasife alınır.">Hesabı sil / pasife al</SubmitButton>
                            <span className="adm-help">Açılış {fmtDay(edit.openingDate)} · {edit.txCount} hareket</span>
                        </AdminForm>
                    )}
                </div>
            </section>
        </div>
    );
}
