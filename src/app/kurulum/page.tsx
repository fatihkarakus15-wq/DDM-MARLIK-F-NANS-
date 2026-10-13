import { redirect } from "next/navigation";
import AdminForm, { SubmitButton } from "@/components/AdminForm";
import { dbState, hasUsers } from "@/lib/db-state";
import { createOwner, setupDatabase } from "../giris/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kurulum" };

/** İlk kurulum: veritabanı tabloları, sonra tek kullanıcı. İkisi de SETUP_KEY ister (adresi bulan biri hesabı ele geçiremesin). */
export default async function Kurulum() {
    let state: Awaited<ReturnType<typeof dbState>>;
    try {
        state = await dbState();
    } catch (err) {
        // Bağlantı bilgisi sızmasın: adresler ve şifre benzeri kısımlar silinir
        const reason = (err instanceof Error ? err.message : String(err)).split("\n").map(l => l.trim()).filter(Boolean).pop()?.replace(/\S+:\/\/\S+/g, "[adres]").slice(0, 160) ?? "bilinmeyen hata";
        return (
            <main className="gate"><div className="gate-card">
                <h1>Veritabanına bağlanılamadı</h1>
                <p className="adm-flash error">Neden: {reason}</p>
                <p>Vercel proje ayarlarında <code>DATABASE_URL</code> değişkenini kontrol edin (Supabase &quot;Connection pooling&quot; bağlantı adresi) ve yeniden dağıtın.</p>
            </div></main>
        );
    }
    const keyMissing = !process.env.SETUP_KEY || process.env.SETUP_KEY.length < 12 || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16;
    if (!keyMissing && state.state === "ok" && (await hasUsers())) redirect("/giris");

    return (
        <main className="gate">
            <div className="gate-card">
                <div className="gate-mark" aria-hidden="true" />
                <h1>Kurulum</h1>
                {keyMissing ? (
                    <>
                        <p>Başlamadan önce Vercel proje ayarlarında (Settings › Environment Variables) şu değişkenleri tanımlayıp yeniden dağıtın:</p>
                        <ul className="setup-list">
                            <li><code>DATABASE_URL</code>: Supabase bağlantı adresi</li>
                            <li><code>JWT_SECRET</code>: en az 16 karakterlik rastgele bir metin</li>
                            <li><code>SETUP_KEY</code>: en az 12 karakterlik, yalnızca sizin bileceğiniz kurulum anahtarı</li>
                        </ul>
                        <p className="muted">Ayrıntı: README.md</p>
                    </>
                ) : state.state !== "ok" ? (
                    <>
                        <p>{state.state === "empty" ? "Veritabanında tablolar henüz yok. Tek adımda oluşturulur; hata olursa hiçbir şey eklenmeden geri alınır." : "Veritabanı güncellemesi bekliyor. Mevcut veriye dokunmadan eklenir."}</p>
                        <AdminForm action={setupDatabase} className="adm-form">
                            <label className="adm-field"><span className="adm-label">Kurulum anahtarı (SETUP_KEY)</span><input name="key" type="password" autoComplete="off" required /></label>
                            <SubmitButton className="btn btn-dark" pendingText="Kuruluyor…">{state.state === "empty" ? "Tabloları oluştur" : "Veritabanını güncelle"}</SubmitButton>
                        </AdminForm>
                    </>
                ) : (
                    <>
                        <p>Tablolar hazır. Şimdi kendi hesabınızı oluşturun; uygulamaya yalnızca bu hesapla girilir.</p>
                        <AdminForm action={createOwner} className="adm-form">
                            <label className="adm-field"><span className="adm-label">Kurulum anahtarı (SETUP_KEY)</span><input name="key" type="password" autoComplete="off" required /></label>
                            <label className="adm-field"><span className="adm-label">Adınız</span><input name="name" autoComplete="name" /></label>
                            <label className="adm-field"><span className="adm-label">E-posta</span><input name="email" type="email" autoComplete="username" inputMode="email" required /></label>
                            <label className="adm-field"><span className="adm-label">Şifre (en az 10 karakter)</span><input name="password" type="password" autoComplete="new-password" minLength={10} required /></label>
                            <label className="adm-field"><span className="adm-label">Şifre (tekrar)</span><input name="again" type="password" autoComplete="new-password" minLength={10} required /></label>
                            <SubmitButton className="btn btn-dark" pendingText="Oluşturuluyor…">Hesabı oluştur ve gir</SubmitButton>
                        </AdminForm>
                    </>
                )}
            </div>
        </main>
    );
}
