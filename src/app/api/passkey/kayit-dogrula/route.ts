import { NextResponse } from "next/server";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { getUser, startSession } from "@/lib/auth";
import { b64, inviteUser, rp, takeChallenge } from "@/lib/passkey";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => null) as { davet?: string; ad?: string; response?: RegistrationResponseJSON } | null;
        if (!body?.response) return NextResponse.json({ success: false, error: "Geçersiz istek." }, { status: 400 });
        const invited = body.davet ? await inviteUser(body.davet) : null;
        const user = invited ?? (body.davet ? null : await getUser());
        const saved = await takeChallenge();
        if (!user || !saved || saved.uid !== user.id) return NextResponse.json({ success: false, error: "Oturum süresi doldu. Tekrar deneyin." }, { status: 401 });
        const { rpID, origin } = await rp();
        const result = await verifyRegistrationResponse({ response: body.response, expectedChallenge: saved.ch, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
        if (!result.verified) return NextResponse.json({ success: false, error: "Yüz/parmak izi doğrulanamadı." }, { status: 400 });
        const { credential } = result.registrationInfo;
        await prisma.appPasskey.create({
            data: { userId: user.id, credentialId: credential.id, publicKey: b64(credential.publicKey), counter: credential.counter, transports: credential.transports?.join(",") ?? null, name: (body.ad ?? "").trim().slice(0, 60) || null },
        });
        if (invited) {
            // Davet kullanıldı: bağlantı kapanır, kullanıcı içeri alınır
            await prisma.appUser.update({ where: { id: user.id }, data: { inviteHash: null, inviteExpires: null } });
            await startSession({ id: invited.id, epoch: invited.epoch });
        }
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error(err);
        const dup = err instanceof Error && /Unique constraint/.test(err.message);
        return NextResponse.json({ success: false, error: dup ? "Bu telefon zaten kayıtlı." : "Kaydedilemedi. Tekrar deneyin." }, { status: 500 });
    }
}
