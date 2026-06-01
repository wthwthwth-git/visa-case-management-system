"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLanguage } from "@/app/_components/language-provider";
import { displayChineseText, displayVisaType } from "@/app/_lib/chinese-display";
import type { AppLocale } from "@/app/_lib/i18n";
import { displayLocalizedRequirementTitle } from "@/app/_lib/visa-template-translations";
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
  displayCasePhaseLabel,
  displayLabel,
} from "./ui";

type Props = {
  caseId: string;
};

const caseDetailText = {
  zh: {
    back: "返回案件列表",
    title: "案件详情",
    deleteCase: "删除案件",
    loadingTitle: "案件详情加载中",
    loadingDetail: "正在读取案件、资料项和变更履历。",
    notFoundTitle: "未找到案件",
    notFoundDescription: "该案件可能不存在，或当前 URL 中的 caseId 不正确。请返回案件列表重新选择。",
    customerInfo: "客户信息",
    edit: "编辑",
    name: "姓名",
    email: "邮箱",
    phone: "电话",
    nationality: "国籍",
    caseProgress: "案件进度",
    changePhase: "切换阶段",
    requirementTotal: "资料项目总数：",
    updatedAt: "最近更新：",
    submittedAt: "提交日期",
    submissionNumber: "受理号",
    note: "备注",
    customerRequirements: "客户资料",
    officeRequirements: "事务所资料",
    emptyCustomerRequirements: "暂无客户负责的资料项。请确认是否已经套用模板，或通过入管追加材料添加客户补件。",
    emptyOfficeRequirements: "暂无事务所负责的资料项。后续可通过模板或自定义资料项补充。",
    addRequirement: "添加资料",
    additionalRequirements: "入管追加材料 / {count} 项",
    addAdditionalRequirement: "添加材料",
    emptyAdditionalCustomer: "暂无客户负责的入管追加材料。",
    emptyAdditionalOffice: "暂无事务所负责的入管追加材料。",
    tokenTitle: "客户访问链接",
    tokenActive: "有效",
    tokenMissing: "未创建",
    tokenDescription: "明文访问令牌不会保存。重新生成成功后只在弹窗中显示一次。",
    regenerateToken: "重新生成链接",
    revokeToken: "撤销链接",
    timeline: "变更履历",
    viewAllTimeline: "查看全部变更履历",
    modalCustomer: "编辑客户信息",
    modalOfficeReview: "事务所资料制作状态",
    modalCustomerReview: "审核资料状态",
    modalUpload: "上传文件",
    modalEditNote: "修改备注",
    modalAddNote: "添加备注",
    modalDueDate: "设置截止日期",
    modalAddAdditional: "添加入管追加材料",
    modalAddAdditionalDescription: "后台手动创建，不依赖模板。",
    modalAddCustomerRequirement: "追加客户资料",
    modalAddOfficeRequirement: "追加事务所资料",
    modalPhase: "切换案件阶段",
    modalCurrentPhase: "当前阶段：{phase}",
    modalApplicationConfirmation: "新建申请书确认版本",
    modalApplicationConfirmationDescription: "登记已经存在于 Storage 的确认文件。",
    modalRegenerateToken: "重新生成客户访问链接",
    modalRegenerateTokenDescription: "旧链接会失效，新的客户访问链接只显示一次。",
    modalRevokeToken: "撤销客户访问链接",
    modalRevokeTokenDescription: "客户访问链接会失效，且不会返回明文访问令牌。",
  },
  ja: {
    back: "案件一覧へ戻る",
    title: "案件詳細",
    deleteCase: "案件を削除",
    loadingTitle: "案件詳細を読み込み中",
    loadingDetail: "案件、資料項目、変更履歴を読み込んでいます。",
    notFoundTitle: "案件が見つかりません",
    notFoundDescription: "案件が存在しない、または URL の caseId が正しくない可能性があります。案件一覧に戻って選択し直してください。",
    customerInfo: "お客様情報",
    edit: "編集",
    name: "氏名",
    email: "メール",
    phone: "電話番号",
    nationality: "国籍",
    caseProgress: "案件進捗",
    changePhase: "段階を変更",
    requirementTotal: "資料項目数：",
    updatedAt: "最終更新：",
    submittedAt: "提出日",
    submissionNumber: "受付番号",
    note: "メモ",
    customerRequirements: "お客様資料",
    officeRequirements: "事務所資料",
    emptyCustomerRequirements: "お客様担当の資料項目はありません。テンプレート適用状況を確認するか、入管追加資料から補足資料を追加してください。",
    emptyOfficeRequirements: "事務所担当の資料項目はありません。テンプレートまたは追加資料で補足できます。",
    addRequirement: "資料を追加",
    additionalRequirements: "入管追加資料 / {count} 件",
    addAdditionalRequirement: "資料を追加",
    emptyAdditionalCustomer: "お客様担当の入管追加資料はありません。",
    emptyAdditionalOffice: "事務所担当の入管追加資料はありません。",
    tokenTitle: "お客様リンク",
    tokenActive: "有効",
    tokenMissing: "未作成",
    tokenDescription: "平文アクセストークンは保存されません。再生成後はダイアログで一度だけ表示されます。",
    regenerateToken: "リンクを再生成",
    revokeToken: "リンクを取り消す",
    timeline: "変更履歴",
    viewAllTimeline: "すべての変更履歴を見る",
    modalCustomer: "お客様情報を編集",
    modalOfficeReview: "事務所資料の作成状態",
    modalCustomerReview: "資料の確認状態",
    modalUpload: "ファイルをアップロード",
    modalEditNote: "メモを編集",
    modalAddNote: "メモを追加",
    modalDueDate: "提出期限を設定",
    modalAddAdditional: "入管追加資料を追加",
    modalAddAdditionalDescription: "管理画面で手動作成します。テンプレートには依存しません。",
    modalAddCustomerRequirement: "お客様資料を追加",
    modalAddOfficeRequirement: "事務所資料を追加",
    modalPhase: "案件段階を変更",
    modalCurrentPhase: "現在の段階：{phase}",
    modalApplicationConfirmation: "確認資料バージョンを新規作成",
    modalApplicationConfirmationDescription: "Storage に既に存在する確認ファイルを登録します。",
    modalRegenerateToken: "お客様リンクを再生成",
    modalRegenerateTokenDescription: "旧リンクは失効し、新しいお客様リンクは一度だけ表示されます。",
    modalRevokeToken: "お客様リンクを取り消す",
    modalRevokeTokenDescription: "お客様リンクは失効し、平文アクセストークンは返されません。",
  },
} as const;

