import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/** Güvenlik başlıkları: uygulama dış betik yüklemez; kur çekimi sunucudan yapılır. */
const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "worker-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
].join("; ");

const securityHeaders = [
    { key: "Content-Security-Policy", value: csp },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
    // Finans verisi arama motorlarına açılmasın
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
    headers() {
        return [
            { source: "/:path*", headers: securityHeaders },
            // Service worker her zaman güncel alınsın
            { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
        ];
    },
};

export default nextConfig;
