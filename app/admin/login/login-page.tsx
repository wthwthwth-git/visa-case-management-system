"use client";

import { useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useLanguage } from "@/app/_components/language-provider";
import type { TranslationKey } from "@/app/_lib/i18n";

function getReasonMessageKey(reason: string | null): TranslationKey | null {
  if (reason === "session-expired") {
    return "admin.login.sessionExpired";
  }

  if (reason === "logged-out") {
    return "admin.login.loggedOut";
  }

  return null;
}

function getErrorMessageKey(error: string | null): TranslationKey | null {
  if (!error) {
    return null;
  }

  if (error === "AccessDenied") {
    return "admin.login.accessDenied";
  }

  if (error === "OAuthSignin" || error === "OAuthCallback") {
    return "admin.login.oauthError";
  }

  return "admin.login.defaultError";
}

export function AdminLoginPage({
  callbackUrl,
  error,
  reason,
}: {
  callbackUrl?: string;
  error?: string;
  reason?: string;
}) {
  const { t } = useLanguage();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const safeCallbackUrl = callbackUrl && callbackUrl.startsWith("/admin") ? callbackUrl : "/admin/cases";
  const messageKey = useMemo(
    () => getErrorMessageKey(error ?? null) ?? getReasonMessageKey(reason ?? null),
    [error, reason],
  );
  const message = messageKey ? t(messageKey) : null;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-180px)] max-w-xl items-center justify-center">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <p className="text-sm font-semibold text-blue-600">{t("admin.login.eyebrow")}</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">
            {t("admin.login.title")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {t("admin.login.description")}
          </p>
        </div>

        {message ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {message}
          </div>
        ) : null}

        <button
          type="button"
          disabled={isSigningIn}
          onClick={() => {
            setIsSigningIn(true);
            void signIn("google", { callbackUrl: safeCallbackUrl });
          }}
          className="mt-6 flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {isSigningIn ? t("admin.login.signingIn") : t("admin.login.google")}
        </button>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
          {t("admin.login.devNotice")}
        </div>
      </section>
    </main>
  );
}
