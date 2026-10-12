/**
 * İstek sınırı (sunucu, bellek içi). Her sunucu örneği kendi sayacını tutar; Vercel'de sıcak
 * örnekler yeniden kullanıldığı için art arda gelen deneme saldırılarını keser, ama kesin
 * bir global sınır değildir. Kalıcı sınır gereken yerde (şifre sıfırlama, iletişim formu)
 * ayrıca veritabanındaki kayıt sayısı kontrol edilir.
 */
import { createHash } from "crypto";
import { NextResponse } from "next/server";

interface Bucket { count: number; resetAt: number }

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

/** Pencere içinde `limit` isteğe izin verir; aşılırsa kalan saniyeyi döndürür */
export function rateLimit(key: string, limit: number, windowSec: number): { ok: true } | { ok: false; retryAfter: number } {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
        if (buckets.size >= MAX_KEYS) prune(now);
        bucket = { count: 0, resetAt: now + windowSec * 1000 };
        buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
    return { ok: true };
}

/** Başarılı girişten sonra sayaç sıfırlanır (ör. doğru şifre) */
export function resetLimit(key: string) {
    buckets.delete(key);
}

function prune(now: number) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    // Hâlâ doluysa en eski anahtarlar atılır
    if (buckets.size >= MAX_KEYS) {
        const drop = buckets.size - MAX_KEYS + 1000;
        let i = 0;
        for (const k of buckets.keys()) { if (i++ >= drop) break; buckets.delete(k); }
    }
}

/** İstemci IP'sinin özeti (ham IP hiçbir yerde tutulmaz) */
export function ipKey(request: Request) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "yerel";
    return createHash("sha256").update(`${ip}|${process.env.JWT_SECRET ?? ""}`).digest("hex").slice(0, 32);
}

export function tooMany(retryAfter: number, error = "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.") {
    return NextResponse.json({ success: false, error }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
}

/**
 * Birden çok sınırı sırayla uygular; ilk aşılan sınır için 429 yanıtı döner, hepsi geçerse null.
 * Örnek: `limitOrNull([[`login:ip:${ip}`, 30, 900], [`login:mail:${email}`, 8, 900]])`
 */
export function limitOrNull(rules: [key: string, limit: number, windowSec: number][], error?: string) {
    for (const [key, limit, windowSec] of rules) {
        const r = rateLimit(key, limit, windowSec);
        if (!r.ok) return tooMany(r.retryAfter, error);
    }
    return null;
}
