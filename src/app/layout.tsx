import type { Metadata, Viewport } from "next";
import RegisterSW from "@/components/RegisterSW";
import "./globals.css";

export const metadata: Metadata = {
    title: { default: "Ofis Finans", template: "%s · Ofis Finans" },
    description: "Gelir-gider, projeler, vadeler, nakit akışı ve yatırımlar",
    applicationName: "Ofis Finans",
    appleWebApp: { capable: true, title: "Finans", statusBarStyle: "black-translucent" },
    robots: { index: false, follow: false },
    formatDetection: { telephone: false },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: "#1a1f2e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="tr">
            <body>
                {children}
                <RegisterSW />
            </body>
        </html>
    );
}
