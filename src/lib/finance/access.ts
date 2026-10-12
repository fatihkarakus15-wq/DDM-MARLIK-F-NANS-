/**
 * Finans erişimi: oturum açmış kullanıcı. Sayfalar requireFinancePage (giriş yoksa yönlendirir),
 * Server Action ve Route Handler'lar requireFinance (hata fırlatır) kullanır.
 */
import { redirect } from "next/navigation";
import { dbState } from "@/lib/db-state";
import { getUser } from "@/lib/auth";

export async function requireFinancePage() {
    if ((await dbState()).state !== "ok") redirect("/kurulum");
    const user = await getUser();
    if (!user) redirect("/giris");
    return user;
}

export async function requireFinance() {
    const user = await getUser();
    if (!user) throw new Error("Bu işlem için giriş yapmanız gerekli.");
    return user;
}
