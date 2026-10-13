"use client";
/** Koyu / açık tema anahtarı (ay / güneş). Seçim bu cihazda hatırlanır. */
import { useEffect, useState } from "react";

export default function ThemeToggle() {
    const [theme, setTheme] = useState<"dark" | "light">("dark");
    useEffect(() => { setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"); }, []);
    function pick(t: "dark" | "light") {
        setTheme(t);
        document.documentElement.dataset.theme = t;
        try { localStorage.setItem("ofis-finans:tema", t); } catch { /* depolama kapalı */ }
    }
    return (
        <div className="theme-toggle" role="group" aria-label="Tema">
            <button type="button" className={theme === "dark" ? "on" : ""} aria-pressed={theme === "dark"} aria-label="Koyu tema" onClick={() => pick("dark")}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
            </button>
            <button type="button" className={theme === "light" ? "on" : ""} aria-pressed={theme === "light"} aria-label="Açık tema" onClick={() => pick("light")}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></svg>
            </button>
        </div>
    );
}
