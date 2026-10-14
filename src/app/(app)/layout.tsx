import LedgerSwitch from "@/components/finance/LedgerSwitch";
import ThemeToggle from "@/components/ThemeToggle";
import AppNav from "@/components/AppNav";
import { requireFinancePage } from "@/lib/finance/access";
import { personName } from "@/lib/finance/options";
import { activeLedger } from "@/lib/finance/ledger";

/** Uygulama kabuğu: üst çubuk (defter), içerik, alt sekme çubuğu. Giriş yoksa /giris'e, kurulum eksikse /kurulum'a gider. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const user = await requireFinancePage();
    const { ledger, ledgers } = await activeLedger();
    return (
        <div className="app">
            <header className="app-top">
                <div className="app-who"><strong className="app-name">Ofis Finans</strong><span className="app-user">{personName(user)}</span></div>
                <div className="app-top-right">{ledgers.length > 1 ? <LedgerSwitch ledgers={ledgers} current={ledger.slug} /> : <span className="app-ledger">{ledger.name}</span>}<ThemeToggle /></div>
            </header>
            <AppNav />
            <main className="app-main">{children}</main>
        </div>
    );
}
