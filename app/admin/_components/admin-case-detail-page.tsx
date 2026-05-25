"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { displayChineseText, displayVisaType } from "@/app/_lib/chinese-display";
import {
  apiGet,
  formatDateTime,
  getAdminCsrfHeaders,
  toAdminErrorMessage,
  type AdminCaseDetail,
  type AdminRequirement,
  type AdminTimelineEvent,
} from "../_lib/admin-api";
import {
  DashboardCard,
  DateTextInput,
  EmptyState,
  ErrorBanner,
  InlineError,
  LoadingState,
  Modal,
  ProgressStepper,
  SectionHeader,
  StatusBadge,
  displayLabel,
} from "./ui";

type Props = {
  caseId: string;
};

type ApiSuccess<T> = {
  data: T;
};

type ApiFailure = {
  error: {
    code: string;
    message: string;
  };
};

type ActiveModal =
  | { type: "customer"; customer: AdminCaseDetail["customer"] }
  | { type: "review"; requirement: AdminRequirement }
  | { type: "upload"; requirement: AdminRequirement }
  | { type: "note"; requirement: AdminRequirement }
  | { type: "customRequirement"; responsibleParty: "customer" | "office" }
  | { type: "immigration" }
  | { type: "changeHistory" }
  | { type: "phase" }
  | { type: "applicationConfirmation" }
  | { type: "tokenRegenerate" }
  | { type: "tokenRevoke" }
  | null;

type MutationResult = {
  message: string;
  warningMessage?: string;
};

type RequirementLookup = {
  byRequirementId: Map<string, AdminRequirement>;
  byFileId: Map<string, AdminRequirement>;
};

function buildRequirementLookup(requirements: AdminRequirement[]): RequirementLookup {
  const byRequirementId = new Map<string, AdminRequirement>();
  const byFileId = new Map<string, AdminRequirement>();

  for (const requirement of requirements) {
    byRequirementId.set(requirement.id, requirement);

    for (const file of requirement.files) {
      byFileId.set(file.id, requirement);
    }
  }

  return { byRequirementId, byFileId };
}

function getMetadataValue(event: AdminTimelineEvent, key: string): unknown {
  if (!event.metadata || typeof event.metadata !== "object" || Array.isArray(event.metadata)) {
    return undefined;
  }

  return (event.metadata as Record<string, unknown>)[key];
}

function getMetadataString(event: AdminTimelineEvent, key: string): string | null {
  const value = getMetadataValue(event, key);
  return typeof value === "string" ? value : null;
}

function getRequirementFromEvent(event: AdminTimelineEvent, lookup: RequirementLookup): AdminRequirement | null {
  const requirementId =
    getMetadataString(event, "requirementId") ||
    (event.targetType === "case_document_requirement" ? event.targetId : null);

  if (requirementId) {
    return lookup.byRequirementId.get(requirementId) ?? null;
  }

  const fileId =
    getMetadataString(event, "fileId") ||
    (event.targetType === "document_file" ? event.targetId : null);

  return fileId ? lookup.byFileId.get(fileId) ?? null : null;
}

function getRequirementScopeLabel(requirement: AdminRequirement | null): string {
  if (!requirement) {
    return "资料项";
  }

  if (requirement.sourceType === "immigration_request") {
    return requirement.responsibleParty === "customer" ? "入管追加材料（客户资料）" : "入管追加材料（事务所资料）";
  }

  return requirement.responsibleParty === "customer" ? "客户资料" : "事务所资料";
}

function formatChangeHistoryDetail(event: AdminTimelineEvent, lookup: RequirementLookup): string {
  const requirement = getRequirementFromEvent(event, lookup);
  const requirementTitle = requirement ? `「${displayChineseText(requirement.title)}」` : "";
  const scope = getRequirementScopeLabel(requirement);

  switch (event.eventType) {
    case "file_uploaded":
      return `${scope}${requirementTitle}已上传文件。`;
    case "file_deleted":
      return `${scope}${requirementTitle}已删除文件。`;
    case "requirement_status_changed": {
      const oldStatus = getMetadataString(event, "oldStatus");
      const newStatus = getMetadataString(event, "newStatus");
      const statusText = oldStatus && newStatus
        ? `状态由「${displayLabel(oldStatus)}」变更为「${displayLabel(newStatus)}」。`
        : "状态已变更。";
      return `${scope}${requirementTitle}${statusText}`;
    }
    case "requirement_note_updated":
      return `${scope}${requirementTitle}备注已更新。`;
    case "requirement_created":
      return `${scope}${requirementTitle}已追加。`;
    case "requirement_deleted":
      return `${scope}${requirementTitle}已删除。`;
    case "case_phase_changed": {
      const oldPhase = getMetadataString(event, "oldPhase");
      const newPhase = getMetadataString(event, "newPhase");
      return oldPhase && newPhase
        ? `案件阶段由「${displayLabel(oldPhase)}」变更为「${displayLabel(newPhase)}」。`
        : "案件阶段已变更。";
    }
    case "template_items_selected_copied": {
      const selectedCount = getMetadataValue(event, "selectedItemCount");
      const customCount = getMetadataValue(event, "customItemCount");
      const selectedText = typeof selectedCount === "number" ? `${selectedCount} 项模板资料` : "模板资料";
      const customText = typeof customCount === "number" && customCount > 0 ? `，另追加 ${customCount} 项自定义资料` : "";
      return `已生成${selectedText}${customText}。`;
    }
    case "custom_requirements_created": {
      const customCount = getMetadataValue(event, "customItemCount");
      return typeof customCount === "number" ? `已追加 ${customCount} 项自定义资料。` : "已追加自定义资料。";
    }
    case "token_created":
      return "客户访问链接已创建。";
    case "token_regenerated":
      return "客户访问链接已重新生成，旧链接已失效。";
    case "token_revoked":
      return "客户访问链接已撤销。";
    case "application_confirmation_created":
    case "application_confirmation_version_created":
      return "申请书确认版本已创建。";
    case "application_confirmation_completed":
      return "客户已完成申请书确认。";
    case "application_confirmation_status_changed":
      return "申请书确认状态已变更。";
    case "case_created":
      return "案件已创建。";
    default:
      return displayLabel(event.eventType);
  }
}

function getLatestCasePhaseReason(events: AdminTimelineEvent[]) {
  for (const event of events) {
    if (event.eventType !== "case_phase_changed") {
      continue;
    }

    const reason = getMetadataString(event, "reason")?.trim();

    if (reason) {
      return reason;
    }
  }

  return null;
}

function createPortalAccessUrl(plaintextToken: string): string {
  if (typeof window === "undefined") {
    return `/portal/${encodeURIComponent(plaintextToken)}`;
  }

  return `${window.location.origin}/portal/${encodeURIComponent(plaintextToken)}`;
}

function getVisibleRequirementInternalNote(
  requirement: Pick<AdminRequirement, "internalNote" | "responsibleParty" | "status">,
) {
  const note = requirement.internalNote?.trim();

  if (!note || /^classification=/i.test(note)) {
    return null;
  }

  const clientRevisionPrefix = "客户要求的说明：";
  const isConfirmedOfficeRequirement =
    requirement.responsibleParty === "office" && requirement.status === "not_applicable";

  if (isConfirmedOfficeRequirement && note.startsWith(clientRevisionPrefix)) {
    return null;
  }

  return note;
}

function getRequirementNoteDisplay(
  requirement: Pick<AdminRequirement, "internalNote" | "responsibleParty" | "status">,
) {
  const note = getVisibleRequirementInternalNote(requirement);

  if (!note) {
    return null;
  }

  const clientRevisionPrefix = "客户要求的说明：";

  if (note.startsWith(clientRevisionPrefix)) {
    return {
      label: "客户要求的说明",
      text: note.slice(clientRevisionPrefix.length).trim(),
    };
  }

  return {
    label: "内部备注",
    text: note,
  };
}

type CasePhaseWarning = {
  type: string;
  count: number;
};

type ChangeCasePhaseResult = {
  caseId: string;
  oldPhase: string;
  newPhase: string;
  warnings: CasePhaseWarning[];
  updatedAt: string;
};

type AdminFileSignedUrlResult = {
  signedUrl: string;
  expiresAt: string;
};

type AdminRequirementFile = AdminRequirement["files"][number];

type FilePreviewState = {
  fileName: string;
  fileUrl: string;
  expiresAt: string;
};

type FileDeleteConfirmation =
  | {
      type: "single";
      file: AdminRequirementFile;
    }
  | {
      type: "all";
      requirement: AdminRequirement;
      fileCount: number;
    };

type RequirementDeleteConfirmation = {
  requirement: AdminRequirement;
  uploadedFileCount: number;
};

type RemovedAdminCaseResult = {
  caseId: string;
  caseNumber: string;
  removedRequirementCount: number;
  removedFileCount: number;
  removedApplicationConfirmationCount: number;
  removedAccessTokenCount: number;
};

type CreatedApplicationConfirmationResult = {
  id: string;
  caseId: string;
  title: string;
  version: number;
  status: string;
  confirmedAt: string | null;
  supersededAt: string | null;
  createdAt: string;
};

type RegeneratedPortalTokenResult = {
  previousTokenId: string | null;
  newTokenId: string;
  plaintextToken: string;
  expiresAt: string | null;
};

type RevokedPortalTokenResult = {
  revokedTokenId: string | null;
};

const casePhaseSteps = [
  "draft",
  "collecting_documents",
  "preparing_application",
  "submitted",
  "under_review",
  "approved",
];

const casePhaseTransitionOptions: Record<string, string[]> = {
  draft: ["collecting_documents"],
  collecting_documents: ["preparing_application"],
  preparing_application: ["submitted", "collecting_documents"],
  submitted: ["under_review", "preparing_application"],
  under_review: ["approved", "submitted", "collecting_documents"],
  approved: [],
};

function getAllowedCasePhaseOptions(currentPhase: string) {
  return (casePhaseTransitionOptions[currentPhase] ?? []).filter((phase) =>
    casePhaseSteps.includes(phase),
  );
}

function formatCasePhaseSubmitError(error: unknown) {
  const message = toAdminErrorMessage(error, "案件阶段切换失败。请检查阶段和原因后重试。");

  if (message === "Invalid request." || /transition|not allowed/i.test(message)) {
    return "该阶段不能从当前阶段直接切换。请按案件流程选择允许的下一阶段。";
  }

  return message;
}

