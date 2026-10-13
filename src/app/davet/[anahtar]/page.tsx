import { PasskeyRegister } from "@/components/PasskeyButtons";
import { inviteUser } from "@/lib/passkey";

export const dynamic = "force-dynamic";
export const metadata = { title: "Davet" };

/** Davet bağlantısı: telefonun yüz/parmak izi kaydedilir, şifre gerekmez */
export default async function Davet({ params }: { params: Promise<{ anahtar: string }> }) {
    const { anahtar } = await params;
    const user = await inviteUser(anahtar);
    return (
        <main className="gate">
            <div className="gate-card">
                <div className="gate-mark" aria-hidden="true" />
                <h1>Ofis Finans</h1>
                {user ? (
                    <>
                        <p>Merhaba{user.name ? ` ${user.name}` : ""}. Bu telefonda yüzünüzü (ya da parmak izinizi) kaydedin; bundan sonra şifre yerine onunla girersiniz.</p>
                        <p className="muted">Telefonunuzun ekran kilidi (yüz tanıma veya parmak izi) kurulu olmalı. Yüz bilgisi telefonunuzdan çıkmaz.</p>
                        <PasskeyRegister davet={anahtar} label="Yüzümü kaydet ve gir" />
                    </>
                ) : <p className="adm-flash error">Bu davet bağlantısı geçersiz ya da süresi dolmuş. Yeni bağlantı isteyin.</p>}
            </div>
        </main>
    );
}
