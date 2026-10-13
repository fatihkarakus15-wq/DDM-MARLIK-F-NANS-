"use client";
/** Yüz tanıma / parmak izi: telefonun kendi kilidiyle giriş (WebAuthn). Yüz verisi sunucuya gitmez. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";

async function post(url: string, body?: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error ?? "İşlem başarısız.");
    return json;
}

const cancelled = (e: unknown) => e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");

export function PasskeyLogin() {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");
    async function go() {
        setBusy(true); setMsg("");
        try {
            if (!browserSupportsWebAuthn()) throw new Error("Bu tarayıcı yüz/parmak izi girişini desteklemiyor.");
            const { options } = await post("/api/passkey/giris-secenek");
            const response = await startAuthentication({ optionsJSON: options });
            await post("/api/passkey/giris-dogrula", { response });
            location.assign("/");
        } catch (e) {
            setMsg(cancelled(e) ? "İptal edildi. Tekrar deneyin ya da şifreyle girin." : e instanceof Error ? e.message : "Giriş yapılamadı.");
            setBusy(false);
        }
    }
    return (
        <div>
            <button type="button" className="btn btn-dark pk-btn" onClick={go} disabled={busy}>{busy ? "Doğrulanıyor…" : "Yüzümle / parmak iziyle gir"}</button>
            {msg && <p className="adm-flash error" role="status">{msg}</p>}
        </div>
    );
}

/** Bu telefonu kaydet. `davet` verilirse davetli kullanıcı için kaydeder ve girişi açar. */
export function PasskeyRegister({ davet, label = "Bu telefonda yüz / parmak izi kaydet" }: { davet?: string; label?: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    async function go() {
        setBusy(true); setMsg(null);
        try {
            if (!browserSupportsWebAuthn()) throw new Error("Bu tarayıcı yüz/parmak izi girişini desteklemiyor.");
            const { options } = await post("/api/passkey/kayit-secenek", { davet });
            const response = await startRegistration({ optionsJSON: options });
            await post("/api/passkey/kayit-dogrula", { davet, response, ad: navigator.userAgent.includes("iPhone") ? "iPhone" : navigator.userAgent.includes("Android") ? "Android telefon" : "Bilgisayar" });
            if (davet) { location.assign("/"); return; }
            setMsg({ ok: true, text: "Kaydedildi. Bundan sonra giriş ekranında yüzünüzle girebilirsiniz." });
            router.refresh();
        } catch (e) {
            setMsg({ ok: false, text: cancelled(e) ? "İptal edildi. Telefonda ekran kilidi (yüz/parmak izi) kurulu olmalı." : e instanceof Error ? e.message : "Kaydedilemedi." });
        } finally { setBusy(false); }
    }
    return (
        <div>
            <button type="button" className="btn btn-dark pk-btn" onClick={go} disabled={busy}>{busy ? "Bekleniyor…" : label}</button>
            {msg && <p className={`adm-flash ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
        </div>
    );
}
