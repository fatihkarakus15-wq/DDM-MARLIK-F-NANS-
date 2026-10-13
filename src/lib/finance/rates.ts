/**
 * Döviz ve altın fiyatları (TL karşılığı). Kaynaklar sırayla denenir:
 *  1. Harem Altın (haremaltin.com panel verisi; döviz + gram/çeyrek/yarım/tam/ata altın, gün içi anlık).
 *     Resmî, belgelenmiş bir API değil: adres `.env` FX_HAREM_URL ile değiştirilebilir, yanıt biçimi
 *     değişirse ayrıştırıcı sessizce boş döner ve yedeğe geçilir. Ayarlar > Kur kaynağını sına ile denenir.
 *  2. TCMB (tcmb.gov.tr/kurlar/today.xml; resmî, iş günü günde bir; yalnızca USD/EUR/GBP).
 *  3. Elle girilen kur (Ayarlar / Yatırımlar): kaynak "manual".
 * Son bilinen değer FinRate'te kalır; kaynak çalışmazsa sayfalar eski değeri "güncel değil" notuyla gösterir.
 * Değerleme "alış" fiyatıyla yapılır (bozdurunca bayinin bize ödeyeceği fiyat).
 */
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayYmd } from "./dates";

export interface RateRow { code: string; name: string; buy: number; sell: number; source: string; fetchedAt: Date; sourceAt: Date | null }
export type RateMap = Record<string, RateRow>;

const HAREM_URL = process.env.FX_HAREM_URL ?? "https://www.haremaltin.com/dashboard/ajax/doviz";
const TCMB_URL = process.env.FX_TCMB_URL ?? "https://www.tcmb.gov.tr/kurlar/today.xml";
const TIMEOUT_MS = 5000;
/** Önceki değerden bu orandan fazla sapan fiyat bozuk sayılır (ayrıştırma hatası koruması) */
const MAX_JUMP = 0.25;
/** Başarısız çekimden sonra aynı sunucu örneği bu süre yeniden denemez */
const RETRY_AFTER_MS = 15_000;

const NAMES: Record<string, string> = {
    USD: "Amerikan doları", EUR: "Euro", GBP: "İngiliz sterlini",
    GRAM_ALTIN: "Gram altın", CEYREK: "Çeyrek altın", YARIM: "Yarım altın", TAM: "Tam altın", ATA: "Ata altın",
};

const HAREM_KEYS: Record<string, string[]> = {
    USD: ["USDTRY"], EUR: ["EURTRY"], GBP: ["GBPTRY"],
    GRAM_ALTIN: ["ALTIN"], CEYREK: ["CEYREK_YENI", "CEYREK"], YARIM: ["YARIM_YENI", "YARIM"], TAM: ["TAM_YENI", "TAM"], ATA: ["ATA_YENI", "ATA"],
};

export interface Quote { code: string; buy: number; sell: number; sourceAt: Date | null }

