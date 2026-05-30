"use client";

import Link from "next/link";
import { LanguageSwitcher } from "./_components/language-switcher";
import { useLanguage } from "./_components/language-provider";

export default function Home() {
  const { t } = useLanguage();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-950">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm font-semibold text-blue-600">{t("home.title")}</p>
          <LanguageSwitcher compact />
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{t("home.heading")}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {t("home.description")}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/admin/cases"
            className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            {t("home.admin")}
          </Link>
          <Link
            href="/admin/cases/new"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t("home.newCase")}
          </Link>
        </div>
      </section>
    </main>
  );
}
