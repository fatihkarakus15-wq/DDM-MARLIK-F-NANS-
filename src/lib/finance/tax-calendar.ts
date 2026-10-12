/**
 * Vergi ve SGK takvimi (hatırlatma). Tarihler hafta sonuna denk gelirse sonraki pazartesiye kaydırılır;
 * resmî tatiller hesaba katılmaz. Mükellefiyet türüne (şahıs / kurum) göre değişebilir: mali müşavirle doğrulayın.
 */
import { addDays } from "./dates";

export interface TaxItem { date: Date; title: string; note: string }

const at = (y: number, m: number, d: number) => {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(d, last), 12));
};
const workday = (d: Date) => { const w = d.getUTCDay(); return w === 6 ? addDays(d, 2) : w === 0 ? addDays(d, 1) : d; };

export function upcomingTaxes(from: Date, days = 120): TaxItem[] {
    const to = addDays(from, days);
    const out: TaxItem[] = [];
    const add = (date: Date, title: string, note: string) => { const d = workday(date); if (d >= from && d <= to) out.push({ date: d, title, note }); };
    for (let i = -1; i <= Math.ceil(days / 28) + 1; i++) {
        const y = from.getUTCFullYear(), m = from.getUTCMonth() + i;
        add(at(y, m, 26), "Muhtasar ve prim hizmet beyannamesi", "Önceki ayın stopaj ve SGK bildirgesi (ayın 26'sı)");
        add(at(y, m + 1, 0), "SGK prim ödemesi", "Önceki ayın primi (ayın son günü)");
        add(at(y, m, 28), "KDV beyanı ve ödemesi", "Önceki ayın KDV'si (ayın 28'i)");
    }
    for (const y of [from.getUTCFullYear(), from.getUTCFullYear() + 1]) {
        add(at(y, 4, 17), "Geçici vergi (1. dönem)", "Ocak–Mart dönemi (17 Mayıs)");
        add(at(y, 7, 17), "Geçici vergi (2. dönem)", "Nisan–Haziran dönemi (17 Ağustos)");
        add(at(y, 10, 17), "Geçici vergi (3. dönem)", "Temmuz–Eylül dönemi (17 Kasım)");
        add(at(y, 2, 31), "Gelir vergisi yıllık beyanname", "Şahıs işletmeleri: Mart ayı sonuna kadar (1. taksit Mart, 2. taksit Temmuz)");
        add(at(y, 6, 31), "Gelir vergisi 2. taksit", "Şahıs işletmeleri (Temmuz sonu)");
        add(at(y, 3, 25), "Kurumlar vergisi yıllık beyanname", "Şirketler: takvim yılı hesap dönemi için 25 Nisan");
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
