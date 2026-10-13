// GET /api/kur — güncel döviz / altın fiyatları (yatırımlar sayfası ve özet şeridi her ~20 sn'de çağırır)
// Veri 20 saniyeden eskiyse kaynaktan yenilenir; kaynak çalışmazsa son bilinen değer döner.
import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/finance/access";
import { ensureFreshRates, toDTO } from "@/lib/finance/rates";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        await requireFinance();
    } catch {
        return NextResponse.json({ success: false, error: "Yönetici girişi gerekli" }, { status: 401 });
    }
    const rates = await ensureFreshRates(20, true);
    return NextResponse.json({
        success: true,
        rates: Object.values(rates).map(toDTO),
    });
}
