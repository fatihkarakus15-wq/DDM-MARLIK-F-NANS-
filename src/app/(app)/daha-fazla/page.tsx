import Link from "next/link";
import { requireFinancePage } from "@/lib/finance/access";
import Icon from "@/components/Icon";
import { MORE_LINKS } from "@/lib/nav";
import InstallHint from "@/components/InstallHint";
import { logout } from "@/app/giris/actions";

export const dynamic = "force-dynamic";

const NOTES: Record<string, string> = {
    "/ozet": "Nakit, alacak, borç, bu ay, 30 gün tahmini",
    "/hesaplar": "Banka, kasa, kredi kartı, POS bakiyeleri",
    "/cariler": "Müşteri, tedarikçi, taşeron bakiyeleri ve ekstre",
    "/cek-senet": "Aldığınız ve verdiğiniz çek / senetler",
    "/nakit-akisi": "Gün gün kasa tahmini ve senaryolar",
    "/yatirimlar": "Döviz ve altın portföyü, anlık değer",
    "/raporlar": "Gelir-gider, kalem, proje, yaşlandırma, KDV",
    "/ice-aktar": "Banka ekstresi (CSV) yükle",
    "/ayarlar": "Kalemler, tekrarlayan ödemeler, kurlar, hesabım",
};

export default async function DahaFazla() {
    const user = await requireFinancePage();
    return (
        <div>
            <div className="adm-head"><div><h1 className="adm-title">Daha fazla</h1><p className="adm-sub">{user.name ?? user.email}</p></div></div>
            <InstallHint />
            <ul className="more-list">
                {MORE_LINKS.map(l => (
                    <li key={l.href}>
                        <Link href={l.href} className="more-item">
                            <span className="more-icon"><Icon name={l.icon} /></span>
                            <span><strong>{l.label}</strong><small>{NOTES[l.href]}</small></span>
                        </Link>
                    </li>
                ))}
            </ul>
            <form action={logout} style={{ marginTop: 24 }}><button type="submit" className="btn btn-sm adm-btn-outline">Çıkış yap</button></form>
        </div>
    );
}
