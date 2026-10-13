"use client";
/**
 * Hareket formu (gelir / gider / virman, gerçekleşen / vadeli). Dosya (fiş, fatura) aynı istekte gider:
 * /api/hareket (Server Action 1 MB sınırı yüzünden API). `mode="quick"`: şantiyede telefondan
 * hızlı gider (tutar, açıklama, kalem, proje, hesap, fiş fotoğrafı).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/finance/money";

interface Opt { id: string; label: string }
export interface TxInitial {
    id?: string; type?: "INCOME" | "EXPENSE" | "TRANSFER"; status?: "DONE" | "PLANNED"; date?: string; docDate?: string; docNo?: string; title?: string; note?: string;
    amount?: number; currency?: string; fxRate?: number; vatRate?: number | null; vatAmount?: number; withholdingAmount?: number;
    accountId?: string | null; toAccountId?: string | null; toAmount?: number | null; categoryId?: string | null; projectId?: string | null; contactId?: string | null; rebillAmount?: number | null; spenderId?: string | null;
}
interface Props {
    ledgerId: string; today: string;
    accounts: (Opt & { currency: string })[];
    categories: (Opt & { kind: "INCOME" | "EXPENSE" })[];
    projects: Opt[]; contacts: Opt[]; people?: Opt[]; meId?: string;
    rates: Record<string, number>;
    initial?: TxInitial; mode?: "full" | "quick";
    onDone?: () => void;
}

const toNumber = (s: string) => {
    const n = Number(s.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
};
const fmtInput = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

export default function TxForm({ ledgerId, today, accounts, categories, projects, contacts, people = [], meId, rates, initial = {}, mode = "full", onDone }: Props) {
    const router = useRouter();
    const quick = mode === "quick";
    const editing = !!initial.id;
    const [type, setType] = useState<"INCOME" | "EXPENSE" | "TRANSFER">(initial.type ?? "EXPENSE");
    const [status, setStatus] = useState<"DONE" | "PLANNED">(initial.status ?? "DONE");
    const [accountId, setAccountId] = useState(initial.accountId ?? (quick || !editing ? accounts[0]?.id ?? "" : ""));
    const [toAccountId, setToAccountId] = useState(initial.toAccountId ?? "");
    const [currency, setCurrency] = useState(initial.currency ?? "TRY");
    const [amount, setAmount] = useState(fmtInput(initial.amount));
    const [vatRate, setVatRate] = useState(initial.vatRate != null ? String(initial.vatRate) : "");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const account = accounts.find(a => a.id === accountId);
    const toAccount = accounts.find(a => a.id === toAccountId);
    const eff = account?.currency ?? currency;
    const transfer = type === "TRANSFER";
    const planned = status === "PLANNED" && !transfer;
    const crossCurrency = transfer && account && toAccount && account.currency !== toAccount.currency;
    const gross = toNumber(amount);
    const vat = vatRate !== "" && gross > 0 ? Math.round((gross - gross / (1 + Number(vatRate) / 100)) * 100) / 100 : 0;
    const cats = categories.filter(c => c.kind === (type === "INCOME" ? "INCOME" : "EXPENSE"));

    async function submit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        fd.set("ledgerId", ledgerId);
        if (initial.id) fd.set("id", initial.id);
        fd.set("type", type); fd.set("status", transfer ? "DONE" : status);
        setBusy(true); setMsg(null);
        try {
            const res = await fetch("/api/hareket", { method: "POST", body: fd });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) { setMsg({ ok: false, text: json?.error ?? "Kaydedilemedi." }); return; }
            setMsg({ ok: true, text: editing ? "Hareket güncellendi." : "Hareket kaydedildi." });
            if (!editing) { form.reset(); setAmount(""); setVatRate(""); }
            router.refresh();
            onDone?.();
        } catch {
            setMsg({ ok: false, text: "Bağlantı kurulamadı. Tekrar deneyin." });
        } finally {
            setBusy(false);
        }
    }

    return (
        <form className="fin-tx" onSubmit={submit} noValidate>
            {!quick && (
                <div className="fin-tx-row">
                    <div className={`fin-seg ${type === "INCOME" ? "income" : type === "EXPENSE" ? "expense" : ""}`} role="radiogroup" aria-label="Hareket türü">
                        {([["INCOME", "Gelir"], ["EXPENSE", "Gider"], ...(accounts.length > 1 ? [["TRANSFER", "Virman"]] : [])] as [typeof type, string][]).map(([v, l]) => (
                            <label key={v}><input type="radio" name="_type" value={v} checked={type === v} onChange={() => setType(v)} />{l}</label>
                        ))}
                    </div>
                    {!transfer && (
                        <div className="fin-seg" role="radiogroup" aria-label="Durum">
                            <label><input type="radio" name="_status" value="DONE" checked={status === "DONE"} onChange={() => setStatus("DONE")} />Gerçekleşti</label>
                            <label><input type="radio" name="_status" value="PLANNED" checked={status === "PLANNED"} onChange={() => setStatus("PLANNED")} />Vadeli (ödenecek / tahsil edilecek)</label>
                        </div>
                    )}
                </div>
            )}

            <div className="adm-form-grid">
                <label className="adm-field"><span className="adm-label">{planned ? "Vade tarihi" : "Tarih"}</span><input type="date" name="date" defaultValue={initial.date ?? today} required /></label>
                <label className="adm-field"><span className="adm-label">Tutar{transfer ? "" : " (KDV dahil)"} ({eff})</span>
                    <input name="amount" inputMode="decimal" className="fin-tx-amount" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" required autoComplete="off" /></label>
                <label className="adm-field full"><span className="adm-label">Açıklama</span><input name="title" defaultValue={initial.title} placeholder={quick ? "Ör. Boya, öğle yemeği, yapı market" : "Ör. Boya malzemesi, Kasım kirası, hakediş 2"} maxLength={200} required /></label>

                <label className="adm-field"><span className="adm-label">{transfer ? "Çıkış hesabı" : planned ? "Hesap (isteğe bağlı)" : "Hesap"}</span>
                    <select name="accountId" value={accountId} onChange={e => setAccountId(e.target.value)} required={!planned}>
                        {planned && <option value="">— belirtilmedi —</option>}
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.label} ({a.currency})</option>)}
                    </select></label>
                {transfer && (
                    <label className="adm-field"><span className="adm-label">Giriş hesabı</span>
                        <select name="toAccountId" value={toAccountId} onChange={e => setToAccountId(e.target.value)} required>
                            <option value="">— seçin —</option>
                            {accounts.filter(a => a.id !== accountId).map(a => <option key={a.id} value={a.id}>{a.label} ({a.currency})</option>)}
                        </select></label>
                )}
                {crossCurrency && <label className="adm-field"><span className="adm-label">Giriş tutarı ({toAccount!.currency})</span><input name="toAmount" inputMode="decimal" defaultValue={fmtInput(initial.toAmount)} required /></label>}
                {!account && !transfer && (
                    <label className="adm-field"><span className="adm-label">Para birimi</span>
                        <select name="currency" value={currency} onChange={e => setCurrency(e.target.value)}>{["TRY", "USD", "EUR", "GBP"].map(c => <option key={c}>{c}</option>)}</select></label>
                )}
                {eff !== "TRY" && (
                    <label className="adm-field" key={eff}><span className="adm-label">Kur (1 {eff} = ? ₺)</span>
                        <input name="fxRate" inputMode="decimal" defaultValue={fmtInput(initial.currency === eff ? initial.fxRate : rates[eff])} required /></label>
                )}

                {!transfer && (
                    <>
                        <label className="adm-field"><span className="adm-label">{type === "INCOME" ? "Gelir kalemi" : "Gider kalemi"}</span>
                            <select name="categoryId" defaultValue={initial.categoryId ?? ""} key={type}><option value="">— kalemsiz —</option>{cats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
                        <label className="adm-field"><span className="adm-label">Proje</span>
                            <select name="projectId" defaultValue={initial.projectId ?? ""}><option value="">— projesiz —</option>{projects.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
                        {type === "EXPENSE" && people.length > 0 && (
                            <label className="adm-field"><span className="adm-label">Harcamayı yapan</span>
                                <select name="spenderId" defaultValue={initial.spenderId ?? meId ?? people[0].id}>{people.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
                        )}
                        {type === "EXPENSE" && (
                            <label className="adm-field"><span className="adm-label">Müşteriden ekstra alınacak (₺, projeli giderde)</span>
                                <input name="rebillAmount" inputMode="decimal" defaultValue={initial.rebillAmount ? String(initial.rebillAmount).replace(".", ",") : ""} placeholder="Yoksa boş bırakın" autoComplete="off" /></label>
                        )}
                        {!quick && (
                            <label className="adm-field"><span className="adm-label">{type === "INCOME" ? "Müşteri / cari" : "Tedarikçi / cari"}</span>
                                <select name="contactId" defaultValue={initial.contactId ?? ""}><option value="">— cari yok —</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
                        )}
                    </>
                )}
            </div>

            {!transfer && (
                <details className="adm-fold" open={!quick && (editing && (!!initial.vatRate || !!initial.docNo || !!initial.note))}>
                    <summary>{quick ? "KDV, belge ve not" : "KDV, belge no, stopaj ve not"}</summary>
                    <div className="adm-card-body adm-form">
                        <div className="adm-form-grid">
                            <label className="adm-field"><span className="adm-label">KDV oranı</span>
                                <select name="vatRate" value={vatRate} onChange={e => setVatRate(e.target.value)}><option value="">— KDV yok / bilinmiyor —</option>{[0, 1, 10, 20].map(r => <option key={r} value={r}>%{r}</option>)}</select></label>
                            <label className="adm-field"><span className="adm-label">KDV tutarı (otomatik, değiştirebilirsiniz)</span>
                                <input name="vatAmount" inputMode="decimal" key={`${vat}-${vatRate}`} defaultValue={initial.vatAmount && !vatRate ? fmtInput(initial.vatAmount) : vat ? fmtInput(vat) : ""} placeholder="0,00" /></label>
                            <label className="adm-field"><span className="adm-label">Belge / fatura tarihi</span><input type="date" name="docDate" defaultValue={initial.docDate ?? ""} /></label>
                            <label className="adm-field"><span className="adm-label">Belge / fatura no</span><input name="docNo" defaultValue={initial.docNo} maxLength={60} /></label>
                            <label className="adm-field"><span className="adm-label">Stopaj (bilgi)</span><input name="withholdingAmount" inputMode="decimal" defaultValue={initial.withholdingAmount ? fmtInput(initial.withholdingAmount) : ""} placeholder="0,00" /></label>
                            <label className="adm-field full"><span className="adm-label">Not</span><input name="note" defaultValue={initial.note} maxLength={500} /></label>
                        </div>
                        {vat > 0 && gross > 0 && <p className="fin-hint">KDV hariç tutar: {money(gross - vat, eff)} · KDV: {money(vat, eff)} (raporlar varsayılan olarak KDV hariç çalışır)</p>}
                    </div>
                </details>
            )}

            <label className="adm-field"><span className="adm-label">{quick ? "Fiş / fatura fotoğrafı" : "Fiş, fatura, dekont (PDF veya fotoğraf, her biri ≤ 5 MB)"}</span>
                <input type="file" name="files" accept="image/*,application/pdf" multiple={!quick} /></label>

            <div className="adm-form-foot">
                <button type="submit" className="btn btn-dark btn-sm" disabled={busy}>{busy ? "Kaydediliyor…" : editing ? "Kaydet" : planned ? "Vadeli kaydı ekle" : "Hareketi ekle"}</button>
                {msg && <span className={`adm-flash ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</span>}
            </div>
        </form>
    );
}