/** "3.150,50" / "3,150.50" / 3150.5 → sayı; geçersiz ya da ≤ 0 ise null */
export function parseNumber(v: unknown): number | null {
    if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
    if (typeof v !== "string") return null;
    let s = v.trim().replace(/[^\d.,-]/g, "");
    if (!s) return null;
    const dot = s.lastIndexOf("."), comma = s.lastIndexOf(",");
    if (dot >= 0 && comma >= 0) s = dot > comma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
    else if (comma >= 0) s = s.replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** Harem Altın yanıtı: `data` (ya da kök) altında kod → { alis, satis } nesneleri */
export function parseHarem(json: unknown): Quote[] {
    const root = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
    const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
    const upper = new Map<string, Record<string, unknown>>();
    for (const [k, v] of Object.entries(data)) if (v && typeof v === "object") upper.set(k.toUpperCase(), v as Record<string, unknown>);
    const out: Quote[] = [];
    for (const [code, keys] of Object.entries(HAREM_KEYS)) {
        const entry = keys.map(k => upper.get(k)).find(Boolean);
        if (!entry) continue;
        const buy = parseNumber(entry.alis ?? entry.buy ?? entry.bid);
        const sell = parseNumber(entry.satis ?? entry.sell ?? entry.ask);
        const price = buy ?? sell;
        if (!price) continue;
        const stamp = typeof entry.tarih === "string" || typeof entry.time === "string" ? new Date(String(entry.tarih ?? entry.time)) : null;
        out.push({ code, buy: buy ?? price, sell: sell ?? price, sourceAt: stamp && !Number.isNaN(stamp.getTime()) ? stamp : null });
    }
    return out;
}

/** TCMB today.xml: ForexBuying / ForexSelling */
export function parseTcmb(xml: string): Quote[] {
    const out: Quote[] = [];
    const re = /<Currency\b[^>]*\bCurrencyCode="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g;
    for (let m = re.exec(xml); m; m = re.exec(xml)) {
        if (!["USD", "EUR", "GBP"].includes(m[1])) continue;
        const buy = parseNumber(/<ForexBuying>([^<]*)<\/ForexBuying>/.exec(m[2])?.[1]);
        const sell = parseNumber(/<ForexSelling>([^<]*)<\/ForexSelling>/.exec(m[2])?.[1]);
        if (buy && sell) out.push({ code: m[1], buy, sell, sourceAt: null });
    }
    return out;
}

export interface SourceProbe { source: string; ok: boolean; status: number | null; ms: number; codes: string[]; sample: string; error?: string }

async function fetchHarem(): Promise<{ quotes: Quote[]; probe: SourceProbe }> {
    const t0 = Date.now();
    const probe: SourceProbe = { source: "haremaltin", ok: false, status: null, ms: 0, codes: [], sample: "" };
    try {
        const res = await fetch(HAREM_URL, {
            method: "POST", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest",
                Referer: "https://www.haremaltin.com/", Accept: "application/json, text/javascript, */*; q=0.01", "User-Agent": "Mozilla/5.0 (compatible; OfisFinans)",
            },
            body: "dil_kodu=tr",
        });
        probe.status = res.status;
        const text = await res.text();
        probe.sample = text.slice(0, 300);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const quotes = parseHarem(JSON.parse(text));
        probe.codes = quotes.map(q => q.code);
        probe.ok = quotes.length > 0;
        if (!probe.ok) probe.error = "Yanıt alındı ama tanınan fiyat bulunamadı (biçim değişmiş olabilir).";
        probe.ms = Date.now() - t0;
        return { quotes, probe };
    } catch (err) {
        probe.error = err instanceof Error ? err.message : "Bağlantı kurulamadı";
        probe.ms = Date.now() - t0;
        return { quotes: [], probe };
    }
}

