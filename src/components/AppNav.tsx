"use client";
/** Alt sekme çubuğu (telefon) / yan menü (geniş ekran). Beş ana sekme; gerisi "Daha fazla" sayfasında. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import { ITEMS, type Item } from "@/lib/nav";

export default function AppNav() {
    const pathname = usePathname();
    const matches = (i: Item) => !!i.match?.some(m => pathname === m || pathname.startsWith(`${m}/`));
    const active = (i: Item) => (i.href === "/" ? pathname === "/" || matches(i) : pathname === i.href || pathname.startsWith(`${i.href}/`) || matches(i));
    return (
        <nav className="app-nav" aria-label="Ana menü">
            {ITEMS.map(i => (
                <Link key={i.href} href={i.href} className={`app-nav-item ${i.slot}${i.icon === "ekle" ? " primary" : ""}${active(i) ? " active" : ""}`} aria-current={active(i) ? "page" : undefined}>
                    <Icon name={i.icon} size={i.icon === "ekle" ? 26 : 22} />
                    <span>{i.label}</span>
                </Link>
            ))}
        </nav>
    );
}
