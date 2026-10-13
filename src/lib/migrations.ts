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
    {
        id: "003-proje-ayrintilari",
        statements: [
            `ALTER TABLE "fin_projects" ADD COLUMN IF NOT EXISTS "address" TEXT`,
            `ALTER TABLE "fin_projects" ADD COLUMN IF NOT EXISTS "clientTckn" TEXT`,
            `ALTER TABLE "fin_projects" ADD COLUMN IF NOT EXISTS "stage" TEXT`,
        ],
    },
    {
        id: "004-ilave-isler-ekstra-alinacak",
        statements: [
            `ALTER TABLE "fin_transactions" ADD COLUMN IF NOT EXISTS "rebillAmount" DOUBLE PRECISION`,
            `ALTER TABLE "fin_transactions" ADD COLUMN IF NOT EXISTS "rebillPlanned" BOOLEAN NOT NULL DEFAULT false`,
            `CREATE TABLE IF NOT EXISTS "fin_project_extras" ("id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL REFERENCES "fin_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE, "title" TEXT NOT NULL, "amount" DOUBLE PRECISION NOT NULL, "date" TIMESTAMP(3), "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
            `CREATE INDEX IF NOT EXISTS "fin_project_extras_projectId_idx" ON "fin_project_extras"("projectId")`,
        ],
    },
];
