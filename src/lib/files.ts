/** Fatura dosyası: PDF veya fotoğraf, en fazla 5 MB. Tür ilk baytlardan belirlenir. */
import { sniffImage } from "@/lib/image";

export const INVOICE_MAX_BYTES = 5 * 1024 * 1024;

export function sniffDocument(b: Uint8Array): string | null {
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
    return sniffImage(b);
}

export async function readInvoiceFile(file: FormDataEntryValue | null): Promise<{ bytes: Uint8Array; mime: string; name: string } | { error: string } | null> {
    if (!(file instanceof File) || file.size === 0) return null;
    if (file.size > INVOICE_MAX_BYTES) return { error: "Dosya en fazla 5 MB olabilir" };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniffDocument(bytes);
    if (!mime) return { error: "Yalnızca PDF, JPEG, PNG veya WebP" };
    const name = file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 80) || "fatura";
    return { bytes, mime, name };
}

export function fileResponse(file: { mime: string | null; data: Uint8Array | null; fileName: string | null } | null) {
    if (!file?.data || !file.mime) return new Response("Bulunamadı", { status: 404 });
    return new Response(new Uint8Array(file.data), {
        headers: {
            "Content-Type": file.mime,
            "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName ?? "fatura")}`,
            "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
        },
    });
}
