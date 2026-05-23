"use client";

export type AdminCaseListItem = {
  id: string;
  caseNumber: string;
  customer: {
    id: string;
    name: string;
    email: string | null;
  };
  currentVisaType: string;
  targetVisaType: string;
  casePhase: string;
  updatedAt: string;
};

export type AdminCaseList = {
  items: AdminCaseListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type AdminCustomerListItem = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  birthday: string | null;
  caseCount: number;
  updatedAt: string;
};

export type AdminCustomerList = {
  items: AdminCustomerListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type AdminTemplateListItem = {
  id: string;
  templateKey: string;
  version: number;
  title: string;
  status: string;
  currentVisaType: string | null;
  targetVisaType: string | null;
  itemCount: number;
  updatedAt: string;
};

export type AdminTemplateList = {
  items: AdminTemplateListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type AdminTemplateDetail = {
  id: string;
  templateKey: string;
  version: number;
  title: string;
  templateDescription: string | null;
  status: string;
  currentVisaType: string | null;
  targetVisaType: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    itemKey: string;
    title: string;
    customerInstruction: string | null;
    internalNote: string | null;
    isRequired: boolean;
    responsibleParty: "customer" | "office";
    sortOrder: number;
    acceptedFileTypesDescription: string | null;
  }>;
};

export type CreatedCase = {
  id: string;
  customerId: string;
  caseNumber: string;
  currentVisaType: string;
  targetVisaType: string;
  casePhase: string;
  createdAt: string;
  updatedAt: string;
};

export type AppliedTemplate = {
  caseId: string;
  templateId: string;
  templateKey: string;
  templateVersion: number;
  copiedRequirementCount: number;
  requirementIds: string[];
};

export type TemplateSelectionCustomItemInput = {
  title: string;
  responsibleParty: "customer" | "office";
  customerInstruction?: string;
  internalNote?: string;
  dueDate?: string;
  portalVisible?: boolean;
  portalDownloadable?: boolean;
};

export type CreateCaseFromTemplateSelectionInput = {
  customer:
    | {
        mode: "create";
        name: string;
        email?: string;
        phone?: string;
        address?: string;
        nationality?: string;
        birthday?: string;
      }
    | {
        mode: "reuse";
        customerId: string;
      };
  existingVisaType?: string;
  applyingVisaType: string;
  title?: string;
  internalNote?: string;
  templateId: string;
  selectedTemplateItemIds: string[];
  customItems?: TemplateSelectionCustomItemInput[];
};

export type CreatedCaseFromTemplateSelection = {
  caseId: string;
  customerId: string;
  caseNumber: string;
  currentVisaType: string;
  targetVisaType: string;
  casePhase: string;
  templateId: string;
  templateKey: string;
  templateVersion: number;
  selectedItemCount: number;
  excludedItemCount: number;
  customItemCount: number;
  requirementIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreatedToken = {
  tokenId: string;
  plaintextToken: string;
  expiresAt: string | null;
};

export type AdminCaseDetail = {
  id: string;
  caseNumber: string;
  currentVisaType: string;
  targetVisaType: string;
  casePhase: string;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    nationality: string | null;
    birthday: string | null;
    passportNumber: string | null;
    residenceCardNumber: string | null;
  };
  requirementSummary: {
    total: number;
    byStatus: Record<string, number | undefined>;
  };
  applicationConfirmations: Array<{
    id: string;
    title: string;
    version: number;
    status: string;
    confirmedAt: string | null;
    supersededAt: string | null;
  }>;
  tokenSummary: {
    activeTokenCount: number;
  };
};

export type AdminRequirement = {
  id: string;
  caseId: string;
  title: string;
  customerInstruction: string | null;
  internalNote: string | null;
  isRequired: boolean;
  responsibleParty: "customer" | "office";
  sourceType: "template" | "custom" | "immigration_request" | "system";
  status: string;
  sortOrder: number;
  portalVisible: boolean;
  portalDownloadable: boolean;
  dueDate: string | null;
  files: Array<{
    id: string;
    originalFileName: string;
    status: string;
    mimeType: string;
    fileSize: string;
    createdAt: string;
  }>;
};

export type AdminTimelineEvent = {
  id: string;
  eventType: string;
  actorType: string;
  summary: string;
  targetType: string | null;
  createdAt: string;
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

export class AdminApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AdminApiError";
    this.code = code;
  }
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;

  if (!response.ok || "error" in payload) {
    if ("error" in payload) {
      if (payload.error.code === "ADMIN_AUTH_REQUIRED" && typeof window !== "undefined") {
        window.location.assign("/admin/login?reason=session-expired");
      }

      throw new AdminApiError(payload.error.code, payload.error.message);
    }

    throw new Error("Request failed.");
  }

  return payload.data;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : undefined;
}

