import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { ensureFreshRates } from "@/lib/finance/rates";
import { formOptions } from "@/lib/finance/options";
import StatementImport from "@/components/finance/StatementImport";

export const dynamic = "force-dynamic";

/** İçe aktar: banka ekstresi (CSV) */
export default async function IceAktar() {
    await requireFinancePage();
    const { ledger } = await activeLedger();
    const rates = await ensureFreshRates(3600);
    const [opts, rules] = await Promise.all([formOptions(ledger.id, rates), prisma.finRule.findMany({ where: { ledgerId: ledger.id }, select: { match: true, categoryId: true, projectId: true, contactId: true, priority: true } })]);

    return (
        <div>
            <Link href="/hareketler" className="adm-back">← Hareketler</Link>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">İçe aktar</h1>
                    <p className="adm-sub">Banka ekstrenizi CSV olarak yükleyin; satırlar hareket olur, tanımlı kurallarla kalemleri atanır. Bankaların kendi internet bankacılığında “Excel / CSV olarak indir” seçeneği vardır.</p>
                </div>
            </div>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Geçmiş işler (Excel defterlerinden)</h2><Link className="adm-link" href="/ice-aktar/gecmis">Aç</Link></div>
            </section>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Banka ekstresi (CSV)</h2><Link className="adm-link" href="/ayarlar#kurallar">Ekstre kuralları</Link></div>
                <div className="adm-card-body">
                    {opts.accounts.length === 0
                        ? <p className="adm-empty">Önce <Link className="adm-link" href="/hesaplar">bir hesap ekleyin</Link>.</p>
                        : <StatementImport ledgerId={ledger.id} accounts={opts.accounts} rules={rules} categories={Object.fromEntries(opts.categories.map(c => [c.id, c.label]))} />}
                </div>
            </section>

        </div>
    );
}
