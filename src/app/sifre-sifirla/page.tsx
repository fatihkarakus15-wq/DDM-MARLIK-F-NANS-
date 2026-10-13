import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { resetOwnerPassword } from "@/app/giris/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Şifre yenile" };

/** Şifreyi unutan hesap sahibi için: Vercel'deki SETUP_KEY ile yeni şifre belirlenir */
export default function SifreSifirla() {
    return (
        <main className="gate">
            <div className="gate-card">
                <div className="gate-mark" aria-hidden="true" />
                <h1>Şifre yenile</h1>
                <p className="muted">Kurulum anahtarını (Vercel &gt; Environment Variables &gt; SETUP_KEY) yazın, yeni şifre belirleyin.</p>
                <AdminForm action={resetOwnerPassword} className="adm-form">
                    <label className="adm-field"><span className="adm-label">Kurulum anahtarı (SETUP_KEY)</span><input name="key" type="password" autoComplete="off" required /></label>
                    <label className="adm-field"><span className="adm-label">E-posta (isteğe bağlı; boşsa değişmez)</span><input name="email" type="email" inputMode="email" autoComplete="username" /></label>
                    <label className="adm-field"><span className="adm-label">Yeni şifre (en az 10 karakter)</span><input name="password" type="password" autoComplete="new-password" required minLength={10} /></label>
                    <label className="adm-field"><span className="adm-label">Yeni şifre (tekrar)</span><input name="again" type="password" autoComplete="new-password" required minLength={10} /></label>
                    <SubmitButton className="btn btn-dark" pendingText="Kaydediliyor…">Şifreyi yenile ve gir</SubmitButton>
                </AdminForm>
            </div>
        </main>
    );
}
