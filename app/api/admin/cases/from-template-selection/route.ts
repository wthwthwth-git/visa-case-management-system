import { requireAdminAuth } from "@/lib/api/admin-auth";
import { requireAdminCsrf } from "@/lib/api/csrf";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import { requireAdminRateLimit } from "@/lib/rate-limit";
import { adminServices } from "@/lib/services";

type CustomerInput =
  | {
      mode: "create";
      name: string;
      email?: string;
      phone?: string;
      address?: string;
      nationality?: string;
      birthday?: Date;
      passportNumber?: string;
      residenceCardNumber?: string;
    }
  | {
      mode: "reuse";
      customerId: string;
    };

type CustomItemInput = {
  title: string;
  responsibleParty: "customer" | "office";
  customerInstruction?: string;
  internalNote?: string;
  dueDate?: Date;
  portalVisible?: boolean;
  portalDownloadable?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function optionalString(value: unknown): string | undefined | "invalid" {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === "string" ? value : "invalid";
}

function optionalBoolean(value: unknown): boolean | undefined | "invalid" {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === "boolean" ? value : "invalid";
}

function isUuidString(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parseOptionalDate(value: unknown): Date | undefined | "invalid" {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    return "invalid";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

function parseCustomer(value: unknown): CustomerInput | "invalid" {
  if (!isRecord(value)) {
    return "invalid";
  }

  if (value.mode === "create") {
    const birthday = parseOptionalDate(value.birthday);

    if (typeof value.name !== "string" || birthday === "invalid") {
      return "invalid";
    }

    const email = optionalString(value.email);
    const phone = optionalString(value.phone);
    const address = optionalString(value.address);
    const nationality = optionalString(value.nationality);
    const passportNumber = optionalString(value.passportNumber);
    const residenceCardNumber = optionalString(value.residenceCardNumber);

    if (
      email === "invalid" ||
      phone === "invalid" ||
      address === "invalid" ||
      nationality === "invalid" ||
      passportNumber === "invalid" ||
      residenceCardNumber === "invalid"
    ) {
      return "invalid";
    }

    return {
      mode: "create",
      name: value.name,
      email,
      phone,
      address,
      nationality,
      birthday,
      passportNumber,
      residenceCardNumber,
    };
  }

  if (value.mode === "reuse") {
    if (typeof value.customerId !== "string" || !isUuidString(value.customerId)) {
      return "invalid";
    }

    return {
      mode: "reuse",
      customerId: value.customerId,
    };
  }

  return "invalid";
}

function parseSelectedTemplateItemIds(value: unknown): string[] | "invalid" {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return "invalid";
  }

  if (value.some((item) => !isUuidString(item))) {
    return "invalid";
  }

  return value;
}

function parseCustomItems(value: unknown): CustomItemInput[] | undefined | "invalid" {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return "invalid";
  }

  const items: CustomItemInput[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return "invalid";
    }

    if (
      typeof item.title !== "string" ||
      (item.responsibleParty !== "customer" && item.responsibleParty !== "office")
    ) {
      return "invalid";
    }

    const customerInstruction = optionalString(item.customerInstruction);
    const internalNote = optionalString(item.internalNote);
    const dueDate = parseOptionalDate(item.dueDate);
    const portalVisible = optionalBoolean(item.portalVisible);
    const portalDownloadable = optionalBoolean(item.portalDownloadable);

    if (
      customerInstruction === "invalid" ||
      internalNote === "invalid" ||
      dueDate === "invalid" ||
      portalVisible === "invalid" ||
      portalDownloadable === "invalid"
    ) {
      return "invalid";
    }

    items.push({
      title: item.title,
      responsibleParty: item.responsibleParty,
      customerInstruction,
      internalNote,
      dueDate,
      portalVisible,
      portalDownloadable,
    });
  }

  return items;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const adminContext = await requireAdminAuth(request);
    await requireAdminCsrf(request);
    await requireAdminRateLimit(request, {
      adminId: adminContext.adminId,
      email: adminContext.email,
      routeGroup: "admin_destructive",
    });

    const body = await readJsonBody(request);
    const customer = parseCustomer(body.customer);
    const existingVisaType = optionalString(body.existingVisaType);
    const applyingVisaType = optionalString(body.applyingVisaType);
    const title = optionalString(body.title);
    const internalNote = optionalString(body.internalNote);
    const templateId = optionalString(body.templateId);
    const selectedTemplateItemIds = parseSelectedTemplateItemIds(body.selectedTemplateItemIds);
    const customItems = parseCustomItems(body.customItems);

    if (
      customer === "invalid" ||
      existingVisaType === "invalid" ||
      applyingVisaType === "invalid" ||
      title === "invalid" ||
      internalNote === "invalid" ||
      templateId === "invalid" ||
      selectedTemplateItemIds === "invalid" ||
      customItems === "invalid" ||
      !applyingVisaType ||
      !templateId ||
      !isUuidString(templateId)
    ) {
      return jsonError("INVALID_REQUEST");
    }

    const result = await adminServices.createCaseFromTemplateSelection({
      customer,
      existingVisaType,
      applyingVisaType,
      title,
      internalNote,
      templateId,
      selectedTemplateItemIds,
      customItems,
    });

    return jsonData(result);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
