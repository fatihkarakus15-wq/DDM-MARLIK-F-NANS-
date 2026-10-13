"use client";
/**
 * Şantiye modu: koyu zeminde büyük tutar, kalem düğmeleri ve rakam tuşları.
 * Tutarı tuşla, kalemi seç, Kaydet. Not, hesap, tarih ve fiş fotoğrafı isteğe bağlıdır (katlanır).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Opt { id: string; label: string }
interface Fav extends Opt { spent?: number }
interface Props { ledgerId: string; projectId: string; today: string; accounts: (Opt & { currency: string })[]; categories: Opt[]; favorites: Fav[]; initialCategoryId?: string }

const KEY = "ofis-finans:son-hesap";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"];
const tl0 = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;

/** "1250,5" → "1.250,5" */
function show(raw: string) {
    if (!raw) return "0";
    const [i, d] = raw.split(",");
    const head = (i || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return d === undefined ? head : `${head},${d}`;
}

export default function ProjectQuickAdd({ ledgerId, projectId, today, accounts, categories, favorites, initialCategoryId }: Props) {
    const router = useRouter();
    const [raw, setRaw] = useState("");
    const [categoryId, setCategoryId] = useState(initialCategoryId ?? "");
    const [note, setNote] = useState("");
    const [date, setDate] = useState(today);
    const [file, setFile] = useState<File | null>(null);
    const [rebill, setRebill] = useState(false);
    const [rebillAmt, setRebillAmt] = useState("");
    const [accountId, setAccountId] = useState(() => {
        try { const saved = localStorage.getItem(KEY); if (saved && accounts.some(a => a.id === saved)) return saved; } catch { /* depolama kapalı */ }
        return accounts[0]?.id ?? "";
    });
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    function press(k: string) {
        setMsg(null);
        if (k === "⌫") return setRaw(r => r.slice(0, -1));
        if (k === ",") return setRaw(r => (r.includes(",") ? r : (r || "0") + ","));
        setRaw(r => {
            if (r.includes(",") && r.split(",")[1].length >= 2) return r;
            if (r.replace(",", "").length >= 10) return r;
            return r === "0" ? k : r + k;
        });
    }

    const label = (id: string) => favorites.find(f => f.id === id)?.label ?? categories.find(c => c.id === id)?.label.split(" › ").pop() ?? "";

    async function save() {
        const amount = Number(raw.replace(",", "."));
        if (!amount || amount <= 0) { setMsg({ ok: false, text: "Önce tutarı girin." }); return; }
        const fd = new FormData();
        fd.set("ledgerId", ledgerId); fd.set("projectId", projectId); fd.set("type", "EXPENSE"); fd.set("status", accountId ? "DONE" : "PLANNED");
        fd.set("accountId", accountId); fd.set("categoryId", categoryId); fd.set("amount", raw); fd.set("date", date);
        fd.set("title", note.trim() || label(categoryId) || "Harcama");
        if (file) fd.set("files", file);
        if (rebill) fd.set("rebillAmount", rebillAmt.trim() || raw);
        setBusy(true); setMsg(null);
        try {
            const res = await fetch("/api/hareket", { method: "POST", body: fd });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) { setMsg({ ok: false, text: json?.error ?? "Kaydedilemedi." }); return; }
            try { localStorage.setItem(KEY, accountId); } catch { /* depolama kapalı */ }
            setMsg({ ok: true, text: `${show(raw)} ₺ kaydedildi${categoryId ? ` · ${label(categoryId)}` : ""}` });
            setRaw(""); setNote(""); setFile(null); setRebill(false); setRebillAmt(""); setCategoryId(initialCategoryId ?? "");
            router.refresh();
        } catch {
            setMsg({ ok: false, text: "Bağlantı kurulamadı. Tekrar deneyin." });
        } finally {
            setBusy(false);
        }
    }

    const other = categoryId && !favorites.some(f => f.id === categoryId);

    return (
        <div className="sm">
            <div className="sm-disp" aria-live="polite">
                <small>{categoryId ? label(categoryId) : "Kalem seçilmedi"}</small>
                <b className={raw ? "" : "empty"}>{show(raw)} <i>₺</i></b>
            </div>

            <div className="sm-tiles" role="group" aria-label="Kalem">
                {favorites.map(f => (
                    <button key={f.id} type="button" className={`sm-tile${categoryId === f.id ? " on" : ""}`} aria-pressed={categoryId === f.id} onClick={() => setCategoryId(categoryId === f.id ? "" : f.id)}>
                        <b>{f.label}</b>{f.spent ? <span>{tl0(f.spent)}</span> : null}
                    </button>
                ))}
                <label className={`sm-tile sm-other${other ? " on" : ""}`}>
                    <b>{other ? label(categoryId) : "Diğer…"}</b>
                    <select value={other ? categoryId : ""} onChange={e => e.target.value && setCategoryId(e.target.value)} aria-label="Diğer kalem">
                        <option value="">Diğer kalemler</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                </label>
            </div>

            <div className="sm-keys" role="group" aria-label="Rakamlar">
                {KEYS.map(k => <button key={k} type="button" onClick={() => press(k)} aria-label={k === "⌫" ? "Sil" : k}>{k}</button>)}
            </div>

            <label className="sm-rebill"><input type="checkbox" checked={rebill} onChange={e => setRebill(e.target.checked)} /> Müşteriden ekstra alınacak</label>
            {rebill && (
                <label className="sm-rebill-amt">Müşteriden alınacak (₺)
                    <input name="rebillAmount" inputMode="decimal" value={rebillAmt} onChange={e => setRebillAmt(e.target.value)} placeholder={show(raw) === "0" ? "0" : `${show(raw)} (harcamayla aynı)`} autoComplete="off" />
                </label>
            )}

            <details className="sm-more">
                <summary>Not, hesap, tarih, fiş{note || file ? " ·" : ""}{note ? " not" : ""}{file ? " fiş" : ""}</summary>
                <div className="sm-more-body">
                    <label>Not (ne alındı?)<input value={note} onChange={e => setNote(e.target.value)} placeholder="Ör. 20 torba çimento" maxLength={200} autoComplete="off" /></label>
                    <label>Hesap<select value={accountId} onChange={e => setAccountId(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}<option value="">Henüz ödenmedi (vadeli)</option></select></label>
                    <label>Tarih<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
                    <label>Fiş / fatura<input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
                </div>
            </details>

            <button type="button" className="sm-go" onClick={save} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
            {msg && <p className={`sm-msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.ok ? "✓ " : ""}{msg.text}</p>}
        </div>
    );
}
