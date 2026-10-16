/**
 * Bildirimler (Web Push): sunucunun VAPID anahtarı veritabanında (ilk kullanımda üretilir), her telefon bir abonelik.
 * Hatırlatmalar `runReminders` ile gönderilir (cron). iPhone'da bildirim için uygulamanın ana ekrana eklenmiş olması gerekir.
 */
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { addDays, parseDay, todayYmd, ymd } from "@/lib/finance/dates";
import { EVENT_KINDS } from "@/lib/finance/events";

export interface PushPayload { title: string; body: string; url?: string; tag?: string }

async function config() {
    const found = await prisma.pushConfig.findUnique({ where: { id: "main" } });
    if (found) return found;
    const keys = webpush.generateVAPIDKeys();
    // Aynı anda iki istek gelirse biri kazanır, diğeri kazananı okur
    await prisma.pushConfig.createMany({ data: [{ id: "main", publicKey: keys.publicKey, privateKey: keys.privateKey }], skipDuplicates: true });
    return prisma.pushConfig.findUniqueOrThrow({ where: { id: "main" } });
}

export async function publicKey() {
    return (await config()).publicKey;
}

/** Kullanıcılara (boşsa herkese) bildirim gönderir; ölü abonelikleri siler. Giden bildirim sayısını döndürür. */
export async function sendPush(userIds: string[] | null, payload: PushPayload) {
    const cfg = await config();
    const subs = await prisma.pushSub.findMany({ where: userIds ? { userId: { in: userIds } } : {}, include: { user: { select: { email: true } } } });
    if (!subs.length) return 0;
    const subject = `mailto:${subs[0].user.email}`;
    let sent = 0;
    const dead: string[] = [];
    await Promise.all(subs.map(async s => {
        try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { vapidDetails: { subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey }, TTL: 3600 });
            sent++;
        } catch (err) {
            const code = (err as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) dead.push(s.id);
            else console.error("push", code ?? err);
        }
    }));
    if (dead.length) await prisma.pushSub.deleteMany({ where: { id: { in: dead } } });
    return sent;
}

/** Etkinliğin başlangıcı (İstanbul UTC+3; saat yoksa 09:00) */
export function eventStart(date: Date, startTime: string | null) {
    const [y, m, d] = ymd(date).split("-").map(Number);
    const [hh, mm] = (startTime ?? "09:00").split(":").map(Number);
    return new Date(Date.UTC(y, m - 1, d, hh - 3, mm));
}

export const REMIND_OPTIONS: [number, string][] = [[0, "Zamanında"], [15, "15 dk önce"], [30, "30 dk önce"], [60, "1 saat önce"], [120, "2 saat önce"], [1440, "1 gün önce"]];

/** Zamanı gelen etkinlik hatırlatmaları + sabah 08:00'dan sonra günün programı (günde bir kez) */
export async function runReminders(now = new Date()) {
    const out = { reminders: 0, digest: 0 };
    // 1) Etkinlik hatırlatmaları: başlangıçtan önce ayarlanan süre geldiyse, başlangıçtan en çok 90 dk sonrasına kadar
    const events = await prisma.finEvent.findMany({
        where: { done: false, remindMin: { not: null }, remindedAt: null, date: { gte: addDays(now, -2), lte: addDays(now, 3) } },
        include: { project: { select: { name: true } } },
    });
    for (const e of events) {
        const start = eventStart(e.date, e.startTime).getTime();
        if (now.getTime() < start - (e.remindMin ?? 0) * 60_000 || now.getTime() > start + 90 * 60_000) continue;
        const when = e.startTime ? e.startTime : "gün boyu";
        const day = ymd(e.date) === todayYmd(now) ? "Bugün" : new Date(`${ymd(e.date)}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "UTC" });
        await prisma.finEvent.update({ where: { id: e.id }, data: { remindedAt: now } });
        out.reminders += await sendPush(e.assigneeId ? [e.assigneeId] : null, {
            title: `${EVENT_KINDS[e.kind]?.label ?? "Etkinlik"}: ${e.title}`, body: `${day} ${when}${e.location ? ` · ${e.location}` : ""}${e.project ? ` · ${e.project.name}` : ""}`, url: `/takvim?gun=${ymd(e.date)}`, tag: `ev-${e.id}`,
        });
    }
    // 2) Günün programı: İstanbul'da 08:00'dan sonra, bugün gönderilmediyse
    const istanbul = new Date(now.getTime() + 3 * 3600_000);
    const day = todayYmd(now);
    if (istanbul.getUTCHours() >= 8) {
        const cfg = await config();
        if (cfg.lastDigest !== day) {
            const claimed = await prisma.pushConfig.updateMany({ where: { id: "main", OR: [{ lastDigest: null }, { lastDigest: { not: day } }] }, data: { lastDigest: day } });
            if (claimed.count) {
                const list = await prisma.finEvent.findMany({ where: { done: false, date: parseDay(day)! }, orderBy: [{ startTime: "asc" }] });
                const users = await prisma.appUser.findMany({ select: { id: true } });
                for (const u of users) {
                    const mine = list.filter(e => !e.assigneeId || e.assigneeId === u.id);
                    if (!mine.length) continue;
                    out.digest += await sendPush([u.id], {
                        title: `Bugün ${mine.length} etkinlik var`, body: mine.slice(0, 5).map(e => `${e.startTime ?? "•"} ${e.title}`).join("\n"), url: `/takvim?gun=${day}`, tag: `gun-${day}`,
                    });
                }
            }
        }
    }
    return out;
}
