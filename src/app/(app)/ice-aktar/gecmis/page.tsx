import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { LEGACY_IMPORTS } from "@/lib/finance/legacy-imports";
import { tl0 } from "@/lib/finance/money";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { importLegacy } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Geçmiş işler" };

/** Excel defterlerinden hazırlanmış geçmiş işler: tek dokunuşla proje, tahsilat ve harcamalarıyla eklenir */
export default async function Gecmis() {
    await requireFinancePage();
    const { ledger } = await activeLedger();
    const existing = await prisma.finProject.findMany({ where: { ledgerId: ledger.id }, select: { name: true } });
    const has = (name: string) => existing.some(p => p.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"));
    return (
        <div>
            <Link href="/ice-aktar" className="adm-back">← İçe aktar</Link>
            <div className="adm-head"><div><h1 className="adm-title">Geçmiş işler</h1><p className="adm-sub">Excel defterlerinizden hazırlanan işler. Eklenince projede harcamalar, tahsilatlar ve kim ne harcadı görünür. Hesap bakiyeleriniz değişmez.</p></div></div>
            {LEGACY_IMPORTS.map(p => {
                const spent = p.expenses.reduce((a, e) => a + e.amount, 0), collected = p.collections.reduce((a, c) => a + c.amount, 0);
                return (
                    <section className="adm-card" key={p.key}>
                        <div className="adm-card-head"><h2 className="adm-card-title">{p.name}</h2><span className={`adm-badge ${p.status === "DONE" ? "ok" : "info"}`}>{p.status === "DONE" ? "Teslim edildi" : "Aktif"}</span></div>
                        <div className="pay-sum">
                            <div><small>İş bedeli + ilaveler</small><b>{tl0(p.contractAmount + p.extras.reduce((a, e) => a + e.amount, 0))}</b></div>
                            <div><small>Tahsil edilen</small><b className="fin-pos">{tl0(collected)}</b></div>
                            <div><small>Harcama ({p.expenses.length} kalem)</small><b>{tl0(spent)}</b></div>
                            <div><small>Kâr</small><b>{tl0(p.contractAmount + p.extras.reduce((a, e) => a + e.amount, 0) - spent)}</b></div>
                        </div>
                        <div className="adm-card-body">
                            {has(p.name) ? <p className="adm-help">Bu iş zaten ekli. <Link className="adm-link" href="/?durum=teslim">Teslim edilenlere git</Link></p> : (
                                <AdminForm action={importLegacy} className="adm-form">
                                    <input type="hidden" name="key" value={p.key} />
                                    <div className="adm-form-foot"><SubmitButton confirm={`“${p.name}” projesi eklensin mi?`} pendingText="Ekleniyor…">{p.status === "DONE" ? "Teslim edilenlere ekle" : "Aktif projelere ekle"}</SubmitButton><span className="adm-help">Bir kez eklenir; aynı iş tekrar eklenmez.</span></div>
                                </AdminForm>
                            )}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
