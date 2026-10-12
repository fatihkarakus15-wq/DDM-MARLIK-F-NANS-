"use client";
/**
 * Banka ekstresi (CSV) içe aktarma: dosya tarayıcıda okunur, sütunlar eşlenir, kurallarla kalem ataması önizlenir;
 * onaylanınca satırlar sunucuya JSON olarak gider (Server Action). Aynı dosya tekrar yüklenirse çift kayıt oluşmaz.
 */
import { useMemo, useState } from "react";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { decodeBytes, detectDelimiter, extractLines, guessColumns, matchRule, parseCsv, type ColumnGuess } from "@/lib/finance/csv";
import { money } from "@/lib/finance/money";
import { importStatement } from "@/app/(app)/actions";

interface RuleDTO { match: string; categoryId: string | null; projectId: string | null; contactId: string | null; priority: number }
interface Props { ledgerId: string; accounts: { id: string; label: string; currency: string }[]; rules: RuleDTO[]; categories: Record<string, string> }

const MAX_ROWS = 3000;

export default function StatementImport({ ledgerId, accounts, rules, categories }: Props) {
    const [rows, setRows] = useState<string[][] | null>(null);
    const [fileName, setFileName] = useState("");
    const [error, setError] = useState("");
    const [cols, setCols] = useState<ColumnGuess>({ date: 0, desc: 1, amount: 2, debit: -1, credit: -1, hasHeader: true });
    const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
    const split = cols.amount < 0 && (cols.debit >= 0 || cols.credit >= 0);

    async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        setError(""); setRows(null);
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) { setError("Dosya en fazla 5 MB olabilir."); return; }
        if (/\.xlsx?$/i.test(f.name)) { setError("Excel dosyası okunamaz: Excel'de “Farklı kaydet › CSV (noktalı virgülle ayrılmış)” yapıp yükleyin."); return; }
        const text = decodeBytes(await f.arrayBuffer());
        const parsed = parseCsv(text, detectDelimiter(text));
        if (parsed.length < 2) { setError("Dosyada satır bulunamadı."); return; }
        setFileName(f.name);
        setRows(parsed);
        setCols(guessColumns(parsed));
    }

    const { lines, skipped } = useMemo(() => (rows ? extractLines(rows, cols) : { lines: [], skipped: 0 }), [rows, cols]);
    const preview = useMemo(() => lines.map(l => {
        const rule = matchRule(l.title, rules);
        return { ...l, category: rule?.categoryId ? categories[rule.categoryId] : null, rule: !!rule };
    }), [lines, rules, categories]);
    const income = lines.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0);
    const expense = lines.filter(l => l.amount < 0).reduce((s, l) => s - l.amount, 0);
    const header = rows?.[0] ?? [];
    const colSelect = (label: string, key: keyof Pick<ColumnGuess, "date" | "desc" | "amount" | "debit" | "credit">, optional = false) => (
        <label className="adm-field"><span className="adm-label">{label}</span>
            <select value={cols[key]} onChange={e => setCols({ ...cols, [key]: Number(e.target.value) })}>
                {optional && <option value={-1}>— yok —</option>}
                {header.map((h, i) => <option key={i} value={i}>{cols.hasHeader ? `${i + 1}. ${h || "(boş)"}` : `${i + 1}. sütun`}</option>)}
            </select></label>
    );

    return (
        <div className="adm-form">
            <label className="adm-field"><span className="adm-label">Ekstre dosyası (CSV, ≤ 5 MB)</span><input type="file" accept=".csv,.txt,text/csv" onChange={onFile} /></label>
            {error && <div className="fin-warn bad">{error}</div>}
            {rows && (
                <>
                    <p className="fin-hint">{fileName}: {rows.length} satır okundu. Sütun eşlemesini kontrol edin; yanlışsa değiştirin.</p>
                    <div className="adm-form-grid">
                        <label className="adm-field"><span className="adm-label">İlk satır başlık mı?</span>
                            <select value={cols.hasHeader ? "1" : "0"} onChange={e => setCols({ ...cols, hasHeader: e.target.value === "1" })}><option value="1">Evet</option><option value="0">Hayır</option></select></label>
                        {colSelect("Tarih sütunu", "date")}
                        {colSelect("Açıklama sütunu", "desc")}
                        <label className="adm-field"><span className="adm-label">Tutar biçimi</span>
                            <select value={split ? "split" : "single"} onChange={e => setCols(e.target.value === "split" ? { ...cols, amount: -1, debit: cols.debit >= 0 ? cols.debit : Math.min(3, header.length - 1), credit: cols.credit >= 0 ? cols.credit : Math.min(4, header.length - 1) } : { ...cols, amount: Math.min(2, header.length - 1), debit: -1, credit: -1 })}>
                                <option value="single">Tek sütun (eksi = çıkış)</option><option value="split">Borç / alacak ayrı sütun</option></select></label>
                        {!split && colSelect("Tutar sütunu", "amount")}
                        {split && colSelect("Borç (çıkış) sütunu", "debit", true)}
                        {split && colSelect("Alacak (giriş) sütunu", "credit", true)}
                    </div>

                    {lines.length === 0 ? <div className="fin-warn">Bu eşlemeyle geçerli satır bulunamadı. Tarih ve tutar sütunlarını kontrol edin.</div> : (
                        <>
                            <p className="fin-hint">{lines.length} geçerli satır{skipped ? `, ${skipped} satır atlandı (tarih ya da tutar okunamadı)` : ""} · giriş {money(income)} · çıkış {money(expense)} · kuralla kalem atanan {preview.filter(p => p.category).length}</p>
                            <div className="adm-table-wrap" style={{ maxHeight: 320, overflow: "auto" }}>
                                <table className="adm-table">
                                    <thead><tr><th>Tarih</th><th>Açıklama</th><th>Kalem (kural)</th><th className="num">Tutar</th></tr></thead>
                                    <tbody>
                                        {preview.slice(0, 40).map((p, i) => (
                                            <tr key={i}><td>{p.date}</td><td className="wrap">{p.title}</td><td>{p.category ?? <span className="muted">—</span>}</td><td className={`num ${p.amount > 0 ? "fin-pos" : "fin-neg"}`}>{p.amount > 0 ? "+" : "−"}{money(Math.abs(p.amount))}</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {lines.length > 40 && <p className="fin-hint">İlk 40 satır gösteriliyor.</p>}
                            {lines.length > MAX_ROWS && <div className="fin-warn bad">En fazla {MAX_ROWS} satır aktarılabilir; dosyayı bölün.</div>}
                            <AdminForm action={importStatement} className="adm-inline">
                                <input type="hidden" name="ledgerId" value={ledgerId} />
                                <input type="hidden" name="lines" value={JSON.stringify(lines.slice(0, MAX_ROWS))} />
                                <label className="adm-field"><span className="adm-label">Hangi hesabın ekstresi?</span>
                                    <select name="accountId" value={accountId} onChange={e => setAccountId(e.target.value)} required>{accounts.map(a => <option key={a.id} value={a.id}>{a.label} ({a.currency})</option>)}</select></label>
                                <SubmitButton pendingText="Aktarılıyor…" confirm={`${lines.length} satır hesaba işlensin mi? (Aynı satırlar tekrar yüklenirse atlanır.)`}>{lines.length} satırı aktar</SubmitButton>
                            </AdminForm>
                            <p className="fin-hint">Aktarılan satırlar “gerçekleşti” olarak hesaba işlenir ve bakiyeyi değiştirir. Hesabın açılış bakiyesini ekstrenin başlangıç tarihine göre ayarlayın (Hesaplar › açılış tarihi).</p>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
