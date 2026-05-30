import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GlobalScrollbarActivity } from "./_components/global-scrollbar-activity";
import { LanguageProvider } from "./_components/language-provider";
import { LOCALE_COOKIE_NAME, normalizeLocale } from "./_lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "签证案件资料管理系统",
  description: "事务所用签证案件资料管理系统",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialLocale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <html lang={initialLocale === "ja" ? "ja" : "zh-CN"}>
      <body>
        <LanguageProvider initialLocale={initialLocale}>
          <GlobalScrollbarActivity />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
