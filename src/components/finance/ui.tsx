/** Finans sayfalarının ortak küçük parçaları */
import Link from "next/link";
import { money } from "@/lib/finance/money";

/** Tutar: pozitif yeşil, negatif kırmızı (işaret her zaman yazılır; renk tek başına anlam taşımaz) */
export function Amount({ value, currency = "TRY", digits = 2, sign = false, className = "" }: { value: number; currency?: string; digits?: number; sign?: boolean; className?: string }) {
    const tone = value > 0 ? "fin-pos" : value < 0 ? "fin-neg" : "";
    const text = money(Math.abs(value), currency, digits);
    return <span className={`fin-amount ${tone} ${className}`}>{value < 0 ? "−" : sign && value > 0 ? "+" : ""}{text}</span>;
}

export function Kpi({ label, value, note, accent = false, tone, href }: { label: string; value: React.ReactNode; note?: React.ReactNode; accent?: boolean; tone?: "pos" | "neg" | "warn"; href?: string }) {
    const body = (
        <>
            <div className="adm-kpi-label">{label}</div>
            <div className={`adm-kpi-value${tone ? ` ${tone === "warn" ? "fin-tone-warn" : `fin-${tone}`}` : ""}`}>{value}</div>
            {note && <div className="adm-kpi-note">{note}</div>}
        </>
    );
    return href
        ? <Link href={href} className={`adm-kpi${accent ? " accent" : ""}`}>{body}</Link>
        : <div className={`adm-kpi${accent ? " accent" : ""}`}>{body}</div>;
}

/** Gecikme günü rozeti: "3 gün gecikti" / "bugün" / "5 gün sonra" */
export function DueBadge({ days }: { days: number }) {
    if (days > 0) return <span className="adm-badge bad">▲ {days} gün gecikti</span>;
    if (days === 0) return <span className="adm-badge warn">Bugün</span>;
    return <span className="adm-badge muted">{-days} gün sonra</span>;
}
