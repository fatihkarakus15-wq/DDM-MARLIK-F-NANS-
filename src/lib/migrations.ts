/**
 * Veritabanı göçleri. Uygulama ilk açılışta /kurulum ekranından, güncelleme gerektiğinde aynı ekrandan çalıştırır.
 * Yeni bir göç eklemek için: prisma/schema.prisma'yı değiştir, `statements` içine yalnızca ekleme yapan SQL'i
 * (CREATE TABLE, ALTER TABLE ... ADD COLUMN ...) yaz ve diziye YENİ bir id ile ekle. Eski göçleri değiştirme.
 */
import { BASELINE_SQL } from "./baseline-sql";

export interface Migration { id: string; statements: string[] }

export const MIGRATIONS: Migration[] = [
    { id: "001-baslangic", statements: BASELINE_SQL },
    {
        id: "002-gecis-anahtarlari",
        statements: [
            `ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "inviteHash" TEXT`,
            `ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "inviteExpires" TIMESTAMP(3)`,
            `CREATE TABLE IF NOT EXISTS "app_passkeys" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE, "credentialId" TEXT NOT NULL, "publicKey" TEXT NOT NULL, "counter" INTEGER NOT NULL DEFAULT 0, "transports" TEXT, "name" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastUsedAt" TIMESTAMP(3))`,
            `CREATE UNIQUE INDEX IF NOT EXISTS "app_passkeys_credentialId_key" ON "app_passkeys"("credentialId")`,
            `CREATE INDEX IF NOT EXISTS "app_passkeys_userId_idx" ON "app_passkeys"("userId")`,
        ],
    },
];
