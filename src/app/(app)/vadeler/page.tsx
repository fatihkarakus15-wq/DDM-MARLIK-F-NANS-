import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { ensureFreshRates } from "@/lib/finance/rates";
import { formOptions } from "@/lib/finance/options";
import { generateRecurring } from "@/lib/finance/recurring";
import { upcomingTaxes } from "@/lib/finance/tax-calendar";
import { diffDays, fmtDay, fmtShort, parseDay, today, todayYmd, ymd } from "@/lib/finance/dates";
import { tl0 } from "@/lib/finance/money";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { Amount, DueBadge, Kpi } from "@/components/finance/ui";
import TxForm from "@/components/finance/TxForm";
import { settleAction } from "../actions";

export const dynamic = "force-dynamic";

const MAX_ROWS = 200;

/** Vadeler: tahsil edilecek alacaklar ve ödenecek borçlar, gecikenler önce. "Ödendi" hesaba işler. */
export default async function Vadeler({ searchParams }: { searchParams: Promise<{ tur?: string; yeni?: string; baslik?: string; tarih?: string; tip?: string }> }) {
    await requireFinancePage();
    const sp = await searchParams;
    const tur = sp.tur === "alacak" || sp.tur === "borc" ? sp.tur : "hepsi";
    const { ledger } = await activeLedger();
    await generateRecurring(ledger.id);
    const rates = await ensureFreshRates(600);
    const [rows, opts, recurringCount] = await Promise.all([
        prisma.finTransaction.findMany({
            where: { ledgerId: ledger.id, status: "PLANNED", type: tur === "alacak" ? "INCOME" : tur === "borc" ? "EXPENSE" : { in: ["INCOME", "EXPENSE"] } },
            orderBy: [{ date: "asc" }, { createdAt: "asc" }], take: MAX_ROWS + 1,
            include: { contact: { select: { name: true } }, project: { select: { name: true } }, cheque: { select: { status: true } }, recurring: { select: { title: true } } },
        }),
        formOptions(ledger.id, rates),
        prisma.finRecurring.count({ where: { ledgerId: ledger.id, isActive: true } }),
    ]);
    const now = today();
    const more = rows.length > MAX_ROWS;
    const list = rows.slice(0, MAX_ROWS);
    const sum = (f: (t: (typeof list)[number]) => boolean, type: "INCOME" | "EXPENSE") => list.filter(t => t.type === type && f(t)).reduce((s, t) => s + t.amountTRY, 0);
    const late = (t: (typeof list)[number]) => diffDays(t.date, now) > 0;
    const week = (t: (typeof list)[number]) => !late(t) && diffDays(now, t.date) <= 7;
    const groups: { title: string; tone: string; items: typeof list }[] = [
        { title: "Gecikmiş", tone: "bad", items: list.filter(late) },
        { title: "Bu hafta (7 gün)", tone: "warn", items: list.filter(week) },
        { title: "Bu ay (30 gün)", tone: "info", items: list.filter(t => !late(t) && !week(t) && diffDays(now, t.date) <= 30) },
        { title: "Daha sonra", tone: "muted", items: list.filter(t => diffDays(now, t.date) > 30) },
    ];
    const taxes = upcomingTaxes(now, 60);
    const prefillDate = parseDay(sp.tarih) ? sp.tarih! : undefined;
    const prefillType = sp.tip === "gelir" ? "INCOME" : "EXPENSE";

    return (
        <div>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">Vadeler</h1>
                    <p className="adm-sub">Tahsil edilecek alacaklar ve ödenecek borçlar. Ödeme ya da tahsilat gerçekleşince “Ödendi” ile hesaba işleyin; kısmi tutar da girebilirsiniz.</p>
                </div>
            </div>

            <div className="adm-kpis">
                <Kpi label="Gecikmiş tahsilat" value={tl0(sum(late, "INCOME"))} tone={sum(late, "INCOME") ? "warn" : undefined} note={`${list.filter(t => t.type === "INCOME" && late(t)).length} kalem`} />
                <Kpi label="Gecikmiş ödeme" value={tl0(sum(late, "EXPENSE"))} tone={sum(late, "EXPENSE") ? "neg" : undefined} note={`${list.filter(t => t.type === "EXPENSE" && late(t)).length} kalem`} />
                <Kpi label="7 gün: tahsilat" value={tl0(sum(week, "INCOME"))} />
                <Kpi label="7 gün: ödeme" value={tl0(sum(week, "EXPENSE"))} />
            </div>

            <div className="adm-filters">
                {[["hepsi", "Hepsi"], ["alacak", "Tahsil edilecekler"], ["borc", "Ödenecekler"]].map(([k, l]) => <Link key={k} href={`/vadeler${k === "hepsi" ? "" : `?tur=${k}`}`} className={`adm-chip${tur === k ? " active" : ""}`}>{l}</Link>)}
                <Link className="adm-link" style={{ marginLeft: "auto" }} href="/ayarlar#tekrarlayan">Tekrarlayan ödemeler ({recurringCount})</Link>
            </div>

            {list.length === 0 && <section className="adm-card"><p className="adm-empty">Vadeli kayıt yok. Aşağıdan ekleyin ya da tekrarlayan ödeme şablonu tanımlayın (kira, abonelik, maaş…).</p></section>}
            {groups.filter(g => g.items.length > 0).map(g => (
                <section key={g.title} className="adm-card">
                    <div className="adm-card-head"><h2 className="adm-card-title"><span className={`adm-badge ${g.tone}`} style={{ marginRight: 8 }}>{g.items.length}</span>{g.title}</h2>
                        <span className="adm-card-note">Alacak {tl0(g.items.filter(t => t.type === "INCOME").reduce((s, t) => s + t.amountTRY, 0))} · Borç {tl0(g.items.filter(t => t.type === "EXPENSE").reduce((s, t) => s + t.amountTRY, 0))}</span></div>
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Vade</th><th>Açıklama</th><th className="num">Tutar</th><th>İşlem</th></tr></thead>
                            <tbody>
                                {g.items.map(t => {
                                    const accounts = opts.accounts.filter(a => a.currency === t.currency);
                                    const viaCheque = t.cheque && ["OPEN", "DEPOSITED"].includes(t.cheque.status);
                                    return (
                                        <tr key={t.id} className={late(t) ? "late" : ""}>
                                            <td>{fmtDay(t.date)}<span className="fin-sub"><DueBadge days={diffDays(t.date, now)} /></span></td>
                                            <td className="wrap"><Link className="adm-link" href={`/hareketler/${t.id}`}>{t.title}</Link>
                                                <span className="fin-sub">{[t.type === "INCOME" ? "Alacak" : "Borç", t.contact?.name, t.project?.name, t.recurring && "tekrarlayan", viaCheque && "çek / senet bekliyor"].filter(Boolean).join(" · ")}</span></td>
                                            <td className="num"><Amount value={t.type === "INCOME" ? t.amount : -t.amount} currency={t.currency} sign />{t.currency !== "TRY" && <span className="fin-sub">≈ {tl0(t.amountTRY)}</span>}</td>
                                            <td>
                                                <details>
                                                    <summary className="adm-link" style={{ cursor: "pointer" }}>{t.type === "INCOME" ? "Tahsil edildi" : "Ödendi"}</summary>
                                                    {accounts.length === 0 ? <p className="fin-hint">{t.currency} hesabı yok.</p> : (
                                                        <AdminForm action={settleAction} className="adm-inline" >
                                                            <input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={t.id} />
                                                            <label className="adm-field"><span className="adm-label">Hesap</span><select name="accountId" defaultValue={t.accountId ?? accounts[0].id}>{accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
                                                            <label className="adm-field"><span className="adm-label">Gün</span><input type="date" name="date" defaultValue={todayYmd()} /></label>
                                                            <label className="adm-field"><span className="adm-label">Tutar</span><input name="amount" inputMode="decimal" defaultValue={String(t.amount).replace(".", ",")} /></label>
                                                            <SubmitButton pendingText="…">İşle</SubmitButton>
                                                        </AdminForm>
                                                    )}
                                                </details>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            ))}
            {more && <p className="fin-hint">İlk {MAX_ROWS} kayıt gösteriliyor; Hareketler sayfasından “Vadeli” süzgeciyle tamamına bakın.</p>}

            <details className="adm-fold" open={!!sp.yeni}>
                <summary>Yeni vadeli kayıt (alacak / borç)</summary>
                <div className="adm-card-body">
                    <TxForm
                        key={`${sp.baslik}-${sp.tarih}`} ledgerId={ledger.id} today={todayYmd()} accounts={opts.accounts} categories={opts.categories} projects={opts.projects} contacts={opts.contacts} rates={opts.rates}
                        initial={{ type: prefillType, status: "PLANNED", title: sp.baslik, date: prefillDate }}
                    />
                </div>
            </details>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Vergi ve SGK takvimi</h2><span className="adm-card-note">Hatırlatmadır; tutarı mali müşavirinizden öğrenip plana ekleyin. Tarihler hafta sonunda pazartesiye kayar, resmî tatiller hesaba katılmaz.</span></div>
                <div className="adm-table-wrap">
                    <table className="adm-table">
                        <thead><tr><th>Tarih</th><th>Yükümlülük</th><th /></tr></thead>
                        <tbody>
                            {taxes.map((t, i) => (
                                <tr key={i}>
                                    <td>{fmtShort(t.date)} <span className="muted">({diffDays(now, t.date)} gün)</span></td>
                                    <td className="wrap">{t.title}<span className="fin-sub">{t.note}</span></td>
                                    <td><Link className="adm-link" href={`/vadeler?yeni=1&tip=gider&baslik=${encodeURIComponent(t.title)}&tarih=${ymd(t.date)}`}>Plana ekle</Link></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
            <p className="fin-hint">Bugün {fmtDay(now)} · Gecikmiş vadeler nakit akışı tahmininde “bugün” sayılır.</p>
        </div>
    );
}

