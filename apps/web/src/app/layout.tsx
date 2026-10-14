import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { readLocale } from "@/i18n/request";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-figtree",
});

export const metadata: Metadata = {
  title: { default: "Pocketly", template: "%s · Pocketly" },
  description: "Budget multi-conto: ogni euro riceve una destinazione",
  applicationName: "Pocketly",
  appleWebApp: { capable: true, title: "Pocketly", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdf4ec" },
    { media: "(prefers-color-scheme: dark)", color: "#171310" },
  ],
};

/**
 * Applica il tema scelto prima che la pagina sia dipinta: senza questo, chi ha
 * scelto "scuro" vedrebbe un lampo chiaro a ogni caricamento.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem("pocketly-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await readLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={figtree.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
