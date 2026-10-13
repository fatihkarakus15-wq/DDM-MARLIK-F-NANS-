import type { MetadataRoute } from "next";

/** Telefona kurulabilir uygulama bildirimi (PWA) */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Ofis Finans",
        short_name: "Finans",
        description: "Gelir-gider, projeler, vadeler, nakit akışı ve yatırımlar",
        lang: "tr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#06120f",
        theme_color: "#0a1814",
        icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}
