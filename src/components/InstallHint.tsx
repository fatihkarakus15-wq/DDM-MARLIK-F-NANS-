"use client";
/** "Ana ekrana ekle" yönlendirmesi: Android'de yükleme düğmesi, iPhone'da Safari adımları. Uygulama olarak açıksa görünmez. */
import { useEffect, useState } from "react";

interface InstallEvent extends Event { prompt: () => Promise<void> }

export default function InstallHint() {
    const [event, setEvent] = useState<InstallEvent | null>(null);
    const [ios, setIos] = useState(false);
    const [standalone, setStandalone] = useState(true);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => {
            setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
            setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
            try { setHidden(localStorage.getItem("install-hint") === "gizli"); } catch { /* depolama kapalı */ }
        }, 0);
        const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallEvent); };
        window.addEventListener("beforeinstallprompt", onPrompt);
        return () => { clearTimeout(t); window.removeEventListener("beforeinstallprompt", onPrompt); };
    }, []);

    if (standalone || hidden) return null;
    const hide = () => { setHidden(true); try { localStorage.setItem("install-hint", "gizli"); } catch { /* depolama kapalı */ } };
    return (
        <section className="install-hint" aria-label="Uygulamayı yükle">
            <strong>Telefona uygulama olarak ekleyin</strong>
            {ios ? (
                <p>Safari&apos;de alttaki <b>Paylaş</b> düğmesine dokunun, ardından <b>Ana Ekrana Ekle</b>&apos;yi seçin. İkon ana ekranda belirir, tam ekran açılır.</p>
            ) : event ? (
                <p>Tek dokunuşla ana ekrana kurulur. <button type="button" className="btn btn-sm btn-dark" onClick={() => event.prompt()}>Uygulamayı yükle</button></p>
            ) : (
                <p>Tarayıcı menüsünden (⋮) <b>Ana ekrana ekle</b> ya da <b>Uygulamayı yükle</b>&apos;yi seçin.</p>
            )}
            <button type="button" className="adm-btn-link" onClick={hide}>Bir daha gösterme</button>
        </section>
    );
}
