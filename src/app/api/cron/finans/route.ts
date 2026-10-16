// GET /api/cron/finans — günlük: kurları yeniler (günlük kapanış kaydı) ve tekrarlayan ödemelerin vadelerini üretir.
// Authorization: Bearer <CRON_SECRET> (Vercel zamanlayıcısı kendisi ekler)
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { generateRecurring } from "@/lib/finance/recurring";
import { refreshRates } from "@/lib/finance/rates";
import { dbState } from "@/lib/db-state";
import { runReminders } from "@/lib/push";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const given = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
    if (!authorized(request)) return NextResponse.json({ success: false, error: "Yetkisiz" }, { status: 401 });
    if ((await dbState()).state !== "ok") return NextResponse.json({ success: true, skipped: "Veritabanı henüz kurulmamış" });
    const rates = await refreshRates().catch(err => ({ ok: false, updated: [], sources: [], errors: [String(err)] }));
    const ledgers = await prisma.finLedger.findMany({ where: { isActive: true }, select: { id: true, slug: true } });
    const generated: Record<string, number> = {};
    for (const l of ledgers) generated[l.slug] = await generateRecurring(l.id);
    const reminders = await runReminders().catch(err => ({ error: String(err) }));
    return NextResponse.json({ success: true, rates, generated, reminders });
}
