"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LanguageSwitcher } from "@/app/_components/language-switcher";
import { useLanguage } from "@/app/_components/language-provider";
import type { AppLocale, TranslationKey } from "@/app/_lib/i18n";
import { displayLocalizedRequirementTitle } from "@/app/_lib/visa-template-translations";
import {
  apiGet,
  apiPost,
  formatDateTime,
  toAdminErrorMessage,
  type AdminNotificationList,
} from "../_lib/admin-api";
import { AdminSessionControls } from "./admin-session-controls";

const navItems = [
  {
    href: "/admin/cases",
    labelKey: "admin.nav.cases",
    shortLabel: "案",
  },
  {
    href: "/admin/cases/new",
    labelKey: "admin.nav.newCase",
    shortLabel: "+",
  },
] satisfies Array<{ href: string; labelKey: TranslationKey; shortLabel: string }>;

function getNotificationHref(notification: NonNullable<AdminNotificationList["items"]>[number]) {
  if (!notification.caseId) {
    return null;
  }

  const caseHref = `/admin/cases/${notification.caseId}`;

  if (notification.targetType === "case_document_requirement" && notification.targetId) {
    return `${caseHref}#requirement-${encodeURIComponent(notification.targetId)}`;
  }

  return caseHref;
}

function splitNotificationText(value: string, action: string) {
  const marker = ` ${action}：`;
  const markerIndex = value.indexOf(marker);

  if (markerIndex < 0) {
    return null;
  }

  return {
    customerName: value.slice(0, markerIndex).trim(),
    objectText: value.slice(markerIndex + marker.length).trim(),
  };
}

function splitRevisionMessageObject(value: string) {
  const commentMarker = "。说明：";
  const commentIndex = value.indexOf(commentMarker);

  if (commentIndex < 0) {
    return {
      objectText: value.trim(),
      comment: null,
    };
  }

  return {
    objectText: value.slice(0, commentIndex).trim(),
    comment: value.slice(commentIndex + commentMarker.length).trim(),
  };
}

function displayNotificationObject(value: string, notification: NonNullable<AdminNotificationList["items"]>[number], locale: AppLocale) {
  if (locale !== "ja") {
    return value;
  }

  if (notification.targetType === "case_document_requirement") {
    return displayLocalizedRequirementTitle(value, locale);
  }

  return value;
}

function localizeNotificationText(
  notification: NonNullable<AdminNotificationList["items"]>[number],
  field: "title" | "message",
  locale: AppLocale,
) {
  const source = field === "title" ? notification.title : notification.message;

  if (locale !== "ja") {
    return source;
  }

  if (notification.type === "portal_file_uploaded") {
    const parsed = splitNotificationText(source, "提交了资料");

    if (parsed) {
      const materialTitle = displayNotificationObject(parsed.objectText, notification, locale);
      return `${parsed.customerName} が資料を提出しました：${materialTitle}`;
    }
  }

  if (notification.type === "application_confirmation_confirmed") {
    const officeRequirement = splitNotificationText(source, "确认了事务所资料");

    if (officeRequirement) {
      const materialTitle = displayNotificationObject(officeRequirement.objectText, notification, locale);
      return `${officeRequirement.customerName} が事務所側資料を確認しました：${materialTitle}`;
    }

    const applicationForm = splitNotificationText(source, "确认了申请书") ??
      splitNotificationText(source, "确认了完成资料");

    if (applicationForm) {
      return `${applicationForm.customerName} が申請書を確認しました：${applicationForm.objectText}`;
    }
  }

  if (notification.type === "application_confirmation_revision_requested") {
    const officeRequirement = splitNotificationText(source, "要求修改事务所资料");

    if (officeRequirement) {
      const { objectText, comment } = splitRevisionMessageObject(officeRequirement.objectText);
      const materialTitle = displayNotificationObject(objectText, notification, locale);
      const baseText = `${officeRequirement.customerName} が事務所側資料の修正を依頼しました：${materialTitle}`;
      return field === "message" && comment ? `${baseText}。説明：${comment}` : baseText;
    }

    const applicationForm = splitNotificationText(source, "要求修改申请书") ??
      splitNotificationText(source, "要求修改完成资料");

    if (applicationForm) {
      return `${applicationForm.customerName} が申請書の修正を依頼しました：${applicationForm.objectText}`;
    }
  }

  if (notification.type === "portal_rate_limit_triggered") {
    return field === "title"
      ? "お客様用アクセスリンクでアクセス頻度制限が発生しました"
      : "お客様用アクセスリンクでアクセス頻度制限が発生しました。異常なアクセスがないか確認してください。";
  }

  return source;
}

