// GET /ek/[id] — fiş / fatura dosyası (yalnızca finans yetkili yönetici)
import { prisma } from "@/lib/prisma";
import { requireFinance } from "@/lib/finance/access";
import { fileResponse } from "@/lib/files";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        await requireFinance();
    } catch {
        return new Response("Yetkisiz", { status: 401 });
    }
    const { id } = await params;
    const file = await prisma.finAttachment.findUnique({ where: { id }, select: { mime: true, data: true, name: true } });
    return fileResponse(file && { mime: file.mime, data: file.data, fileName: file.name });
}
