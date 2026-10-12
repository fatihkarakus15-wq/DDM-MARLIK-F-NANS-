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
        background_color: "#f6f3ed",
        theme_color: "#1a1f2e",
        icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}
