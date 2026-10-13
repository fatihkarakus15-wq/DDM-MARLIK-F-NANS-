// POST /api/hareket — hareket oluşturur / günceller (multipart: form alanları + files[])
// Fiş / fatura dosyası 1 MB'yi aşabildiği için Server Action değil. Yalnızca finans yetkili yönetici.
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { FormError } from "@/lib/form";
import { requireFinance } from "@/lib/finance/access";
import { saveTransaction } from "@/lib/finance/transactions";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: NextRequest) {
    let admin;
    try {
        admin = await requireFinance();
    } catch {
        return fail("Yönetici girişi gerekli", 401);
    }
    const form = await request.formData().catch(() => null);
    if (!form) return fail("Form okunamadı");
    // Yeni giderde harcayan belirtilmediyse giriş yapan kişidir
    if (!form.get("id") && !form.get("spenderId")) form.set("spenderId", admin.id);
    try {
        const id = await saveTransaction(form, admin.name ?? admin.email);
        revalidatePath("/", "layout");
        return NextResponse.json({ success: true, id });
    } catch (err) {
        if (err instanceof FormError) return fail(err.message);
        console.error(err);
        return fail("Hareket kaydedilemedi", 500);
    }
}
