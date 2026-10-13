import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { rp, saveChallenge } from "@/lib/passkey";
import { rateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request";

export const dynamic = "force-dynamic";

/** E-posta yazmadan giriş: tarayıcı kayıtlı geçiş anahtarlarını kendisi önerir */
export async function POST() {
    try {
        if (!rateLimit(`pk:${await clientKey()}`, 30, 15 * 60).ok) return NextResponse.json({ success: false, error: "Çok fazla deneme. Biraz sonra tekrar deneyin." }, { status: 429 });
        const { rpID } = await rp();
        const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
        await saveChallenge(options.challenge);
        return NextResponse.json({ success: true, options });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ success: false, error: "Hazırlanamadı." }, { status: 500 });
    }
}
