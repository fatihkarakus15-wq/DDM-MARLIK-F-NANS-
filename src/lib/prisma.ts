import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

// Bağlantı kurulurken ağ hatası: sorgu sunucuya hiç gitmedi, yeniden denemek güvenli
const CONNECT_ERRORS = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET"]);
const RETRIES = 3;

/**
 * Havuzdan bağlantı alırken (yeni bağlantı açılıyorsa) geçici DNS/ağ hatasında kısa aralıkla
 * yeniden dener. Supabase havuzunda zaman zaman "Can't reach database server" (P1001) görüldü.
 * `pool.query` de içeride `connect(cb)` çağırır; iki biçim de desteklenir.
 */
class RetryingPool extends pg.Pool {
    // pg-pool'un aşırı yüklenmiş imzası: söz (promise) ya da geri çağrı
    connect(): Promise<pg.PoolClient>;
    connect(cb: (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: boolean | Error) => void) => void): void;
    connect(cb?: (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: boolean | Error) => void) => void): Promise<pg.PoolClient> | void {
        const attempt = async (): Promise<pg.PoolClient> => {
            for (let i = 0; ; i++) {
                try {
                    return await super.connect();
                } catch (err) {
                    const code = (err as { code?: string }).code;
                    if (i >= RETRIES - 1 || !code || !CONNECT_ERRORS.has(code)) throw err;
                    await new Promise(r => setTimeout(r, 250 * (i + 1)));
                }
            }
        };
        if (!cb) return attempt();
        attempt().then(client => cb(undefined, client, client.release.bind(client)), err => cb(err, undefined, () => {}));
    }
}

/**
 * Bağlantı `pg` sürücüsüyle (driver adapter): sorgu başına tek gidiş-dönüş.
 * Prisma'nın kendi motoru `pgbouncer=true` modunda her sorguyu BEGIN / DEALLOCATE ALL / COMMIT ile
 * sarıyordu (sorgu başına ~5 tur). `pg` adsız hazırlanmış ifade kullandığı için Supabase havuzunun
 * işlem modunda (6543) sorunsuz çalışır; Prisma'ya özgü URL parametreleri sürücüye verilmez.
 */
function createClient() {
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.delete("pgbouncer");
    url.searchParams.delete("connection_limit");
    // Sunucusuz ortamda her örnek kendi havuzunu açar; küçük tutulur. Yeni bağlantı ~6 tur sürdüğü
    // için boştaki bağlantılar bir süre açık bırakılır.
    const pool = new RetryingPool({ connectionString: url.toString(), max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
    return new PrismaClient({
        adapter: new PrismaPg(pool),
        log:
            process.env.NODE_ENV === "development"
                ? ["query", "error", "warn"]
                : ["error"],
    });
}

/**
 * İstemci ilk kullanımda kurulur: DATABASE_URL hatalıysa derleme çökmez, hata ilk sorguda
 * (kurulum ekranında "Neden: …" olarak) görünür.
 */
function getClient(): PrismaClient {
    if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
    return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
    get(_t, prop) {
        const client = getClient();
        const value = Reflect.get(client, prop, client);
        return typeof value === "function" ? value.bind(client) : value;
    },
});
