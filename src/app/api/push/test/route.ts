import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sendPush } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Giriş yapan kişiye deneme bildirimi */
export async function POST() {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: "Giriş gerekli." }, { status: 401 });
    const sent = await sendPush([user.id], { title: "Ofis Finans", body: "Bildirimler çalışıyor ✓", url: "/takvim", tag: "deneme" });
    return NextResponse.json({ success: true, sent });
}