async function fetchTcmb(): Promise<{ quotes: Quote[]; probe: SourceProbe }> {
    const t0 = Date.now();
    const probe: SourceProbe = { source: "tcmb", ok: false, status: null, ms: 0, codes: [], sample: "" };
    try {
        const res = await fetch(TCMB_URL, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
        probe.status = res.status;
        const text = await res.text();
        probe.sample = text.slice(0, 300);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const quotes = parseTcmb(text);
        probe.codes = quotes.map(q => q.code);
        probe.ok = quotes.length > 0;
        if (!probe.ok) probe.error = "Yanıtta USD/EUR/GBP bulunamadı.";
        probe.ms = Date.now() - t0;
        return { quotes, probe };
    } catch (err) {
        probe.error = err instanceof Error ? err.message : "Bağlantı kurulamadı";
        probe.ms = Date.now() - t0;
        return { quotes: [], probe };
    }
}

/** Ayarlar > Kur kaynağını sına: iki kaynağı da dener, kaydetmez */
export async function probeSources() {
    const [h, t] = await Promise.all([fetchHarem(), fetchTcmb()]);
    return [h.probe, t.probe];
}

export async function loadRates(): Promise<RateMap> {
    const rows = await prisma.finRate.findMany();
    return Object.fromEntries(rows.map(r => [r.code, r]));
}

export interface RefreshResult { ok: boolean; updated: string[]; sources: string[]; errors: string[] }

async function persist(quotes: Quote[], source: string, previous: RateMap, errors: string[]) {
    const now = new Date();
    const day = new Date(`${todayYmd()}T00:00:00Z`);
    const good = quotes.filter(q => {
        const prev = previous[q.code];
        if (prev && prev.buy > 0 && Math.abs(q.buy / prev.buy - 1) > MAX_JUMP) { errors.push(`${q.code}: ${source} fiyatı öncekinden %${Math.round(Math.abs(q.buy / prev.buy - 1) * 100)} farklı, atlandı`); return false; }
        return true;
    });
    if (good.length === 0) return [];
    const dailyRows = await prisma.finRateDaily.findMany({ where: { day, code: { in: good.map(q => q.code) } } });
    const daily = new Map(dailyRows.map(d => [d.code, d]));
    await prisma.$transaction(good.flatMap(q => [
        prisma.finRate.upsert({
            where: { code: q.code },
            create: { code: q.code, name: NAMES[q.code] ?? q.code, buy: q.buy, sell: q.sell, source, fetchedAt: now, sourceAt: q.sourceAt },
            update: { buy: q.buy, sell: q.sell, source, fetchedAt: now, sourceAt: q.sourceAt },
        }),
        prisma.finRateDaily.upsert({
            where: { code_day: { code: q.code, day } },
            create: { code: q.code, day, buy: q.buy, sell: q.sell, low: q.buy, high: q.buy },
            update: { buy: q.buy, sell: q.sell, low: Math.min(daily.get(q.code)?.low ?? q.buy, q.buy), high: Math.max(daily.get(q.code)?.high ?? q.buy, q.buy) },
        }),
    ]));
    return good.map(q => q.code);
}

let inflight: Promise<RefreshResult> | null = null;
let lastFailAt = 0;

/** Kaynaklardan güncel fiyatları çekip kaydeder. Aynı anda tek çekim yapılır. */
export function refreshRates(): Promise<RefreshResult> {
    inflight ??= (async (): Promise<RefreshResult> => {
        const errors: string[] = [];
        const sources: string[] = [];
        const updated = new Set<string>();
        const previous = await loadRates();
        const harem = await fetchHarem();
        if (harem.probe.ok) { sources.push("haremaltin"); (await persist(harem.quotes, "haremaltin", previous, errors)).forEach(c => updated.add(c)); }
        else errors.push(`Harem Altın: ${harem.probe.error}`);
        // Döviz Harem'den gelmediyse resmî kura düş
        if (!["USD", "EUR", "GBP"].every(c => updated.has(c))) {
            const tcmb = await fetchTcmb();
            if (tcmb.probe.ok) {
                sources.push("tcmb");
                (await persist(tcmb.quotes.filter(q => !updated.has(q.code)), "tcmb", previous, errors)).forEach(c => updated.add(c));
            } else errors.push(`TCMB: ${tcmb.probe.error}`);
        }
        if (updated.size === 0) lastFailAt = Date.now();
        return { ok: updated.size > 0, updated: [...updated], sources, errors };
    })().finally(() => { inflight = null; });
    return inflight;
}

/** Fiyatlar `maxAgeSec`'ten eskiyse yeniler (hata atmaz); güncel kur haritasını döndürür */
export async function ensureFreshRates(maxAgeSec = 60, wait = false): Promise<RateMap> {
    let rates = await loadRates();
    const newest = Math.max(0, ...Object.values(rates).map(r => r.fetchedAt.getTime()));
    if (Date.now() - newest > maxAgeSec * 1000 && Date.now() - lastFailAt > RETRY_AFTER_MS) {
        // Sayfa dış kaynağı beklemesin: eski kurla açılır, yenileme yanıttan sonra yapılır (hiç kur yoksa beklenir)
        if (wait || newest === 0) {
            const r = await refreshRates().catch(() => null);
            if (r?.ok) rates = await loadRates();
        } else {
            try { after(() => refreshRates().catch(() => null)); } catch { /* istek dışı çağrı */ }
        }
    }
    return rates;
}

/** Elle kur girişi (kaynak çalışmazken ya da kaynağı olmayan varlık için) */
export async function setManualRate(code: string, buy: number, sell: number) {
    const now = new Date();
    const day = new Date(`${todayYmd()}T00:00:00Z`);
    await prisma.$transaction([
        prisma.finRate.upsert({
            where: { code }, create: { code, name: NAMES[code] ?? code, buy, sell, source: "manual", fetchedAt: now },
            update: { buy, sell, source: "manual", fetchedAt: now, sourceAt: null },
        }),
        prisma.finRateDaily.upsert({
            where: { code_day: { code, day } }, create: { code, day, buy, sell, low: buy, high: buy },
            update: { buy, sell },
        }),
    ]);
}

/** 1 birimin TL karşılığı (alış). TL için 1; kur yoksa null */
export function rateTRY(code: string, rates: RateMap, side: "buy" | "sell" = "buy"): number | null {
    if (code === "TRY") return 1;
    const r = rates[code];
    return r ? r[side] : null;
}

/** Tutarı TL'ye çevirir; kur yoksa null */
export function toTRY(amount: number, currency: string, rates: RateMap): number | null {
    const r = rateTRY(currency, rates);
    return r == null ? null : amount * r;
}

/** Kur bilgisi bu kadar saatten eskiyse "güncel değil" */
export const isStale = (row: RateRow | undefined, hours = 36) => !row || Date.now() - row.fetchedAt.getTime() > hours * 3_600_000;

/** İstemciye giden biçim ("güncel değil" sunucuda hesaplanır) */
export const toDTO = (r: RateRow) => ({ code: r.code, name: r.name, buy: r.buy, sell: r.sell, source: r.source, fetchedAt: r.fetchedAt.toISOString(), stale: isStale(r) });

export const SOURCE_LABEL: Record<string, string> = { haremaltin: "Harem Altın", tcmb: "TCMB", manual: "Elle girildi" };
