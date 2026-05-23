import type { ButtonHTMLAttributes, ReactNode } from "react";
import { displayChineseText } from "@/app/_lib/chinese-display";
import type { PortalDocumentStatus } from "../_lib/portal-api";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const statusLabels: Record<string, string> = {
  not_submitted: "\u5f85\u4e0a\u4f20",
  needs_more: "\u9700\u8981\u8865\u5145",
  submitted: "\u5df2\u63d0\u4ea4",
  accepted: "\u5df2\u53d7\u7406",
  not_applicable: "\u4e0d\u9002\u7528",
  pending: "\u5f85\u786e\u8ba4",
  confirmed: "\u5df2\u786e\u8ba4",
  needs_revision: "\u8981\u6c42\u4fee\u6539",
  superseded: "\u5df2\u4f5c\u5e9f",
  draft: "\u8349\u7a3f",
  collecting_documents: "\u8d44\u6599\u6536\u96c6\u4e2d",
  preparing_application: "\u7533\u8bf7\u4e66\u5236\u4f5c\u4e2d",
  under_review: "\u5ba1\u67e5\u4e2d",
  approved: "\u5ba1\u67e5\u5b8c\u4e86",
};

export function displayPortalLabel(value: string): string {
  return statusLabels[value] ?? displayChineseText(value.replaceAll("_", " "));
}

function statusTone(value: string): string {
  if (value === "accepted" || value === "confirmed" || value === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (value === "needs_more" || value === "needs_revision") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (value === "superseded") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (value === "submitted" || value === "under_review") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
        statusTone(value),
      )}
    >
      {displayPortalLabel(value)}
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
        variant === "danger" ? "bg-amber-600 text-white hover:bg-amber-700" : null,
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

export function groupTitle(status: PortalDocumentStatus) {
  switch (status) {
    case "not_submitted":
      return "\u5f85\u4e0a\u4f20";
    case "needs_more":
      return "\u9700\u8981\u8865\u5145";
    case "submitted":
      return "\u5df2\u63d0\u4ea4";
    case "accepted":
      return "\u5df2\u53d7\u7406 / \u5df2\u5b8c\u6210";
    case "not_applicable":
      return "\u4e0d\u9002\u7528";
  }
}
