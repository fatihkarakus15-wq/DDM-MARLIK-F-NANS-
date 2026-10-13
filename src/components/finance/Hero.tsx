"use client";
/** Ana ekran üst bölümü: selam, toplam nakit (gizlenebilir), bu ay gelir/gider ve hızlı işlemler */
import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

interface Props { name: string; ledger: string; total: string; monthIn: string; monthOut: string }
const KEY = "ofis-finans:bakiye-gizli";

export default function Hero({ name, ledger, total, monthIn, monthOut }: Props) {
    const [hidden, setHidden] = useState(false);
    useEffect(() => { try { setHidden(localStorage.getItem(KEY) === "1"); } catch { /* depolama kapalı */ } }, []);
    function toggle() { setHidden(h => { try { localStorage.setItem(KEY, h ? "0" : "1"); } catch { /* */ } return !h; }); }
    const mask = (v: string) => (hidden ? "••••" : v);
    return (
        <section className="hero">
            <div className="hero-hi">
                <span className="hero-av" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
                <div><b>Merhaba, {name}</b><small>{ledger}</small></div>
            </div>
            <div className="hero-bal">
                <small>Toplam nakit</small>
                <div className="hero-amt">{mask(total)}
                    <button type="button" className="hero-eye" onClick={toggle} aria-label={hidden ? "Tutarları göster" : "Tutarları gizle"} aria-pressed={hidden}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{hidden && <path d="M3 3l18 18" />}
                        </svg>
                    </button>
                </div>
                <div className="hero-flow"><span className="in">Bu ay gelir <b>{mask(monthIn)}</b></span><span className="out">Bu ay gider <b>{mask(monthOut)}</b></span></div>
            </div>
            <div className="hero-actions">
                <a href="#ekle" className="hero-act main"><i><Icon name="ekle" size={24} /></i>Harcama</a>
                <Link href="/hareketler" className="hero-act"><i><Icon name="hareketler" size={22} /></i>Hareketler</Link>
                <Link href="/vadeler" className="hero-act"><i><Icon name="vadeler" size={22} /></i>Vadeler</Link>
                <Link href="/ozet" className="hero-act"><i><Icon name="raporlar" size={22} /></i>Özet</Link>
            </div>
        </section>
    );
}
