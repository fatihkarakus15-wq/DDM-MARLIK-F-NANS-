// GET /api/cron/hatirlat — zamanı gelen etkinlik hatırlatmalarını ve günün programını bildirim olarak gönderir.
// Her 5-10 dakikada çağrılırsa hatırlatmalar tam zamanında gider (günde bir çağrılırsa yalnızca günün programı).
// Authorization: Bearer <CRON_SECRET>
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
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
    return NextResponse.json({ success: true, ...(await runReminders()) });
}
