import { redirect } from "next/navigation";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { getUser } from "@/lib/auth";
import { dbState, hasUsers } from "@/lib/db-state";
import Link from "next/link";
import { login } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Giriş" };

export default async function Giris() {
    if ((await dbState()).state !== "ok" || !(await hasUsers())) redirect("/kurulum");
    if (await getUser()) redirect("/");
    return (
        <main className="gate">
            <div className="gate-card">
                <div className="gate-mark" aria-hidden="true" />
                <h1>Ofis Finans</h1>
                <p className="muted">Devam etmek için giriş yapın.</p>
                <AdminForm action={login} className="adm-form">
                    <label className="adm-field"><span className="adm-label">E-posta</span><input name="email" type="email" autoComplete="username" inputMode="email" required autoFocus /></label>
                    <label className="adm-field"><span className="adm-label">Şifre</span><input name="password" type="password" autoComplete="current-password" required /></label>
                    <SubmitButton className="btn btn-dark" pendingText="Giriş yapılıyor…">Giriş yap</SubmitButton>
                </AdminForm>
                <p className="muted" style={{ marginTop: 14 }}><Link className="adm-link" href="/sifre-sifirla">Şifremi unuttum</Link></p>
            </div>
        </main>
    );
}
