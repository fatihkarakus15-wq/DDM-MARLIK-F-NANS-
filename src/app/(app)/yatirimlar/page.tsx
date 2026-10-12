import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { SOURCE_LABEL, ensureFreshRates, toDTO } from "@/lib/finance/rates";
import { ASSET, ASSETS } from "@/lib/finance/labels";
import { addDays, fmtDay, fmtShort, today, todayYmd, ymd } from "@/lib/finance/dates";
import { money } from "@/lib/finance/money";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { Amount } from "@/components/finance/ui";
import { LineChart } from "@/components/finance/charts";
import { LivePortfolio, RateStrip, type PositionDTO } from "@/components/finance/LiveRates";
import { deleteInvestment, saveInvestment, saveManualRate, sellInvestment } from "../actions";

export const dynamic = "force-dynamic";

/** Yatırımlar: döviz ve altın pozisyonları, anlık değer, kâr / zarar, fiyat geçmişi. */
export default async function Yatirimlar({ searchParams }: { searchParams: Promise<{ varlik?: string; duzenle?: string }> }) {
    await requireFinancePage();
    const { varlik, duzenle } = await searchParams;
    const { ledger } = await activeLedger();
    const rates = await ensureFreshRates(20);
    const asset = varlik && ASSET[varlik] ? varlik : "USD";
    const [open, sold, history] = await Promise.all([
        prisma.finInvestment.findMany({ where: { ledgerId: ledger.id, status: "OPEN" }, orderBy: { boughtAt: "desc" } }),
        prisma.finInvestment.findMany({ where: { ledgerId: ledger.id, status: "SOLD" }, orderBy: { soldAt: "desc" }, take: 50 }),
        prisma.finRateDaily.findMany({ where: { code: asset, day: { gte: addDays(today(), -120) } }, orderBy: { day: "asc" } }),
    ]);
    const dto = Object.values(rates).map(toDTO);
    const edit = duzenle ? open.find(p => p.id === duzenle) : undefined;
    const positions: PositionDTO[] = open.map(p => ({
        id: p.id, asset: p.asset, name: ASSET[p.asset]?.name ?? p.asset, unit: ASSET[p.asset]?.unit ?? "", quantity: p.quantity, unitCost: p.unitCost,
        boughtAt: fmtDay(p.boughtAt), targetPrice: p.targetPrice, note: p.note,
    }));
    const actions = Object.fromEntries(open.map(p => [p.id, (
        <div key={p.id} className="fin-row-actions">
            <details>
                <summary className="adm-link" style={{ cursor: "pointer" }}>Sat</summary>
                <AdminForm action={sellInvestment} className="adm-inline">
                    <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={p.id} />
                    <label className="adm-field"><span className="adm-label">Satış günü</span><input type="date" name="soldAt" defaultValue={todayYmd()} /></label>
                    <label className="adm-field"><span className="adm-label">Birim fiyat (₺)</span><input name="soldPrice" inputMode="decimal" defaultValue={rates[p.asset] ? String(rates[p.asset].buy).replace(".", ",") : ""} required /></label>
                    <SubmitButton pendingText="…">Satıldı</SubmitButton>
                </AdminForm>
            </details>
            <Link className="adm-link" href={`/yatirimlar?duzenle=${p.id}#form`}>Düzenle</Link>
            <AdminForm action={deleteInvestment}>
                <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={p.id} />
                <SubmitButton className="adm-btn-link fin-neg" confirm="Pozisyon silinsin mi?" pendingText="…">Sil</SubmitButton>
            </AdminForm>
        </div>
    )]));
    const realized = sold.reduce((s, p) => s + (p.soldPrice! - p.unitCost) * p.quantity, 0);

    return (
        <div>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">Yatırımlar</h1>
                    <p className="adm-sub">Döviz ve altın pozisyonlarınızın anlık değeri. Fiyatlar sayfa açıkken 20 saniyede bir yenilenir; değerleme bayinin bizden alış fiyatıyladır.</p>
                </div>
            </div>

            <RateStrip codes={ASSETS.map(a => a.code)} initial={dto} />
            <LivePortfolio initial={dto} positions={positions} actions={actions} />

            <section className={`adm-card${edit ? " fin-edit" : ""}`} id="form">
                <div className="adm-card-head"><h2 className="adm-card-title">{edit ? "Pozisyonu düzenle" : "Alış ekle"}</h2>{edit && <Link className="adm-link" href="/yatirimlar">Vazgeç</Link>}</div>
                <div className="adm-card-body">
                    <AdminForm action={saveInvestment} className="adm-form" key={edit?.id ?? "new"}>
                        <input type="hidden" name="ledgerId" value={ledger.id} />
                        {edit && <input type="hidden" name="id" value={edit.id} />}
                        <div className="adm-form-grid">
                            <label className="adm-field"><span className="adm-label">Varlık</span><select name="asset" defaultValue={edit?.asset ?? "USD"}>{ASSETS.map(a => <option key={a.code} value={a.code}>{a.name} ({a.unit})</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">Miktar</span><input name="quantity" inputMode="decimal" defaultValue={edit ? String(edit.quantity).replace(".", ",") : ""} placeholder="Ör. 5000 ya da 12,5" required /></label>
                            <label className="adm-field"><span className="adm-label">Alış fiyatı (birim başına ₺)</span><input name="unitCost" inputMode="decimal" defaultValue={edit ? String(edit.unitCost).replace(".", ",") : ""} required /></label>
                            <label className="adm-field"><span className="adm-label">Alış tarihi</span><input type="date" name="boughtAt" defaultValue={edit ? ymd(edit.boughtAt) : todayYmd()} required /></label>
                            <label className="adm-field"><span className="adm-label">Hedef fiyat (₺, isteğe bağlı)</span><input name="targetPrice" inputMode="decimal" defaultValue={edit?.targetPrice ?? ""} /></label>
                            <label className="adm-field"><span className="adm-label">Not</span><input name="note" defaultValue={edit?.note ?? ""} /></label>
                        </div>
                        <div className="adm-form-foot"><SubmitButton>{edit ? "Kaydet" : "Pozisyonu ekle"}</SubmitButton><span className="adm-help">Bu kayıt portföy takibidir; hesap bakiyelerine dokunmaz. Para çıkışını Hareketler&apos;e ayrıca girin ya da dövizli hesap açın.</span></div>
                    </AdminForm>
                </div>
            </section>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Fiyat geçmişi: {ASSET[asset].name}</h2><span className="adm-card-note">Günlük alış fiyatı, son 120 gün (kayıt kurların çekildiği günlerden birikir)</span></div>
                <div className="adm-filters" style={{ padding: "12px 20px 0" }}>{ASSETS.map(a => <Link key={a.code} href={`/yatirimlar?varlik=${a.code}`} className={`adm-chip${asset === a.code ? " active" : ""}`}>{a.name.split(" (")[0]}</Link>)}</div>
                {history.length < 2 ? <p className="adm-empty">Henüz yeterli geçmiş yok; fiyatlar her gün kaydedilir, birkaç gün sonra grafik oluşur.</p> : <LineChart label={`${ASSET[asset].name} alış fiyatı`} name="Alış" unit="TRY" points={history.map(h => ({ label: fmtShort(h.day), value: h.buy }))} />}
            </section>

            {sold.length > 0 && (
                <section className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title">Satılan pozisyonlar</h2><span className="adm-card-note">Gerçekleşen kâr / zarar: <Amount value={realized} digits={0} sign /></span></div>
                    <table className="adm-table">
                        <thead><tr><th>Varlık</th><th className="num">Miktar</th><th className="num">Alış</th><th className="num">Satış</th><th className="num">Kâr / zarar</th></tr></thead>
                        <tbody>
                            {sold.map(p => (
                                <tr key={p.id}><td>{ASSET[p.asset]?.name ?? p.asset}<span className="fin-sub">{fmtDay(p.boughtAt)} → {p.soldAt ? fmtDay(p.soldAt) : ""}</span></td><td className="num">{p.quantity.toLocaleString("tr-TR")}</td><td className="num">{money(p.unitCost)}</td><td className="num">{money(p.soldPrice ?? 0)}</td><td className="num"><Amount value={(p.soldPrice! - p.unitCost) * p.quantity} digits={0} sign /></td></tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            <details className="adm-fold">
                <summary>Kur kaynağı yanıt vermiyorsa fiyatı elle girin</summary>
                <div className="adm-card-body">
                    <p className="adm-help" style={{ marginBottom: 10 }}>Kaynaklar: {Object.values(rates).length ? [...new Set(Object.values(rates).map(r => SOURCE_LABEL[r.source] ?? r.source))].join(", ") : "henüz veri yok"}. Elle girilen fiyat, kaynak çalışınca yenisiyle değişir. Ayrıntı: <Link className="adm-link" href="/ayarlar#kur">Ayarlar › Kur kaynağı</Link>.</p>
                    <AdminForm action={saveManualRate} className="adm-inline">
                        <label className="adm-field"><span className="adm-label">Varlık</span><select name="code">{ASSETS.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</select></label>
                        <label className="adm-field"><span className="adm-label">Alış (₺)</span><input name="buy" inputMode="decimal" required /></label>
                        <label className="adm-field"><span className="adm-label">Satış (₺)</span><input name="sell" inputMode="decimal" /></label>
                        <SubmitButton>Kaydet</SubmitButton>
                    </AdminForm>
                </div>
            </details>
        </div>
    );
}
