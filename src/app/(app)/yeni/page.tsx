import Link from "next/link";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { ensureFreshRates } from "@/lib/finance/rates";
import { formOptions } from "@/lib/finance/options";
import { todayYmd } from "@/lib/finance/dates";
import TxForm from "@/components/finance/TxForm";

export const dynamic = "force-dynamic";

/** Yeni hareket: varsayılan "hızlı gider" (tutar, açıklama, kalem, proje, hesap, fiş fotoğrafı); ayrıntılı form gelir, vade ve virman için. */
export default async function Yeni({ searchParams }: { searchParams: Promise<{ ayrintili?: string; tip?: string }> }) {
    const me = await requireFinancePage();
    const sp = await searchParams;
    const { ledger } = await activeLedger();
    const rates = await ensureFreshRates(600);
    const opts = await formOptions(ledger.id, rates);
    const detailed = sp.ayrintili === "1";

    return (
        <div>
            <div className="adm-head">
                <div>
                    <h1 className="adm-title">{detailed ? "Yeni hareket" : "Hızlı gider"}</h1>
                    <p className="adm-sub">{detailed ? "Gelir, gider, virman ya da vadeli kayıt." : "Şantiyede fişi çekin, tutarı yazın, kaydedin."}</p>
                </div>
                <Link className="btn btn-sm adm-btn-outline" href={detailed ? "/yeni" : "/yeni?ayrintili=1"}>{detailed ? "Hızlı gider" : "Gelir, vade, virman…"}</Link>
            </div>
            {opts.accounts.length === 0 && (
                <div className="fin-warn">Henüz hesap yok. Gerçekleşen hareket için önce <Link className="adm-link" href="/hesaplar">bir hesap ekleyin</Link> (banka, kasa, kart). Hesapsız yalnızca vadeli kayıt girilebilir.</div>
            )}
            <section className="adm-card"><div className="adm-card-body">
                <TxForm
                    key={detailed ? "full" : "quick"} mode={detailed ? "full" : "quick"} ledgerId={ledger.id} today={todayYmd()}
                    accounts={opts.accounts} categories={opts.categories} projects={opts.projects} contacts={opts.contacts} people={opts.people} meId={me.id} rates={opts.rates}
                    initial={{ type: sp.tip === "gelir" ? "INCOME" : "EXPENSE", status: "DONE" }}
                />
            </div></section>
        </div>
    );
}
