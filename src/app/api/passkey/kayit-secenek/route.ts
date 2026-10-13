import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { inviteUser, rp, saveChallenge } from "@/lib/passkey";
import { rateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request";

export const dynamic = "force-dynamic";

/** Kayıt seçenekleri: oturum açmış kullanıcı için ya da davet anahtarıyla (davetli kullanıcı için) */
export async function POST(req: Request) {
    try {
        if (!rateLimit(`pk:${await clientKey()}`, 30, 15 * 60).ok) return NextResponse.json({ success: false, error: "Çok fazla deneme. Biraz sonra tekrar deneyin." }, { status: 429 });
        const body = await req.json().catch(() => ({})) as { davet?: string };
        const user = body.davet ? await inviteUser(body.davet) : await getUser();
        if (!user) return NextResponse.json({ success: false, error: body.davet ? "Davet bağlantısı geçersiz ya da süresi dolmuş." : "Giriş yapmanız gerekli." }, { status: 401 });
        const { rpID, rpName } = await rp();
        const existing = await prisma.appPasskey.findMany({ where: { userId: user.id }, select: { credentialId: true, transports: true } });
        const options = await generateRegistrationOptions({
            rpName, rpID, userName: user.email, userDisplayName: user.name ?? user.email, userID: new TextEncoder().encode(user.id), attestationType: "none",
            excludeCredentials: existing.map(c => ({ id: c.credentialId, transports: (c.transports?.split(",").filter(Boolean) ?? undefined) as never })),
            authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
        });
        await saveChallenge(options.challenge, { uid: user.id });
        return NextResponse.json({ success: true, options });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ success: false, error: "Seçenekler hazırlanamadı." }, { status: 500 });
    }
}
