import { cookies } from "next/headers";

import { LanguageProvider } from "../../_components/language-provider";
import { LOCALE_COOKIE_NAME, normalizeLocale } from "../../_lib/i18n";
import { PortalPage } from "../_components/portal-page";

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function Page({ params }: PageProps) {
  const { token } = await params;
  const cookieStore = await cookies();
  const initialLocale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return (
    <LanguageProvider initialLocale={initialLocale}>
      <PortalPage token={token} />
    </LanguageProvider>
  );
}
