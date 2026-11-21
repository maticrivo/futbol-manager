import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Hebrew } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import Nav from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansHebrew = Noto_Sans_Hebrew({
  variable: "--font-noto-sans-hebrew",
  subsets: ["hebrew"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    title: t("appName"),
    applicationName: t("appName"),
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: t("appName"),
      statusBarStyle: "default",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0a7d3a",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      dir={locale === "he" ? "rtl" : "ltr"}
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansHebrew.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <Nav>
            <LocaleSwitcher />
          </Nav>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
