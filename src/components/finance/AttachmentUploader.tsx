"use client";
/** Mevcut harekete fiş / fatura ekler (/api/ek) */
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AttachmentUploader({ transactionId }: { transactionId: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    async function submit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        fd.set("transactionId", transactionId);
        setBusy(true); setMsg(null);
        try {
            const res = await fetch("/api/ek", { method: "POST", body: fd });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) { setMsg({ ok: false, text: json?.error ?? "Yüklenemedi." }); return; }
            form.reset();
            setMsg({ ok: true, text: `${json.count} dosya eklendi.` });
            router.refresh();
        } catch {
            setMsg({ ok: false, text: "Bağlantı kurulamadı." });
        } finally {
            setBusy(false);
        }
    }
    return (
        <form onSubmit={submit} className="adm-inline">
            <label className="adm-field"><span className="adm-label">Dosya ekle (PDF veya fotoğraf, ≤ 5 MB)</span><input type="file" name="files" accept="image/*,application/pdf" multiple required /></label>
            <button type="submit" className="btn btn-sm btn-dark" disabled={busy}>{busy ? "Yükleniyor…" : "Yükle"}</button>
            {msg && <span className={`adm-flash ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</span>}
        </form>
    );
}