function formatCaseDetailText(template: string, params: Record<string, string | number>) {
  return Object.entries(params).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function localText(locale: AppLocale, zh: string, ja: string): string {
  return locale === "ja" ? ja : zh;
}

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
  | { type: "dueDate"; requirement: AdminRequirement }
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

const changeHistoryText = {
  zh: {
    requirement: "资料项",
    customerRequirement: "客户资料",
    officeRequirement: "事务所资料",
    customerImmigrationRequirement: "入管追加材料（客户资料）",
    officeImmigrationRequirement: "入管追加材料（事务所资料）",
    empty: "暂无变更履历。",
    all: "全部变更履历",
    requirementName: "资料名",
    time: "时间",
    timeFilter: "时间筛选",
    startDate: "开始日期",
    endDate: "结束日期",
    clear: "清除",
    noFilterableRequirements: "暂无可筛选资料。",
    count: (filtered: number, total: number) => `显示 ${filtered} / ${total} 条履历`,
    fileUploaded: (scope: string, title: string) => `${scope}${title}已上传文件。`,
    fileDeleted: (scope: string, title: string) => `${scope}${title}已删除文件。`,
    statusChanged: (scope: string, title: string, oldStatus: string | null, newStatus: string | null) =>
      oldStatus && newStatus
        ? `${scope}${title}状态由「${oldStatus}」变更为「${newStatus}」。`
        : `${scope}${title}状态已变更。`,
    noteUpdated: (scope: string, title: string) => `${scope}${title}备注已更新。`,
    requirementCreated: (scope: string, title: string) => `${scope}${title}已追加。`,
    requirementDeleted: (scope: string, title: string) => `${scope}${title}已删除。`,
    phaseChanged: (oldPhase: string | null, newPhase: string | null) =>
      oldPhase && newPhase
        ? `案件阶段由「${oldPhase}」变更为「${newPhase}」。`
        : "案件阶段已变更。",
    templateItemsCopied: (selectedText: string, customText: string) => `已生成${selectedText}${customText}。`,
    selectedTemplateItems: (count: number | null) => (count === null ? "模板资料" : `${count} 项模板资料`),
    customItemsSuffix: (count: number) => `，另追加 ${count} 项自定义资料`,
    customRequirementsCreated: (count: number | null) =>
      count === null ? "已追加自定义资料。" : `已追加 ${count} 项自定义资料。`,
    tokenCreated: "客户访问链接已创建。",
    tokenRegenerated: "客户访问链接已重新生成，旧链接已失效。",
    tokenRevoked: "客户访问链接已撤销。",
    applicationConfirmationCreated: "申请书确认版本已创建。",
    applicationConfirmationCompleted: "客户已完成申请书确认。",
    applicationConfirmationStatusChanged: "申请书确认状态已变更。",
    caseCreated: "案件已创建。",
  },
  ja: {
    requirement: "資料項目",
    customerRequirement: "お客様側資料",
    officeRequirement: "事務所側資料",
    customerImmigrationRequirement: "入管追加資料（お客様側資料）",
    officeImmigrationRequirement: "入管追加資料（事務所側資料）",
    empty: "変更履歴はありません。",
    all: "すべての変更履歴",
    requirementName: "資料名",
    time: "時間",
    timeFilter: "期間で絞り込み",
    startDate: "開始日",
    endDate: "終了日",
    clear: "クリア",
    noFilterableRequirements: "絞り込み可能な資料はありません。",
    count: (filtered: number, total: number) => `${filtered} / ${total} 件の履歴を表示`,
    fileUploaded: (scope: string, title: string) => `${scope}${title}のファイルをアップロードしました。`,
    fileDeleted: (scope: string, title: string) => `${scope}${title}のファイルを削除しました。`,
    statusChanged: (scope: string, title: string, oldStatus: string | null, newStatus: string | null) =>
      oldStatus && newStatus
        ? `${scope}${title}のステータスを「${oldStatus}」から「${newStatus}」へ変更しました。`
        : `${scope}${title}のステータスを変更しました。`,
    noteUpdated: (scope: string, title: string) => `${scope}${title}の備考を更新しました。`,
    requirementCreated: (scope: string, title: string) => `${scope}${title}を追加しました。`,
    requirementDeleted: (scope: string, title: string) => `${scope}${title}を削除しました。`,
    phaseChanged: (oldPhase: string | null, newPhase: string | null) =>
      oldPhase && newPhase
        ? `案件段階を「${oldPhase}」から「${newPhase}」へ変更しました。`
        : "案件段階を変更しました。",
    templateItemsCopied: (selectedText: string, customText: string) => `${selectedText}${customText}を生成しました。`,
    selectedTemplateItems: (count: number | null) => (count === null ? "テンプレート資料" : `${count}件のテンプレート資料`),
    customItemsSuffix: (count: number) => `、あわせて${count}件のカスタム資料`,
    customRequirementsCreated: (count: number | null) =>
      count === null ? "カスタム資料を追加しました。" : `${count}件のカスタム資料を追加しました。`,
    tokenCreated: "お客様用アクセスリンクを作成しました。",
    tokenRegenerated: "お客様用アクセスリンクを再生成し、旧リンクを無効化しました。",
    tokenRevoked: "お客様用アクセスリンクを無効化しました。",
    applicationConfirmationCreated: "申請書確認版を作成しました。",
    applicationConfirmationCompleted: "お客様が申請書確認を完了しました。",
    applicationConfirmationStatusChanged: "申請書確認ステータスを変更しました。",
    caseCreated: "案件を作成しました。",
  },
} satisfies Record<AppLocale, Record<string, unknown>>;

function getChangeHistoryText(locale: AppLocale) {
  return changeHistoryText[locale] as typeof changeHistoryText.zh;
}

function getRequirementScopeLabel(requirement: AdminRequirement | null, locale: AppLocale): string {
  const text = getChangeHistoryText(locale);

  if (!requirement) {
    return text.requirement;
  }

  if (requirement.sourceType === "immigration_request") {
    return requirement.responsibleParty === "customer"
      ? text.customerImmigrationRequirement
      : text.officeImmigrationRequirement;
  }

  return requirement.responsibleParty === "customer" ? text.customerRequirement : text.officeRequirement;
}

function formatChangeHistoryDetail(event: AdminTimelineEvent, lookup: RequirementLookup, locale: AppLocale): string {
  const text = getChangeHistoryText(locale);
  const requirement = getRequirementFromEvent(event, lookup);
  const requirementTitle = requirement ? `「${displayLocalizedRequirementTitle(requirement.title, locale)}」` : "";
  const scope = getRequirementScopeLabel(requirement, locale);

  switch (event.eventType) {
    case "file_uploaded":
      return text.fileUploaded(scope, requirementTitle);
    case "file_deleted":
    case "file_removed":
      return text.fileDeleted(scope, requirementTitle);
    case "requirement_status_changed": {
      const oldStatus = getMetadataString(event, "oldStatus");
      const newStatus = getMetadataString(event, "newStatus");
      return text.statusChanged(
        scope,
        requirementTitle,
        oldStatus ? displayLabel(oldStatus, locale) : null,
        newStatus ? displayLabel(newStatus, locale) : null,
      );
    }
    case "requirement_note_updated":
      return text.noteUpdated(scope, requirementTitle);
    case "requirement_created":
      return text.requirementCreated(scope, requirementTitle);
    case "requirement_deleted":
      return text.requirementDeleted(scope, requirementTitle);
    case "case_phase_changed": {
      const oldPhase = getMetadataString(event, "oldPhase");
      const newPhase = getMetadataString(event, "newPhase");
      return text.phaseChanged(
        oldPhase ? displayCasePhaseLabel(oldPhase, locale) : null,
        newPhase ? displayCasePhaseLabel(newPhase, locale) : null,
      );
    }
    case "template_items_selected_copied": {
      const selectedCount = getMetadataValue(event, "selectedItemCount");
      const customCount = getMetadataValue(event, "customItemCount");
      const selectedText = text.selectedTemplateItems(typeof selectedCount === "number" ? selectedCount : null);
      const customText = typeof customCount === "number" && customCount > 0 ? text.customItemsSuffix(customCount) : "";
      return text.templateItemsCopied(selectedText, customText);
    }
    case "custom_requirements_created": {
      const customCount = getMetadataValue(event, "customItemCount");
      return text.customRequirementsCreated(typeof customCount === "number" ? customCount : null);
    }
    case "token_created":
      return text.tokenCreated;
    case "token_regenerated":
      return text.tokenRegenerated;
    case "token_revoked":
      return text.tokenRevoked;
    case "application_confirmation_created":
    case "application_confirmation_version_created":
      return text.applicationConfirmationCreated;
    case "application_confirmation_completed":
      return text.applicationConfirmationCompleted;
    case "application_confirmation_status_changed":
      return text.applicationConfirmationStatusChanged;
    case "case_created":
      return text.caseCreated;
    default:
      return displayLabel(event.eventType, locale);
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

function getLatestCaseSubmissionInfo(events: AdminTimelineEvent[]) {
  for (const event of events) {
    if (event.eventType !== "case_phase_changed") {
      continue;
    }

    const submittedAt = getMetadataString(event, "submittedAt")?.trim() || null;
    const submissionNumber = getMetadataString(event, "submissionNumber")?.trim() || null;

    if (submittedAt || submissionNumber) {
      return {
        submittedAt,
        submissionNumber,
      };
    }
  }

  return null;
}

function formatDateOnly(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function todayDateInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function getRequirementIdFromHash() {
  if (typeof window === "undefined") {
    return null;
  }

  const prefix = "#requirement-";

  if (!window.location.hash.startsWith(prefix)) {
    return null;
  }

  return decodeURIComponent(window.location.hash.slice(prefix.length));
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
  locale: AppLocale = "zh",
) {
  const note = getVisibleRequirementInternalNote(requirement);

  if (!note) {
    return null;
  }

  const clientRevisionPrefix = "客户要求的说明：";

  if (note.startsWith(clientRevisionPrefix)) {
    return {
      label: localText(locale, "客户要求的说明", "お客様からの修正依頼"),
      text: note.slice(clientRevisionPrefix.length).trim(),
    };
  }

  return {
    label: localText(locale, "内部备注", "内部メモ"),
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
  "approved",
];

function getAllowedCasePhaseOptions(currentPhase: string) {
  return casePhaseSteps.filter((phase) => phase !== currentPhase);
}

function shouldShowSubmissionInfo(casePhase: string) {
  const submittedIndex = casePhaseSteps.indexOf("submitted");
  const currentIndex = casePhaseSteps.indexOf(casePhase);

  return submittedIndex >= 0 && currentIndex >= submittedIndex;
}

function formatCasePhaseSubmitError(error: unknown, locale: AppLocale) {
  const message = toAdminErrorMessage(
    error,
    localText(locale, "案件阶段切换失败。请检查阶段和原因后重试。", "案件段階の変更に失敗しました。段階と理由を確認して再度お試しください。"),
  );

  if (message === "Invalid request." || /transition|not allowed/i.test(message)) {
    return localText(
      locale,
      "案件阶段切换失败。请选择不同的案件阶段后重试。",
      "案件段階の変更に失敗しました。別の案件段階を選択して再度お試しください。",
    );
  }

  return message;
}

function formatVisaBusinessSummary(currentVisaType: string, targetVisaType: string, locale: AppLocale) {
  const current = displayVisaType(currentVisaType, locale);
  const target = displayVisaType(targetVisaType, locale);

  if (currentVisaType === "无") {
    return locale === "ja" ? `認定申請 / ${target}` : `认定 / ${target}`;
  }

  if (currentVisaType === targetVisaType) {
    return locale === "ja" ? `更新申請 / ${target}` : `更新 / ${target}`;
  }

  return locale === "ja" ? `変更申請 / ${current} → ${target}` : `变更 / ${current} → ${target}`;
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

const changeHistorySummaryMap = {
  zh: {
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
    "文件已上传": "文件已上传",
    "file removed.": "文件已删除",
    "requirement submitted.": "客户已提交资料",
    "客户已提交资料": "客户已提交资料",
    "requirement submission withdrawn.": "客户已撤回资料",
    "客户已撤回资料": "客户已撤回资料",
    "office requirement confirmed by client.": "客户已确认事务所资料",
    "客户已确认事务所资料": "客户已确认事务所资料",
    "client requested office requirement revision.": "客户要求修改事务所资料",
    "客户要求修改事务所资料": "客户要求修改事务所资料",
    "requirement status changed.": "材料状态已变更",
    "case phase changed.": "案件阶段已变更",
    "application confirmation created.": "申请书确认已创建",
    "application confirmation version created.": "申请书确认版本已创建",
    "application confirmation completed.": "申请书确认已完成",
    "application confirmation status changed.": "申请书确认状态已变更",
  },
  ja: {
    "case created.": "案件を作成しました",
    "template items copied.": "テンプレート資料を反映しました",
    "selected template items copied.": "テンプレート資料を反映しました",
    "custom requirements created.": "カスタム資料を作成しました",
    "custom requirement created.": "追加資料を作成しました",
    "immigration additional requirement created.": "入管追加資料を作成しました",
    "portal token created.": "お客様用アクセスリンクを作成しました",
    "portal token regenerated.": "お客様用アクセスリンクを再生成しました",
    "portal token revoked.": "お客様用アクセスリンクを無効化しました",
    "previous portal token revoked during regeneration.": "旧お客様用アクセスリンクを無効化しました",
    "internal note created.": "備考を作成しました",
    "internal note updated.": "備考を更新しました",
    "file uploaded.": "ファイルをアップロードしました",
    "document file uploaded.": "ファイルをアップロードしました",
    "文件已上传": "ファイルをアップロードしました",
    "file removed.": "ファイルを削除しました",
    "requirement submitted.": "お客様が資料を提出しました",
    "客户已提交资料": "お客様が資料を提出しました",
    "requirement submission withdrawn.": "お客様が資料提出を取り消しました",
    "客户已撤回资料": "お客様が資料提出を取り消しました",
    "office requirement confirmed by client.": "お客様が事務所側資料を確認しました",
    "客户已确认事务所资料": "お客様が事務所側資料を確認しました",
    "client requested office requirement revision.": "お客様が事務所側資料の修正を依頼しました",
    "客户要求修改事务所资料": "お客様が事務所側資料の修正を依頼しました",
    "requirement status changed.": "資料ステータスを変更しました",
    "case phase changed.": "案件段階を変更しました",
    "application confirmation created.": "申請書確認を作成しました",
    "application confirmation version created.": "申請書確認版を作成しました",
    "application confirmation completed.": "申請書確認が完了しました",
    "application confirmation status changed.": "申請書確認ステータスを変更しました",
  },
} satisfies Record<AppLocale, Record<string, string>>;

function formatChangeHistorySummary(value: string, locale: AppLocale) {
  const normalized = value.trim().toLowerCase();
  const summaryMap: Record<string, string> = changeHistorySummaryMap[locale];

  return summaryMap[normalized] ?? summaryMap[value.trim()] ?? displayChineseText(value);
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

function sortApprovedRequirementsLast(requirements: AdminRequirement[]) {
  return requirements.toSorted((first, second) => {
    const firstApproved = getEffectiveRequirementStatus(first) === "approved";
    const secondApproved = getEffectiveRequirementStatus(second) === "approved";

    if (firstApproved === secondApproved) {
      return 0;
    }

    return firstApproved ? 1 : -1;
  });
}

function getRequirementReviewButtonLabel(requirement: AdminRequirement, locale: AppLocale) {
  return requirement.responsibleParty === "office"
    ? localText(locale, "制作状态变更", "作成状態を変更")
    : localText(locale, "审核状态变更", "確認状態を変更");
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

function confirmImportantAction(message: string, locale: AppLocale = "zh"): boolean {
  if (locale === "ja") {
    return window.confirm(`確認してください：${message}\n\n続行すると案件詳細を再読み込みします。`);
  }

  return window.confirm(`请确认：${message}\n\n继续后系统会刷新案件详情。`);
}

function SubmitSpinner() {
  return (
    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
  );
}

function FormActions({
  cancelLabel,
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
  const { locale } = useLanguage();
  const resolvedCancelLabel = cancelLabel ?? (locale === "ja" ? "キャンセル" : "取消");

  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button
        type="button"
        disabled={isSubmitting}
        onClick={onCancel}
        className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:w-auto"
      >
        {resolvedCancelLabel}
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
  onDueDate,
  onPreviewFile,
  onDownloadAllFiles,
  onDeleteFile,
  onDeleteAllFiles,
  onDeleteRequirement,
  downloadingRequirementId,
  deletingFileId,
  deletingRequirementId,
  deletingRequirementRecordId,
  focusedRequirementId,
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
  onDueDate: (requirement: AdminRequirement) => void;
  onPreviewFile: (file: AdminRequirementFile) => void;
  onDownloadAllFiles: (requirement: AdminRequirement) => void;
  onDeleteFile: (file: AdminRequirementFile) => void;
  onDeleteAllFiles: (requirement: AdminRequirement) => void;
  onDeleteRequirement: (requirement: AdminRequirement) => void;
  downloadingRequirementId: string | null;
  deletingFileId: string | null;
  deletingRequirementId: string | null;
  deletingRequirementRecordId: string | null;
  focusedRequirementId?: string | null;
}) {
  const { locale } = useLanguage();
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
            {title} / {requirements.length} {localText(locale, "项", "件")}
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
            <span className="ml-2 font-medium text-slate-400">
              {requirements.length} {localText(locale, "项", "件")}
            </span>
          </h3>
          {headerAction}
        </div>
      )}
      {isExpanded ? <div className="grid gap-3">
        {requirements.length === 0 ? (
          standalone ? (
            <EmptyState title={localText(locale, "暂无资料项", "資料項目はありません")} description={emptyMessage} />
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
          const visibleNoteDisplay = getRequirementNoteDisplay(requirement, locale);
          const effectiveStatus = getEffectiveRequirementStatus(requirement);
          const showDueDate =
            requirement.dueDate && effectiveStatus === "not_submitted";
          const canEditDueDate =
            requirement.responsibleParty === "customer" && effectiveStatus === "not_submitted";
          const isDownloadingAll = downloadingRequirementId === requirement.id;
          const isDeletingAll = deletingRequirementId === requirement.id;
          const isDeletingRequirement = deletingRequirementRecordId === requirement.id;

          return (
          <div
            id={`requirement-${requirement.id}`}
            key={requirement.id}
            onClick={(event) => event.stopPropagation()}
            className={[
              "scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 transition",
              focusedRequirementId === requirement.id ? "ring-2 ring-blue-300 ring-offset-2" : "",
            ].join(" ")}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="font-medium text-slate-950">
                  {displayLocalizedRequirementTitle(requirement.title, locale)}
                </div>
                {showDueDate ? (
                  <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                    {localText(locale, "截止日期：", "提出期限：")}
                    {formatDateOnly(requirement.dueDate)}
                  </span>
                ) : null}
              </div>
              <StatusBadge value={statusBadgeValue} />
            </div>
            {uploadedFiles.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-500">
                    {localText(locale, "已上传文件", "アップロード済みファイル")}（{uploadedFiles.length}）
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isDownloadingAll || isDeletingAll}
                      onClick={() => onDownloadAllFiles(requirement)}
                      className="rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                    >
                      {isDownloadingAll
                        ? localText(locale, "下载中...", "ダウンロード中...")
                        : localText(locale, "全部下载", "すべてダウンロード")}
                    </button>
                    <button
                      type="button"
                      disabled={isDownloadingAll || isDeletingAll}
                      onClick={() => onDeleteAllFiles(requirement)}
                      className="rounded-full border border-rose-100 bg-white px-3 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                    >
                      {isDeletingAll
                        ? localText(locale, "删除中...", "削除中...")
                        : localText(locale, "全部删除", "すべて削除")}
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
                        aria-label={localText(locale, `删除 ${file.originalFileName}`, `${file.originalFileName} を削除`)}
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
                    {getRequirementReviewButtonLabel(requirement, locale)}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onUpload(requirement)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {localText(locale, "上传文件", "ファイルをアップロード")}
                </button>
                <button
                  type="button"
                  onClick={() => onNote(requirement)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {visibleInternalNote || requirement.customerInstruction
                    ? localText(locale, "修改备注", "メモを編集")
                    : localText(locale, "添加备注", "メモを追加")}
                </button>
                {canEditDueDate ? (
                  <button
                    type="button"
                    onClick={() => onDueDate(requirement)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {requirement.dueDate
                      ? localText(locale, "修改截止日期", "提出期限を編集")
                      : localText(locale, "设置截止日期", "提出期限を設定")}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                disabled={isDeletingRequirement}
                onClick={() => onDeleteRequirement(requirement)}
                className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
              >
                {isDeletingRequirement
                  ? localText(locale, "删除中...", "削除中...")
                  : localText(locale, "删除资料", "資料を削除")}
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
  const { locale } = useLanguage();
  const label = isExpanded
    ? localText(locale, "收起", "閉じる")
    : localText(locale, "展开", "展開");

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-xs font-medium text-slate-500 outline-none transition hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-blue-100"
    >
      <span>{label}</span>
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
  const { locale } = useLanguage();
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
      !confirmImportantAction(
        localText(locale, "该资料已通过审核，继续后会退回为“需补充”。", "この資料は確認済みです。続行すると「追加提出」に戻ります。"),
        locale,
      )
    ) {
      return;
    }

    if (
      needsCustomerInstruction &&
      (newStatus === "needs_more" || newStatus === "not_applicable") &&
      customerInstruction.trim().length === 0
    ) {
      setError(
        localText(
          locale,
          "选择“需补充”或“需修改”时，请填写补充说明。",
          "「追加提出」又は「修正依頼」を選択する場合は、お客様向け説明を入力してください。",
        ),
      );
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
        message: isOfficeRequirement
          ? localText(locale, "事务所资料制作状态已更新。", "事務所資料の作成状態を更新しました。")
          : localText(locale, "资料审核状态已更新。", "資料の確認状態を更新しました。"),
      });
    } catch (submitError) {
      setError(
        toAdminErrorMessage(
          submitError,
          localText(locale, "资料审核失败。请检查状态和原因后重试。", "資料状態の更新に失敗しました。状態と理由を確認して再度お試しください。"),
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitReview} className="grid gap-4">
      <InlineError message={error} />
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="newStatus">
          {localText(locale, "状态", "状態")}
        </label>
        <select
          id="newStatus"
          value={newStatus}
          onChange={(event) => setNewStatus(event.target.value)}
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        >
          {isOfficeRequirement ? (
            <>
              <option value="submitted">{localText(locale, "制作中", "作成中")}</option>
              <option value="approved">{localText(locale, "已完成", "作成済み")}</option>
              <option value="not_applicable">{localText(locale, "已确认", "確認済み")}</option>
            </>
          ) : (
            <>
              {!hasUploadedFiles ? (
                <option value="not_submitted">{localText(locale, "未提交", "未提出")}</option>
              ) : null}
              <option value="submitted">{localText(locale, "已提交", "提出済み")}</option>
              <option value="needs_more">{localText(locale, "需补充", "追加提出")}</option>
              <option value="not_applicable">{localText(locale, "需修改", "修正依頼")}</option>
              <option value="approved">{localText(locale, "已通过", "確認済み")}</option>
            </>
          )}
        </select>
      </div>
      {needsCustomerInstruction ? (
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="customerInstruction">
            {localText(locale, "补充说明", "お客様向け説明")}
          </label>
          <textarea
            id="customerInstruction"
            value={customerInstruction}
            onChange={(event) => setCustomerInstruction(event.target.value)}
            placeholder={localText(locale, "向客户补充说明", "お客様への補足説明を入力")}
            className="min-h-24 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </div>
      ) : null}
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel={
          isOfficeRequirement
            ? localText(locale, "保存状态", "状態を保存")
            : localText(locale, "保存审核", "確認結果を保存")
        }
        submittingLabel={localText(locale, "保存中...", "保存中...")}
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
  const { locale } = useLanguage();
  const [customerInstruction, setCustomerInstruction] = useState(
    requirement.responsibleParty === "office" ? "" : (requirement.customerInstruction ?? ""),
  );
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
        customerInstruction,
        internalNote,
      });
      await onSuccess({
        message:
          customerInstruction.trim() || internalNote.trim()
            ? localText(locale, "备注已保存。", "メモを保存しました。")
            : localText(locale, "备注已清空。", "メモを削除しました。"),
      });
    } catch (submitError) {
      setError(
        toAdminErrorMessage(
          submitError,
          localText(locale, "备注保存失败，请稍后重试。", "メモの保存に失敗しました。時間をおいて再度お試しください。"),
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitNote} className="grid gap-4">
      <InlineError message={error} />
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="requirementCustomerInstruction">
          {localText(locale, "补充说明", "お客様向け説明")}
        </label>
        <textarea
          id="requirementCustomerInstruction"
          value={customerInstruction}
          onChange={(event) => setCustomerInstruction(event.target.value)}
          className="min-h-28 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          placeholder={localText(locale, "向客户补充说明", "お客様への補足説明を入力")}
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="requirementInternalNote">
          {localText(locale, "内部备注", "内部メモ")}
        </label>
        <textarea
          id="requirementInternalNote"
          value={internalNote}
          onChange={(event) => setInternalNote(event.target.value)}
          className="min-h-28 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          placeholder={localText(locale, "仅后台可见，不会显示给客户。", "管理画面のみに表示され、お客様には表示されません。")}
        />
      </div>
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel={localText(locale, "保存备注", "メモを保存")}
        submittingLabel={localText(locale, "保存中...", "保存中...")}
      />
    </form>
  );
}

function RequirementDueDateForm({
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
  const { locale } = useLanguage();
  const [dueDate, setDueDate] = useState(toDateInputValue(requirement.dueDate));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onBusyChange(isSubmitting);
    return () => onBusyChange(false);
  }, [isSubmitting, onBusyChange]);

  async function submitDueDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      setIsSubmitting(true);
      await patchJson(`/api/admin/requirements/${requirement.id}/note`, {
        caseId,
        dueDate: dueDate || null,
      });
      await onSuccess({
        message: dueDate
          ? localText(locale, "截止日期已保存。", "提出期限を保存しました。")
          : localText(locale, "截止日期已清除。", "提出期限を削除しました。"),
      });
    } catch (submitError) {
      setError(
        toAdminErrorMessage(
          submitError,
          localText(locale, "截止日期保存失败，请稍后重试。", "提出期限の保存に失敗しました。時間をおいて再度お試しください。"),
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitDueDate} className="grid gap-4">
      <InlineError message={error} />
      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
        <div className="text-xs font-semibold text-slate-500">
          {localText(locale, "资料名称", "資料名")}
        </div>
        <div className="mt-1 font-semibold text-slate-950">
          {displayLocalizedRequirementTitle(requirement.title, locale)}
        </div>
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="requirementDueDateOnly">
          {localText(locale, "截止日期", "提出期限")}
        </label>
        <DateTextInput
          id="requirementDueDateOnly"
          value={dueDate}
          min={todayDateInputValue()}
          onChange={(event) => setDueDate(event.target.value)}
        />
      </div>
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel={localText(locale, "保存截止日期", "提出期限を保存")}
        submittingLabel={localText(locale, "保存中...", "保存中...")}
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
  const { locale } = useLanguage();
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
      setError(localText(locale, "请输入客户姓名。", "お客様名を入力してください。"));
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
      await onSuccess({ message: localText(locale, "客户信息已更新。", "お客様情報を更新しました。") });
    } catch (submitError) {
      setError(
        toAdminErrorMessage(
          submitError,
          localText(locale, "客户信息保存失败，请稍后重试。", "お客様情報の保存に失敗しました。時間をおいて再度お試しください。"),
        ),
      );
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
            {localText(locale, "姓名", "氏名")}
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
            {localText(locale, "邮箱", "メール")}
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
            {localText(locale, "电话", "電話番号")}
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
            {localText(locale, "国籍", "国籍")}
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
        submitLabel={localText(locale, "保存客户信息", "お客様情報を保存")}
        submittingLabel={localText(locale, "保存中...", "保存中...")}
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
  const { locale } = useLanguage();
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
      setError(
        localText(
          locale,
          "请选择要上传的文件。可一次选择多个文件。",
          "アップロードするファイルを選択してください。複数ファイルをまとめて選択できます。",
        ),
      );
      return;
    }

    const uploadForm = new FormData();
    uploadForm.set("caseId", caseId);
    selectedFiles.forEach((file) => uploadForm.append("file", file));

    try {
      setIsSubmitting(true);
      await postForm(`/api/admin/requirements/${requirement.id}/files`, uploadForm);
      await onSuccess({
        message: localText(
          locale,
          `已上传 ${selectedFiles.length} 个文件。`,
          `${selectedFiles.length} 件のファイルをアップロードしました。`,
        ),
      });
    } catch (submitError) {
      setError(
        toAdminErrorMessage(
          submitError,
          localText(locale, "文件上传失败。请重新选择文件后重试。", "ファイルのアップロードに失敗しました。ファイルを選択し直して再度お試しください。"),
        ),
      );
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
            <span className="block text-sm font-semibold text-slate-900">
              {localText(locale, "选择要上传的文件", "アップロードするファイルを選択")}
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              {localText(locale, "支持一次选择多个文件", "複数ファイルをまとめて選択できます")}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-100">
            {localText(locale, "选择文件", "ファイルを選択")}
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
              <span>
                {localText(locale, `已选择 ${selectedFiles.length} 个文件`, `${selectedFiles.length} 件のファイルを選択中`)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedFiles([])}
                className="text-blue-600 hover:text-blue-700"
              >
                {localText(locale, "清空", "クリア")}
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
                    aria-label={localText(locale, `移除 ${file.name}`, `${file.name} を削除`)}
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
        submitLabel={localText(locale, "上传文件", "ファイルをアップロード")}
        submittingLabel={localText(locale, "上传中...", "アップロード中...")}
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
  const { locale } = useLanguage();
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
      setError(localText(locale, "请填写标题并选择负责方。", "タイトルを入力し、担当区分を選択してください。"));
      return;
    }

    const body = {
      title,
      responsibleParty,
      customerInstruction: optionalFormString(form, "customerInstruction"),
      internalNote: optionalFormString(form, "internalNote"),
      dueDate: optionalFormString(form, "dueDate"),
      setCasePhase: form.get("setCasePhase") === "on",
    };

    try {
      setIsSubmitting(true);
      await postJson(`/api/admin/cases/${caseId}/immigration-requests`, body);
      await onSuccess({ message: localText(locale, "入管追加材料已添加。", "入管追加資料を追加しました。") });
    } catch (submitError) {
      setError(
        toAdminErrorMessage(
          submitError,
          localText(locale, "追加材料创建失败。请检查标题、负责方和日期后重试。", "追加資料の作成に失敗しました。タイトル、担当区分、日付を確認して再度お試しください。"),
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitImmigrationRequest} className="grid gap-4">
      <InlineError message={error} />
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="immigrationTitle">
          {localText(locale, "材料标题", "資料タイトル")}
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
          {localText(locale, "负责方", "担当")}
        </label>
        <select
          id="responsibleParty"
          name="responsibleParty"
          defaultValue="customer"
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        >
          <option value="customer">{localText(locale, "客户", "お客様")}</option>
          <option value="office">{localText(locale, "事务所", "事務所")}</option>
        </select>
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="immigrationCustomerInstruction">
          {localText(locale, "补充说明", "お客様向け説明")}
        </label>
        <textarea
          id="immigrationCustomerInstruction"
          name="customerInstruction"
          placeholder={localText(
            locale,
            "此说明会显示给客户，请写明需要提交的资料内容和注意事项。",
            "この説明はお客様画面に表示されます。提出が必要な資料内容と注意事項を記載してください。",
          )}
          className="min-h-20 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="immigrationInternalNote">
          {localText(locale, "内部备注", "内部メモ")}
        </label>
        <textarea
          id="immigrationInternalNote"
          name="internalNote"
          className="min-h-20 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="immigrationDueDate">
          {localText(locale, "截止日期", "提出期限")}
        </label>
        <DateTextInput
          id="immigrationDueDate"
          name="dueDate"
          min={todayDateValue}
          placeholder="YYYY-MM-DD"
        />
      </div>
      <div className="grid gap-2 text-sm text-slate-600">
        <label className="flex items-center gap-2">
          <input name="setCasePhase" type="checkbox" className="h-4 w-4 rounded border-slate-300" />
          {localText(locale, "同时将案件阶段切换为资料收集中", "案件段階も「資料収集中」に変更する")}
        </label>
      </div>
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel={localText(locale, "添加材料", "資料を追加")}
        submittingLabel={localText(locale, "添加中...", "追加中...")}
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
  const { locale } = useLanguage();
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
      setError(localText(locale, "请填写追加资料名称。", "追加資料名を入力してください。"));
      return;
    }

    try {
      setIsSubmitting(true);
      await postJson(`/api/admin/cases/${caseId}/custom-requirements`, {
        title,
        responsibleParty,
        customerInstruction: optionalFormString(form, "customerInstruction"),
        dueDate:
          responsibleParty === "customer" ? optionalFormString(form, "dueDate") : undefined,
      });
      await onSuccess({ message: localText(locale, "追加资料已添加。", "追加資料を追加しました。") });
    } catch (submitError) {
      setError(
        toAdminErrorMessage(
          submitError,
          localText(locale, "追加资料创建失败，请检查资料名称后重试。", "追加資料の作成に失敗しました。資料名を確認して再度お試しください。"),
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitCustomRequirement} className="grid gap-4">
      <InlineError message={error} />
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="customRequirementTitle">
          {localText(locale, "追加资料名称", "追加資料名")}
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
          {localText(locale, "补充说明", "お客様向け説明")}
        </label>
        <textarea
          id="customRequirementInstruction"
          name="customerInstruction"
          placeholder={localText(
            locale,
            "此说明会显示给客户，请写明需要提交的资料内容和注意事项。",
            "この説明はお客様画面に表示されます。提出が必要な資料内容と注意事項を記載してください。",
          )}
          className="min-h-24 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      {responsibleParty === "customer" ? (
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="customRequirementDueDate">
            {localText(locale, "截止日期", "提出期限")}
          </label>
          <DateTextInput
            id="customRequirementDueDate"
            name="dueDate"
            min={todayDateInputValue()}
          />
        </div>
      ) : null}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {responsibleParty === "customer"
          ? localText(locale, "该资料会显示在客户画面中。", "この資料はお客様画面に表示されます。")
          : localText(locale, "该资料只显示在事务所后台。", "この資料は事務所管理画面のみに表示されます。")}
      </div>
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel={localText(locale, "追加资料", "資料を追加")}
        submittingLabel={localText(locale, "追加中...", "追加中...")}
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
  const { locale } = useLanguage();
  const text = getChangeHistoryText(locale);
  const requirementLookup = useMemo(() => buildRequirementLookup(requirements), [requirements]);

  if (events.length === 0) {
    return <p className="text-sm text-slate-500">{text.empty}</p>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {events.map((event) => (
        <div key={event.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="break-words text-sm font-medium text-slate-900">
              {formatChangeHistorySummary(event.summary, locale)}
            </div>
            <div className="mt-0.5 break-words text-xs leading-5 text-slate-500">
              {formatChangeHistoryDetail(event, requirementLookup, locale)}
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
  const { locale } = useLanguage();
  const text = getChangeHistoryText(locale);
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
          <span>{text.all}</span>
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
                {text.requirementName}{selectedRequirementIds.length > 0 ? ` ${selectedRequirementIds.length}` : ""}
                <span className="ml-1 text-[9px] text-slate-400">
                  {openFilter === "requirements" ? "▲" : "▼"}
                </span>
              </button>
              {openFilter === "requirements" ? (
                <div className="absolute left-0 top-full z-10 mt-2 w-[min(420px,calc(100vw-3rem))] rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xl shadow-slate-950/10">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-slate-600">{text.requirementName}</div>
                  {selectedRequirementIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelectedRequirementIds([])}
                      className="text-xs font-medium text-blue-700 hover:text-blue-800"
                    >
                      {text.clear}
                    </button>
                  ) : null}
                </div>
                <div className="soft-scrollbar max-h-40 overflow-auto pr-1">
                  {requirements.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-slate-500">{text.noFilterableRequirements}</p>
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
                          <span className="truncate">{displayLocalizedRequirementTitle(requirement.title, locale)}</span>
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
                {text.time}
                <span className="ml-1 text-[9px] text-slate-400">
                  {openFilter === "time" ? "▲" : "▼"}
                </span>
              </button>
              {openFilter === "time" ? (
                <div className="absolute left-0 top-full z-10 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xl shadow-slate-950/10">
                <div className="mb-2 text-xs font-semibold text-slate-600">{text.timeFilter}</div>
                <div className="grid gap-2">
                  <label className="grid gap-1 text-xs font-medium text-slate-500">
                    {text.startDate}
                    <DateTextInput
                      value={fromDate}
                      onChange={(event) => setFromDate(event.target.value)}
                      className="h-10 bg-white text-sm font-normal"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-slate-500">
                    {text.endDate}
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
                {text.clear}
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
          <span>{text.count(filteredEvents.length, events.length)}</span>
        </div>

        <div className="soft-scrollbar overflow-y-auto pr-1">
          <ChangeHistoryList events={filteredEvents} requirements={requirements} />
        </div>
      </div>
    </Modal>
  );
}

function formatPhaseWarning(warning: CasePhaseWarning, locale: AppLocale): string {
  if (warning.type === "required_requirements_incomplete") {
    return localText(
      locale,
      `必需资料尚未完成：${warning.count} 项`,
      `必須資料が未完了です：${warning.count} 件`,
    );
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
  const { locale } = useLanguage();
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
      setError(localText(locale, "当前阶段暂无可切换的下一阶段。", "現在の段階から変更できる次の段階はありません。"));
      return;
    }

    if (!phaseOptions.includes(newPhase)) {
      setError(localText(locale, "请选择不同的案件阶段。", "別の案件段階を選択してください。"));
      return;
    }

    if (newPhase === currentPhase) {
      setError(localText(locale, "请选择一个不同的案件阶段。", "現在とは異なる案件段階を選択してください。"));
      return;
    }

    if (
      needsConfirmation &&
      !confirmImportantAction(
        localText(
          locale,
          `案件阶段将从“${displayCasePhaseLabel(currentPhase, locale)}”切换为“${displayCasePhaseLabel(newPhase, locale)}”。`,
          `案件段階を「${displayCasePhaseLabel(currentPhase, locale)}」から「${displayCasePhaseLabel(newPhase, locale)}」へ変更します。`,
        ),
        locale,
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
        },
      );
      const warningMessage =
        result.warnings.length > 0
          ? localText(
              locale,
              `提示：${result.warnings.map((warning) => formatPhaseWarning(warning, locale)).join(" / ")}`,
              `注意：${result.warnings.map((warning) => formatPhaseWarning(warning, locale)).join(" / ")}`,
            )
          : undefined;

      await onSuccess({
        message: localText(
          locale,
          `案件阶段已从 ${displayCasePhaseLabel(result.oldPhase, locale)} 切换为 ${displayCasePhaseLabel(result.newPhase, locale)}。`,
          `案件段階を ${displayCasePhaseLabel(result.oldPhase, locale)} から ${displayCasePhaseLabel(result.newPhase, locale)} へ変更しました。`,
        ),
        warningMessage,
      });
    } catch (submitError) {
      setError(formatCasePhaseSubmitError(submitError, locale));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitPhase} className="grid gap-4">
      <InlineError message={error} />
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="newPhase">
          {localText(locale, "新案件阶段", "新しい案件段階")}
        </label>
        <select
          id="newPhase"
          value={newPhase}
          onChange={(event) => setNewPhase(event.target.value)}
          disabled={phaseOptions.length === 0}
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        >
          <option value="" disabled>
            {localText(locale, "请选择案件阶段", "案件段階を選択してください")}
          </option>
          {phaseOptions.map((phase) => (
            <option key={phase} value={phase}>
              {displayCasePhaseLabel(phase, locale)}
            </option>
          ))}
        </select>
        {phaseOptions.length > 0 ? (
          <p className="text-xs text-slate-500">
            {localText(locale, "可选择任意其他案件阶段。", "現在とは異なる任意の案件段階を選択できます。")}
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            {localText(locale, "暂无可切换的案件阶段。", "変更できる案件段階はありません。")}
          </p>
        )}
        {needsConfirmation ? (
          <p className="text-xs text-amber-700">
            {localText(locale, "该阶段切换提交前会要求确认，建议填写原因。", "この段階変更は送信前に確認が必要です。理由の入力を推奨します。")}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="phaseReason">
          {localText(locale, "原因", "理由")}
        </label>
        <input
          id="phaseReason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={localText(locale, "可选；回退或审查完了时建议填写", "任意。差戻し又は審査完了時は入力を推奨します")}
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      {newPhase === "submitted" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="submittedAt">
              {localText(locale, "提交日期", "提出日")}
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
              {localText(locale, "受理号", "受付番号")}
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
            {localText(locale, "结果日期", "結果日")}
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
        submitLabel={localText(locale, "切换阶段", "段階を変更")}
        submittingLabel={localText(locale, "切换中...", "変更中...")}
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
  const { locale } = useLanguage();
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
      setError(localText(locale, "请填写标题、storage bucket 和 storage path。", "タイトル、storage bucket、storage path を入力してください。"));
      return;
    }

    if (
      parsedVersion !== undefined &&
      (!Number.isInteger(parsedVersion) || parsedVersion <= 0)
    ) {
      setError(localText(locale, "版本号必须是正整数。", "バージョン番号は正の整数で入力してください。"));
      return;
    }

    if (
      supersedePendingVersions &&
      !confirmImportantAction(
        localText(locale, "旧的 pending 申请书确认版本会被标记为 superseded。", "既存の pending 状態の確認資料バージョンは superseded として扱われます。"),
        locale,
      )
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
        message: localText(
          locale,
          `申请书确认版本已创建：${result.title} v${result.version}。`,
          `確認資料バージョンを作成しました：${result.title} v${result.version}。`,
        ),
      });
    } catch (submitError) {
      setError(
        toAdminErrorMessage(
          submitError,
          localText(locale, "申请书确认版本创建失败。请检查文件登记信息后重试。", "確認資料バージョンの作成に失敗しました。ファイル登録情報を確認して再度お試しください。"),
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitConfirmation} className="grid gap-4">
      <InlineError message={error} />
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-900">
        {localText(
          locale,
          "当前只是登记已存在的确认文件，不是上传文件。storage bucket 和 storage path 必须对应已经存在的文件；本操作不会生成预览或下载链接。",
          "この操作は既存の確認ファイルを登録するものです。ファイルアップロードではありません。storage bucket と storage path は既に存在するファイルに対応している必要があり、この操作ではプレビュー又はダウンロードリンクは生成されません。",
        )}
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="confirmationTitle">
          {localText(locale, "标题", "タイトル")}
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
            {localText(locale, "版本号", "バージョン番号")}
          </label>
          <input
            id="confirmationVersion"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            inputMode="numeric"
            placeholder={localText(locale, "可选；不填则自动递增", "任意。未入力の場合は自動採番")}
            className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="confirmationReason">
            {localText(locale, "原因", "理由")}
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
        {localText(locale, "将旧的 pending 版本标记为 superseded", "既存の pending バージョンを superseded にする")}
      </label>
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel={localText(locale, "创建确认版本", "確認バージョンを作成")}
        submittingLabel={localText(locale, "创建中...", "作成中...")}
      />
    </form>
  );
}

const tokenRegenerateFormText = {
  zh: {
    confirm:
      "旧的有效客户访问链接会失效。新的客户访问链接只会显示一次，请准备好立即复制。",
    success: "客户访问链接已重新生成。请立即复制新的客户链接。",
    error: "客户访问链接重新生成失败。请稍后重试。",
    copied: "已复制到剪贴板。",
    copyFailed: "复制失败，请手动选择访问链接。",
    warning: "重新生成会让旧的客户访问链接失效。新的客户链接只在本窗口显示一次，关闭后无法再次查看。",
    reason: "原因",
    reasonPlaceholder: "可选，写入安全的操作原因",
    expiresAt: "过期时间",
    oneTimeTitle: "客户访问链接只显示一次。",
    oneTimeDescription: "请现在复制并交给客户，关闭弹窗后无法再次查看。",
    newTokenId: "新访问令牌 ID：",
    previousTokenId: "旧访问令牌 ID：",
    none: "无",
    expiry: "有效期：",
    copyLink: "复制客户链接",
    close: "关闭",
    submit: "重新生成链接",
    submitAgain: "再次重新生成",
    submitting: "重新生成中...",
  },
  ja: {
    confirm:
      "現在有効なお客様リンクは失効します。新しいお客様リンクは一度だけ表示されるため、すぐにコピーできる状態で続行してください。",
    success: "お客様リンクを再生成しました。新しいリンクをすぐにコピーしてください。",
    error: "お客様リンクの再生成に失敗しました。時間をおいて再度お試しください。",
    copied: "クリップボードにコピーしました。",
    copyFailed: "コピーに失敗しました。リンクを手動で選択してコピーしてください。",
    warning:
      "再生成すると旧お客様リンクは失効します。新しいお客様リンクはこの画面で一度だけ表示され、閉じた後は再確認できません。",
    reason: "理由",
    reasonPlaceholder: "任意。安全に保存できる操作理由を入力してください",
    expiresAt: "有効期限",
    oneTimeTitle: "お客様リンクは一度だけ表示されます。",
    oneTimeDescription: "今すぐコピーしてお客様へ共有してください。画面を閉じると再確認できません。",
    newTokenId: "新しいアクセストークン ID：",
    previousTokenId: "旧アクセストークン ID：",
    none: "なし",
    expiry: "有効期限：",
    copyLink: "お客様リンクをコピー",
    close: "閉じる",
    submit: "リンクを再生成",
    submitAgain: "もう一度再生成",
    submitting: "再生成中...",
  },
} as const;

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
  const { locale } = useLanguage();
  const text = tokenRegenerateFormText[locale];
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

    if (!confirmImportantAction(text.confirm, locale)) {
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
      await onSuccess({ message: text.success });
    } catch (submitError) {
      setError(toAdminErrorMessage(submitError, text.error));
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
      setCopyMessage(text.copied);
    } catch {
      setCopyMessage(text.copyFailed);
    }
  }

  return (
    <form onSubmit={submitRegenerate} className="grid gap-4">
      <InlineError message={error} />
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
        {text.warning}
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="tokenRegenerateReason">
          {text.reason}
        </label>
        <input
          id="tokenRegenerateReason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={text.reasonPlaceholder}
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="tokenRegenerateExpiresAt">
          {text.expiresAt}
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
            <div className="text-base font-semibold">{text.oneTimeTitle}</div>
            <div className="mt-1 text-amber-800">{text.oneTimeDescription}</div>
          </div>
          <div className="break-all rounded-xl border border-amber-300 bg-white p-3 font-mono text-xs text-slate-900 shadow-inner">
            {createPortalAccessUrl(regeneratedToken.plaintextToken)}
          </div>
          <div className="grid gap-1 text-xs text-amber-800">
            <div>
              {text.newTokenId}
              {regeneratedToken.newTokenId}
            </div>
            <div>
              {text.previousTokenId}
              {regeneratedToken.previousTokenId ?? text.none}
            </div>
            <div>
              {text.expiry}
              {formatDateTime(regeneratedToken.expiresAt)}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={copyPortalLink}
              className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {text.copyLink}
            </button>
            {copyMessage ? <span className="text-sm text-amber-800">{copyMessage}</span> : null}
          </div>
        </div>
      ) : null}

      <FormActions
        cancelLabel={text.close}
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel={regeneratedToken ? text.submitAgain : text.submit}
        submittingLabel={text.submitting}
      />
    </form>
  );
}

const tokenRevokeFormText = {
  zh: {
    confirm: "撤销后，客户访问链接会失效。",
    success: (tokenId: string) => `客户访问链接已撤销：${tokenId}。`,
    noActiveToken: "当前没有有效访问令牌，无需撤销。",
    error: "客户访问链接撤销失败。请稍后重试。",
    warning: "撤销后，客户将无法继续使用当前访问链接查看案件。此操作不会显示或返回明文访问令牌。",
    reason: "原因",
    reasonPlaceholder: "可选，写入安全的操作原因",
    submit: "撤销链接",
    submitting: "撤销中...",
  },
  ja: {
    confirm: "取り消すと、お客様リンクは失効します。",
    success: (tokenId: string) => `お客様リンクを取り消しました：${tokenId}。`,
    noActiveToken: "現在有効なアクセストークンはありません。取り消しは不要です。",
    error: "お客様リンクの取り消しに失敗しました。時間をおいて再度お試しください。",
    warning:
      "取り消すと、お客様は現在のリンクで案件を閲覧できなくなります。この操作では平文アクセストークンは表示・返却されません。",
    reason: "理由",
    reasonPlaceholder: "任意。安全に保存できる操作理由を入力してください",
    submit: "リンクを取り消す",
    submitting: "取り消し中...",
  },
} as const;

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
  const { locale } = useLanguage();
  const text = tokenRevokeFormText[locale];
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

    if (!confirmImportantAction(text.confirm, locale)) {
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
          ? text.success(result.revokedTokenId)
          : text.noActiveToken,
      });
    } catch (submitError) {
      setError(toAdminErrorMessage(submitError, text.error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitRevoke} className="grid gap-4">
      <InlineError message={error} />
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900">
        {text.warning}
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="tokenRevokeReason">
          {text.reason}
        </label>
        <input
          id="tokenRevokeReason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={text.reasonPlaceholder}
          className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel={text.submit}
        submittingLabel={text.submitting}
        submitTone="rose"
      />
    </form>
  );
}

export function AdminCaseDetailPage({ caseId }: Props) {
  const { locale } = useLanguage();
  const text = caseDetailText[locale];
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
  const [focusedRequirementId, setFocusedRequirementId] = useState<string | null>(null);

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
          setError(
            toAdminErrorMessage(
              loadError,
              localText(locale, "案件加载失败。请确认 caseId 是否正确。", "案件の読み込みに失敗しました。caseId が正しいか確認してください。"),
            ),
          );
          setIsLoading(false);
        }
      }
    }

    void loadMountedCase();

    return () => {
      isMounted = false;
    };
  }, [loadCase, locale]);

  const scrollToRequirementFromHash = useCallback(() => {
    const requirementId = getRequirementIdFromHash();

    if (!requirementId) {
      return;
    }

    const element = document.getElementById(`requirement-${requirementId}`);

    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setFocusedRequirementId(requirementId);

    if (window.location.hash.startsWith("#requirement-")) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }

    window.setTimeout(() => {
      setFocusedRequirementId((current) => (current === requirementId ? null : current));
    }, 2200);
  }, []);

  useEffect(() => {
    if (requirements.length === 0) {
      return undefined;
    }

    const timeoutId = window.setTimeout(scrollToRequirementFromHash, 120);
    window.addEventListener("hashchange", scrollToRequirementFromHash);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("hashchange", scrollToRequirementFromHash);
    };
  }, [requirements, scrollToRequirementFromHash]);

  async function handleMutationSuccess(result: MutationResult) {
    setActiveModal(null);
    setIsModalBusy(false);
    setMessage(result.message);
    setWarning(result.warningMessage ?? null);
    try {
      await loadCase();
    } catch (loadError) {
      setError(
        toAdminErrorMessage(
          loadError,
          localText(locale, "案件刷新失败。请手动刷新页面。", "案件の再読み込みに失敗しました。手動でページを更新してください。"),
        ),
      );
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
      setError(
        toAdminErrorMessage(
          loadError,
          localText(locale, "案件刷新失败。请手动刷新页面。", "案件の再読み込みに失敗しました。手動でページを更新してください。"),
        ),
      );
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
        setMessage(localText(locale, "文件下载已开始。", "ファイルのダウンロードを開始しました。"));
        return;
      }

      setFilePreview({
        fileName: file.originalFileName,
        fileUrl: result.signedUrl,
        expiresAt: result.expiresAt,
      });
    } catch (previewError) {
      setError(
        toAdminErrorMessage(
          previewError,
          localText(locale, "文件预览链接生成失败，请稍后重试。", "ファイルプレビューリンクの生成に失敗しました。時間をおいて再度お試しください。"),
        ),
      );
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
        setMessage(localText(locale, "文件下载已开始。", "ファイルのダウンロードを開始しました。"));
        return;
      }

      const archive = await postBlob(
        `/api/admin/requirements/${requirement.id}/files/archive`,
      );
      triggerBlobDownload({
        blob: archive,
        fileName: `${requirement.title || "files"}.zip`,
      });
      setMessage(
        localText(
          locale,
          `已开始下载 ${uploadedFiles.length} 个文件的压缩包。`,
          `${uploadedFiles.length} 件のファイルをまとめた zip のダウンロードを開始しました。`,
        ),
      );
    } catch (downloadError) {
      setError(
        toAdminErrorMessage(
          downloadError,
          localText(locale, "部分文件下载链接生成失败，请稍后重试。", "一部ファイルのダウンロードリンク生成に失敗しました。時間をおいて再度お試しください。"),
        ),
      );
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
      setMessage(localText(locale, "文件已删除。", "ファイルを削除しました。"));
      setFileDeleteConfirmation(null);
      await loadCase();
    } catch (deleteError) {
      setFileDeleteError(
        toAdminErrorMessage(
          deleteError,
          localText(locale, "文件删除失败，请稍后重试。", "ファイルの削除に失敗しました。時間をおいて再度お試しください。"),
        ),
      );
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
      setMessage(
        localText(
          locale,
          `已删除 ${uploadedFiles.length} 个文件。`,
          `${uploadedFiles.length} 件のファイルを削除しました。`,
        ),
      );
      setFileDeleteConfirmation(null);
      await loadCase();
    } catch (deleteError) {
      setFileDeleteError(
        toAdminErrorMessage(
          deleteError,
          localText(locale, "全部删除失败，请稍后重试。", "すべてのファイル削除に失敗しました。時間をおいて再度お試しください。"),
        ),
      );
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
      setMessage(localText(locale, "资料已删除。", "資料を削除しました。"));
      setRequirementDeleteConfirmation(null);
      await loadCase();
    } catch (deleteError) {
      setRequirementDeleteError(
        toAdminErrorMessage(
          deleteError,
          localText(locale, "资料删除失败，请稍后重试。", "資料の削除に失敗しました。時間をおいて再度お試しください。"),
        ),
      );
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
      setCaseDeleteError(
        toAdminErrorMessage(
          deleteError,
          localText(locale, "案件删除失败，请稍后重试。", "案件の削除に失敗しました。時間をおいて再度お試しください。"),
        ),
      );
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
      customer: sortApprovedRequirementsLast(
        requirements.filter(
          (requirement) =>
            requirement.responsibleParty === "customer" &&
            requirement.sourceType !== "immigration_request",
        ),
      ),
      office: sortApprovedRequirementsLast(
        requirements.filter(
          (requirement) =>
            requirement.responsibleParty === "office" &&
            requirement.sourceType !== "immigration_request",
        ),
      ),
      immigration: sortApprovedRequirementsLast(
        requirements.filter(
          (requirement) => requirement.sourceType === "immigration_request",
        ),
      ),
      immigrationCustomer: sortApprovedRequirementsLast(
        requirements.filter(
          (requirement) =>
            requirement.sourceType === "immigration_request" &&
            requirement.responsibleParty === "customer",
        ),
      ),
      immigrationOffice: sortApprovedRequirementsLast(
        requirements.filter(
          (requirement) =>
            requirement.sourceType === "immigration_request" &&
            requirement.responsibleParty === "office",
        ),
      ),
    }),
    [requirements],
  );
  const latestCasePhaseReason = useMemo(() => getLatestCasePhaseReason(timeline), [timeline]);
  const latestCaseSubmissionInfo = useMemo(
    () => getLatestCaseSubmissionInfo(timeline),
    [timeline],
  );

  return (
    <main className="w-full">
      <div className="mb-6 grid gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <Link href="/admin/cases" className="text-sm text-blue-700 hover:underline">
            {text.back}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {text.title}
          </h1>
        </div>
        {caseDetail ? (
          <button
            type="button"
            onClick={requestDeleteCase}
            className="inline-flex w-fit rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
          >
            {text.deleteCase}
          </button>
        ) : null}
      </div>

      {isLoading ? <LoadingState title={text.loadingTitle} detail={text.loadingDetail} /> : null}
      {message ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">{message}</div> : null}
      {warning ? <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">{warning}</div> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {!isLoading && !error && !caseDetail ? (
        <DashboardCard>
          <EmptyState
            title={text.notFoundTitle}
            description={text.notFoundDescription}
            action={
              <Link
                href="/admin/cases"
                className="inline-flex rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {text.back}
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
                  {formatVisaBusinessSummary(caseDetail.currentVisaType, caseDetail.targetVisaType, locale)}
                </p>
              </div>
              <StatusBadge
                value={caseDetail.casePhase}
                label={displayCasePhaseLabel(caseDetail.casePhase, locale)}
              />
            </div>
          </DashboardCard>

          <DashboardCard>
            <SectionHeader
              title={text.customerInfo}
              action={
                <button
                  type="button"
                  onClick={() => setActiveModal({ type: "customer", customer: caseDetail.customer })}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  {text.edit}
                </button>
              }
            />
            <div className="grid gap-x-10 gap-y-5 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="text-slate-500">{text.name}</div>
                <div className="mt-1 break-words font-semibold text-slate-950">
                  {caseDetail.customer.name}
                </div>
              </div>
              <div>
                <div className="text-slate-500">{text.email}</div>
                <div className="mt-1 break-words font-semibold text-slate-950">
                  {caseDetail.customer.email ?? "-"}
                </div>
              </div>
              <div>
                <div className="text-slate-500">{text.phone}</div>
                <div className="mt-1 break-words font-semibold text-slate-950">
                  {caseDetail.customer.phone ?? "-"}
                </div>
              </div>
              <div>
                <div className="text-slate-500">{text.nationality}</div>
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
                  title={text.caseProgress}
                  action={
                    <button
                      type="button"
                      onClick={() => setActiveModal({ type: "phase" })}
                      className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700"
                    >
                      {text.changePhase}
                    </button>
                  }
                />
                <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 border-b border-slate-100 pb-4 text-sm text-slate-600">
                  <div>
                    {text.requirementTotal}
                    <span className="font-semibold text-slate-950">
                      {caseDetail.requirementSummary.total}
                    </span>
                  </div>
                  <div>
                    {text.updatedAt}
                    <span className="font-semibold text-slate-950">
                      {formatDateTime(caseDetail.updatedAt)}
                    </span>
                  </div>
                </div>
                <ProgressStepper
                  steps={casePhaseSteps}
                  currentStep={caseDetail.casePhase}
                  formatLabel={(phase) => displayCasePhaseLabel(phase, locale)}
                />
                {latestCaseSubmissionInfo && shouldShowSubmissionInfo(caseDetail.casePhase) ? (
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <div className="grid gap-4 text-sm sm:grid-cols-2">
                      {latestCaseSubmissionInfo.submittedAt ? (
                        <div>
                          <div className="text-slate-500">{text.submittedAt}</div>
                          <div className="mt-1 font-semibold text-slate-950">
                            {formatDateOnly(latestCaseSubmissionInfo.submittedAt)}
                          </div>
                        </div>
                      ) : null}
                      {latestCaseSubmissionInfo.submissionNumber ? (
                        <div>
                          <div className="text-slate-500">{text.submissionNumber}</div>
                          <div className="mt-1 break-words font-semibold text-slate-950">
                            {latestCaseSubmissionInfo.submissionNumber}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {latestCasePhaseReason ? (
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <div className="text-sm text-slate-500">{text.note}</div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                      {latestCasePhaseReason}
                    </div>
                  </div>
                ) : null}
              </DashboardCard>

              <div className="grid gap-6">
                <RequirementGroup
                  title={text.customerRequirements}
                  emptyMessage={text.emptyCustomerRequirements}
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
                      {text.addRequirement}
                    </button>
                  }
                  onReview={(requirement) => setActiveModal({ type: "review", requirement })}
                  onUpload={(requirement) => setActiveModal({ type: "upload", requirement })}
                  onNote={(requirement) => setActiveModal({ type: "note", requirement })}
                  onDueDate={(requirement) => setActiveModal({ type: "dueDate", requirement })}
                  onPreviewFile={openFilePreview}
                  onDownloadAllFiles={downloadAllFiles}
                  onDeleteFile={requestDeleteUploadedFile}
                  onDeleteAllFiles={requestDeleteAllUploadedFiles}
                  onDeleteRequirement={requestDeleteRequirement}
                  downloadingRequirementId={downloadingRequirementId}
                  deletingFileId={deletingFileId}
                  deletingRequirementId={deletingRequirementId}
                  deletingRequirementRecordId={deletingRequirementRecordId}
                  focusedRequirementId={focusedRequirementId}
                />
                <RequirementGroup
                  title={text.officeRequirements}
                  emptyMessage={text.emptyOfficeRequirements}
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
                      {text.addRequirement}
                    </button>
                  }
                  onReview={(requirement) => setActiveModal({ type: "review", requirement })}
                  onUpload={(requirement) => setActiveModal({ type: "upload", requirement })}
                  onNote={(requirement) => setActiveModal({ type: "note", requirement })}
                  onDueDate={(requirement) => setActiveModal({ type: "dueDate", requirement })}
                  onPreviewFile={openFilePreview}
                  onDownloadAllFiles={downloadAllFiles}
                  onDeleteFile={requestDeleteUploadedFile}
                  onDeleteAllFiles={requestDeleteAllUploadedFiles}
                  onDeleteRequirement={requestDeleteRequirement}
                  downloadingRequirementId={downloadingRequirementId}
                  deletingFileId={deletingFileId}
                  deletingRequirementId={deletingRequirementId}
                  deletingRequirementRecordId={deletingRequirementRecordId}
                  focusedRequirementId={focusedRequirementId}
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
                    {formatCaseDetailText(text.additionalRequirements, {
                      count: grouped.immigrationCustomer.length + grouped.immigrationOffice.length,
                    })}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveModal({ type: "immigration" })}
                      className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700"
                    >
                      {text.addAdditionalRequirement}
                    </button>
                    <CollapseIconButton
                      isExpanded={isImmigrationExpanded}
                      onClick={() => setIsImmigrationExpanded((current) => !current)}
                    />
                  </div>
                </div>
                {isImmigrationExpanded ? <div className="grid gap-6">
                  <RequirementGroup
                    title={text.customerRequirements}
                    emptyMessage={text.emptyAdditionalCustomer}
                    requirements={grouped.immigrationCustomer}
                    standalone={false}
                    onReview={(requirement) => setActiveModal({ type: "review", requirement })}
                    onUpload={(requirement) => setActiveModal({ type: "upload", requirement })}
                    onNote={(requirement) => setActiveModal({ type: "note", requirement })}
                    onDueDate={(requirement) => setActiveModal({ type: "dueDate", requirement })}
                    onPreviewFile={openFilePreview}
                    onDownloadAllFiles={downloadAllFiles}
                    onDeleteFile={requestDeleteUploadedFile}
                    onDeleteAllFiles={requestDeleteAllUploadedFiles}
                    onDeleteRequirement={requestDeleteRequirement}
                    downloadingRequirementId={downloadingRequirementId}
                    deletingFileId={deletingFileId}
                    deletingRequirementId={deletingRequirementId}
                    deletingRequirementRecordId={deletingRequirementRecordId}
                    focusedRequirementId={focusedRequirementId}
                  />
                  <div className="border-t border-slate-100 pt-6">
                    <RequirementGroup
                      title={text.officeRequirements}
                      emptyMessage={text.emptyAdditionalOffice}
                      requirements={grouped.immigrationOffice}
                      standalone={false}
                      onReview={(requirement) => setActiveModal({ type: "review", requirement })}
                      onUpload={(requirement) => setActiveModal({ type: "upload", requirement })}
                      onNote={(requirement) => setActiveModal({ type: "note", requirement })}
                      onDueDate={(requirement) => setActiveModal({ type: "dueDate", requirement })}
                      onPreviewFile={openFilePreview}
                      onDownloadAllFiles={downloadAllFiles}
                      onDeleteFile={requestDeleteUploadedFile}
                      onDeleteAllFiles={requestDeleteAllUploadedFiles}
                      onDeleteRequirement={requestDeleteRequirement}
                      downloadingRequirementId={downloadingRequirementId}
                      deletingFileId={deletingFileId}
                      deletingRequirementId={deletingRequirementId}
                      deletingRequirementRecordId={deletingRequirementRecordId}
                      focusedRequirementId={focusedRequirementId}
                    />
                  </div>
                </div> : null}
              </DashboardCard>
            </div>

            <DashboardCard>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-base font-semibold text-slate-950">
                      {text.tokenTitle}
                    </h2>
                    <span
                      className={
                        caseDetail.tokenSummary.activeTokenCount > 0
                          ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                          : "rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500"
                      }
                    >
                      {caseDetail.tokenSummary.activeTokenCount > 0
                        ? text.tokenActive
                        : text.tokenMissing}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {text.tokenDescription}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => setActiveModal({ type: "tokenRegenerate" })}
                    className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700"
                  >
                    {text.regenerateToken}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModal({ type: "tokenRevoke" })}
                    className="rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    {text.revokeToken}
                  </button>
                </div>
              </div>
            </DashboardCard>

          </div>

          <DashboardCard className="shadow-sm">
            <SectionHeader
              title={text.timeline}
              action={
                timeline.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setActiveModal({ type: "changeHistory" })}
                    className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {text.viewAllTimeline}
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
          title={text.modalCustomer}
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
              ? text.modalOfficeReview
              : text.modalCustomerReview
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
          title={text.modalUpload}
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
          title={
            getVisibleRequirementInternalNote(activeModal.requirement)
              ? text.modalEditNote
              : text.modalAddNote
          }
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

      {activeModal?.type === "dueDate" ? (
        <Modal
          title={text.modalDueDate}
          onClose={closeActiveModal}
          closeDisabled={isModalBusy}
        >
          <RequirementDueDateForm
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
          title={text.modalAddAdditional}
          description={text.modalAddAdditionalDescription}
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
              ? text.modalAddCustomerRequirement
              : text.modalAddOfficeRequirement
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
          title={text.modalPhase}
          description={formatCaseDetailText(text.modalCurrentPhase, {
            phase: displayCasePhaseLabel(caseDetail.casePhase, locale),
          })}
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
          title={text.modalApplicationConfirmation}
          description={text.modalApplicationConfirmationDescription}
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
          title={text.modalRegenerateToken}
          description={text.modalRegenerateTokenDescription}
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
          title={text.modalRevokeToken}
          description={text.modalRevokeTokenDescription}
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
              ? localText(locale, "确认删除文件", "ファイル削除の確認")
              : localText(locale, "确认删除全部文件", "すべてのファイル削除の確認")
          }
          description={
            fileDeleteConfirmation.type === "single"
              ? displayChineseText(fileDeleteConfirmation.file.originalFileName)
              : displayLocalizedRequirementTitle(fileDeleteConfirmation.requirement.title, locale)
          }
          onClose={closeFileDeleteConfirmation}
          closeDisabled={Boolean(deletingFileId || deletingRequirementId)}
        >
          <div className="grid gap-4">
            <InlineError message={fileDeleteError} />
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
              {fileDeleteConfirmation.type === "single" ? (
                <>
                  {localText(
                    locale,
                    "确定删除这个已上传文件吗？删除后，该文件不会再出现在客户或后台文件列表中。",
                    "このアップロード済みファイルを削除しますか。削除後、このファイルはお客様画面及び管理画面のファイル一覧に表示されません。",
                  )}
                </>
              ) : (
                <>
                  {localText(
                    locale,
                    `确定删除该材料下全部 ${fileDeleteConfirmation.fileCount} 个已上传文件吗？删除后，这些文件不会再出现在客户或后台文件列表中。`,
                    `この資料に紐づくアップロード済みファイル ${fileDeleteConfirmation.fileCount} 件をすべて削除しますか。削除後、これらのファイルはお客様画面及び管理画面のファイル一覧に表示されません。`,
                  )}
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
                {localText(locale, "取消", "キャンセル")}
              </button>
              <button
                type="button"
                disabled={Boolean(deletingFileId || deletingRequirementId)}
                onClick={() => void confirmFileDelete()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
              >
                {deletingFileId || deletingRequirementId ? <SubmitSpinner /> : null}
                {deletingFileId || deletingRequirementId
                  ? localText(locale, "删除中...", "削除中...")
                  : localText(locale, "确认删除", "削除する")}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {requirementDeleteConfirmation ? (
        <Modal
          title={localText(locale, "确认删除资料", "資料削除の確認")}
          description={displayLocalizedRequirementTitle(requirementDeleteConfirmation.requirement.title, locale)}
          onClose={closeRequirementDeleteConfirmation}
          closeDisabled={Boolean(deletingRequirementRecordId)}
        >
          <div className="grid gap-4">
            <InlineError message={requirementDeleteError} />
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
              {localText(
                locale,
                "确定删除该资料吗？删除后，该资料项、已上传文件、内部备注和相关文件记录都会从案件中移除。",
                "この資料を削除しますか。削除後、この資料項目、アップロード済みファイル、内部メモ、関連ファイル記録は案件から削除されます。",
              )}
              {requirementDeleteConfirmation.uploadedFileCount > 0
                ? localText(
                    locale,
                    ` 当前包含 ${requirementDeleteConfirmation.uploadedFileCount} 个已上传文件。`,
                    ` 現在、アップロード済みファイルが ${requirementDeleteConfirmation.uploadedFileCount} 件含まれています。`,
                  )
                : null}
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={Boolean(deletingRequirementRecordId)}
                onClick={closeRequirementDeleteConfirmation}
                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:w-auto"
              >
                {localText(locale, "取消", "キャンセル")}
              </button>
              <button
                type="button"
                disabled={Boolean(deletingRequirementRecordId)}
                onClick={() => void confirmRequirementDelete()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
              >
                {deletingRequirementRecordId ? <SubmitSpinner /> : null}
                {deletingRequirementRecordId
                  ? localText(locale, "删除中...", "削除中...")
                  : localText(locale, "确认删除", "削除する")}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {caseDeleteConfirmation && caseDetail ? (
        <Modal
          title={localText(locale, "确认删除案件", "案件削除の確認")}
          description={caseDetail.caseNumber}
          onClose={closeCaseDeleteConfirmation}
          closeDisabled={isDeletingCase}
        >
          <div className="grid gap-4">
            <InlineError message={caseDeleteError} />
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
              {localText(
                locale,
                "确定删除该案件吗？删除后，案件、资料项、上传文件记录、客户访问链接、变更履历和通知记录都会被移除。客户资料本身不会删除。此操作无法撤销。",
                "この案件を削除しますか。削除後、案件、資料項目、アップロードファイル記録、お客様リンク、変更履歴、通知記録は削除されます。お客様情報自体は削除されません。この操作は取り消せません。",
              )}
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isDeletingCase}
                onClick={closeCaseDeleteConfirmation}
                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:w-auto"
              >
                {localText(locale, "取消", "キャンセル")}
              </button>
              <button
                type="button"
                disabled={isDeletingCase}
                onClick={() => void confirmCaseDelete()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
              >
                {isDeletingCase ? <SubmitSpinner /> : null}
                {isDeletingCase
                  ? localText(locale, "删除中...", "削除中...")
                  : localText(locale, "确认删除案件", "案件を削除")}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {filePreview ? (
        <Modal
          title={localText(locale, "文件预览", "ファイルプレビュー")}
          description={displayChineseText(filePreview.fileName)}
          onClose={closeFilePreview}
        >
          <div className="grid gap-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <iframe
                title={localText(locale, "文件预览", "ファイルプレビュー")}
                src={filePreview.fileUrl}
                className="h-[60vh] w-full bg-white"
              />
            </div>
            <div className="flex flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {localText(locale, "短期预览链接，过期时间：", "一時プレビューリンク。有効期限：")}
                {formatDateTime(filePreview.expiresAt)}
              </span>
              <a
                href={filePreview.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex justify-center rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {localText(locale, "新窗口打开 / 下载", "新しいウィンドウで開く / ダウンロード")}
              </a>
            </div>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}
