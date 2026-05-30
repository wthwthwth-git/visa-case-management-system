import { cookies } from "next/headers";

import { LanguageProvider } from "../_components/language-provider";
import { LOCALE_COOKIE_NAME, normalizeLocale } from "../_lib/i18n";
import { AdminShell } from "./_components/admin-shell";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialLocale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <LanguageProvider initialLocale={initialLocale}>
      <AdminShell>{children}</AdminShell>
    </LanguageProvider>
  );
}
