"use client";
/**
 * Projeye hızlı harcama: tutar + "ne alındı" + kalem + (isteğe bağlı) fiş fotoğrafı. Tek dokunuşla kaydeder.
 * Telefonda şantiyeden kullanılır: tutar alanı sayısal klavye açar, son kullanılan hesap hatırlanır.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Opt { id: string; label: string }
interface Props { ledgerId: string; projectId: string; today: string; accounts: (Opt & { currency: string })[]; categories: Opt[]; favorites: Opt[] }

const KEY = "ofis-finans:son-hesap";

export default function ProjectQuickAdd({ ledgerId, projectId, today, accounts, categories, favorites }: Props) {
    const router = useRouter();
    const [categoryId, setCategoryId] = useState("");
    const [accountId, setAccountId] = useState(() => {
        try { const saved = localStorage.getItem(KEY); if (saved && accounts.some(a => a.id === saved)) return saved; } catch { /* depolama kapalı */ }
        return accounts[0]?.id ?? "";
    });
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    async function submit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        fd.set("ledgerId", ledgerId); fd.set("projectId", projectId); fd.set("type", "EXPENSE"); fd.set("status", accountId ? "DONE" : "PLANNED");
        fd.set("accountId", accountId); fd.set("categoryId", categoryId);
        setBusy(true); setMsg(null);
        try {
            const res = await fetch("/api/hareket", { method: "POST", body: fd });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) { setMsg({ ok: false, text: json?.error ?? "Kaydedilemedi." }); return; }
            try { localStorage.setItem(KEY, accountId); } catch { /* depolama kapalı */ }
            const amount = String(fd.get("amount"));
            form.reset(); setCategoryId("");
            setMsg({ ok: true, text: `${amount} ₺ kaydedildi.` });
            router.refresh();
        } catch {
            setMsg({ ok: false, text: "Bağlantı kurulamadı. Tekrar deneyin." });
        } finally {
            setBusy(false);
        }
    }

    return (
        <form className="quick" onSubmit={submit} noValidate>
            <div className="quick-main">
                <label className="adm-field quick-amount"><span className="adm-label">Tutar (₺)</span>
                    <input name="amount" inputMode="decimal" placeholder="0" autoComplete="off" required /></label>
                <label className="adm-field quick-title"><span className="adm-label">Ne alındı / ne ödendi</span>
                    <input name="title" placeholder="Ör. çimento, usta yemeği, nakliye" maxLength={200} autoComplete="off" required /></label>
            </div>
            {favorites.length > 0 && (
                <div className="quick-chips" role="group" aria-label="Kalem">
                    {favorites.map(c => (
                        <button key={c.id} type="button" className={`adm-chip${categoryId === c.id ? " active" : ""}`} aria-pressed={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? "" : c.id)}>{c.label}</button>
                    ))}
                </div>
            )}
            <div className="quick-row">
                <label className="adm-field"><span className="adm-label">Diğer kalem</span>
                    <select value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">— kalemsiz —</option>{categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
                <label className="adm-field"><span className="adm-label">Hesap</span>
                    <select value={accountId} onChange={e => setAccountId(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}<option value="">Henüz ödenmedi (vadeli)</option></select></label>
                <label className="adm-field"><span className="adm-label">Tarih</span><input type="date" name="date" defaultValue={today} required /></label>
            </div>
            <label className="adm-field"><span className="adm-label">Fiş / fatura fotoğrafı (isteğe bağlı)</span><input type="file" name="files" accept="image/*,application/pdf" /></label>
            <div className="adm-form-foot">
                <button type="submit" className="btn btn-dark quick-save" disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
                {msg && <span className={`adm-flash ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</span>}
            </div>
        </form>
    );
}
