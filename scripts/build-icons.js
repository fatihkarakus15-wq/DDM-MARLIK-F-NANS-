/**
 * Uygulama ikonlarını üretir (sharp gerekir: `npm i --no-save sharp`):
 *   public/icons/icon-192.png, icon-512.png, mark.svg · src/app/icon.png, apple-icon.png
 * Kullanım: node scripts/build-icons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const NAVY = '#1a1f2e', GOLD = '#c9a96e', CREAM = '#f6f3ed';
// 512 × 512; içerik ortadaki %80'lik güvenli alanda (maskable ikon kırpılsa da bozulmaz)
const bars = [[148, 270, 56, 110], [228, 210, 56, 170], [308, 140, 56, 240]]
    .map(([x, y, w, h]) => `<path d="M${x},${y + h} V${y + 14} Q${x},${y} ${x + 14},${y} H${x + w - 14} Q${x + w},${y} ${x + w},${y + 14} V${y + h} Z" fill="${GOLD}"/>`).join('');
const baseline = `<rect x="128" y="394" width="256" height="8" rx="4" fill="${CREAM}" opacity=".45"/>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${NAVY}"/>${bars}${baseline}</svg>`;
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="120 120 272 290">${bars}${baseline}</svg>`;

(async () => {
    fs.writeFileSync(path.join(root, 'public/icons/mark.svg'), mark);
    const png = (size, file) => sharp(Buffer.from(icon)).resize(size, size).png().toFile(path.join(root, file));
    await png(192, 'public/icons/icon-192.png');
    await png(512, 'public/icons/icon-512.png');
    await png(180, 'src/app/apple-icon.png');
    await png(64, 'src/app/icon.png');
    console.log('ikonlar yazıldı');
})();
