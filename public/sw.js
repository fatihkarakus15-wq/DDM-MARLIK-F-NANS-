/**
 * Service worker: yalnızca kabuk dosyalarını (/_next/static, ikonlar) önbelleğe alır; sayfalar ve veriler
 * HİÇBİR ZAMAN önbelleğe alınmaz (finans verisi telefonda saklanmasın). Çevrimdışıyken kısa bir bilgi sayfası gösterilir.
 */
const CACHE = "ofis-finans-kabuk-v1";

self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE).then(c => c.addAll(["/offline.html", "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== location.origin) return;
    if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
        event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
            if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
            return res;
        })));
        return;
    }
    if (req.mode === "navigate") event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
});
