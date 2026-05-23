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

function optionalString(value: unknown): string | undefined | "invalid" {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === "string" ? value : "invalid";
}

function optionalDate(value: unknown): Date | null | undefined | "invalid" {
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
      routeGroup: "admin_token_mutation",
    });

    const { caseId } = await context.params;
    const body = await readJsonBody(request);
    const reason = optionalString(body.reason);
    const expiresAt = optionalDate(body.expiresAt);

    if (reason === "invalid" || expiresAt === "invalid") {
      return jsonError("INVALID_REQUEST");
    }

    const result = await adminServices.createPortalTokenForCase({
      caseId,
      reason,
      expiresAt,
    });

    return jsonData(result);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
