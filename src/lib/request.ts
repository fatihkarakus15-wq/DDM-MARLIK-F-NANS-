/** İstek yardımcıları (Server Action içinde): istemci IP özeti ve kurulum anahtarı karşılaştırması */
import { createHash, timingSafeEqual } from "crypto";
import { headers } from "next/headers";

export async function clientKey() {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "yerel";
    return createHash("sha256").update(`${ip}|${process.env.JWT_SECRET ?? ""}`).digest("hex").slice(0, 32);
}

/** SETUP_KEY ile verilen anahtarı zamanlama saldırısına karşı güvenli karşılaştırır */
export function setupKeyOk(given: string) {
    const expected = process.env.SETUP_KEY;
    if (!expected || expected.length < 12) return false;
    const a = createHash("sha256").update(given).digest();
    const b = createHash("sha256").update(expected).digest();
    return timingSafeEqual(a, b);
}
