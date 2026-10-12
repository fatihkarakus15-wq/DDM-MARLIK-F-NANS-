"use client";
import { useEffect } from "react";

/** Service worker'ı yalnızca üretimde kaydeder (uygulama olarak kurulabilirlik ve çevrimdışı bilgi sayfası) */
export default function RegisterSW() {
    useEffect(() => {
        if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    }, []);
    return null;
}
