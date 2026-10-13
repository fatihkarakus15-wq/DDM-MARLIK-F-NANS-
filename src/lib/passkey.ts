/**
 * Yüz tanıma / parmak izi ile giriş (WebAuthn geçiş anahtarı). Telefon yüzü kendisi doğrular (Face ID, Android yüz/parmak izi,
 * Windows Hello); sunucuya yalnızca açık anahtar gelir. Meydan okuma (challenge) kısa ömürlü imzalı çerezde tutulur.
 */
import { createHash, randomBytes } from "crypto";
import { cookies, headers } from "next/headers";
import jwt from "jsonwebtoken";

const CH_COOKIE = "ofisfinans_pk";

export async function rp() {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return { rpID: host.split(":")[0], origin: `${proto}://${host}`, rpName: "Ofis Finans" };
}

function secret() {
    const s = process.env.JWT_SECRET;
    if (!s || s.length < 16) throw new Error("JWT_SECRET tanımlı değil.");
    return s;
}

export async function saveChallenge(challenge: string, extra: { uid?: string } = {}) {
    const token = jwt.sign({ ch: challenge, ...extra }, secret(), { expiresIn: 300 });
    (await cookies()).set(CH_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/passkey", maxAge: 300 });
}

/** Çerezdeki meydan okumayı okur ve siler (tek kullanımlık) */
export async function takeChallenge(): Promise<{ ch: string; uid?: string } | null> {
    const jar = await cookies();
    const token = jar.get(CH_COOKIE)?.value;
    jar.delete({ name: CH_COOKIE, path: "/api/passkey" });
    if (!token) return null;
    try { return jwt.verify(token, secret()) as { ch: string; uid?: string }; } catch { return null; }
}

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64url");
export const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

/** Davet anahtarından geçerli kullanıcı */
export async function inviteUser(token: string) {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.appUser.findFirst({ where: { inviteHash: hashToken(token), inviteExpires: { gt: new Date() } }, select: { id: true, email: true, name: true, epoch: true } });
    return user;
}