function NotificationButton() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotificationList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  async function loadNotifications() {
    setIsLoading(true);
    setError(null);

    try {
      const result = await apiGet<AdminNotificationList>(
        "/api/admin/notifications?status=unread&pageSize=10",
      );
      setNotifications(result);
    } catch (loadError) {
      setError(toAdminErrorMessage(loadError, t("admin.notifications.loadError")));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  async function openPanel() {
    setIsOpen((current) => !current);

    if (!isOpen) {
      await loadNotifications();
    }
  }

  async function markRead(notificationId: string) {
    try {
      await apiPost(`/api/admin/notifications/${notificationId}/read`, {});
      await loadNotifications();
    } catch (readError) {
      setError(toAdminErrorMessage(readError, t("admin.notifications.loadError")));
    }
  }

  async function markAllRead() {
    try {
      await apiPost("/api/admin/notifications/read-all", {});
      await loadNotifications();
    } catch (readError) {
      setError(toAdminErrorMessage(readError, t("admin.notifications.loadError")));
    }
  }

  async function openNotification(notification: NonNullable<AdminNotificationList["items"]>[number]) {
    const href = getNotificationHref(notification);

    await markRead(notification.id);

    if (href) {
      setIsOpen(false);
      router.push(href);
    }
  }

  const unreadCount = notifications?.unreadCount ?? 0;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => void openPanel()}
        className="relative h-9 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
      >
        {t("admin.notifications.button")}
        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">
                {t("admin.notifications.title")}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {t("admin.notifications.subtitle")}
              </div>
            </div>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs font-medium text-blue-700 hover:text-blue-800"
              >
                {t("admin.notifications.markAllRead")}
              </button>
            ) : null}
          </div>

          {error ? (
            <div className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-5 text-sm text-slate-500">
                {t("admin.notifications.loading")}
              </div>
            ) : notifications && notifications.items.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {notifications.items.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => void openNotification(notification)}
                    className="block w-full px-4 py-3 text-left transition hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-950">
                          {localizeNotificationText(notification, "title", locale)}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                          {localizeNotificationText(notification, "message", locale)}
                        </div>
                      </div>
                      <span
                        className={[
                          "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                          notification.severity === "critical"
                            ? "bg-rose-500"
                            : notification.severity === "warning"
                              ? "bg-amber-400"
                              : "bg-blue-500",
                        ].join(" ")}
                      />
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      {formatDateTime(notification.createdAt)}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-5 text-sm text-slate-500">
                {t("admin.notifications.empty")}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div
      className={
        isSidebarCollapsed
          ? "min-h-screen bg-slate-100 text-slate-950 lg:grid lg:grid-cols-[72px_1fr]"
          : "min-h-screen bg-slate-100 text-slate-950 lg:grid lg:grid-cols-[220px_1fr]"
      }
    >
      <aside className="bg-[#071B3A] text-white lg:sticky lg:top-0 lg:h-screen">
        <div
          className={
            isSidebarCollapsed
              ? "flex h-full min-h-0 flex-col items-center px-3 py-4 lg:min-h-screen"
              : "flex h-full min-h-0 flex-col px-4 py-4 lg:min-h-screen"
          }
        >
          <Link
            href="/admin/cases"
            className={isSidebarCollapsed ? "flex justify-center" : "flex min-w-0 items-center gap-3"}
            title={t("admin.brand.title")}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-sm font-bold shadow-lg shadow-blue-950/30">
              VI
            </span>
            {!isSidebarCollapsed ? (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {t("admin.brand.title")}
                </span>
                <span className="block truncate text-xs text-blue-100">
                  {t("admin.brand.subtitle")}
                </span>
              </span>
            ) : null}
          </Link>

          <nav
            className={
              isSidebarCollapsed
                ? "mt-8 grid justify-items-center gap-3 text-sm"
                : "mt-5 flex gap-2 overflow-x-auto pb-1 text-sm lg:grid lg:overflow-visible lg:pb-0"
            }
          >
            {navItems.map((item) => {
              const isActive =
                item.href === "/admin/cases"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              const label = t(item.labelKey);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={label}
                  className={
                    isSidebarCollapsed
                      ? [
                          "flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold transition",
                          isActive ? "bg-white text-[#071B3A]" : "text-blue-50 hover:bg-white/10",
                        ].join(" ")
                      : [
                          "shrink-0 rounded-xl px-3 py-2.5 font-medium transition",
                          isActive ? "bg-white/12 text-white" : "text-blue-50 hover:bg-white/10",
                        ].join(" ")
                  }
                >
                  {isSidebarCollapsed ? item.shortLabel : label}
                </Link>
              );
            })}
          </nav>

          {!isSidebarCollapsed ? (
            <div className="mt-auto hidden rounded-2xl border border-amber-300/40 bg-amber-300/15 p-3 text-xs leading-5 text-amber-50 lg:block">
              {t("admin.devWarning")}
            </div>
          ) : (
            <div className="mt-auto" />
          )}

          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((current) => !current)}
            className={
              isSidebarCollapsed
                ? "mt-4 hidden h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg text-blue-100 transition hover:bg-white/10 hover:text-white lg:inline-flex"
                : "mt-4 hidden h-10 w-10 items-center justify-center self-end rounded-xl border border-white/10 bg-white/5 text-lg text-blue-100 transition hover:bg-white/10 hover:text-white lg:inline-flex"
            }
            aria-label={
              isSidebarCollapsed
                ? t("admin.sidebar.expand")
                : t("admin.sidebar.collapse")
            }
            title={
              isSidebarCollapsed
                ? t("admin.sidebar.expand")
                : t("admin.sidebar.collapse")
            }
          >
            {isSidebarCollapsed ? "›" : "‹"}
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 sm:justify-end">
              {!isLoginPage ? (
                <>
                  <LanguageSwitcher compact />
                  <NotificationButton />
                  <AdminSessionControls />
                </>
              ) : (
                <LanguageSwitcher compact />
              )}
            </div>
          </div>
        </header>

        <div className="px-4 py-5 sm:px-5 md:px-6 lg:px-7">{children}</div>
      </div>
    </div>
  );
}
