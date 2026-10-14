"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, startSession } from "@/lib/auth";
import { FormError, run, str, type ActionState } from "@/lib/form";
import { rateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request";
import { inviteUser } from "@/lib/passkey";

/** Davetli kullanıcı şifre belirler (yüz/parmak izi yerine ya da yanında); bağlantı kapanır ve içeri alınır */
export async function setInvitePassword(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        if (!rateLimit(`davet:${await clientKey()}`, 10, 15 * 60).ok) throw new FormError("Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.");
        const user = await inviteUser(str(fd, "token", "Davet"));
        if (!user) throw new FormError("Davet bağlantısı geçersiz ya da süresi dolmuş. Yeni bağlantı isteyin.");
        const password = str(fd, "password", "Şifre");
        if (password.length < 10) throw new FormError("Şifre en az 10 karakter olmalı.");
        if (password !== str(fd, "again", "Şifre (tekrar)")) throw new FormError("Şifreler aynı değil.");
        const updated = await prisma.appUser.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), epoch: { increment: 1 }, inviteHash: null, inviteExpires: null }, select: { id: true, epoch: true } });
        await startSession(updated);
        redirect("/");
    });
}
