// POST /api/ek — mevcut harekete fiş / fatura dosyası ekler (multipart: transactionId, files[])
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { FormError } from "@/lib/form";
import { requireFinance } from "@/lib/finance/access";
import { readFiles } from "@/lib/finance/transactions";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: NextRequest) {
    try {
        await requireFinance();
    } catch {
        return fail("Yönetici girişi gerekli", 401);
    }
    const form = await request.formData().catch(() => null);
    if (!form) return fail("Form okunamadı");
    const transactionId = String(form.get("transactionId") ?? "");
    const tx = await prisma.finTransaction.findUnique({ where: { id: transactionId }, select: { id: true, _count: { select: { attachments: true } } } });
    if (!tx) return fail("Hareket bulunamadı", 404);
    try {
        const files = await readFiles(form);
        if (files.length === 0) return fail("Dosya seçin");
        if (tx._count.attachments + files.length > 10) return fail("Bir harekete en çok 10 dosya eklenebilir");
        await prisma.finAttachment.createMany({ data: files.map(f => ({ transactionId, name: f.name, mime: f.mime, size: f.size, data: Buffer.from(f.bytes) })) });
        revalidatePath(`/hareketler/${transactionId}`);
        return NextResponse.json({ success: true, count: files.length });
    } catch (err) {
        if (err instanceof FormError) return fail(err.message);
        console.error(err);
        return fail("Dosya eklenemedi", 500);
    }
}
