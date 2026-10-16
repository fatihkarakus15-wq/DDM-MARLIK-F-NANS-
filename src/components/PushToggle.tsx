"use client";
/** Bu telefonda bildirimleri açar / kapatır (Web Push). iPhone'da uygulama ana ekrana eklenmiş olmalı. */
import { useEffect, useState } from "react";

const b64ToBytes = (s: string) => {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
};

type State = "loading" | "unsupported" | "denied" | "off" | "on";

export default function PushToggle() {
    const [state, setState] = useState<State>("loading");
    const [msg, setMsg] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        (async () => {
            if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
            if (Notification.permission === "denied") return setState("denied");
            try {
                const reg = await navigator.serviceWorker.getRegistration();
                const sub = await reg?.pushManager.getSubscription();
                setState(sub && Notification.permission === "granted" ? "on" : "off");
            } catch { setState("off"); }
        })();
    }, []);

    async function enable() {
        setBusy(true); setMsg("");
        try {
            const perm = await Notification.requestPermission();
            if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
            const reg = await navigator.serviceWorker.ready;
            const k = await (await fetch("/api/push/anahtar")).json();
            if (!k.success) throw new Error(k.error);
            const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(k.key) }));
            const res = await (await fetch("/api/push/abone", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) })).json();
            if (!res.success) throw new Error(res.error);
            setState("on"); setMsg("Bildirimler açıldı.");
        } catch (e) {
            setMsg(e instanceof Error && e.message ? e.message : "Açılamadı. Uygulamayı ana ekrana ekleyip tekrar deneyin.");
        } finally { setBusy(false); }
    }

    async function disable() {
        setBusy(true); setMsg("");
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            const sub = await reg?.pushManager.getSubscription();
            if (sub) { await fetch("/api/push/abone", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
            setState("off"); setMsg("Bildirimler kapatıldı.");
        } finally { setBusy(false); }
    }

    async function test() {
        setBusy(true); setMsg("");
        try {
            const res = await (await fetch("/api/push/test", { method: "POST" })).json();
            setMsg(res.success && res.sent > 0 ? "Deneme bildirimi gönderildi." : "Bildirim gönderilemedi; kapatıp yeniden açın.");
        } catch { setMsg("Bağlantı kurulamadı."); } finally { setBusy(false); }
    }

    return (
        <div className="push-box">
            {state === "loading" && <small>Bildirim durumu kontrol ediliyor…</small>}
            {state === "unsupported" && <small>Bu tarayıcı bildirimi desteklemiyor. iPhone&apos;da önce Paylaş › “Ana Ekrana Ekle” ile uygulamayı kurun, sonra oradan açın.</small>}
            {state === "denied" && <small>Bildirim izni kapalı. Telefon ayarlarından Ofis Finans için bildirimlere izin verin.</small>}
            {state === "off" && <><small>Keşif ve toplantılardan önce telefonunuza hatırlatma gelsin.</small><button type="button" className="btn btn-sm btn-gold" onClick={enable} disabled={busy}>Bildirimleri aç</button></>}
            {state === "on" && <><small>✓ Bu telefonda bildirimler açık.</small><span className="push-actions"><button type="button" className="btn btn-sm adm-btn-outline" onClick={test} disabled={busy}>Deneme gönder</button><button type="button" className="btn btn-sm adm-btn-outline" onClick={disable} disabled={busy}>Kapat</button></span></>}
            {msg && <small role="status">{msg}</small>}
        </div>
    );
}
