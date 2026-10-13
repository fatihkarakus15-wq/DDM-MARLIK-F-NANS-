"use client";
/**
 * Tutar alanlarını yazarken Türk biçimine çevirir: 1.250.000,50 (nokta binlik, virgül ondalık).
 * Sayfadaki tutar alanlarına (ad listesi aşağıda) tek yerden bağlanır; sunucu bu biçimi okur.
 */
import { useEffect } from "react";

const MONEY = /^(amount|amountTL|contractAmount|openingBalance|withholdingAmount|vatAmount|unitCost|toAmount|targetPrice|soldPrice|buy|sell|creditLimit)$/;
const FOUR = /^(unitCost|targetPrice|soldPrice|buy|sell)$/; // döviz / altın fiyatları 4 ondalık
const isMoney = (el: EventTarget | null): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === "text" && el.inputMode === "decimal" && MONEY.test(el.name);

/** "1250000,5" / "1250000.5" → "1.250.000,5" */
export function formatMoney(raw: string, maxDec = 2): string {
    let s = raw.replace(/[^\d,.\-]/g, "");
    const neg = s.startsWith("-");
    s = s.replace(/-/g, "");
    // Hangi işaret ondalık: virgül varsa virgül; yoksa tek nokta + en çok maxDec hane ise nokta
    let int = s, dec: string | null = null;
    const comma = s.indexOf(",");
    if (comma >= 0) { int = s.slice(0, comma); dec = s.slice(comma + 1).replace(/[.,]/g, ""); }
    else {
        const dot = s.lastIndexOf(".");
        if (dot >= 0 && s.indexOf(".") === dot && s.length - dot - 1 <= maxDec && s.length - dot - 1 !== 3) { int = s.slice(0, dot); dec = s.slice(dot + 1); }
    }
    int = int.replace(/\./g, "").replace(/^0+(?=\d)/, "");
    const head = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${neg ? "-" : ""}${head}${dec !== null ? "," + dec.slice(0, maxDec) : ""}`;
}

function apply(el: HTMLInputElement) {
    const maxDec = FOUR.test(el.name) ? 4 : 2;
    const before = el.value;
    const next = formatMoney(before, maxDec);
    if (next === before) return;
    const caret = el.selectionStart ?? before.length;
    const sig = before.slice(0, caret).replace(/[^\d,\-]/g, "").length; // imleçten önceki anlamlı karakter sayısı
    // React'in kontrollü alanları da görsün diye yerel setter + input olayı
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    let pos = 0, seen = 0;
    while (pos < next.length && seen < sig) { if (/[\d,\-]/.test(next[pos])) seen++; pos++; }
    try { el.setSelectionRange(pos, pos); } catch { /* alan seçimi desteklemiyor */ }
}

export default function MoneyFormat() {
    useEffect(() => {
        const onInput = (e: Event) => { if (isMoney(e.target)) apply(e.target); };
        document.addEventListener("input", onInput);
        // Hazır değerli alanlar (ör. iş bedeli 850000) görününce bir kez biçimlenir; sonrası kullanıcıya bırakılır
        let timer: ReturnType<typeof setTimeout> | undefined;
        const scan = () => document.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]').forEach(el => {
            if (el.dataset.mf || !isMoney(el)) return;
            el.dataset.mf = "1";
            if (el.value && document.activeElement !== el) apply(el);
        });
        const obs = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(scan, 30); });
        obs.observe(document.body, { childList: true, subtree: true });
        scan();
        return () => { document.removeEventListener("input", onInput); obs.disconnect(); clearTimeout(timer); };
    }, []);
    return null;
}