function formatVisaBusinessSummary(currentVisaType: string, targetVisaType: string) {
  const current = displayVisaType(currentVisaType);
  const target = displayVisaType(targetVisaType);

  if (currentVisaType === "无") {
    return `认定 / ${target}`;
  }

  if (currentVisaType === targetVisaType) {
    return `更新 / ${target}`;
  }

  return `变更 / ${current} → ${target}`;
}

const todayDateValue = new Date().toISOString().slice(0, 10);

async function parseMutationResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;

  if (!response.ok || "error" in payload) {
    throw new Error(
      "error" in payload
        ? toAdminErrorMessage(new Error(payload.error.message), "操作失败，请稍后重试。")
        : "请求失败。",
    );
  }

  return payload.data;
}

async function patchJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const csrfHeaders = await getAdminCsrfHeaders();
  const response = await fetch(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders,
    },
    body: JSON.stringify(body),
  });

  return parseMutationResponse<T>(response);
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const csrfHeaders = await getAdminCsrfHeaders();
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders,
    },
    body: JSON.stringify(body),
  });

  return parseMutationResponse<T>(response);
}

async function postForm<T>(path: string, body: FormData): Promise<T> {
  const csrfHeaders = await getAdminCsrfHeaders();
  const response = await fetch(path, {
    method: "POST",
    headers: csrfHeaders,
    body,
  });

  return parseMutationResponse<T>(response);
}

async function postBlob(path: string): Promise<Blob> {
  const csrfHeaders = await getAdminCsrfHeaders();
  const response = await fetch(path, {
    method: "POST",
    headers: csrfHeaders,
  });

  if (!response.ok) {
    await parseMutationResponse<never>(response);
  }

  return response.blob();
}

async function deleteJson<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const csrfHeaders = await getAdminCsrfHeaders();
  const response = await fetch(path, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders,
    },
    body: JSON.stringify(body),
  });

  return parseMutationResponse<T>(response);
}

