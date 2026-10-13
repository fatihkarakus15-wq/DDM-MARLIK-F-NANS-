import { NextResponse } from "next/server";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { startSession } from "@/lib/auth";
import { fromB64, rp, takeChallenge } from "@/lib/passkey";
import { rateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        if (!rateLimit(`pk:${await clientKey()}`, 30, 15 * 60).ok) return NextResponse.json({ success: false, error: "Çok fazla deneme. Biraz sonra tekrar deneyin." }, { status: 429 });
        const body = await req.json().catch(() => null) as { response?: AuthenticationResponseJSON } | null;
        const saved = await takeChallenge();
        if (!body?.response || !saved) return NextResponse.json({ success: false, error: "Oturum süresi doldu. Tekrar deneyin." }, { status: 400 });
        const key = await prisma.appPasskey.findUnique({ where: { credentialId: body.response.id }, include: { user: { select: { id: true, epoch: true } } } });
        if (!key) return NextResponse.json({ success: false, error: "Bu telefon kayıtlı değil. Önce şifreyle girip Ayarlar'dan kaydedin." }, { status: 401 });
        const { rpID, origin } = await rp();
        const result = await verifyAuthenticationResponse({
            response: body.response, expectedChallenge: saved.ch, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
            credential: { id: key.credentialId, publicKey: fromB64(key.publicKey), counter: key.counter, transports: (key.transports?.split(",").filter(Boolean) ?? undefined) as never },
        });
        if (!result.verified) return NextResponse.json({ success: false, error: "Yüz/parmak izi doğrulanamadı." }, { status: 401 });
        await prisma.appPasskey.update({ where: { id: key.id }, data: { counter: result.authenticationInfo.newCounter, lastUsedAt: new Date() } });
        await startSession(key.user);
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ success: false, error: "Giriş yapılamadı. Tekrar deneyin." }, { status: 500 });
    }
}
