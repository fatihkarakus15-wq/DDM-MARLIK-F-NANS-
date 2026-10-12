/**
 * Giriş: e-posta + şifre (bcrypt), imzalı JWT çerezi (90 gün). Çerez `epoch` taşır; kullanıcının epoch'u artınca
 * (şifre değişimi, "diğer cihazları çıkar") eski oturumlar geçersiz olur.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const COOKIE_NAME = "ofisfinans_session";
const TTL_SECONDS = 60 * 60 * 24 * 90;

export interface SessionUser { id: string; email: string; name: string | null }

function secret() {
    const s = process.env.JWT_SECRET;
    if (!s || s.length < 16) throw new Error("JWT_SECRET tanımlı değil ya da çok kısa (en az 16 karakter).");
    return s;
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Oturum çerezini kurar (Server Action / Route Handler içinde) */
export async function startSession(user: { id: string; epoch: number }) {
    const token = jwt.sign({ uid: user.id, ep: user.epoch }, secret(), { expiresIn: TTL_SECONDS });
    (await cookies()).set(COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_SECONDS });
}

export async function endSession() {
    (await cookies()).delete(COOKIE_NAME);
}

/** Oturumdaki kullanıcı; yoksa ya da oturum geçersizse null */
export const getUser = cache(async (): Promise<SessionUser | null> => {
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    if (!token) return null;
    let payload: { uid?: string; ep?: number };
    try {
        payload = jwt.verify(token, secret()) as typeof payload;
    } catch {
        return null;
    }
    if (!payload.uid) return null;
    const user = await prisma.appUser.findUnique({ where: { id: payload.uid }, select: { id: true, email: true, name: true, epoch: true } });
    if (!user || user.epoch !== payload.ep) return null;
    return { id: user.id, email: user.email, name: user.name };
});