export async function getAdminCsrfHeaders(): Promise<Record<string, string>> {
  let token = readCookie("admin_csrf_token");

  if (!token) {
    await fetch("/api/admin/csrf", {
      method: "GET",
      cache: "no-store",
    });
    token = readCookie("admin_csrf_token");
  }

  return token ? { "X-CSRF-Token": token } : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: "GET",
    cache: "no-store",
  });

  return parseApiResponse<T>(response);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const csrfHeaders = await getAdminCsrfHeaders();
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders,
    },
    body: JSON.stringify(body),
  });

  return parseApiResponse<T>(response);
}

function cleanOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanCustomerInput(input: CreateCaseFromTemplateSelectionInput["customer"]) {
  if (input.mode === "reuse") {
    return {
      mode: "reuse" as const,
      customerId: input.customerId,
    };
  }

  return {
    mode: "create" as const,
    name: input.name,
    email: cleanOptionalString(input.email),
    phone: cleanOptionalString(input.phone),
    address: cleanOptionalString(input.address),
    nationality: cleanOptionalString(input.nationality),
    birthday: cleanOptionalString(input.birthday),
  };
}

function cleanCustomItems(input: TemplateSelectionCustomItemInput[] | undefined) {
  return (input ?? []).map((item) => ({
    title: item.title,
    responsibleParty: item.responsibleParty,
    customerInstruction: cleanOptionalString(item.customerInstruction),
    internalNote: cleanOptionalString(item.internalNote),
    dueDate: cleanOptionalString(item.dueDate),
    portalVisible: item.portalVisible,
    portalDownloadable: item.portalDownloadable,
  }));
}

export async function createCaseFromTemplateSelection(
  input: CreateCaseFromTemplateSelectionInput,
): Promise<CreatedCaseFromTemplateSelection> {
  return apiPost<CreatedCaseFromTemplateSelection>("/api/admin/cases/from-template-selection", {
    customer: cleanCustomerInput(input.customer),
    existingVisaType: cleanOptionalString(input.existingVisaType),
    applyingVisaType: input.applyingVisaType,
    title: cleanOptionalString(input.title),
    internalNote: cleanOptionalString(input.internalNote),
    templateId: input.templateId,
    selectedTemplateItemIds: input.selectedTemplateItemIds,
    customItems: cleanCustomItems(input.customItems),
  });
}

export function toAdminErrorMessage(error: unknown, fallback = "操作失败，请稍后重试。"): string {
  const message = error instanceof Error ? error.message : fallback;

  if (!message || message === "Request failed.") {
    return fallback;
  }

  if (message === "Server configuration error." || message.includes("SERVER_CONFIGURATION_ERROR")) {
    return "服务配置缺失，请检查环境变量。";
  }

  if (message === "Invalid admin request." || message.includes("ADMIN_CSRF_REQUIRED")) {
    return "页面安全校验失败，请刷新页面后重试。";
  }

  if (message === "Too many requests. Please try again later." || message.includes("RATE_LIMITED")) {
    return "操作过于频繁，请稍后再试。";
  }

  if (message.trim().startsWith("{") || message.includes("\n    at ")) {
    return fallback;
  }

  return message;
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
