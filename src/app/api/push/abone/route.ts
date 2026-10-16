import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Sub { endpoint?: string; keys?: { p256dh?: string; auth?: string } }

/** Bu telefonu bildirimlere abone eder (aynı adres varsa kullanıcıya bağlanır) */
export async function POST(req: Request) {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: "Giriş gerekli." }, { status: 401 });
    const sub = await req.json().catch(() => null) as Sub | null;
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys.auth || !sub.endpoint.startsWith("https://")) return NextResponse.json({ success: false, error: "Geçersiz abonelik." }, { status: 400 });
    await prisma.pushSub.upsert({
        where: { endpoint: sub.endpoint }, update: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        create: { userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
    return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: "Giriş gerekli." }, { status: 401 });
    const body = await req.json().catch(() => null) as { endpoint?: string } | null;
    if (body?.endpoint) await prisma.pushSub.deleteMany({ where: { endpoint: body.endpoint, userId: user.id } });
    return NextResponse.json({ success: true });
}
