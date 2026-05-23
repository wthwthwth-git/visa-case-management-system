import { requireAdminAuth } from "@/lib/api/admin-auth";
import { requireAdminCsrf } from "@/lib/api/csrf";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import { requireAdminRateLimit } from "@/lib/rate-limit";
import { adminServices } from "@/lib/services";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
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

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

type RouteResponsibleParty = "customer" | "office";

function parseResponsibleParty(value: unknown): RouteResponsibleParty | undefined {
  return value === "customer" || value === "office" ? value : undefined;
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

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const adminContext = await requireAdminAuth(request);
    await requireAdminCsrf(request);
    await requireAdminRateLimit(request, {
      adminId: adminContext.adminId,
      email: adminContext.email,
      routeGroup: "admin_destructive",
    });

    const { caseId } = await context.params;
    const body = await readJsonBody(request);
    const responsibleParty = parseResponsibleParty(body.responsibleParty);
    const dueDate = parseOptionalDate(body.dueDate);

    if (typeof body.title !== "string" || !responsibleParty || dueDate === "invalid") {
      return jsonError("INVALID_REQUEST");
    }

    const requirement = await adminServices.addImmigrationAdditionalRequirement({
      caseId,
      title: body.title,
      responsibleParty,
      customerInstruction: optionalString(body.customerInstruction),
      internalNote: optionalString(body.internalNote),
      dueDate,
      reason: optionalString(body.reason),
      portalVisible: optionalBoolean(body.portalVisible),
      portalDownloadable: optionalBoolean(body.portalDownloadable),
      setCasePhase: optionalBoolean(body.setCasePhase),
    });

    return jsonData(requirement);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
