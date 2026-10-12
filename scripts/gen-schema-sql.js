/**
 * Başlangıç şemasının SQL ifadelerini src/lib/baseline-sql.ts'e yazar (prisma migrate diff --from-empty).
 * YALNIZCA ilk kurulum içindir: yayınlanmış bir veritabanı için bu dosya değişmez.
 * Şemaya sonradan eklenen her şey src/lib/migrations.ts'e yeni bir göç olarak yazılır (README: "Şema değişikliği").
 * Kullanım: npm run sql
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = execFileSync('npx', ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'postgresql://u:p@localhost:5432/x' },
});
const body = out.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const statements = body.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
if (!statements.every(s => /^(CREATE|ALTER)\b/.test(s)) || statements.some(s => /\bDROP\b|\bTRUNCATE\b/.test(s))) {
    throw new Error('Beklenmeyen SQL ifadesi: yalnızca CREATE / ALTER ... ADD CONSTRAINT olmalı.');
}
const file = `/**
 * Başlangıç şeması (prisma migrate diff çıktısı). Elle düzenleme: scripts/gen-schema-sql.js üretir.
 * Yalnızca ilk kurulumda çalışır (migrations.ts "001-baslangic"); yayınlanmış veritabanı için değiştirilmez.
 */
export const BASELINE_SQL: string[] = [
${statements.map(s => '    ' + JSON.stringify(s) + ',').join('\n')}
];
`;
fs.writeFileSync(path.join(root, 'src/lib/baseline-sql.ts'), file);
console.log(`${statements.length} ifade yazıldı (${statements.filter(s => s.startsWith('CREATE TABLE')).length} tablo).`);
