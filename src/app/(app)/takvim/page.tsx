import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFinancePage } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { personName } from "@/lib/finance/options";
import { EVENT_KINDS, WEEKDAYS, monthGrid, shiftMonth } from "@/lib/finance/events";
import { addDays, monthLabel, parseDay, todayYmd } from "@/lib/finance/dates";
import PushToggle from "@/components/PushToggle";
import { REMIND_OPTIONS } from "@/lib/push";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { deleteEvent, saveEvent, toggleEvent } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Takvim" };

type Ev = Awaited<ReturnType<typeof loadEvents>>[number];
const loadEvents = (ledgerId: string, from: Date, to: Date) => prisma.finEvent.findMany({
    where: { ledgerId, date: { gte: from, lte: to } }, orderBy: [{ date: "asc" }, { startTime: "asc" }, { createdAt: "asc" }], include: { project: { select: { id: true, name: true } } },
});

const dayTitle = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const hours = (e: { startTime: string | null; endTime: string | null }) => (e.startTime ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ""}` : "Gün boyu");

/** Ortak takvim: keşif, toplantı, teslim ve günlük program; iki kullanıcı aynı takvimi görür */
export default async function Takvim({ searchParams }: { searchParams: Promise<{ ay?: string; gun?: string }> }) {
    await requireFinancePage();
    const { ay, gun } = await searchParams;
    const { ledger } = await activeLedger();
    const now = todayYmd();
    const selected = parseDay(gun) ? gun! : /^\d{4}-\d{2}$/.test(ay ?? "") ? `${ay}-01` : now;
    const month = selected.slice(0, 7);
    const grid = monthGrid(month);
    const from = parseDay(grid[0].ymd)!, to = parseDay(grid[grid.length - 1].ymd)!;
    const upFrom = parseDay(now)!, upTo = addDays(upFrom, 7);
    const [events, upcoming, users, projects] = await Promise.all([
        loadEvents(ledger.id, from, to),
        loadEvents(ledger.id, upFrom, upTo),
        prisma.appUser.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true } }),
        prisma.finProject.findMany({ where: { ledgerId: ledger.id, status: { notIn: ["CANCELLED"] } }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
    ]);
    const who = (id: string | null) => (id ? personName(users.find(u => u.id === id) ?? { name: null, email: "?" }) : "İkimiz");
    const byDay = new Map<string, Ev[]>();
    for (const e of events) { const k = e.date.toISOString().slice(0, 10); byDay.set(k, [...(byDay.get(k) ?? []), e]); }
    const dayEvents = byDay.get(selected) ?? [];
    const nav = (m: string) => `/takvim?ay=${m}`;

    const form = (e?: Ev) => (
        <AdminForm action={saveEvent} className="adm-form" key={e?.id ?? `new-${selected}`}>
            <input type="hidden" name="ledgerId" value={ledger.id} />{e && <input type="hidden" name="id" value={e.id} />}
            <label className="adm-field"><span className="adm-label">Başlık</span><input name="title" defaultValue={e?.title} required maxLength={140} placeholder="Ör. Tansel Bey keşif" autoComplete="off" /></label>
            <div className="adm-form-grid">
                <label className="adm-field"><span className="adm-label">Tür</span><select name="kind" defaultValue={e?.kind ?? "KESIF"}>{Object.entries(EVENT_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
                <label className="adm-field"><span className="adm-label">Tarih</span><input type="date" name="date" defaultValue={e ? e.date.toISOString().slice(0, 10) : selected} required /></label>
                <label className="adm-field"><span className="adm-label">Başlangıç</span><input type="time" name="startTime" defaultValue={e?.startTime ?? ""} /></label>
                <label className="adm-field"><span className="adm-label">Bitiş</span><input type="time" name="endTime" defaultValue={e?.endTime ?? ""} /></label>
                <label className="adm-field"><span className="adm-label">Kimin</span><select name="assigneeId" defaultValue={e?.assigneeId ?? ""}><option value="">İkimiz</option>{users.map(u => <option key={u.id} value={u.id}>{personName(u)}</option>)}</select></label>
                <label className="adm-field"><span className="adm-label">Proje (isteğe bağlı)</span><select name="projectId" defaultValue={e?.projectId ?? ""}><option value="">— yok —</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            </div>
            <label className="adm-field"><span className="adm-label">Hatırlat (bildirim)</span><select name="remindMin" defaultValue={e ? (e.remindMin ?? "") : "60"}><option value="">Hatırlatma yok</option>{REMIND_OPTIONS.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select></label>
            <label className="adm-field"><span className="adm-label">Yer / adres</span><input name="location" defaultValue={e?.location ?? ""} maxLength={200} autoComplete="off" /></label>
            <label className="adm-field"><span className="adm-label">Not</span><input name="note" defaultValue={e?.note ?? ""} maxLength={1000} autoComplete="off" /></label>
            <div className="adm-form-foot"><SubmitButton>{e ? "Kaydet" : "Takvime ekle"}</SubmitButton></div>
        </AdminForm>
    );

    const row = (e: Ev, showDate = false) => {
        const k = EVENT_KINDS[e.kind] ?? EVENT_KINDS.DIGER;
        return (
            <li key={e.id} className={e.done ? "done" : ""}>
                <details className="pay-item">
                    <summary className="pay-row">
                        <span><b><i className={`cal-dot ${k.tone}`} />{e.title}</b><small>{showDate ? `${dayTitle(e.date.toISOString().slice(0, 10))} · ` : ""}{hours(e)} · {k.label} · {who(e.assigneeId)}{e.remindMin != null && !e.done ? " · 🔔" : ""}{e.project ? ` · ${e.project.name}` : ""}</small></span>
                        <span className="pay-amt">{e.done && <em className="adm-badge ok">Tamam</em>}</span>
                    </summary>
                    <div className="pay-body">
                        {e.location && <p className="adm-help">📍 {e.location}{" "}<a className="adm-link" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}`}>Haritada aç</a></p>}
                        {e.note && <p className="adm-help">{e.note}</p>}
                        {e.project && <p className="adm-help"><Link className="adm-link" href={`/projeler/${e.project.id}`}>Projeye git: {e.project.name}</Link></p>}
                        <div className="cal-actions">
                            <AdminForm action={toggleEvent} className="adm-inline"><input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={e.id} /><SubmitButton className="btn btn-sm adm-btn-outline" pendingText="…">{e.done ? "Yeniden aç" : "Tamamlandı"}</SubmitButton></AdminForm>
                            <AdminForm action={deleteEvent} className="adm-inline"><input type="hidden" name="ledgerId" value={ledger.id} /><input type="hidden" name="id" value={e.id} /><SubmitButton className="btn btn-sm adm-btn-danger" pendingText="…" confirm="Etkinlik silinsin mi?">Sil</SubmitButton></AdminForm>
                        </div>
                        <details className="adm-fold"><summary>Düzenle</summary>{form(e)}</details>
                    </div>
                </details>
            </li>
        );
    };

    return (
        <div>
            <div className="adm-head">
                <div><h1 className="adm-title">Takvim</h1><p className="adm-sub">Ortak takvim: keşif, toplantı ve günlük program. İkiniz de aynısını görürsünüz.</p></div>
                <div className="adm-actions"><a className="btn btn-sm btn-gold" href="#yeni">+ Etkinlik ekle</a></div>
            </div>

            <section className="adm-card"><div className="adm-card-body"><PushToggle /></div></section>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">Önümüzdeki 7 gün</h2><span className="adm-card-note">{upcoming.length} etkinlik</span></div>
                {upcoming.length === 0 ? <p className="adm-empty">Bu hafta planlı bir şey yok.</p> : <ul className="pay-list">{upcoming.map(e => row(e, true))}</ul>}
            </section>

            <section className="adm-card cal">
                <div className="cal-head">
                    <Link className="btn btn-sm adm-btn-outline" href={nav(shiftMonth(month, -1))} replace aria-label="Önceki ay">‹</Link>
                    <b>{monthLabel(month)}</b>
                    <Link className="btn btn-sm adm-btn-outline" href={nav(shiftMonth(month, 1))} replace aria-label="Sonraki ay">›</Link>
                    <Link className="btn btn-sm adm-btn-outline" href={`/takvim?gun=${now}`} replace>Bugün</Link>
                </div>
                <div className="cal-grid" role="grid" aria-label="Ay takvimi">
                    {WEEKDAYS.map(w => <span key={w} className="cal-wd">{w}</span>)}
                    {grid.map(c => {
                        const list = byDay.get(c.ymd) ?? [];
                        return (
                            <Link key={c.ymd} replace href={`/takvim?gun=${c.ymd}`} className={`cal-day${c.inMonth ? "" : " out"}${c.ymd === now ? " today" : ""}${c.ymd === selected ? " sel" : ""}`} aria-label={`${dayTitle(c.ymd)}${list.length ? `, ${list.length} etkinlik` : ""}`}>
                                <span>{c.day}</span>
                                <span className="cal-dots">{list.slice(0, 4).map(e => <i key={e.id} className={`cal-dot ${(EVENT_KINDS[e.kind] ?? EVENT_KINDS.DIGER).tone}`} />)}</span>
                            </Link>
                        );
                    })}
                </div>
                <div className="cal-legend">{Object.values(EVENT_KINDS).map(k => <span key={k.label}><i className={`cal-dot ${k.tone}`} />{k.label}</span>)}</div>
            </section>

            <section className="adm-card">
                <div className="adm-card-head"><h2 className="adm-card-title">{dayTitle(selected)}</h2><span className="adm-card-note">{dayEvents.length} etkinlik</span></div>
                {dayEvents.length === 0 ? <p className="adm-empty">Bu gün için bir şey yok.</p> : <ul className="pay-list">{dayEvents.map(e => row(e))}</ul>}
            </section>

            <section className="adm-card" id="yeni">
                <div className="adm-card-head"><h2 className="adm-card-title">Yeni etkinlik</h2><span className="adm-card-note">{dayTitle(selected)} için</span></div>
                <div className="adm-card-body">{form()}</div>
            </section>
        </div>
    );
}
