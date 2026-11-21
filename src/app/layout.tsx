import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import Nav from "@/components/Nav";
import "./globals.css";

const geistSans = { variable: '--font-geist-sans' }
const geistMono = { variable: '--font-geist-mono' }
const notoSansHebrew = { variable: '--font-noto-sans-hebrew' }

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
      <body className="min-h-full flex flex-col pb-20 md:pb-0">
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
