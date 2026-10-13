import type { Metadata, Viewport } from "next";
import MoneyFormat from "@/components/MoneyFormat";
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
    themeColor: "#0a1814",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="tr" data-theme="dark" suppressHydrationWarning>
            <head><script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("ofis-finans:tema");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}` }} /></head>
            <body>
                {children}
                <RegisterSW />
                <MoneyFormat />
            </body>
        </html>
    );
}
