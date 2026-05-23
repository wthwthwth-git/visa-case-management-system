import { requireAdminAuth } from "@/lib/api/admin-auth";
import { requireAdminCsrf } from "@/lib/api/csrf";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import { requireAdminRateLimit } from "@/lib/rate-limit";
import { adminServices } from "@/lib/services";

type RouteContext = {
  params: Promise<{
    requirementId: string;
  }>;
};

type RouteRequirementStatus =
  | "not_submitted"
  | "submitted"
  | "needs_more"
  | "approved"
  | "not_applicable";

const requirementStatuses: RouteRequirementStatus[] = [
  "not_submitted",
  "submitted",
  "needs_more",
  "approved",
  "not_applicable",
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

function parseRequirementStatus(value: unknown): RouteRequirementStatus | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return requirementStatuses.includes(value as RouteRequirementStatus)
    ? (value as RouteRequirementStatus)
    : undefined;
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

    const { requirementId } = await context.params;
    const body = await readJsonBody(request);
    const newStatus = parseRequirementStatus(body.newStatus);

    if (!newStatus || typeof body.caseId !== "string") {
      return jsonError("INVALID_REQUEST");
    }

    const reviewedRequirement = await adminServices.reviewCaseDocumentRequirement({
      caseId: body.caseId,
      requirementId,
      newStatus,
      reason: optionalString(body.reason),
      customerInstruction: optionalString(body.customerInstruction),
      internalNote: optionalString(body.internalNote),
    });

    return jsonData(reviewedRequirement);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
