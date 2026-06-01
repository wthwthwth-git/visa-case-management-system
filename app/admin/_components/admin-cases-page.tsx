"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLanguage } from "@/app/_components/language-provider";
import { displayVisaType } from "@/app/_lib/chinese-display";
import { apiGet, formatDateTime, toAdminErrorMessage, type AdminCaseList } from "../_lib/admin-api";
import {
  DataTable,
  DashboardCard,
  EmptyState,
  ErrorBanner,
  LoadingState,
  StatusBadge,
  displayCasePhaseLabel,
} from "./ui";

type VisaBusinessTypeFilter = "all" | "certification" | "renewal" | "change";

const casePhaseFilterOptions = [
  "draft",
  "collecting_documents",
  "preparing_application",
  "submitted",
  "approved",
];

function getVisaBusinessType(item: { currentVisaType: string; targetVisaType: string }): Exclude<VisaBusinessTypeFilter, "all"> {
  if (item.currentVisaType === "无") {
    return "certification";
  }

  if (item.currentVisaType === item.targetVisaType) {
    return "renewal";
  }

  return "change";
}

export function AdminCasesPage() {
  const { locale, t } = useLanguage();
  const [cases, setCases] = useState<AdminCaseList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [businessTypeFilter, setBusinessTypeFilter] = useState<VisaBusinessTypeFilter>("all");

  useEffect(() => {
    let isMounted = true;

    async function loadCases() {
      try {
        setIsLoading(true);
        setError(null);
        const query = activeSearch.trim();
        const params = new URLSearchParams();
        if (query) {
          params.set("q", query);
        }
        if (phaseFilter !== "all") {
          params.set("phase", phaseFilter);
        }
        const requestPath = params.size > 0 ? `/api/admin/cases?${params.toString()}` : "/api/admin/cases";
        const data = await apiGet<AdminCaseList>(
          requestPath,
        );

        if (isMounted) {
          setCases(data);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(toAdminErrorMessage(loadError, t("admin.cases.loadError")));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadCases();

    return () => {
      isMounted = false;
    };
  }, [activeSearch, phaseFilter, t]);

  const filteredItems = useMemo(() => {
    const items = cases?.items ?? [];

    if (businessTypeFilter === "all") {
      return items;
    }

    return items.filter((item) => getVisaBusinessType(item) === businessTypeFilter);
  }, [businessTypeFilter, cases]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveSearch(searchInput.trim());
  }

  return (
    <main className="mx-auto max-w-7xl">
      <div className="mb-6 grid gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            {t("admin.cases.title")}
          </h1>
        </div>
        <Link
          href="/admin/cases/new"
          className="inline-flex w-full justify-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 sm:w-auto"
        >
          {t("admin.cases.new")}
        </Link>
      </div>

      <form className="mb-6 flex flex-wrap items-center gap-2" onSubmit={submitSearch}>
        <div className="flex min-w-[260px] flex-1 rounded-xl border border-slate-200 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 sm:max-w-md">
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("admin.cases.searchPlaceholder")}
              className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              className="m-1 shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {t("admin.cases.search")}
            </button>
        </div>
          <select
            aria-label={t("admin.cases.phaseFilter")}
            value={phaseFilter}
            onChange={(event) => setPhaseFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">{t("admin.cases.allPhases")}</option>
            {casePhaseFilterOptions.map((phase) => (
              <option key={phase} value={phase}>
                {displayCasePhaseLabel(phase, locale)}
              </option>
            ))}
          </select>
          <select
            aria-label={t("admin.cases.typeFilter")}
            value={businessTypeFilter}
            onChange={(event) => setBusinessTypeFilter(event.target.value as VisaBusinessTypeFilter)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">{t("admin.cases.allTypes")}</option>
            <option value="certification">{t("admin.cases.certification")}</option>
            <option value="renewal">{t("admin.cases.renewal")}</option>
            <option value="change">{t("admin.cases.change")}</option>
          </select>
      </form>

      {isLoading ? (
        <LoadingState title={t("admin.cases.loadingTitle")} detail={t("admin.cases.loadingDetail")} />
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}

      {!isLoading && !error && cases && filteredItems.length === 0 ? (
        <DashboardCard className="text-center">
          <EmptyState
            title={
              activeSearch || phaseFilter !== "all" || businessTypeFilter !== "all"
                ? t("admin.cases.emptyFilteredTitle")
                : t("admin.cases.emptyTitle")
            }
            description={
              activeSearch || phaseFilter !== "all" || businessTypeFilter !== "all"
                ? t("admin.cases.emptyFilteredDescription")
                : t("admin.cases.emptyDescription")
            }
            action={
              activeSearch || phaseFilter !== "all" || businessTypeFilter !== "all" ? (
                undefined
              ) : (
                <Link
                  href="/admin/cases/new"
                  className="inline-flex rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {t("admin.cases.new")}
                </Link>
              )
            }
          />
        </DashboardCard>
      ) : null}

      {cases && filteredItems.length > 0 ? (
        <DataTable
          headers={[
            t("admin.cases.column.case"),
            t("admin.cases.column.customer"),
            t("admin.cases.column.targetVisaType"),
            t("admin.cases.column.phase"),
            t("admin.cases.column.updatedAt"),
          ]}
        >
          {filteredItems.map((item) => (
            <tr key={item.id} className="transition hover:bg-blue-50/40">
              <td className="px-5 py-4">
                <Link className="font-semibold text-blue-700 hover:text-blue-800" href={`/admin/cases/${item.id}`}>
                  {item.caseNumber}
                </Link>
              </td>
              <td className="px-5 py-4">
                <div className="font-medium text-slate-950">{item.customer.name}</div>
              </td>
              <td className="px-5 py-4">
                <div className="text-slate-800">{displayVisaType(item.targetVisaType, locale)}</div>
              </td>
              <td className="px-5 py-4">
                <StatusBadge
                  value={item.casePhase}
                  label={displayCasePhaseLabel(item.casePhase, locale)}
                  className="min-w-24 justify-center"
                />
              </td>
              <td className="px-5 py-4 text-slate-600">{formatDateTime(item.updatedAt)}</td>
            </tr>
          ))}
        </DataTable>
      ) : null}
    </main>
  );
}
