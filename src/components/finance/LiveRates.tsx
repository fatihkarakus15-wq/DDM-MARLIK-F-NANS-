"use client";
/**
 * Canlı kurlar ve portföy değeri. /api/kur her 20 sn'de sorulur (sekme görünürken);
 * sunucu veriyi kaynaktan yeniler, kaynak çalışmazsa son bilinen değeri döndürür ve burada "güncel değil" görünür.
 */
import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/finance/money";

export interface RateDTO { code: string; name: string; buy: number; sell: number; source: string; fetchedAt: string; stale: boolean }
const SOURCE: Record<string, string> = { haremaltin: "Harem Altın", tcmb: "TCMB", manual: "Elle girildi" };
const POLL_MS = 20_000;

function useRates(initial: RateDTO[]) {
    const [rates, setRates] = useState<Record<string, RateDTO>>(() => Object.fromEntries(initial.map(r => [r.code, r])));
    const [prev, setPrev] = useState<Record<string, number>>({});
    const [online, setOnline] = useState(true);
    const ref = useRef(rates);
    useEffect(() => { ref.current = rates; }, [rates]);
    useEffect(() => {
        let stop = false;
        async function tick() {
            if (document.visibilityState === "hidden") return;
            try {
                const res = await fetch("/api/kur", { cache: "no-store" });
                const json = await res.json();
                if (stop || !json?.success) throw new Error("bad");
                const next = Object.fromEntries((json.rates as RateDTO[]).map(r => [r.code, r]));
                setPrev(Object.fromEntries(Object.values(ref.current).map(r => [r.code, r.buy])));
                setRates(next);
                setOnline(true);
            } catch { if (!stop) setOnline(false); }
        }
        const id = setInterval(tick, POLL_MS);
        const onVisible = () => { if (document.visibilityState === "visible") tick(); };
        document.addEventListener("visibilitychange", onVisible);
        tick();
        return () => { stop = true; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
    }, []);
    return { rates, prev, online };
}

const clock = (iso: string) => new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

export function RateStrip({ initial, codes }: { initial: RateDTO[]; codes: string[] }) {
    const { rates, prev, online } = useRates(initial);
    const shown = codes.map(c => rates[c]).filter(Boolean);
    if (shown.length === 0) {
        return <div className="fin-warn">Henüz kur bilgisi yok. Kaynak yanıt vermiyorsa Ayarlar sayfasındaki Kur kaynağı bölümünden denenir ya da fiyat elle girilir.</div>;
    }
    return (
        <div className="fin-rates" aria-label="Güncel kurlar">
            {shown.map(r => {
                const stale = r.stale;
                const before = prev[r.code];
                const dir = before && r.buy !== before ? (r.buy > before ? "▲" : "▼") : "";
                return (
                    <div key={r.code} className={`fin-rate${stale ? " stale" : ""}`}>
                        <div className="fin-rate-code"><i className={`fin-live${online && !stale ? "" : " off"}`} />{r.name}</div>
                        <div className="fin-rate-val">{r.buy.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺ {dir && <small aria-label={dir === "▲" ? "yükseldi" : "düştü"}>{dir}</small>}</div>
                        <div className="fin-rate-sub">Satış {r.sell.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {SOURCE[r.source] ?? r.source} · {clock(r.fetchedAt)}{stale ? " · güncel değil" : ""}</div>
                    </div>
                );
            })}
        </div>
    );
}

export interface PositionDTO {
    id: string; asset: string; name: string; unit: string; quantity: number; unitCost: number; boughtAt: string; targetPrice: number | null; note: string | null;
}

export function LivePortfolio({ initial, positions, actions }: { initial: RateDTO[]; positions: PositionDTO[]; actions: Record<string, React.ReactNode> }) {
    const { rates, online } = useRates(initial);
    const rows = positions.map(p => {
        const price = rates[p.asset]?.buy ?? null;
        const cost = p.quantity * p.unitCost;
        const value = price == null ? null : p.quantity * price;
        return { ...p, price, cost, value, pnl: value == null ? null : value - cost, hit: !!p.targetPrice && price != null && price >= p.targetPrice };
    });
    const cost = rows.reduce((s, r) => s + r.cost, 0);
    const value = rows.reduce((s, r) => s + (r.value ?? 0), 0);
    const pnl = value - cost;
    const tone = (n: number) => (n > 0 ? "fin-pos" : n < 0 ? "fin-neg" : "");
    const signed = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${money(Math.abs(n), "TRY", 0)}`;
    return (
        <>
            <div className="adm-kpis">
                <div className="adm-kpi accent"><div className="adm-kpi-label">Portföy değeri (alış fiyatıyla)</div><div className="adm-kpi-value">{money(value, "TRY", 0)}</div><div className="adm-kpi-note"><i className={`fin-live${online ? "" : " off"}`} />{online ? "Canlı güncelleniyor" : "Bağlantı yok, son değer"}</div></div>
                <div className="adm-kpi"><div className="adm-kpi-label">Toplam maliyet</div><div className="adm-kpi-value">{money(cost, "TRY", 0)}</div><div className="adm-kpi-note">{rows.length} açık pozisyon</div></div>
                <div className="adm-kpi"><div className="adm-kpi-label">Kâr / zarar</div><div className={`adm-kpi-value ${tone(pnl)}`}>{signed(pnl)}</div><div className="adm-kpi-note">{cost ? `%${((pnl / cost) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` : "—"}</div></div>
            </div>
            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Açık pozisyonlar</h2><span className="adm-card-note">Değerleme bayinin bizden alış fiyatıyla; bozdurma masrafı ve vergi dahil değil.</span></div>
                {rows.length === 0 ? <p className="adm-empty">Henüz pozisyon yok. Aşağıdan alışınızı ekleyin.</p> : (
                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead><tr><th>Varlık</th><th className="num">Miktar</th><th className="num">Alış fiyatı</th><th className="num">Maliyet</th><th className="num">Güncel fiyat</th><th className="num">Değer</th><th className="num">Kâr / zarar</th><th /></tr></thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.id}>
                                        <td>{r.name}<span className="fin-sub">{r.boughtAt}{r.note ? ` · ${r.note}` : ""}{r.targetPrice ? ` · hedef ${money(r.targetPrice)}` : ""}{r.hit && <b className="fin-pos"> · ✓ hedefe ulaştı</b>}</span></td>
                                        <td className="num">{r.quantity.toLocaleString("tr-TR")} {r.unit}</td>
                                        <td className="num">{money(r.unitCost)}</td>
                                        <td className="num">{money(r.cost, "TRY", 0)}</td>
                                        <td className="num">{r.price == null ? <span className="adm-badge warn">Kur yok</span> : money(r.price)}</td>
                                        <td className="num">{r.value == null ? "—" : money(r.value, "TRY", 0)}</td>
                                        <td className={`num ${r.pnl == null ? "" : tone(r.pnl)}`}>{r.pnl == null ? "—" : <>{signed(r.pnl)}<span className="fin-sub">%{((r.pnl / r.cost) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</span></>}</td>
                                        <td>{actions[r.id]}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot><tr><td>Toplam</td><td /><td /><td className="num">{money(cost, "TRY", 0)}</td><td /><td className="num">{money(value, "TRY", 0)}</td><td className={`num ${tone(pnl)}`}>{signed(pnl)}</td><td /></tr></tfoot>
                        </table>
                    </div>
                )}
            </section>
        </>
    );
}
