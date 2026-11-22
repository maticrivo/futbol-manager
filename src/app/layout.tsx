import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import Nav from "@/components/Nav";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
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

export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  if (theme === "dark") return { themeColor: "#101412" };
  if (theme === "light") return { themeColor: "#f6f5f2" };
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
      { media: "(prefers-color-scheme: dark)", color: "#101412" },
    ],
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang={locale}
      dir={locale === "he" ? "rtl" : "ltr"}
      data-theme={theme === "system" ? undefined : theme}
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
