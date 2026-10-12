/** Görsel yardımcıları: shrinkImage tarayıcıda, sniffImage sunucuda kullanılır */
/** Tarayıcıda fotoğrafı en uzun kenarı 1600 px olacak şekilde JPEG'e çevirir (telefon fotoğrafları çok büyük) */
export async function shrinkImage(file: File, maxSide = 1600): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Fotoğraf işlenemedi"))), "image/jpeg", 0.82));
}

/** Dosya türünü ilk baytlardan belirler (sunucu tarafı) */
export function sniffImage(b: Uint8Array): string | null {
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
    return null;
}
