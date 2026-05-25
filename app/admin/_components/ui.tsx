import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { displayChineseText } from "@/app/_lib/chinese-display";
import { formatDateTime, type AdminTimelineEvent } from "../_lib/admin-api";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const labelMap: Record<string, string> = {
  active: "有效",
  approved: "已通过",
  accepted: "已受理",
  collecting_documents: "材料收集中",
  confirmed: "已确认",
  create: "新建客户",
  draft: "草稿",
  error: "错误",
  failed: "失败",
  needs_more: "需补充",
  not_applicable: "需修改",
  not_submitted: "未提交",
  pending: "待处理",
  preparing_application: "资料做成中",
  reuse: "复用客户",
  revoked: "已撤销",
  submitted: "已提交",
  under_review: "审查中",
  result_completed: "审查完了",
  closed: "已关闭",
  customer: "客户",
  custom: "自定义",
  office: "事务所",
  office_completed: "已完成",
  office_confirmed: "已确认",
  office_in_progress: "制作中",
  immigration_request: "入管追加材料",
  internal: "内部",
  system: "系统",
  template: "模板",
  template_items_copied: "模板材料已复制",
  requirement_created: "材料项目已创建",
  case_created: "案件已创建",
  token_created: "客户访问链接已创建",
  token_regenerated: "客户访问链接已重新生成",
  token_revoked: "客户访问链接已撤销",
  internal_note_created: "内部备注已创建",
  internal_note_updated: "内部备注已更新",
  file_uploaded: "文件已上传",
  file_removed: "文件已删除",
  file_replaced: "文件已替换",
  requirement_status_changed: "材料状态已变更",
  case_phase_changed: "案件阶段已变更",
  application_confirmation_created: "申请书确认已创建",
  application_confirmation_version_created: "申请书确认版本已创建",
  application_confirmation_completed: "申请书确认已完成",
  application_confirmation_status_changed: "申请书确认状态已变更",
};

export function displayLabel(value: string): string {
  return labelMap[value] ?? displayChineseText(value.replaceAll("_", " "));
}

type DateTextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  includeTime?: boolean;
};

export function DateTextInput({ className, includeTime = false, ...props }: DateTextInputProps) {
  return (
    <input
      {...props}
      type={includeTime ? "datetime-local" : "date"}
      className={cx(
        "rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100",
        className,
      )}
    />
  );
}

export function DashboardCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 sm:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function LoadingState({
  title = "加载中",
  detail,
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <DashboardCard>
      <div className="flex items-center gap-3">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
        <div>
          <div className="text-sm font-semibold text-slate-950">{title}</div>
          {detail ? <div className="mt-1 text-sm text-slate-500">{detail}</div> : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
      </div>
    </DashboardCard>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
      <div className="font-semibold text-slate-950">{title}</div>
      <p className="mt-1 leading-6">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800 shadow-sm">
      {message}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function statusTone(value: string): string {
  const normalized = value.toLowerCase();

  if (
    normalized.includes("approved") ||
    normalized.includes("accepted") ||
    normalized.includes("active") ||
    normalized.includes("confirmed") ||
    normalized.includes("office_completed") ||
    normalized.includes("office_confirmed") ||
    normalized.includes("result_completed")
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (
    normalized.includes("revoked") ||
    normalized.includes("error") ||
    normalized.includes("failed")
  ) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (
    normalized.includes("submitted") ||
    normalized.includes("pending") ||
    normalized.includes("needs_more") ||
    normalized.includes("not_applicable") ||
    normalized.includes("additional")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (
    normalized.includes("collecting") ||
    normalized.includes("preparing") ||
    normalized.includes("review")
  ) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        statusTone(value),
        className,
      )}
    >
      {displayLabel(value)}
    </span>
  );
}

export function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <DashboardCard className="p-4">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 break-words text-2xl font-semibold text-slate-950">{value}</div>
      {detail ? <div className="mt-1 text-sm text-slate-500">{detail}</div> : null}
    </DashboardCard>
  );
}

export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-5 py-4 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function ProgressStepper({
  steps,
  currentStep,
}: {
  steps: string[];
  currentStep: string;
}) {
  const currentIndex = Math.max(0, steps.indexOf(currentStep));

  return (
    <div className="grid gap-3">
      {steps.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <div key={step} className="flex items-center gap-3">
            <div
              className={cx(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                isComplete ? "border-blue-600 bg-blue-600 text-white" : null,
                isCurrent ? "border-blue-600 bg-blue-50 text-blue-700" : null,
                !isComplete && !isCurrent ? "border-slate-200 bg-white text-slate-400" : null,
              )}
            >
              {index + 1}
            </div>
            <div
              className={cx(
                "text-sm",
                isCurrent ? "font-semibold text-blue-700" : "text-slate-600",
              )}
            >
              {`Step ${index + 1}：${displayLabel(step)}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatEventSummary(value: string) {
  const normalized = value.trim().toLowerCase();
  const summaryMap: Record<string, string> = {
    "case created.": "案件已创建。",
    "template items copied.": "模板材料已复制。",
    "selected template items copied.": "已复制所选模板材料。",
    "custom requirements created.": "自定义材料已创建。",
    "portal token created.": "客户访问链接已创建。",
    "portal token regenerated.": "客户访问链接已重新生成。",
    "portal token revoked.": "客户访问链接已撤销。",
    "previous portal token revoked during regeneration.": "旧客户访问链接已在重新生成时撤销。",
    "internal note created.": "内部备注已创建。",
    "document file uploaded.": "文件已上传。",
    "requirement status changed.": "材料状态已变更。",
    "case phase changed.": "案件阶段已变更。",
  };

  return summaryMap[normalized] ?? displayChineseText(value);
}

export function TimelineList({ events }: { events: AdminTimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">暂无变更履历。</p>;
  }

  return (
    <div className="grid gap-4">
      {events.map((event) => (
        <div key={event.id} className="relative pl-6">
          <div className="absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 border-blue-600 bg-white" />
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-slate-950">{formatEventSummary(event.summary)}</div>
              <span className="text-xs text-slate-500">{formatDateTime(event.createdAt)}</span>
            </div>
            <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">
              {displayLabel(event.eventType)} / {displayLabel(event.actorType)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Modal({
  title,
  description,
  children,
  onClose,
  closeDisabled,
}: {
  title: ReactNode;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
    };
  }, []);

  function handleScroll() {
    setIsScrolling(true);

    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
    }

    scrollTimerRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 700);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-2 sm:items-center sm:p-4">
      <div
        onScroll={handleScroll}
        className={cx(
          "soft-scrollbar max-h-[calc(100vh-1rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-950/20 sm:max-h-[calc(100vh-2rem)] sm:p-6",
          isScrolling && "scrollbar-visible",
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-950">{title}</div>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300"
          >
            {closeDisabled ? "处理中" : "关闭"}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      {message}
    </div>
  );
}
