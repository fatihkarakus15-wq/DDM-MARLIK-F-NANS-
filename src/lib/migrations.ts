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
    {
        id: "005-harcayan-kisi",
        statements: [`ALTER TABLE "fin_transactions" ADD COLUMN IF NOT EXISTS "spenderId" TEXT`],
    },
    {
        id: "006-hesapsiz-harcamalar-odendi",
        // Tuş takımından hesapsız girilen proje / ofis harcamaları "vadeli" kalmıştı ve Vadeler listesini dolduruyordu: ödendi sayılır
        statements: [`UPDATE "fin_transactions" SET "status" = 'DONE' WHERE "status" = 'PLANNED' AND "type" = 'EXPENSE' AND "accountId" IS NULL AND "contactId" IS NULL AND "recurringId" IS NULL AND NOT EXISTS (SELECT 1 FROM "fin_cheques" c WHERE c."transactionId" = "fin_transactions"."id")`],
    },
    {
        id: "007-takvim",
        statements: [
            `CREATE TABLE IF NOT EXISTS "fin_events" ("id" TEXT NOT NULL PRIMARY KEY, "ledgerId" TEXT NOT NULL REFERENCES "fin_ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE, "title" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'DIGER', "date" TIMESTAMP(3) NOT NULL, "startTime" TEXT, "endTime" TEXT, "location" TEXT, "note" TEXT, "projectId" TEXT REFERENCES "fin_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE, "assigneeId" TEXT, "done" BOOLEAN NOT NULL DEFAULT false, "createdBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
            `CREATE INDEX IF NOT EXISTS "fin_events_ledgerId_date_idx" ON "fin_events"("ledgerId", "date")`,
        ],
    },
    {
        id: "008-bildirimler",
        statements: [
            `ALTER TABLE "fin_events" ADD COLUMN IF NOT EXISTS "remindMin" INTEGER`,
            `ALTER TABLE "fin_events" ADD COLUMN IF NOT EXISTS "remindedAt" TIMESTAMP(3)`,
            `CREATE TABLE IF NOT EXISTS "app_push_config" ("id" TEXT NOT NULL PRIMARY KEY, "publicKey" TEXT NOT NULL, "privateKey" TEXT NOT NULL, "lastDigest" TEXT)`,
            `CREATE TABLE IF NOT EXISTS "app_push_subs" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE, "endpoint" TEXT NOT NULL, "p256dh" TEXT NOT NULL, "auth" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
            `CREATE UNIQUE INDEX IF NOT EXISTS "app_push_subs_endpoint_key" ON "app_push_subs"("endpoint")`,
            `CREATE INDEX IF NOT EXISTS "app_push_subs_userId_idx" ON "app_push_subs"("userId")`,
        ],
    },
];