function optionalFormString(form: FormData, name: string): string | undefined {
  const value = form.get(name);

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatFileSize(value: string): string {
  const size = Number.parseInt(value, 10);

  if (!Number.isFinite(size) || size < 0) {
    return "-";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatChangeHistorySummary(value: string) {
  const normalized = value.trim().toLowerCase();
  const summaryMap: Record<string, string> = {
    "case created.": "案件已创建",
    "template items copied.": "模板材料已复制",
    "selected template items copied.": "模板材料已复制",
    "custom requirements created.": "自定义资料已创建",
    "custom requirement created.": "追加资料已创建",
    "immigration additional requirement created.": "入管追加材料已创建",
    "portal token created.": "客户访问链接已创建",
    "portal token regenerated.": "客户访问链接已重新生成",
    "portal token revoked.": "客户访问链接已撤销",
    "previous portal token revoked during regeneration.": "旧客户访问链接已撤销",
    "internal note created.": "备注已创建",
    "internal note updated.": "备注已更新",
    "file uploaded.": "文件已上传",
    "document file uploaded.": "文件已上传",
    "file removed.": "文件已删除",
    "requirement status changed.": "材料状态已变更",
    "case phase changed.": "案件阶段已变更",
    "application confirmation created.": "申请书确认已创建",
    "application confirmation version created.": "申请书确认版本已创建",
    "application confirmation completed.": "申请书确认已完成",
    "application confirmation status changed.": "申请书确认状态已变更",
  };

  return summaryMap[normalized] ?? displayChineseText(value);
}

function getUploadedRequirementFiles(requirement: AdminRequirement) {
  return requirement.files.filter((file) => file.status === "uploaded");
}

function getEffectiveRequirementStatus(requirement: AdminRequirement) {
  if (requirement.responsibleParty === "office") {
    if (requirement.status === "approved" || requirement.status === "not_applicable") {
      return requirement.status;
    }

    return "submitted";
  }

  const uploadedFileCount = getUploadedRequirementFiles(requirement).length;

  if (requirement.status === "not_submitted" && uploadedFileCount > 0) {
    return "submitted";
  }

  if (requirement.status === "submitted" && uploadedFileCount === 0) {
    return "not_submitted";
  }

  return requirement.status;
}

function getRequirementStatusBadgeValue(requirement: AdminRequirement) {
  if (requirement.responsibleParty === "office") {
    if (requirement.status === "not_applicable") {
      return "office_confirmed";
    }

    return requirement.status === "approved" ? "office_completed" : "office_in_progress";
  }

  return getEffectiveRequirementStatus(requirement);
}

function getRequirementReviewButtonLabel(requirement: AdminRequirement) {
  return requirement.responsibleParty === "office" ? "制作状态变更" : "审核状态变更";
}

function canPreviewInModal(file: AdminRequirementFile): boolean {
  const mimeType = file.mimeType.toLowerCase();
  const fileName = file.originalFileName.toLowerCase();

  return (
    mimeType === "application/pdf" ||
    mimeType.startsWith("image/") ||
    mimeType.startsWith("text/") ||
    fileName.endsWith(".pdf") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".gif") ||
    fileName.endsWith(".webp") ||
    fileName.endsWith(".txt")
  );
}

function triggerFileDownload(input: { fileUrl: string; fileName: string }) {
  const link = document.createElement("a");
  link.href = input.fileUrl;
  link.download = input.fileName;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function triggerBlobDownload(input: { blob: Blob; fileName: string }) {
  const fileUrl = URL.createObjectURL(input.blob);

  try {
    triggerFileDownload({
      fileUrl,
      fileName: input.fileName,
    });
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
  }
}

function confirmImportantAction(message: string): boolean {
  return window.confirm(`请确认：${message}\n\n继续后系统会刷新案件详情。`);
}

function SubmitSpinner() {
  return (
    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
  );
}

function FormActions({
  cancelLabel = "取消",
  submitLabel,
  submittingLabel,
  isSubmitting,
  onCancel,
  submitTone = "blue",
}: {
  cancelLabel?: string;
  submitLabel: string;
  submittingLabel: string;
  isSubmitting: boolean;
  onCancel: () => void;
  submitTone?: "blue" | "rose";
}) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button
        type="button"
        disabled={isSubmitting}
        onClick={onCancel}
        className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:w-auto"
      >
        {cancelLabel}
      </button>
      <button
        disabled={isSubmitting}
        className={
          submitTone === "rose"
            ? "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
            : "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
        }
      >
        {isSubmitting ? <SubmitSpinner /> : null}
        {isSubmitting ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}

function RequirementGroup({
  title,
  emptyMessage,
  requirements,
  action,
  collapsible = false,
  standalone = true,
  onReview,
  onUpload,
  onNote,
  onPreviewFile,
  onDownloadAllFiles,
  onDeleteFile,
  onDeleteAllFiles,
  onDeleteRequirement,
  downloadingRequirementId,
  deletingFileId,
  deletingRequirementId,
  deletingRequirementRecordId,
}: {
  title: string;
  emptyMessage: string;
  requirements: AdminRequirement[];
  action?: ReactNode;
  collapsible?: boolean;
  standalone?: boolean;
  onReview: (requirement: AdminRequirement) => void;
  onUpload: (requirement: AdminRequirement) => void;
  onNote: (requirement: AdminRequirement) => void;
  onPreviewFile: (file: AdminRequirementFile) => void;
  onDownloadAllFiles: (requirement: AdminRequirement) => void;
  onDeleteFile: (file: AdminRequirementFile) => void;
  onDeleteAllFiles: (requirement: AdminRequirement) => void;
  onDeleteRequirement: (requirement: AdminRequirement) => void;
  downloadingRequirementId: string | null;
  deletingFileId: string | null;
  deletingRequirementId: string | null;
  deletingRequirementRecordId: string | null;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const headerAction =
    action || collapsible ? (
      <div className="flex flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
        {action}
        {collapsible ? (
          <CollapseIconButton
            isExpanded={isExpanded}
            onClick={() => setIsExpanded((current) => !current)}
          />
        ) : null}
      </div>
    ) : undefined;

  const content = (
    <>
      {standalone ? (
        <div
          className={
            isExpanded
              ? "mb-5 flex flex-wrap items-start justify-between gap-4"
              : "flex flex-wrap items-center justify-between gap-4"
          }
        >
          <h2 className="text-base font-semibold text-slate-950">
            {title} / {requirements.length} 项
          </h2>
          {headerAction}
        </div>
      ) : (
        <div
          className={
            isExpanded
              ? "mb-3 flex flex-wrap items-center justify-between gap-3"
              : "flex flex-wrap items-center justify-between gap-3"
          }
        >
          <h3 className="text-sm font-semibold text-slate-700">
            {title}
            <span className="ml-2 font-medium text-slate-400">{requirements.length} 项</span>
          </h3>
          {headerAction}
        </div>
      )}
      {isExpanded ? <div className="grid gap-3">
        {requirements.length === 0 ? (
          standalone ? (
            <EmptyState title="暂无资料项" description={emptyMessage} />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              {emptyMessage}
            </div>
          )
        ) : null}
        {requirements.map((requirement) => {
          const uploadedFiles = getUploadedRequirementFiles(requirement);
          const statusBadgeValue = getRequirementStatusBadgeValue(requirement);
          const visibleInternalNote = getVisibleRequirementInternalNote(requirement);
          const visibleNoteDisplay = getRequirementNoteDisplay(requirement);
          const isDownloadingAll = downloadingRequirementId === requirement.id;
          const isDeletingAll = deletingRequirementId === requirement.id;
          const isDeletingRequirement = deletingRequirementRecordId === requirement.id;

          return (
          <div
            key={requirement.id}
            onClick={(event) => event.stopPropagation()}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="font-medium text-slate-950">{displayChineseText(requirement.title)}</div>
              </div>
              <StatusBadge value={statusBadgeValue} />
            </div>
            {uploadedFiles.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-500">
                    已上传文件（{uploadedFiles.length}）
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isDownloadingAll || isDeletingAll}
                      onClick={() => onDownloadAllFiles(requirement)}
                      className="rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                    >
                      {isDownloadingAll ? "下载中..." : "全部下载"}
                    </button>
                    <button
                      type="button"
                      disabled={isDownloadingAll || isDeletingAll}
                      onClick={() => onDeleteAllFiles(requirement)}
                      className="rounded-full border border-rose-100 bg-white px-3 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                    >
                      {isDeletingAll ? "删除中..." : "全部删除"}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-slate-100 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm shadow-slate-100 sm:max-w-xl"
                    >
                      <button
                        type="button"
                        onClick={() => onPreviewFile(file)}
                        title={displayChineseText(file.originalFileName)}
                        className="min-w-0 max-w-[220px] truncate text-left font-medium hover:text-blue-700 sm:max-w-[360px]"
                      >
                        {displayChineseText(file.originalFileName)}
                      </button>
                      <span className="shrink-0 text-slate-400">{formatFileSize(file.fileSize)}</span>
                      <button
                        type="button"
                        disabled={deletingFileId === file.id || isDeletingAll}
                        onClick={() => onDeleteFile(file)}
                        aria-label={`删除 ${file.originalFileName}`}
                        className="shrink-0 px-1 text-base leading-none text-rose-400 hover:text-rose-700 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {visibleNoteDisplay ? (
              <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                <div className="mb-1 text-xs font-semibold text-amber-700">
                  {visibleNoteDisplay.label}
                </div>
                <div className="whitespace-pre-wrap break-words">
                  {displayChineseText(visibleNoteDisplay.text)}
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <div className="flex flex-wrap gap-2">
                {uploadedFiles.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onReview(requirement)}
                    className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    {getRequirementReviewButtonLabel(requirement)}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onUpload(requirement)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  上传文件
                </button>
                <button
                  type="button"
                  onClick={() => onNote(requirement)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {visibleInternalNote ? "修改备注" : "添加备注"}
                </button>
              </div>
              <button
                type="button"
                disabled={isDeletingRequirement}
                onClick={() => onDeleteRequirement(requirement)}
                className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
              >
                {isDeletingRequirement ? "删除中..." : "删除资料"}
              </button>
            </div>
          </div>
        );
        })}
      </div> : null}
    </>
  );

  return standalone ? (
    <DashboardCard>{content}</DashboardCard>
  ) : (
    <div>{content}</div>
  );
}

function CollapseIconButton({
  isExpanded,
  onClick,
}: {
  isExpanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isExpanded ? "收起" : "展开"}
      title={isExpanded ? "收起" : "展开"}
      className="inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-xs font-medium text-slate-500 outline-none transition hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-blue-100"
    >
      <span>{isExpanded ? "收起" : "展开"}</span>
      <span className="translate-y-[-1px] text-[9px] leading-none text-slate-400">
        {isExpanded ? "▲" : "▼"}
      </span>
    </button>
  );
}

function RequirementReviewForm({
  caseId,
  requirement,
  onCancel,
  onSuccess,
  onBusyChange,
}: {
  caseId: string;
  requirement: AdminRequirement;
  onCancel: () => void;
  onSuccess: (result: MutationResult) => Promise<void>;
  onBusyChange: (isBusy: boolean) => void;
}) {
  const hasUploadedFiles = getUploadedRequirementFiles(requirement).length > 0;
  const needsCustomerInstruction = requirement.responsibleParty === "customer";
  const isOfficeRequirement = requirement.responsibleParty === "office";
  const [newStatus, setNewStatus] = useState(getEffectiveRequirementStatus(requirement));
  const [customerInstruction, setCustomerInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onBusyChange(isSubmitting);
    return () => onBusyChange(false);
  }, [isSubmitting, onBusyChange]);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (
      !isOfficeRequirement &&
      requirement.status === "approved" &&
      newStatus === "needs_more" &&
      !confirmImportantAction("该资料已通过审核，继续后会退回为“需补充”。")
    ) {
      return;
    }

    if (
      needsCustomerInstruction &&
      (newStatus === "needs_more" || newStatus === "not_applicable") &&
      customerInstruction.trim().length === 0
    ) {
      setError("选择“需补充”或“需修改”时，请填写补充说明。");
      return;
    }

    try {
      setIsSubmitting(true);
      await patchJson(`/api/admin/requirements/${requirement.id}/status`, {
        caseId,
        newStatus,
        ...(needsCustomerInstruction ? { customerInstruction } : {}),
      });
      await onSuccess({
        message: isOfficeRequirement ? "事务所资料制作状态已更新。" : "资料审核状态已更新。",
      });
    } catch (submitError) {
      setError(toAdminErrorMessage(submitError, "资料审核失败。请检查状态和原因后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitReview} className="grid gap-4">
      <InlineError message={error} />
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="newStatus">
          状态
        </label>
        <select
          id="newStatus"
          value={newStatus}
          onChange={(event) => setNewStatus(event.target.value)}
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        >
          {isOfficeRequirement ? (
            <>
              <option value="submitted">制作中</option>
              <option value="approved">已完成</option>
              <option value="not_applicable">已确认</option>
            </>
          ) : (
            <>
              {!hasUploadedFiles ? <option value="not_submitted">未提交</option> : null}
              <option value="submitted">已提交</option>
              <option value="needs_more">需补充</option>
              <option value="not_applicable">需修改</option>
              <option value="approved">已通过</option>
            </>
          )}
        </select>
      </div>
      {needsCustomerInstruction ? (
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="customerInstruction">
            补充说明
          </label>
          <textarea
            id="customerInstruction"
            value={customerInstruction}
            onChange={(event) => setCustomerInstruction(event.target.value)}
            placeholder="向客户补充说明"
            className="min-h-24 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </div>
      ) : null}
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel={isOfficeRequirement ? "保存状态" : "保存审核"}
        submittingLabel="保存中..."
      />
    </form>
  );
}

function RequirementNoteForm({
  caseId,
  requirement,
  onCancel,
  onSuccess,
  onBusyChange,
}: {
  caseId: string;
  requirement: AdminRequirement;
  onCancel: () => void;
  onSuccess: (result: MutationResult) => Promise<void>;
  onBusyChange: (isBusy: boolean) => void;
}) {
  const [internalNote, setInternalNote] = useState(
    getVisibleRequirementInternalNote(requirement) ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onBusyChange(isSubmitting);
    return () => onBusyChange(false);
  }, [isSubmitting, onBusyChange]);

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      setIsSubmitting(true);
      await patchJson(`/api/admin/requirements/${requirement.id}/note`, {
        caseId,
        internalNote,
      });
      await onSuccess({ message: internalNote.trim() ? "内部备注已保存。" : "内部备注已清空。" });
    } catch (submitError) {
      setError(toAdminErrorMessage(submitError, "内部备注保存失败，请稍后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitNote} className="grid gap-4">
      <InlineError message={error} />
      <div className="grid gap-2">
        <textarea
          id="requirementInternalNote"
          aria-label="备注"
          value={internalNote}
          onChange={(event) => setInternalNote(event.target.value)}
          className="min-h-36 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          placeholder="仅后台可见，不会显示给客户。"
        />
      </div>
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel="保存备注"
        submittingLabel="保存中..."
      />
    </form>
  );
}

function CustomerEditForm({
  customer,
  onCancel,
  onSuccess,
  onBusyChange,
}: {
  customer: AdminCaseDetail["customer"];
  onCancel: () => void;
  onSuccess: (result: MutationResult) => Promise<void>;
  onBusyChange: (isBusy: boolean) => void;
}) {
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.email ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [nationality, setNationality] = useState(customer.nationality ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onBusyChange(isSubmitting);
    return () => onBusyChange(false);
  }, [isSubmitting, onBusyChange]);

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (name.trim().length === 0) {
      setError("请输入客户姓名。");
      return;
    }

    try {
      setIsSubmitting(true);
      await patchJson(`/api/admin/customers/${customer.id}`, {
        name,
        email,
        phone,
        nationality,
      });
      await onSuccess({ message: "客户信息已更新。" });
    } catch (submitError) {
      setError(toAdminErrorMessage(submitError, "客户信息保存失败，请稍后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitCustomer} className="grid gap-4">
      <InlineError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="customerName">
            姓名
          </label>
          <input
            id="customerName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="customerEmail">
            邮箱
          </label>
          <input
            id="customerEmail"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="customerPhone">
            电话
          </label>
          <input
            id="customerPhone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="customerNationality">
            国籍
          </label>
          <input
            id="customerNationality"
            value={nationality}
            onChange={(event) => setNationality(event.target.value)}
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </div>
      </div>
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel="保存客户信息"
        submittingLabel="保存中..."
      />
    </form>
  );
}

function RequirementUploadForm({
  caseId,
  requirement,
  onCancel,
  onSuccess,
  onBusyChange,
}: {
  caseId: string;
  requirement: AdminRequirement;
  onCancel: () => void;
  onSuccess: (result: MutationResult) => Promise<void>;
  onBusyChange: (isBusy: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onBusyChange(isSubmitting);
    return () => onBusyChange(false);
  }, [isSubmitting, onBusyChange]);

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (selectedFiles.length === 0) {
      setError("请选择要上传的文件。可一次选择多个文件。");
      return;
    }

    const uploadForm = new FormData();
    uploadForm.set("caseId", caseId);
    selectedFiles.forEach((file) => uploadForm.append("file", file));

    try {
      setIsSubmitting(true);
      await postForm(`/api/admin/requirements/${requirement.id}/files`, uploadForm);
      await onSuccess({ message: `已上传 ${selectedFiles.length} 个文件。` });
    } catch (submitError) {
      setError(toAdminErrorMessage(submitError, "文件上传失败。请重新选择文件后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitUpload} className="grid gap-4">
      <InlineError message={error} />
      <div className="grid gap-2">
        <label
          htmlFor="adminUploadFile"
          className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-dashed border-blue-200 bg-slate-50 px-4 py-4 transition hover:border-blue-300 hover:bg-blue-50/70"
        >
          <span>
            <span className="block text-sm font-semibold text-slate-900">选择要上传的文件</span>
            <span className="mt-1 block text-xs text-slate-500">支持一次选择多个文件</span>
          </span>
          <span className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-100">
            选择文件
          </span>
        </label>
        <input
          id="adminUploadFile"
          name="file"
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => setSelectedFiles(Array.from(event.currentTarget.files ?? []))}
        />
        {selectedFiles.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-xs font-semibold text-slate-500">
              <span>已选择 {selectedFiles.length} 个文件</span>
              <button
                type="button"
                onClick={() => setSelectedFiles([])}
                className="text-blue-600 hover:text-blue-700"
              >
                清空
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {selectedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-slate-700"
                >
                  <span className="min-w-0 flex-1 truncate">{displayChineseText(file.name)}</span>
                  <span className="shrink-0 text-xs text-slate-400">{formatFileSize(String(file.size))}</span>
                  <button
                    type="button"
                    aria-label={`移除 ${file.name}`}
                    onClick={() =>
                      setSelectedFiles((currentFiles) =>
                        currentFiles.filter((_, currentIndex) => currentIndex !== index),
                      )
                    }
                    className="flex h-7 w-7 shrink-0 items-center justify-center text-xl leading-none text-rose-500 hover:text-rose-700"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel="上传文件"
        submittingLabel="上传中..."
      />
    </form>
  );
}

function ImmigrationRequestForm({
  caseId,
  onCancel,
  onSuccess,
  onBusyChange,
}: {
  caseId: string;
  onCancel: () => void;
  onSuccess: (result: MutationResult) => Promise<void>;
  onBusyChange: (isBusy: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onBusyChange(isSubmitting);
    return () => onBusyChange(false);
  }, [isSubmitting, onBusyChange]);

  async function submitImmigrationRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const title = optionalFormString(form, "title");
    const responsibleParty = optionalFormString(form, "responsibleParty");

    if (!title || (responsibleParty !== "customer" && responsibleParty !== "office")) {
      setError("请填写标题并选择负责方。");
      return;
    }

    const body = {
      title,
      responsibleParty,
      customerInstruction: optionalFormString(form, "customerInstruction"),
      internalNote: optionalFormString(form, "internalNote"),
      dueDate: optionalFormString(form, "dueDate"),
      reason: optionalFormString(form, "reason"),
      portalVisible: form.get("portalVisible") === "on",
      portalDownloadable: form.get("portalDownloadable") === "on",
      setCasePhase: form.get("setCasePhase") === "on",
    };

    try {
      setIsSubmitting(true);
      await postJson(`/api/admin/cases/${caseId}/immigration-requests`, body);
      await onSuccess({ message: "入管追加材料已添加。" });
    } catch (submitError) {
      setError(toAdminErrorMessage(submitError, "追加材料创建失败。请检查标题、负责方和日期后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitImmigrationRequest} className="grid gap-4">
      <InlineError message={error} />
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="immigrationTitle">
          材料标题
        </label>
        <input
          id="immigrationTitle"
          name="title"
          required
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="responsibleParty">
          负责方
        </label>
        <select
          id="responsibleParty"
          name="responsibleParty"
          defaultValue="customer"
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        >
          <option value="customer">客户</option>
          <option value="office">事务所</option>
        </select>
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="immigrationCustomerInstruction">
          给客户看的说明
        </label>
        <textarea
          id="immigrationCustomerInstruction"
          name="customerInstruction"
          placeholder="此说明会显示给客户，请写明需要提交的资料内容和注意事项。"
          className="min-h-20 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="immigrationInternalNote">
          内部备注
        </label>
        <textarea
          id="immigrationInternalNote"
          name="internalNote"
          className="min-h-20 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="immigrationDueDate">
            截止日期
          </label>
          <DateTextInput
            id="immigrationDueDate"
            name="dueDate"
            min={todayDateValue}
            placeholder="YYYY-MM-DD"
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="immigrationReason">
            原因
          </label>
          <input
            id="immigrationReason"
            name="reason"
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </div>
      </div>
      <div className="grid gap-2 text-sm text-slate-600">
        <label className="flex items-center gap-2">
          <input name="portalVisible" type="checkbox" className="h-4 w-4 rounded border-slate-300" />
          Portal 可见
        </label>
        <label className="flex items-center gap-2">
          <input name="portalDownloadable" type="checkbox" className="h-4 w-4 rounded border-slate-300" />
          Portal 可下载
        </label>
        <label className="flex items-center gap-2">
          <input name="setCasePhase" type="checkbox" className="h-4 w-4 rounded border-slate-300" />
          同时将案件阶段切换为资料收集中
        </label>
      </div>
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel="添加材料"
        submittingLabel="添加中..."
      />
    </form>
  );
}

function CustomRequirementForm({
  caseId,
  responsibleParty,
  onCancel,
  onSuccess,
  onBusyChange,
}: {
  caseId: string;
  responsibleParty: "customer" | "office";
  onCancel: () => void;
  onSuccess: (result: MutationResult) => Promise<void>;
  onBusyChange: (isBusy: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onBusyChange(isSubmitting);
    return () => onBusyChange(false);
  }, [isSubmitting, onBusyChange]);

  async function submitCustomRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const title = optionalFormString(form, "title");

    if (!title) {
      setError("请填写追加资料名称。");
      return;
    }

    try {
      setIsSubmitting(true);
      await postJson(`/api/admin/cases/${caseId}/custom-requirements`, {
        title,
        responsibleParty,
        customerInstruction: optionalFormString(form, "customerInstruction"),
      });
      await onSuccess({ message: "追加资料已添加。" });
    } catch (submitError) {
      setError(toAdminErrorMessage(submitError, "追加资料创建失败，请检查资料名称后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitCustomRequirement} className="grid gap-4">
      <InlineError message={error} />
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="customRequirementTitle">
          追加资料名称
        </label>
        <input
          id="customRequirementTitle"
          name="title"
          required
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="customRequirementInstruction">
          补充说明
        </label>
        <textarea
          id="customRequirementInstruction"
          name="customerInstruction"
          placeholder="此说明会显示给客户，请写明需要提交的资料内容和注意事项。"
          className="min-h-24 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {responsibleParty === "customer"
          ? "该资料会显示在客户画面中。"
          : "该资料只显示在事务所后台。"}
      </div>
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel="追加资料"
        submittingLabel="追加中..."
      />
    </form>
  );
}

function ChangeHistoryList({
  events,
  requirements,
}: {
  events: AdminTimelineEvent[];
  requirements: AdminRequirement[];
}) {
  const requirementLookup = useMemo(() => buildRequirementLookup(requirements), [requirements]);

  if (events.length === 0) {
    return <p className="text-sm text-slate-500">暂无变更履历。</p>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {events.map((event) => (
        <div key={event.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="break-words text-sm font-medium text-slate-900">
              {formatChangeHistorySummary(event.summary)}
            </div>
            <div className="mt-0.5 break-words text-xs leading-5 text-slate-500">
              {formatChangeHistoryDetail(event, requirementLookup)}
            </div>
          </div>
          <div className="shrink-0 text-xs text-slate-400">{formatDateTime(event.createdAt)}</div>
        </div>
      ))}
    </div>
  );
}

function ChangeHistoryModal({
  events,
  requirements,
  onClose,
  closeDisabled,
}: {
  events: AdminTimelineEvent[];
  requirements: AdminRequirement[];
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  const [openFilter, setOpenFilter] = useState<"requirements" | "time" | null>(null);
  const [selectedRequirementIds, setSelectedRequirementIds] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const requirementLookup = useMemo(() => buildRequirementLookup(requirements), [requirements]);
  const hasFilter = selectedRequirementIds.length > 0 || fromDate || toDate;

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const eventDate = event.createdAt.slice(0, 10);

      if (fromDate && eventDate < fromDate) {
        return false;
      }

      if (toDate && eventDate > toDate) {
        return false;
      }

      if (selectedRequirementIds.length === 0) {
        return true;
      }

      const requirement = getRequirementFromEvent(event, requirementLookup);
      return requirement ? selectedRequirementIds.includes(requirement.id) : false;
    });
  }, [events, fromDate, requirementLookup, selectedRequirementIds, toDate]);

  function toggleRequirement(requirementId: string) {
    setSelectedRequirementIds((current) =>
      current.includes(requirementId)
        ? current.filter((id) => id !== requirementId)
        : [...current, requirementId],
    );
  }

  function clearFilters() {
    setSelectedRequirementIds([]);
    setFromDate("");
    setToDate("");
  }

  return (
    <Modal
      title={
        <div className="relative flex flex-wrap items-center gap-2">
          <span>全部变更履历</span>
          <div className="relative flex items-center gap-1.5 text-xs font-medium">
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenFilter((current) => (current === "requirements" ? null : "requirements"))}
                className={[
                  "rounded-full border px-2.5 py-1 transition",
                  selectedRequirementIds.length > 0 || openFilter === "requirements"
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                ].join(" ")}
              >
                资料名{selectedRequirementIds.length > 0 ? ` ${selectedRequirementIds.length}` : ""}
                <span className="ml-1 text-[9px] text-slate-400">
                  {openFilter === "requirements" ? "▲" : "▼"}
                </span>
              </button>
              {openFilter === "requirements" ? (
                <div className="absolute left-0 top-full z-10 mt-2 w-[min(420px,calc(100vw-3rem))] rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xl shadow-slate-950/10">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-slate-600">资料名</div>
                  {selectedRequirementIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelectedRequirementIds([])}
                      className="text-xs font-medium text-blue-700 hover:text-blue-800"
                    >
                      清除
                    </button>
                  ) : null}
                </div>
                <div className="soft-scrollbar max-h-40 overflow-auto pr-1">
                  {requirements.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-slate-500">暂无可筛选资料。</p>
                  ) : (
                    <div className="grid gap-0.5 sm:grid-cols-2">
                      {requirements.map((requirement) => (
                        <label
                          key={requirement.id}
                          className="flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedRequirementIds.includes(requirement.id)}
                            onChange={() => toggleRequirement(requirement.id)}
                            className="h-3.5 w-3.5 rounded border-slate-300"
                          />
                          <span className="truncate">{displayChineseText(requirement.title)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              ) : null}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenFilter((current) => (current === "time" ? null : "time"))}
                className={[
                  "rounded-full border px-2.5 py-1 transition",
                  fromDate || toDate || openFilter === "time"
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                ].join(" ")}
              >
                时间
                <span className="ml-1 text-[9px] text-slate-400">
                  {openFilter === "time" ? "▲" : "▼"}
                </span>
              </button>
              {openFilter === "time" ? (
                <div className="absolute left-0 top-full z-10 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xl shadow-slate-950/10">
                <div className="mb-2 text-xs font-semibold text-slate-600">时间筛选</div>
                <div className="grid gap-2">
                  <label className="grid gap-1 text-xs font-medium text-slate-500">
                    开始日期
                    <DateTextInput
                      value={fromDate}
                      onChange={(event) => setFromDate(event.target.value)}
                      className="h-10 bg-white text-sm font-normal"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-slate-500">
                    结束日期
                    <DateTextInput
                      value={toDate}
                      onChange={(event) => setToDate(event.target.value)}
                      className="h-10 bg-white text-sm font-normal"
                    />
                  </label>
                </div>
              </div>
              ) : null}
            </div>
            {hasFilter ? (
              <button
                type="button"
                onClick={clearFilters}
                className="px-1.5 py-1 text-slate-400 hover:text-slate-700"
              >
                清除
              </button>
            ) : null}
          </div>
        </div>
      }
      onClose={onClose}
      closeDisabled={closeDisabled}
    >
      <div className="grid h-[min(620px,calc(100vh-10rem))] min-h-[460px] grid-rows-[auto_1fr] gap-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>显示 {filteredEvents.length} / {events.length} 条履历</span>
        </div>

        <div className="soft-scrollbar overflow-y-auto pr-1">
          <ChangeHistoryList events={filteredEvents} requirements={requirements} />
        </div>
      </div>
    </Modal>
  );
}

function formatPhaseWarning(warning: CasePhaseWarning): string {
  if (warning.type === "required_requirements_incomplete") {
    return `必需资料尚未完成：${warning.count} 项`;
  }

  return `${warning.type}：${warning.count}`;
}

function CasePhaseChangeForm({
  caseId,
  currentPhase,
  onCancel,
  onSuccess,
  onBusyChange,
}: {
  caseId: string;
  currentPhase: string;
  onCancel: () => void;
  onSuccess: (result: MutationResult) => Promise<void>;
  onBusyChange: (isBusy: boolean) => void;
}) {
  const phaseOptions = useMemo(() => getAllowedCasePhaseOptions(currentPhase), [currentPhase]);
  const defaultNewPhase = phaseOptions[0] ?? "";
  const [newPhase, setNewPhase] = useState(defaultNewPhase);
  const [reason, setReason] = useState("");
  const [submittedAt, setSubmittedAt] = useState("");
  const [submissionNumber, setSubmissionNumber] = useState("");
  const [resultAt, setResultAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setNewPhase(defaultNewPhase);
  }, [defaultNewPhase]);

  useEffect(() => {
    onBusyChange(isSubmitting);
    return () => onBusyChange(false);
  }, [isSubmitting, onBusyChange]);

  const currentIndex = casePhaseSteps.indexOf(currentPhase);
  const nextIndex = casePhaseSteps.indexOf(newPhase);
  const isRollback = currentIndex >= 0 && nextIndex >= 0 && currentIndex > nextIndex;
  const needsConfirmation = newPhase === "approved" || isRollback;

  async function submitPhase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!newPhase) {
      setError("当前阶段暂无可切换的下一阶段。");
      return;
    }

    if (!phaseOptions.includes(newPhase)) {
      setError("该阶段不能从当前阶段直接切换。请按案件流程选择允许的下一阶段。");
      return;
    }

    if (newPhase === currentPhase) {
      setError("请选择一个不同的案件阶段。");
      return;
    }

    if (
      needsConfirmation &&
      !confirmImportantAction(
        `案件阶段将从“${displayLabel(currentPhase)}”切换为“${displayLabel(newPhase)}”。`,
      )
    ) {
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await patchJson<ChangeCasePhaseResult>(
        `/api/admin/cases/${caseId}/phase`,
        {
          newPhase,
          reason,
          submittedAt,
          submissionNumber,
          resultAt,
          allowWithWarnings: false,
        },
      );
      const warningMessage =
        result.warnings.length > 0
          ? `提示：${result.warnings.map(formatPhaseWarning).join(" / ")}`
          : undefined;

      await onSuccess({
        message: `案件阶段已从 ${displayLabel(result.oldPhase)} 切换为 ${displayLabel(result.newPhase)}。`,
        warningMessage,
      });
    } catch (submitError) {
      setError(formatCasePhaseSubmitError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitPhase} className="grid gap-4">
      <InlineError message={error} />
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="newPhase">
          新案件阶段
        </label>
        <select
          id="newPhase"
          value={newPhase}
          onChange={(event) => setNewPhase(event.target.value)}
          disabled={phaseOptions.length === 0}
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        >
          <option value="" disabled>
            请选择案件阶段
          </option>
          {phaseOptions.map((phase) => (
            <option key={phase} value={phase}>
              {displayLabel(phase)}
            </option>
          ))}
        </select>
        {phaseOptions.length > 0 ? (
          <p className="text-xs text-slate-500">
            当前阶段可切换到：{phaseOptions.map(displayLabel).join("、")}
          </p>
        ) : (
          <p className="text-xs text-slate-500">当前阶段没有可继续切换的下一阶段。</p>
        )}
        {needsConfirmation ? (
          <p className="text-xs text-amber-700">该阶段切换提交前会要求确认，建议填写原因。</p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="phaseReason">
          原因
        </label>
        <input
          id="phaseReason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="可选；回退或审查完了时建议填写"
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      {newPhase === "submitted" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="submittedAt">
              提交日期
            </label>
            <DateTextInput
              id="submittedAt"
              value={submittedAt}
              onChange={(event) => setSubmittedAt(event.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="submissionNumber">
              受理号
            </label>
            <input
              id="submissionNumber"
              value={submissionNumber}
              onChange={(event) => setSubmissionNumber(event.target.value)}
              className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </div>
        </div>
      ) : null}
      {newPhase === "approved" ? (
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="resultAt">
            结果日期
          </label>
          <DateTextInput
            id="resultAt"
            value={resultAt}
            onChange={(event) => setResultAt(event.target.value)}
            placeholder="YYYY-MM-DD"
          />
        </div>
      ) : null}
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel="切换阶段"
        submittingLabel="切换中..."
      />
    </form>
  );
}

function ApplicationConfirmationForm({
  caseId,
  onCancel,
  onSuccess,
  onBusyChange,
}: {
  caseId: string;
  onCancel: () => void;
  onSuccess: (result: MutationResult) => Promise<void>;
  onBusyChange: (isBusy: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [storageBucket, setStorageBucket] = useState("");
  const [storagePath, setStoragePath] = useState("");
  const [supersedePendingVersions, setSupersedePendingVersions] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onBusyChange(isSubmitting);
    return () => onBusyChange(false);
  }, [isSubmitting, onBusyChange]);

  async function submitConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const normalizedTitle = title.trim();
    const normalizedStorageBucket = storageBucket.trim();
    const normalizedStoragePath = storagePath.trim();
    const normalizedReason = reason.trim();
    const parsedVersion = version.trim().length > 0 ? Number(version) : undefined;

    if (!normalizedTitle || !normalizedStorageBucket || !normalizedStoragePath) {
      setError("请填写标题、storage bucket 和 storage path。");
      return;
    }

    if (
      parsedVersion !== undefined &&
      (!Number.isInteger(parsedVersion) || parsedVersion <= 0)
    ) {
      setError("版本号必须是正整数。");
      return;
    }

    if (
      supersedePendingVersions &&
      !confirmImportantAction("旧的 pending 申请书确认版本会被标记为 superseded。")
    ) {
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await postJson<CreatedApplicationConfirmationResult>(
        `/api/admin/cases/${caseId}/application-confirmations`,
        {
          title: normalizedTitle,
          version: parsedVersion,
          storageBucket: normalizedStorageBucket,
          storagePath: normalizedStoragePath,
          supersedePendingVersions,
          reason: normalizedReason.length > 0 ? normalizedReason : undefined,
        },
      );

      await onSuccess({
        message: `申请书确认版本已创建：${result.title} v${result.version}。`,
      });
    } catch (submitError) {
      setError(toAdminErrorMessage(submitError, "申请书确认版本创建失败。请检查文件登记信息后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitConfirmation} className="grid gap-4">
      <InlineError message={error} />
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-900">
        当前只是登记已存在的确认文件，不是上传文件。storage bucket 和 storage path
        必须对应已经存在的文件；本操作不会生成预览或下载链接。
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="confirmationTitle">
          标题
        </label>
        <input
          id="confirmationTitle"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="confirmationVersion">
            版本号
          </label>
          <input
            id="confirmationVersion"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            inputMode="numeric"
            placeholder="可选；不填则自动递增"
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="confirmationReason">
            原因
          </label>
          <input
            id="confirmationReason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="confirmationStorageBucket">
          Storage bucket
        </label>
        <input
          id="confirmationStorageBucket"
          value={storageBucket}
          onChange={(event) => setStorageBucket(event.target.value)}
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="confirmationStoragePath">
          Storage path
        </label>
        <input
          id="confirmationStoragePath"
          value={storagePath}
          onChange={(event) => setStoragePath(event.target.value)}
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={supersedePendingVersions}
          onChange={(event) => setSupersedePendingVersions(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        将旧的 pending 版本标记为 superseded
      </label>
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel="创建确认版本"
        submittingLabel="创建中..."
      />
    </form>
  );
}

function TokenRegenerateForm({
  caseId,
  onCancel,
  onSuccess,
  onBusyChange,
}: {
  caseId: string;
  onCancel: () => void;
  onSuccess: (result: MutationResult) => Promise<void>;
  onBusyChange: (isBusy: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [regeneratedToken, setRegeneratedToken] =
    useState<RegeneratedPortalTokenResult | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onBusyChange(isSubmitting);
    return () => onBusyChange(false);
  }, [isSubmitting, onBusyChange]);

  async function submitRegenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCopyMessage(null);

    if (
      !confirmImportantAction(
        "旧的有效客户访问链接会失效。新的客户访问链接只会显示一次，请准备好立即复制。",
      )
    ) {
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await postJson<RegeneratedPortalTokenResult>(
        `/api/admin/cases/${caseId}/token/regenerate`,
        {
          reason: reason.trim().length > 0 ? reason.trim() : undefined,
          expiresAt: expiresAt.trim().length > 0 ? expiresAt : undefined,
        },
      );

      setRegeneratedToken(result);
      await onSuccess({ message: "客户访问链接已重新生成。请立即复制新的客户链接。" });
    } catch (submitError) {
      setError(toAdminErrorMessage(submitError, "客户访问链接重新生成失败。请稍后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyPortalLink() {
    if (!regeneratedToken) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createPortalAccessUrl(regeneratedToken.plaintextToken));
      setCopyMessage("已复制到剪贴板。");
    } catch {
      setCopyMessage("复制失败，请手动选择访问链接。");
    }
  }

  return (
    <form onSubmit={submitRegenerate} className="grid gap-4">
      <InlineError message={error} />
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
        重新生成会让旧的客户访问链接失效。新的客户链接只在本窗口显示一次，关闭后无法再次查看。
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="tokenRegenerateReason">
          原因
        </label>
        <input
          id="tokenRegenerateReason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="可选，写入安全的操作原因"
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="tokenRegenerateExpiresAt">
          过期时间
        </label>
        <DateTextInput
          id="tokenRegenerateExpiresAt"
          includeTime
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
          placeholder="YYYY-MM-DD HH:mm"
        />
      </div>

      {regeneratedToken ? (
          <div className="grid gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
            <div>
            <div className="text-base font-semibold">客户访问链接只显示一次。</div>
            <div className="mt-1 text-amber-800">请现在复制并交给客户，关闭弹窗后无法再次查看。</div>
          </div>
          <div className="break-all rounded-xl border border-amber-300 bg-white p-3 font-mono text-xs text-slate-900 shadow-inner">
            {createPortalAccessUrl(regeneratedToken.plaintextToken)}
          </div>
          <div className="grid gap-1 text-xs text-amber-800">
            <div>新访问令牌 ID：{regeneratedToken.newTokenId}</div>
            <div>旧访问令牌 ID：{regeneratedToken.previousTokenId ?? "无"}</div>
            <div>有效期：{formatDateTime(regeneratedToken.expiresAt)}</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={copyPortalLink}
              className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              复制客户链接
            </button>
            {copyMessage ? <span className="text-sm text-amber-800">{copyMessage}</span> : null}
          </div>
        </div>
      ) : null}

      <FormActions
        cancelLabel="关闭"
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel={regeneratedToken ? "再次重新生成" : "重新生成链接"}
        submittingLabel="重新生成中..."
      />
    </form>
  );
}

function TokenRevokeForm({
  caseId,
  onCancel,
  onSuccess,
  onBusyChange,
}: {
  caseId: string;
  onCancel: () => void;
  onSuccess: (result: MutationResult) => Promise<void>;
  onBusyChange: (isBusy: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onBusyChange(isSubmitting);
    return () => onBusyChange(false);
  }, [isSubmitting, onBusyChange]);

  async function submitRevoke(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!confirmImportantAction("撤销后，客户访问链接会失效。")) {
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await postJson<RevokedPortalTokenResult>(
        `/api/admin/cases/${caseId}/token/revoke`,
        {
          reason: reason.trim().length > 0 ? reason.trim() : undefined,
        },
      );

      await onSuccess({
        message: result.revokedTokenId
          ? `客户访问链接已撤销：${result.revokedTokenId}。`
          : "当前没有有效访问令牌，无需撤销。",
      });
    } catch (submitError) {
      setError(toAdminErrorMessage(submitError, "客户访问链接撤销失败。请稍后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitRevoke} className="grid gap-4">
      <InlineError message={error} />
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900">
        撤销后，客户将无法继续使用当前访问链接查看案件。此操作不会显示或返回明文访问令牌。
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="tokenRevokeReason">
          原因
        </label>
        <input
          id="tokenRevokeReason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="可选，写入安全的操作原因"
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel="撤销链接"
        submittingLabel="撤销中..."
        submitTone="rose"
      />
    </form>
  );
}

export function AdminCaseDetailPage({ caseId }: Props) {
  const router = useRouter();
  const [caseDetail, setCaseDetail] = useState<AdminCaseDetail | null>(null);
  const [requirements, setRequirements] = useState<AdminRequirement[]>([]);
  const [timeline, setTimeline] = useState<AdminTimelineEvent[]>([]);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreviewState | null>(null);
  const [fileDeleteConfirmation, setFileDeleteConfirmation] =
    useState<FileDeleteConfirmation | null>(null);
  const [requirementDeleteConfirmation, setRequirementDeleteConfirmation] =
    useState<RequirementDeleteConfirmation | null>(null);
  const [caseDeleteConfirmation, setCaseDeleteConfirmation] = useState(false);
  const [fileDeleteError, setFileDeleteError] = useState<string | null>(null);
  const [requirementDeleteError, setRequirementDeleteError] = useState<string | null>(null);
  const [caseDeleteError, setCaseDeleteError] = useState<string | null>(null);
  const [downloadingRequirementId, setDownloadingRequirementId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deletingRequirementId, setDeletingRequirementId] = useState<string | null>(null);
  const [deletingRequirementRecordId, setDeletingRequirementRecordId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isModalBusy, setIsModalBusy] = useState(false);
  const [isImmigrationExpanded, setIsImmigrationExpanded] = useState(true);
  const [isDeletingCase, setIsDeletingCase] = useState(false);

  const loadCase = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const [detailData, requirementData, timelineData] = await Promise.all([
      apiGet<AdminCaseDetail | null>(`/api/admin/cases/${caseId}`),
      apiGet<AdminRequirement[]>(`/api/admin/cases/${caseId}/requirements`),
      apiGet<AdminTimelineEvent[]>(`/api/admin/cases/${caseId}/timeline`),
    ]);

    setCaseDetail(detailData);
    setRequirements(requirementData);
    setTimeline(timelineData);
    setIsLoading(false);
  }, [caseId]);

  useEffect(() => {
    let isMounted = true;

    async function loadMountedCase() {
      try {
        await loadCase();
      } catch (loadError) {
        if (isMounted) {
          setError(toAdminErrorMessage(loadError, "案件加载失败。请确认 caseId 是否正确。"));
          setIsLoading(false);
        }
      }
    }

    void loadMountedCase();

    return () => {
      isMounted = false;
    };
  }, [loadCase]);

  async function handleMutationSuccess(result: MutationResult) {
    setActiveModal(null);
    setIsModalBusy(false);
    setMessage(result.message);
    setWarning(result.warningMessage ?? null);
    try {
      await loadCase();
    } catch (loadError) {
      setError(toAdminErrorMessage(loadError, "案件刷新失败。请手动刷新页面。"));
      setIsLoading(false);
    }
  }

  async function handleTokenRegenerateSuccess(result: MutationResult) {
    setIsModalBusy(false);
    setMessage(result.message);
    setWarning(result.warningMessage ?? null);
    try {
      await loadCase();
    } catch (loadError) {
      setError(toAdminErrorMessage(loadError, "案件刷新失败。请手动刷新页面。"));
      setIsLoading(false);
    }
  }

  async function openFilePreview(file: AdminRequirementFile) {
    setError(null);

    try {
      const result = await postJson<AdminFileSignedUrlResult>(
        `/api/admin/files/${file.id}/signed-url`,
        {},
      );

      if (!canPreviewInModal(file)) {
        triggerFileDownload({
          fileUrl: result.signedUrl,
          fileName: file.originalFileName,
        });
        setMessage("文件下载已开始。");
        return;
      }

      setFilePreview({
        fileName: file.originalFileName,
        fileUrl: result.signedUrl,
        expiresAt: result.expiresAt,
      });
    } catch (previewError) {
      setError(toAdminErrorMessage(previewError, "文件预览链接生成失败，请稍后重试。"));
    }
  }

  async function downloadAllFiles(requirement: AdminRequirement) {
    const uploadedFiles = requirement.files.filter((file) => file.status === "uploaded");

    if (uploadedFiles.length === 0) {
      return;
    }

    setError(null);
    setDownloadingRequirementId(requirement.id);

    try {
      if (uploadedFiles.length === 1) {
        const file = uploadedFiles[0];
        const result = await postJson<AdminFileSignedUrlResult>(
          `/api/admin/files/${file.id}/signed-url`,
          {},
        );

        triggerFileDownload({
          fileUrl: result.signedUrl,
          fileName: file.originalFileName,
        });
        setMessage("文件下载已开始。");
        return;
      }

      const archive = await postBlob(
        `/api/admin/requirements/${requirement.id}/files/archive`,
      );
      triggerBlobDownload({
        blob: archive,
        fileName: `${requirement.title || "files"}.zip`,
      });
      setMessage(`已开始下载 ${uploadedFiles.length} 个文件的压缩包。`);
    } catch (downloadError) {
      setError(toAdminErrorMessage(downloadError, "部分文件下载链接生成失败，请稍后重试。"));
    } finally {
      setDownloadingRequirementId(null);
    }
  }

  async function deleteUploadedFile(file: AdminRequirementFile) {
    setError(null);
    setFileDeleteError(null);
    setDeletingFileId(file.id);

    try {
      await deleteJson(`/api/admin/files/${file.id}`);
      setMessage("文件已删除。");
      setFileDeleteConfirmation(null);
      await loadCase();
    } catch (deleteError) {
      setFileDeleteError(toAdminErrorMessage(deleteError, "文件删除失败，请稍后重试。"));
    } finally {
      setDeletingFileId(null);
    }
  }

  async function deleteAllUploadedFiles(requirement: AdminRequirement) {
    const uploadedFiles = requirement.files.filter((file) => file.status === "uploaded");

    if (uploadedFiles.length === 0) {
      return;
    }

    setError(null);
    setFileDeleteError(null);
    setDeletingRequirementId(requirement.id);

    try {
      await deleteJson(`/api/admin/requirements/${requirement.id}/files`);
      setMessage(`已删除 ${uploadedFiles.length} 个文件。`);
      setFileDeleteConfirmation(null);
      await loadCase();
    } catch (deleteError) {
      setFileDeleteError(toAdminErrorMessage(deleteError, "全部删除失败，请稍后重试。"));
    } finally {
      setDeletingRequirementId(null);
    }
  }

  function requestDeleteUploadedFile(file: AdminRequirementFile) {
    setFileDeleteError(null);
    setFileDeleteConfirmation({
      type: "single",
      file,
    });
  }

  function requestDeleteAllUploadedFiles(requirement: AdminRequirement) {
    const uploadedFiles = requirement.files.filter((file) => file.status === "uploaded");

    if (uploadedFiles.length === 0) {
      return;
    }

    setFileDeleteError(null);
    setFileDeleteConfirmation({
      type: "all",
      requirement,
      fileCount: uploadedFiles.length,
    });
  }

  function requestDeleteRequirement(requirement: AdminRequirement) {
    setRequirementDeleteError(null);
    setRequirementDeleteConfirmation({
      requirement,
      uploadedFileCount: getUploadedRequirementFiles(requirement).length,
    });
  }

  async function confirmFileDelete() {
    if (!fileDeleteConfirmation) {
      return;
    }

    if (fileDeleteConfirmation.type === "single") {
      await deleteUploadedFile(fileDeleteConfirmation.file);
      return;
    }

    await deleteAllUploadedFiles(fileDeleteConfirmation.requirement);
  }

  function closeFileDeleteConfirmation() {
    if (deletingFileId || deletingRequirementId) {
      return;
    }

    setFileDeleteConfirmation(null);
    setFileDeleteError(null);
  }

  async function deleteRequirement(requirement: AdminRequirement) {
    setError(null);
    setRequirementDeleteError(null);
    setDeletingRequirementRecordId(requirement.id);

    try {
      await deleteJson(`/api/admin/requirements/${requirement.id}`, {
        caseId,
      });
      setMessage("资料已删除。");
      setRequirementDeleteConfirmation(null);
      await loadCase();
    } catch (deleteError) {
      setRequirementDeleteError(toAdminErrorMessage(deleteError, "资料删除失败，请稍后重试。"));
    } finally {
      setDeletingRequirementRecordId(null);
    }
  }

  async function confirmRequirementDelete() {
    if (!requirementDeleteConfirmation) {
      return;
    }

    await deleteRequirement(requirementDeleteConfirmation.requirement);
  }

  function closeRequirementDeleteConfirmation() {
    if (deletingRequirementRecordId) {
      return;
    }

    setRequirementDeleteConfirmation(null);
    setRequirementDeleteError(null);
  }

  function requestDeleteCase() {
    setCaseDeleteError(null);
    setCaseDeleteConfirmation(true);
  }

  async function confirmCaseDelete() {
    setCaseDeleteError(null);
    setIsDeletingCase(true);

    try {
      await deleteJson<RemovedAdminCaseResult>(`/api/admin/cases/${caseId}`);
      router.push("/admin/cases");
      router.refresh();
    } catch (deleteError) {
      setCaseDeleteError(toAdminErrorMessage(deleteError, "案件删除失败，请稍后重试。"));
    } finally {
      setIsDeletingCase(false);
    }
  }

  function closeCaseDeleteConfirmation() {
    if (isDeletingCase) {
      return;
    }

    setCaseDeleteConfirmation(false);
    setCaseDeleteError(null);
  }

  function closeFilePreview() {
    setFilePreview(null);
  }

  function closeActiveModal() {
    if (isModalBusy) {
      return;
    }

    setActiveModal(null);
  }

  const grouped = useMemo(
    () => ({
      customer: requirements.filter(
        (requirement) =>
          requirement.responsibleParty === "customer" &&
          requirement.sourceType !== "immigration_request",
      ),
      office: requirements.filter(
        (requirement) =>
          requirement.responsibleParty === "office" &&
          requirement.sourceType !== "immigration_request",
      ),
      immigration: requirements.filter(
        (requirement) => requirement.sourceType === "immigration_request",
      ),
      immigrationCustomer: requirements.filter(
        (requirement) =>
          requirement.sourceType === "immigration_request" &&
          requirement.responsibleParty === "customer",
      ),
      immigrationOffice: requirements.filter(
        (requirement) =>
          requirement.sourceType === "immigration_request" &&
          requirement.responsibleParty === "office",
      ),
    }),
    [requirements],
  );
  const latestCasePhaseReason = useMemo(() => getLatestCasePhaseReason(timeline), [timeline]);

  return (
    <main className="w-full">
      <div className="mb-6 grid gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <Link href="/admin/cases" className="text-sm text-blue-700 hover:underline">
            返回案件列表
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">案件详情</h1>
        </div>
        {caseDetail ? (
          <button
            type="button"
            onClick={requestDeleteCase}
            className="inline-flex w-fit rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
          >
            删除案件
          </button>
        ) : null}
      </div>

      {isLoading ? <LoadingState title="案件详情加载中" detail="正在读取案件、资料项和变更履历。" /> : null}
      {message ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">{message}</div> : null}
      {warning ? <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">{warning}</div> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {!isLoading && !error && !caseDetail ? (
        <DashboardCard>
          <EmptyState
            title="未找到案件"
            description="该案件可能不存在，或当前 URL 中的 caseId 不正确。请返回案件列表重新选择。"
            action={
              <Link
                href="/admin/cases"
                className="inline-flex rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                返回案件列表
              </Link>
            }
          />
        </DashboardCard>
      ) : null}

      {caseDetail ? (
        <div className="grid gap-6">
          <DashboardCard className="bg-gradient-to-br from-white to-blue-50">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="break-words text-2xl font-semibold text-slate-950">{caseDetail.caseNumber}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {formatVisaBusinessSummary(caseDetail.currentVisaType, caseDetail.targetVisaType)}
                </p>
              </div>
              <StatusBadge value={caseDetail.casePhase} />
            </div>
          </DashboardCard>

          <DashboardCard>
            <SectionHeader
              title="客户信息"
              action={
                <button
                  type="button"
                  onClick={() => setActiveModal({ type: "customer", customer: caseDetail.customer })}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  编辑
                </button>
              }
            />
            <div className="grid gap-x-10 gap-y-5 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="text-slate-500">姓名</div>
                <div className="mt-1 break-words font-semibold text-slate-950">
                  {caseDetail.customer.name}
                </div>
              </div>
              <div>
                <div className="text-slate-500">邮箱</div>
                <div className="mt-1 break-words font-semibold text-slate-950">
                  {caseDetail.customer.email ?? "-"}
                </div>
              </div>
              <div>
                <div className="text-slate-500">电话</div>
                <div className="mt-1 break-words font-semibold text-slate-950">
                  {caseDetail.customer.phone ?? "-"}
                </div>
              </div>
              <div>
                <div className="text-slate-500">国籍</div>
                <div className="mt-1 break-words font-semibold text-slate-950">
                  {caseDetail.customer.nationality ?? "-"}
                </div>
              </div>
            </div>
          </DashboardCard>

          <div className="grid gap-6">
            <div className="grid gap-6">
              <DashboardCard>
                <SectionHeader
                  title="案件进度"
                  action={
                    <button
                      type="button"
                      onClick={() => setActiveModal({ type: "phase" })}
                      className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700"
                    >
                      切换阶段
                    </button>
                  }
                />
                <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 border-b border-slate-100 pb-4 text-sm text-slate-600">
                  <div>
                    资料项目总数：
                    <span className="font-semibold text-slate-950">
                      {caseDetail.requirementSummary.total}
                    </span>
                  </div>
                  <div>
                    最近更新：
                    <span className="font-semibold text-slate-950">
                      {formatDateTime(caseDetail.updatedAt)}
                    </span>
                  </div>
                </div>
                <ProgressStepper steps={casePhaseSteps} currentStep={caseDetail.casePhase} />
                {latestCasePhaseReason ? (
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <div className="text-sm text-slate-500">备注</div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                      {latestCasePhaseReason}
                    </div>
                  </div>
                ) : null}
              </DashboardCard>

              <div className="grid gap-6">
                <RequirementGroup
                  title="客户资料"
                  emptyMessage="暂无客户负责的资料项。请确认是否已经套用模板，或通过入管追加材料添加客户补件。"
                  requirements={grouped.customer}
                  collapsible
                  action={
                    <button
                      type="button"
                      onClick={() =>
                        setActiveModal({ type: "customRequirement", responsibleParty: "customer" })
                      }
                      className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700"
                    >
                      添加资料
                    </button>
                  }
                  onReview={(requirement) => setActiveModal({ type: "review", requirement })}
                  onUpload={(requirement) => setActiveModal({ type: "upload", requirement })}
                  onNote={(requirement) => setActiveModal({ type: "note", requirement })}
                  onPreviewFile={openFilePreview}
                  onDownloadAllFiles={downloadAllFiles}
                  onDeleteFile={requestDeleteUploadedFile}
                  onDeleteAllFiles={requestDeleteAllUploadedFiles}
                  onDeleteRequirement={requestDeleteRequirement}
                  downloadingRequirementId={downloadingRequirementId}
                  deletingFileId={deletingFileId}
                  deletingRequirementId={deletingRequirementId}
                  deletingRequirementRecordId={deletingRequirementRecordId}
                />
                <RequirementGroup
                  title="事务所资料"
                  emptyMessage="暂无事务所负责的资料项。后续可通过模板或自定义资料项补充。"
                  requirements={grouped.office}
                  collapsible
                  action={
                    <button
                      type="button"
                      onClick={() =>
                        setActiveModal({ type: "customRequirement", responsibleParty: "office" })
                      }
                      className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700"
                    >
                      添加资料
                    </button>
                  }
                  onReview={(requirement) => setActiveModal({ type: "review", requirement })}
                  onUpload={(requirement) => setActiveModal({ type: "upload", requirement })}
                  onNote={(requirement) => setActiveModal({ type: "note", requirement })}
                  onPreviewFile={openFilePreview}
                  onDownloadAllFiles={downloadAllFiles}
                  onDeleteFile={requestDeleteUploadedFile}
                  onDeleteAllFiles={requestDeleteAllUploadedFiles}
                  onDeleteRequirement={requestDeleteRequirement}
                  downloadingRequirementId={downloadingRequirementId}
                  deletingFileId={deletingFileId}
                  deletingRequirementId={deletingRequirementId}
                  deletingRequirementRecordId={deletingRequirementRecordId}
                />
              </div>
              <DashboardCard>
                <div
                  className={
                    isImmigrationExpanded
                      ? "mb-5 flex flex-wrap items-start justify-between gap-4"
                      : "flex flex-wrap items-center justify-between gap-4"
                  }
                >
                  <h2 className="text-base font-semibold text-slate-950">
                    入管追加材料 / {grouped.immigrationCustomer.length + grouped.immigrationOffice.length} 项
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveModal({ type: "immigration" })}
                      className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700"
                    >
                      添加材料
                    </button>
                    <CollapseIconButton
                      isExpanded={isImmigrationExpanded}
                      onClick={() => setIsImmigrationExpanded((current) => !current)}
                    />
                  </div>
                </div>
                {isImmigrationExpanded ? <div className="grid gap-6">
                  <RequirementGroup
                    title="客户资料"
                    emptyMessage="暂无客户负责的入管追加材料。"
                    requirements={grouped.immigrationCustomer}
                    standalone={false}
                    onReview={(requirement) => setActiveModal({ type: "review", requirement })}
                    onUpload={(requirement) => setActiveModal({ type: "upload", requirement })}
                    onNote={(requirement) => setActiveModal({ type: "note", requirement })}
                    onPreviewFile={openFilePreview}
                    onDownloadAllFiles={downloadAllFiles}
                    onDeleteFile={requestDeleteUploadedFile}
                    onDeleteAllFiles={requestDeleteAllUploadedFiles}
                    onDeleteRequirement={requestDeleteRequirement}
                    downloadingRequirementId={downloadingRequirementId}
                    deletingFileId={deletingFileId}
                    deletingRequirementId={deletingRequirementId}
                    deletingRequirementRecordId={deletingRequirementRecordId}
                  />
                  <div className="border-t border-slate-100 pt-6">
                    <RequirementGroup
                      title="事务所资料"
                      emptyMessage="暂无事务所负责的入管追加材料。"
                      requirements={grouped.immigrationOffice}
                      standalone={false}
                      onReview={(requirement) => setActiveModal({ type: "review", requirement })}
                      onUpload={(requirement) => setActiveModal({ type: "upload", requirement })}
                      onNote={(requirement) => setActiveModal({ type: "note", requirement })}
                      onPreviewFile={openFilePreview}
                      onDownloadAllFiles={downloadAllFiles}
                      onDeleteFile={requestDeleteUploadedFile}
                      onDeleteAllFiles={requestDeleteAllUploadedFiles}
                      onDeleteRequirement={requestDeleteRequirement}
                      downloadingRequirementId={downloadingRequirementId}
                      deletingFileId={deletingFileId}
                      deletingRequirementId={deletingRequirementId}
                      deletingRequirementRecordId={deletingRequirementRecordId}
                    />
                  </div>
                </div> : null}
              </DashboardCard>
            </div>

            <DashboardCard>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-base font-semibold text-slate-950">客户访问链接</h2>
                    <span
                      className={
                        caseDetail.tokenSummary.activeTokenCount > 0
                          ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                          : "rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500"
                      }
                    >
                      {caseDetail.tokenSummary.activeTokenCount > 0 ? "有效" : "未创建"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    明文访问令牌不会保存。重新生成成功后只在弹窗中显示一次。
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => setActiveModal({ type: "tokenRegenerate" })}
                    className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700"
                  >
                    重新生成链接
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModal({ type: "tokenRevoke" })}
                    className="rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    撤销链接
                  </button>
                </div>
              </div>
            </DashboardCard>

          </div>

          <DashboardCard className="shadow-sm">
            <SectionHeader
              title="变更履历"
              action={
                timeline.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setActiveModal({ type: "changeHistory" })}
                    className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    查看全部变更履历
                  </button>
                ) : null
              }
            />
            <ChangeHistoryList events={timeline.slice(0, 3)} requirements={requirements} />
          </DashboardCard>
        </div>
      ) : null}

      {activeModal?.type === "customer" ? (
        <Modal
          title="编辑客户信息"
          onClose={closeActiveModal}
          closeDisabled={isModalBusy}
        >
          <CustomerEditForm
            customer={activeModal.customer}
            onCancel={closeActiveModal}
            onSuccess={handleMutationSuccess}
            onBusyChange={setIsModalBusy}
          />
        </Modal>
      ) : null}

      {activeModal?.type === "review" ? (
        <Modal
          title={
            activeModal.requirement.responsibleParty === "office"
              ? "事务所资料制作状态"
              : "审核资料状态"
          }
          onClose={closeActiveModal}
          closeDisabled={isModalBusy}
        >
          <RequirementReviewForm
            caseId={caseId}
            requirement={activeModal.requirement}
            onCancel={closeActiveModal}
            onSuccess={handleMutationSuccess}
            onBusyChange={setIsModalBusy}
          />
        </Modal>
      ) : null}

      {activeModal?.type === "upload" ? (
        <Modal
          title="上传文件"
          description={displayChineseText(activeModal.requirement.title)}
          onClose={closeActiveModal}
          closeDisabled={isModalBusy}
        >
          <RequirementUploadForm
            caseId={caseId}
            requirement={activeModal.requirement}
            onCancel={closeActiveModal}
            onSuccess={handleMutationSuccess}
            onBusyChange={setIsModalBusy}
          />
        </Modal>
      ) : null}

      {activeModal?.type === "note" ? (
        <Modal
          title={getVisibleRequirementInternalNote(activeModal.requirement) ? "修改备注" : "添加备注"}
          onClose={closeActiveModal}
          closeDisabled={isModalBusy}
        >
          <RequirementNoteForm
            caseId={caseId}
            requirement={activeModal.requirement}
            onCancel={closeActiveModal}
            onSuccess={handleMutationSuccess}
            onBusyChange={setIsModalBusy}
          />
        </Modal>
      ) : null}

      {activeModal?.type === "immigration" ? (
        <Modal
          title="添加入管追加材料"
          description="后台手动创建，不依赖模板。"
          onClose={closeActiveModal}
          closeDisabled={isModalBusy}
        >
          <ImmigrationRequestForm
            caseId={caseId}
            onCancel={closeActiveModal}
            onSuccess={handleMutationSuccess}
            onBusyChange={setIsModalBusy}
          />
        </Modal>
      ) : null}

      {activeModal?.type === "customRequirement" ? (
        <Modal
          title={
            activeModal.responsibleParty === "customer"
              ? "追加客户资料"
              : "追加事务所资料"
          }
          onClose={closeActiveModal}
          closeDisabled={isModalBusy}
        >
          <CustomRequirementForm
            caseId={caseId}
            responsibleParty={activeModal.responsibleParty}
            onCancel={closeActiveModal}
            onSuccess={handleMutationSuccess}
            onBusyChange={setIsModalBusy}
          />
        </Modal>
      ) : null}

      {activeModal?.type === "phase" && caseDetail ? (
        <Modal
          title="切换案件阶段"
          description={`当前阶段：${displayLabel(caseDetail.casePhase)}`}
          onClose={closeActiveModal}
          closeDisabled={isModalBusy}
        >
          <CasePhaseChangeForm
            caseId={caseId}
            currentPhase={caseDetail.casePhase}
            onCancel={closeActiveModal}
            onSuccess={handleMutationSuccess}
            onBusyChange={setIsModalBusy}
          />
        </Modal>
      ) : null}

      {activeModal?.type === "applicationConfirmation" ? (
        <Modal
          title="新建申请书确认版本"
          description="登记已经存在于 Storage 的确认文件。"
          onClose={closeActiveModal}
          closeDisabled={isModalBusy}
        >
          <ApplicationConfirmationForm
            caseId={caseId}
            onCancel={closeActiveModal}
            onSuccess={handleMutationSuccess}
            onBusyChange={setIsModalBusy}
          />
        </Modal>
      ) : null}

      {activeModal?.type === "tokenRegenerate" ? (
        <Modal
          title="重新生成客户访问链接"
          description="旧链接会失效，新的客户访问链接只显示一次。"
          onClose={closeActiveModal}
          closeDisabled={isModalBusy}
        >
          <TokenRegenerateForm
            caseId={caseId}
            onCancel={closeActiveModal}
            onSuccess={handleTokenRegenerateSuccess}
            onBusyChange={setIsModalBusy}
          />
        </Modal>
      ) : null}

      {activeModal?.type === "tokenRevoke" ? (
        <Modal
          title="撤销客户访问链接"
          description="客户访问链接会失效，且不会返回明文访问令牌。"
          onClose={closeActiveModal}
          closeDisabled={isModalBusy}
        >
          <TokenRevokeForm
            caseId={caseId}
            onCancel={closeActiveModal}
            onSuccess={handleMutationSuccess}
            onBusyChange={setIsModalBusy}
          />
        </Modal>
      ) : null}

      {activeModal?.type === "changeHistory" ? (
        <ChangeHistoryModal
          events={timeline}
          requirements={requirements}
          onClose={closeActiveModal}
          closeDisabled={isModalBusy}
        />
      ) : null}

      {fileDeleteConfirmation ? (
        <Modal
          title={
            fileDeleteConfirmation.type === "single"
              ? "确认删除文件"
              : "确认删除全部文件"
          }
          description={
            fileDeleteConfirmation.type === "single"
              ? displayChineseText(fileDeleteConfirmation.file.originalFileName)
              : displayChineseText(fileDeleteConfirmation.requirement.title)
          }
          onClose={closeFileDeleteConfirmation}
          closeDisabled={Boolean(deletingFileId || deletingRequirementId)}
        >
          <div className="grid gap-4">
            <InlineError message={fileDeleteError} />
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
              {fileDeleteConfirmation.type === "single" ? (
                <>
                  确定删除这个已上传文件吗？删除后，该文件不会再出现在客户或后台文件列表中。
                </>
              ) : (
                <>
                  确定删除该材料下全部 {fileDeleteConfirmation.fileCount} 个已上传文件吗？
                  删除后，这些文件不会再出现在客户或后台文件列表中。
                </>
              )}
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={Boolean(deletingFileId || deletingRequirementId)}
                onClick={closeFileDeleteConfirmation}
                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:w-auto"
              >
                取消
              </button>
              <button
                type="button"
                disabled={Boolean(deletingFileId || deletingRequirementId)}
                onClick={() => void confirmFileDelete()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
              >
                {deletingFileId || deletingRequirementId ? <SubmitSpinner /> : null}
                {deletingFileId || deletingRequirementId ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {requirementDeleteConfirmation ? (
        <Modal
          title="确认删除资料"
          description={displayChineseText(requirementDeleteConfirmation.requirement.title)}
          onClose={closeRequirementDeleteConfirmation}
          closeDisabled={Boolean(deletingRequirementRecordId)}
        >
          <div className="grid gap-4">
            <InlineError message={requirementDeleteError} />
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
              确定删除该资料吗？删除后，该资料项、已上传文件、内部备注和相关文件记录都会从案件中移除。
              {requirementDeleteConfirmation.uploadedFileCount > 0
                ? ` 当前包含 ${requirementDeleteConfirmation.uploadedFileCount} 个已上传文件。`
                : null}
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={Boolean(deletingRequirementRecordId)}
                onClick={closeRequirementDeleteConfirmation}
                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:w-auto"
              >
                取消
              </button>
              <button
                type="button"
                disabled={Boolean(deletingRequirementRecordId)}
                onClick={() => void confirmRequirementDelete()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
              >
                {deletingRequirementRecordId ? <SubmitSpinner /> : null}
                {deletingRequirementRecordId ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {caseDeleteConfirmation && caseDetail ? (
        <Modal
          title="确认删除案件"
          description={caseDetail.caseNumber}
          onClose={closeCaseDeleteConfirmation}
          closeDisabled={isDeletingCase}
        >
          <div className="grid gap-4">
            <InlineError message={caseDeleteError} />
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
              确定删除该案件吗？删除后，案件、资料项、上传文件记录、客户访问链接、变更履历和通知记录都会被移除。
              客户资料本身不会删除。此操作无法撤销。
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isDeletingCase}
                onClick={closeCaseDeleteConfirmation}
                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:w-auto"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isDeletingCase}
                onClick={() => void confirmCaseDelete()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
              >
                {isDeletingCase ? <SubmitSpinner /> : null}
                {isDeletingCase ? "删除中..." : "确认删除案件"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {filePreview ? (
        <Modal
          title="文件预览"
          description={displayChineseText(filePreview.fileName)}
          onClose={closeFilePreview}
        >
          <div className="grid gap-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <iframe
                title="文件预览"
                src={filePreview.fileUrl}
                className="h-[60vh] w-full bg-white"
              />
            </div>
            <div className="flex flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>短期预览链接，过期时间：{formatDateTime(filePreview.expiresAt)}</span>
              <a
                href={filePreview.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex justify-center rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                新窗口打开 / 下载
              </a>
            </div>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}
