/**
 * Yatay çubuk listesi (kalem / proje / cari dağılımı). Tek seri = tek renk; çubuk ucunda tutar, yanında pay.
 * Tablo görünümü zaten listenin kendisidir. `href` verilirse satır bağlantı olur.
 */
import Link from "next/link";
import { tl0 } from "@/lib/finance/money";

export interface ShareItem { label: string; amount: number; share?: number; sub?: string; href?: string }

export default function ShareBars({ items, tone = "s1", empty = "Veri yok." }: { items: ShareItem[]; tone?: "s1" | "s2" | "s3"; empty?: string }) {
    if (items.length === 0) return <p className="adm-empty">{empty}</p>;
    const max = Math.max(...items.map(i => i.amount), 1);
    return (
        <ul className="fin-share">
            {items.map(i => {
                const row = (
                    <>
                        <span className="fin-share-label">{i.label}{i.sub && <small>{i.sub}</small>}</span>
                        <span className="fin-share-track"><span className={`fin-share-fill ${tone}`} style={{ width: `${Math.max(2, (i.amount / max) * 100)}%` }} /></span>
                        <span className="fin-share-val">{tl0(i.amount)}{i.share != null && <small>%{i.share.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</small>}</span>
                    </>
                );
                return <li key={i.label}>{i.href ? <Link href={i.href} className="fin-share-row">{row}</Link> : <div className="fin-share-row">{row}</div>}</li>;
            })}
        </ul>
    );
}
