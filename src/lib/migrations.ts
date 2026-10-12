/**
 * Veritabanı göçleri. Uygulama ilk açılışta /kurulum ekranından, güncelleme gerektiğinde aynı ekrandan çalıştırır.
 * Yeni bir göç eklemek için: prisma/schema.prisma'yı değiştir, `statements` içine yalnızca ekleme yapan SQL'i
 * (CREATE TABLE, ALTER TABLE ... ADD COLUMN ...) yaz ve diziye YENİ bir id ile ekle. Eski göçleri değiştirme.
 */
import { BASELINE_SQL } from "./baseline-sql";

export interface Migration { id: string; statements: string[] }

export const MIGRATIONS: Migration[] = [
    { id: "001-baslangic", statements: BASELINE_SQL },
];
