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

type RouteCasePhase =
  | "draft"
  | "collecting_documents"
  | "preparing_application"
  | "submitted"
  | "under_review"
  | "approved";

const casePhases: RouteCasePhase[] = [
  "draft",
  "collecting_documents",
  "preparing_application",
  "submitted",
  "under_review",
  "approved",
];

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

function parseCasePhase(value: unknown): RouteCasePhase | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return casePhases.includes(value as RouteCasePhase)
    ? (value as RouteCasePhase)
    : undefined;
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

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
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
    const newPhase = parseCasePhase(body.newPhase);
    const submittedAt = parseOptionalDate(body.submittedAt);
    const resultAt = parseOptionalDate(body.resultAt);

    if (!newPhase || submittedAt === "invalid" || resultAt === "invalid") {
      return jsonError("INVALID_REQUEST");
    }

    const result = await adminServices.changeCasePhase({
      caseId,
      newPhase,
      reason: optionalString(body.reason),
      submittedAt,
      submissionNumber: optionalString(body.submissionNumber),
      resultAt,
      allowWithWarnings: optionalBoolean(body.allowWithWarnings),
    });

    return jsonData(result);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
