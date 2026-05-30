"use client";

import { useLanguage } from "./language-provider";
import type { AppLocale } from "@/app/_lib/i18n";

const localeOptions: Array<{ value: AppLocale; labelKey: "language.zh" | "language.ja" }> = [
  { value: "zh", labelKey: "language.zh" },
  { value: "ja", labelKey: "language.ja" },
];

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLanguage();

  return (
    <div
      className={[
        "inline-flex shrink-0 items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm",
        compact ? "text-xs" : "text-sm",
      ].join(" ")}
      aria-label={t("language.switch")}
    >
      {localeOptions.map((option) => {
        const active = locale === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setLocale(option.value)}
            className={[
              "rounded-lg px-2.5 py-1 font-semibold transition",
              active
                ? "bg-blue-600 text-white"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
            ].join(" ")}
            aria-pressed={active}
          >
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
