"use server";
import { revalidatePath } from "next/cache";
import { run, str, type ActionState } from "@/lib/form";
import { requireFinance } from "@/lib/finance/access";
import { activeLedger } from "@/lib/finance/ledger";
import { importLegacyProject } from "@/lib/finance/legacy-import";
import { LEGACY_IMPORTS } from "@/lib/finance/legacy-imports";
import { FormError } from "@/lib/form";
import { tl0 } from "@/lib/finance/money";

export async function importLegacy(_: ActionState, fd: FormData): Promise<ActionState> {
    return run(async () => {
        await requireFinance();
        const pack = LEGACY_IMPORTS.find(p => p.key === str(fd, "key"));
        if (!pack) throw new FormError("Paket bulunamadı.");
        const { ledger } = await activeLedger();
        const r = await importLegacyProject(ledger.id, pack);
        revalidatePath("/", "layout");
        const notes = [r.missingCats.length ? `Kalem bulunamadı (kalemsiz girildi): ${r.missingCats.join(", ")}.` : "", r.missingUsers.length ? `Kullanıcı bulunamadı (harcayan boş): ${r.missingUsers.join(", ")}.` : ""].filter(Boolean).join(" ");
        return `Eklendi: ${r.expenses} harcama (${tl0(r.spent)}), tahsilat ${tl0(r.collected)}. ${notes}`.trim();
    });
}
