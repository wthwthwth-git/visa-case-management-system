"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useLanguage } from "@/app/_components/language-provider";
import {
  displayLocalizedCasePhaseLabel,
  displayLocalizedGroupTitle,
  displayLocalizedLabel,
  type AppLocale,
} from "@/app/_lib/i18n";
import type { PortalDocumentStatus } from "../_lib/portal-api";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function displayPortalLabel(value: string, locale?: AppLocale): string {
  return displayLocalizedLabel(value, locale);
}

export function displayPortalCasePhaseLabel(value: string, locale?: AppLocale): string {
  return displayLocalizedCasePhaseLabel(value, locale);
}

function statusTone(value: string): string {
  if (
    value === "accepted" ||
    value === "confirmed" ||
    value === "approved" ||
    value === "office_completed" ||
    value === "office_confirmed"
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (value === "needs_more" || value === "not_applicable" || value === "needs_revision") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (value === "superseded") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (value === "submitted" || value === "office_in_progress") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function StatusBadge({ value }: { value: string }) {
  const { locale } = useLanguage();

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
        statusTone(value),
      )}
    >
      {displayPortalLabel(value, locale)}
    </span>
  );
}

export function PortalCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PortalButton({
  children,
  variant = "primary",
  className,
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" ? "bg-blue-600 text-white hover:bg-blue-700" : null,
        variant === "secondary"
          ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          : null,
        variant === "danger" ? "bg-rose-600 text-white hover:bg-rose-700" : null,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-800">
      {message}
    </div>
  );
}

export function SuccessMessage({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">
      {message}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
      <div className="font-semibold text-slate-950">{title}</div>
      <p className="mt-2 leading-6">{description}</p>
    </div>
  );
}

export function groupTitle(status: PortalDocumentStatus, locale?: AppLocale) {
  return displayLocalizedGroupTitle(status, locale);
}
