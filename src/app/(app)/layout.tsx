import LedgerSwitch from "@/components/finance/LedgerSwitch";
import AppNav from "@/components/AppNav";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";

/** Uygulama kabuğu: üst çubuk (defter), içerik, alt sekme çubuğu. Giriş yoksa /giris'e, kurulum eksikse /kurulum'a gider. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
    await requireFinancePage();
    const { ledger, ledgers } = await activeLedger();
    return (
        <div className="app">
            <header className="app-top">
                <strong className="app-name">Ofis Finans</strong>
                {ledgers.length > 1 ? <LedgerSwitch ledgers={ledgers} current={ledger.slug} /> : <span className="app-ledger">{ledger.name}</span>}
            </header>
            <AppNav />
            <main className="app-main">{children}</main>
        </div>
    );
}
