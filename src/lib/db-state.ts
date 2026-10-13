/** Veritabanı durumu ve göçlerin çalıştırılması (kurulum ekranı) */
import { prisma } from "@/lib/prisma";
import { MIGRATIONS, type Migration } from "@/lib/migrations";

export type DbState = { state: "empty" | "pending" | "ok"; pending: Migration[] };

/** Göçler yalnızca ileri gider: bir kez "ok" görüldüyse bu sunucu örneği için tekrar sorgulanmaz (sayfa başına 2 sorgu azalır) */
let okSeen = false;

/** empty: hiç kurulmamış · pending: bekleyen göç var · ok: güncel */
export async function dbState(): Promise<DbState> {
    if (okSeen) return { state: "ok", pending: [] };
    const [row] = await prisma.$queryRaw<{ t: string | null }[]>`SELECT to_regclass('public.app_migrations')::text AS t`;
    if (!row?.t) return { state: "empty", pending: MIGRATIONS };
    const done = new Set((await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM app_migrations`).map(r => r.id));
    const pending = MIGRATIONS.filter(m => !done.has(m.id));
    if (!pending.length) okSeen = true;
    return { state: pending.length ? "pending" : "ok", pending };
}

/** Bekleyen göçleri tek işlemde çalıştırır; hata olursa hiçbiri uygulanmaz. Uygulanan göç sayısını döndürür. */
export async function runMigrations(): Promise<number> {
    return prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ofis-finans-migrations'))`;
        await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "app_migrations" ("id" TEXT NOT NULL PRIMARY KEY, "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
        const done = new Set((await tx.$queryRaw<{ id: string }[]>`SELECT id FROM app_migrations`).map(r => r.id));
        let n = 0;
        for (const m of MIGRATIONS) {
            if (done.has(m.id)) continue;
            for (const sql of m.statements) await tx.$executeRawUnsafe(sql);
            await tx.$executeRaw`INSERT INTO app_migrations (id) VALUES (${m.id})`;
            n++;
        }
        return n;
    }, { timeout: 60_000, maxWait: 15_000 });
}

export async function hasUsers(): Promise<boolean> {
    return (await prisma.appUser.count()) > 0;
}
