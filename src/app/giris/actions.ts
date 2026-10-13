"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { endSession, hashPassword, startSession, verifyPassword } from "@/lib/auth";
import { dbState, hasUsers, runMigrations } from "@/lib/db-state";
import { FormError, run, str, type ActionState } from "@/lib/form";
import { rateLimit, resetLimit } from "@/lib/rate-limit";
import { clientKey, setupKeyOk } from "@/lib/request";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Var olmayan hesapta da bcrypt çalışsın: yanıt süresinden hesabın varlığı anlaşılmasın
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("hesap-yok"));

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const email = str(fd, "email", "E-posta").toLowerCase();
        const password = str(fd, "password", "Şifre");
        const byIp = `login:ip:${await clientKey()}`, byMail = `login:mail:${email}`;
        const gate = rateLimit(byIp, 30, 15 * 60);
        const gate2 = rateLimit(byMail, 6, 60);
        if (!gate.ok || !gate2.ok) throw new FormError("Çok fazla deneme yapıldı. Bir dakika sonra tekrar deneyin.");
        if ((await dbState()).state !== "ok") redirect("/kurulum");
        const user = await prisma.appUser.findUnique({ where: { email } });
        const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
        if (!user || !ok) throw new FormError("E-posta ya da şifre hatalı.");
        resetLimit(byMail);
        await startSession(user);
        redirect("/");
    });
}

export async function logout() {
    await endSession();
    redirect("/giris");
}

/** Kurulum 1: tablolar (SETUP_KEY ister) */
export async function setupDatabase(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const gate = rateLimit(`setup:${await clientKey()}`, 10, 15 * 60);
        if (!gate.ok) throw new FormError("Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.");
        if (!process.env.SETUP_KEY) throw new FormError("SETUP_KEY ortam değişkeni tanımlı değil (README).");
        if (!setupKeyOk(str(fd, "key", "Kurulum anahtarı"))) throw new FormError("Kurulum anahtarı hatalı.");
        try {
            await runMigrations();
        } catch (err) {
            console.error(err);
            throw new FormError(`Veritabanı kurulamadı, hiçbir değişiklik yapılmadı: ${(err instanceof Error ? err.message : "bilinmeyen hata").split("\n").pop()?.slice(0, 200)}`);
        }
        redirect("/kurulum");
    });
}

/** Kurulum 2: ilk (ve tek) kullanıcı (SETUP_KEY ister; kullanıcı varsa kapalı) */
export async function createOwner(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const gate = rateLimit(`setup:${await clientKey()}`, 10, 15 * 60);
        if (!gate.ok) throw new FormError("Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.");
        if (!setupKeyOk(str(fd, "key", "Kurulum anahtarı"))) throw new FormError("Kurulum anahtarı hatalı.");
        if ((await dbState()).state !== "ok") throw new FormError("Önce veritabanı kurulmalı.");
        if (await hasUsers()) throw new FormError("Kullanıcı zaten oluşturulmuş. Giriş yapın.");
        const email = str(fd, "email", "E-posta").toLowerCase();
        if (!EMAIL_RE.test(email)) throw new FormError("Geçerli bir e-posta yazın.");
        const password = str(fd, "password", "Şifre");
        if (password.length < 10) throw new FormError("Şifre en az 10 karakter olmalı.");
        if (password !== str(fd, "again", "Şifre (tekrar)")) throw new FormError("Şifreler aynı değil.");
        const user = await prisma.appUser.create({ data: { email, name: String(fd.get("name") ?? "").trim() || null, passwordHash: await hashPassword(password) }, select: { id: true, epoch: true } });
        await startSession(user);
        redirect("/");
    });
}

/** Şifremi unuttum: SETUP_KEY ile tek hesabın şifresi (isteğe bağlı e-postası) yenilenir, eski oturumlar kapanır */
export async function resetOwnerPassword(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        const gate = rateLimit(`setup:${await clientKey()}`, 10, 15 * 60);
        if (!gate.ok) throw new FormError("Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.");
        if (!setupKeyOk(str(fd, "key", "Kurulum anahtarı"))) throw new FormError("Kurulum anahtarı hatalı.");
        if ((await dbState()).state !== "ok") throw new FormError("Önce veritabanı kurulmalı.");
        const password = str(fd, "password", "Yeni şifre");
        if (password.length < 10) throw new FormError("Şifre en az 10 karakter olmalı.");
        if (password !== str(fd, "again", "Yeni şifre (tekrar)")) throw new FormError("Şifreler aynı değil.");
        const email = String(fd.get("email") ?? "").trim().toLowerCase();
        if (email && !EMAIL_RE.test(email)) throw new FormError("Geçerli bir e-posta yazın.");
        const owner = await prisma.appUser.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
        if (!owner) redirect("/kurulum");
        const user = await prisma.appUser.update({
            where: { id: owner.id },
            data: { passwordHash: await hashPassword(password), epoch: { increment: 1 }, ...(email && { email }) },
            select: { id: true, epoch: true },
        });
        resetLimit(`login:mail:${email}`);
        await startSession(user);
        redirect("/");
    });
}
