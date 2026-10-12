"use client";
/**
 * Finans grafikleri (bağımlılıksız SVG). Veri-görselleştirme ilkeleri: ince çubuk (≤ 24 px, uçları 4 px yuvarlak,
 * tabanda düz), 2 px çizgi, ≥ 8 px işaretçi + 2 px yüzey halkası, hairline düz ızgara, iki seri için lejant,
 * imleçle / klavyeyle açılan ayrıntı kutusu ve her grafiğin altında tablo görünümü. Renkler finans.css'ten.
 */
import { useState } from "react";
import { money } from "@/lib/finance/money";

const DEFAULT_W = 720;
const ML = 56, MR = 14, MT = 14, MB = 30;

/** 1,2 Mn / 25 B / 480 */
export function compact(n: number) {
    const a = Math.abs(n), sign = n < 0 ? "−" : "";
    if (a >= 1e6) return `${sign}${(a / 1e6).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} Mn`;
    if (a >= 1e3) return `${sign}${(a / 1e3).toLocaleString("tr-TR", { maximumFractionDigits: a >= 1e4 ? 0 : 1 })} B`;
    return `${sign}${a.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
}

/** Temiz eksen: [lo, hi] aralığını yuvarlak adımlara böler */
function niceScale(min: number, max: number, count = 4) {
    if (min === max) { max = min + 1; }
    const raw = (max - min) / count;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= raw) ?? 10 * pow;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return { lo, hi, ticks };
}

/** Üst köşeleri 4 px yuvarlak, tabanı düz sütun */
function topRounded(x: number, y: number, w: number, h: number, r = 4) {
    if (h <= 0) return "";
    const rr = Math.min(r, w / 2, h);
    return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

function Tip({ cx, w, children }: { cx: number; w: number; children: React.ReactNode }) {
    const left = Math.min(Math.max((cx / w) * 100, 14), 86);
    return <div className="fin-tip" style={{ left: `${left}%` }} role="status">{children}</div>;
}

export interface ColumnDatum { label: string; a: number; b: number }

/** İki seri yan yana sütun: gelir (a) ve gider (b) */
export function ColumnChart({ data, aName = "Gelir", bName = "Gider", height = 260, width = DEFAULT_W, label }: { data: ColumnDatum[]; aName?: string; bName?: string; height?: number; width?: number; label: string }) {
    const [hover, setHover] = useState<number | null>(null);
    if (data.length === 0) return <p className="adm-empty">Bu dönemde veri yok.</p>;
    const W = width, H = height, iw = W - ML - MR, ih = H - MT - MB;
    const max = Math.max(...data.flatMap(d => [d.a, d.b]), 1);
    const sc = niceScale(0, max);
    const y = (v: number) => MT + ih - (v / sc.hi) * ih;
    const slot = iw / data.length;
    const bw = Math.min(24, slot * 0.34);
    const every = Math.ceil(data.length / 12);
    const d = hover != null ? data[hover] : null;
    return (
        <figure className="fin-chart" aria-label={label}>
            <div className="fin-legend">
                <span><i className="fin-key s1" />{aName}</span><span><i className="fin-key s2" />{bName}</span>
            </div>
            <div className="fin-plot">
                <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerLeave={() => setHover(null)}>
                    {sc.ticks.map(t => (
                        <g key={t}>
                            <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} className={t === 0 ? "fin-axis" : "fin-grid"} />
                            <text x={ML - 8} y={y(t) + 4} textAnchor="end" className="fin-tick">{compact(t)}</text>
                        </g>
                    ))}
                    {data.map((p, i) => {
                        const cx = ML + slot * (i + 0.5);
                        return (
                            <g key={p.label}>
                                {hover === i && <rect x={ML + slot * i} y={MT} width={slot} height={ih} className="fin-wash" />}
                                <path d={topRounded(cx - bw - 1, y(p.a), bw, y(0) - y(p.a))} className="fin-bar s1" />
                                <path d={topRounded(cx + 1, y(p.b), bw, y(0) - y(p.b))} className="fin-bar s2" />
                                {i % every === 0 && <text x={cx} y={H - 9} textAnchor="middle" className="fin-tick">{p.label}</text>}
                                <rect
                                    x={ML + slot * i} y={MT} width={slot} height={ih} className="fin-hit" tabIndex={0}
                                    aria-label={`${p.label}: ${aName} ${money(p.a, "TRY", 0)}, ${bName} ${money(p.b, "TRY", 0)}`}
                                    onPointerMove={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                                />
                            </g>
                        );
                    })}
                </svg>
                {d && hover != null && (
                    <Tip cx={ML + slot * (hover + 0.5)} w={W}>
                        <strong>{d.label}</strong>
                        <span><i className="fin-key s1" />{aName}<b>{money(d.a, "TRY", 0)}</b></span>
                        <span><i className="fin-key s2" />{bName}<b>{money(d.b, "TRY", 0)}</b></span>
                        <span>Fark<b>{money(d.a - d.b, "TRY", 0)}</b></span>
                    </Tip>
                )}
            </div>
            <details className="fin-table-view">
                <summary>Tablo görünümü</summary>
                <table className="adm-table"><thead><tr><th>Dönem</th><th className="num">{aName}</th><th className="num">{bName}</th><th className="num">Fark</th></tr></thead>
                    <tbody>{data.map(p => <tr key={p.label}><td>{p.label}</td><td className="num">{money(p.a, "TRY", 0)}</td><td className="num">{money(p.b, "TRY", 0)}</td><td className="num">{money(p.a - p.b, "TRY", 0)}</td></tr>)}</tbody></table>
            </details>
        </figure>
    );
}

export interface LinePoint { label: string; value: number }

/** Tek seri çizgi (+ %10 alan): bakiye seyri. `low` verilirse en düşük nokta işaretlenir. */
export function LineChart({ points, name, height = 260, width = DEFAULT_W, label, low = false, unit = "TRY" }: { points: LinePoint[]; name: string; height?: number; width?: number; label: string; low?: boolean; unit?: string }) {
    const [hover, setHover] = useState<number | null>(null);
    if (points.length < 2) return <p className="adm-empty">Grafik için yeterli veri yok.</p>;
    const W = width, H = height, iw = W - ML - MR, ih = H - MT - MB;
    const values = points.map(p => p.value);
    const sc = niceScale(Math.min(0, ...values), Math.max(0, ...values));
    const x = (i: number) => ML + (i / (points.length - 1)) * iw;
    const y = (v: number) => MT + ih - ((v - sc.lo) / (sc.hi - sc.lo)) * ih;
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
    const lowIdx = low ? values.indexOf(Math.min(...values)) : -1;
    const last = points.length - 1;
    const ticksX = Array.from(new Set([0, Math.round(last * 0.25), Math.round(last * 0.5), Math.round(last * 0.75), last]));
    const showIdx = hover ?? null;
    const cur = showIdx != null ? points[showIdx] : null;
    const onMove = (e: React.PointerEvent<SVGRectElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        setHover(Math.min(last, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * last))));
    };
    return (
        <figure className="fin-chart" aria-label={label}>
            <div className="fin-plot">
                <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerLeave={() => setHover(null)}>
                    {sc.ticks.map(t => (
                        <g key={t}>
                            <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} className={t === 0 ? "fin-axis" : "fin-grid"} />
                            <text x={ML - 8} y={y(t) + 4} textAnchor="end" className="fin-tick">{compact(t)}</text>
                        </g>
                    ))}
                    <path d={area} className="fin-area s1" />
                    <path d={line} className="fin-line s1" />
                    {ticksX.map(i => <text key={i} x={x(i)} y={H - 9} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} className="fin-tick">{points[i].label}</text>)}
                    {lowIdx >= 0 && values[lowIdx] < Math.max(...values) && (
                        <g>
                            <circle cx={x(lowIdx)} cy={y(values[lowIdx])} r={5} className="fin-dot crit" />
                            <text x={Math.min(Math.max(x(lowIdx), ML + 60), W - MR - 60)} y={Math.min(y(values[lowIdx]) + 20, H - MB - 4)} textAnchor="middle" className="fin-note">▲ En düşük {compact(values[lowIdx])} ₺</text>
                        </g>
                    )}
                    {showIdx != null && <line x1={x(showIdx)} x2={x(showIdx)} y1={MT} y2={MT + ih} className="fin-cross" />}
                    <circle cx={x(showIdx ?? last)} cy={y(points[showIdx ?? last].value)} r={4.5} className="fin-dot s1" />
                    <rect x={ML} y={MT} width={iw} height={ih} className="fin-hit" tabIndex={0} aria-label={`${label}; ok tuşlarıyla gezin`}
                        onPointerMove={onMove} onFocus={() => setHover(last)} onBlur={() => setHover(null)}
                        onKeyDown={e => { if (e.key === "ArrowLeft") setHover(h => Math.max(0, (h ?? last) - 1)); if (e.key === "ArrowRight") setHover(h => Math.min(last, (h ?? last) + 1)); }} />
                </svg>
                {cur && showIdx != null && <Tip cx={x(showIdx)} w={W}><strong>{cur.label}</strong><span><i className="fin-key s1" />{name}<b>{money(cur.value, unit, 0)}</b></span></Tip>}
            </div>
            <details className="fin-table-view">
                <summary>Tablo görünümü</summary>
                <table className="adm-table"><thead><tr><th>Tarih</th><th className="num">{name}</th></tr></thead>
                    <tbody>{points.filter((_, i) => points.length <= 40 || i % Math.ceil(points.length / 40) === 0 || i === last).map(p => <tr key={p.label}><td>{p.label}</td><td className="num">{money(p.value, unit, 0)}</td></tr>)}</tbody></table>
            </details>
        </figure>
    );
}
