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

// Bildirimler (Web Push): sunucudan gelen başlık / metin gösterilir, dokununca ilgili sayfa açılır
self.addEventListener("push", event => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Ofis Finans", body: event.data ? event.data.text() : "" }; }
    event.waitUntil(self.registration.showNotification(data.title || "Ofis Finans", {
        body: data.body || "", tag: data.tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: data.url || "/takvim" },
    }));
});

self.addEventListener("notificationclick", event => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || "/takvim";
    event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
        for (const c of list) { if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
        return self.clients.openWindow(url);
    }));
});
