"use client";
/** Defter seçici. Seçim çerezde tutulur (setLedger). */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLedger } from "@/app/(app)/actions";

export default function LedgerSwitch({ ledgers, current }: { ledgers: { slug: string; name: string }[]; current: string }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    return (
        <div className="fin-ledgers" role="group" aria-label="Defter">
            {ledgers.map(l => (
                <button
                    key={l.slug} type="button" disabled={pending || l.slug === current} aria-pressed={l.slug === current}
                    className={`fin-ledger${l.slug === current ? " active" : ""}`}
                    onClick={() => start(async () => { const fd = new FormData(); fd.set("slug", l.slug); await setLedger(null, fd); router.refresh(); })}
                >
                    {l.name}
                </button>
            ))}
        </div>
    );
}
