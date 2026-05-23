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

function optionalBoolean(value: unknown): boolean | undefined | "invalid" {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === "boolean" ? value : "invalid";
}

function optionalPositiveInteger(value: unknown): number | undefined | "invalid" {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : "invalid";
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
    const version = optionalPositiveInteger(body.version);
    const supersedePendingVersions = optionalBoolean(body.supersedePendingVersions);
    const reason = optionalString(body.reason);

    if (
      typeof body.title !== "string" ||
      typeof body.storageBucket !== "string" ||
      typeof body.storagePath !== "string" ||
      version === "invalid" ||
      supersedePendingVersions === "invalid" ||
      reason === "invalid"
    ) {
      return jsonError("INVALID_REQUEST");
    }

    const confirmation = await adminServices.createApplicationConfirmationVersion({
      caseId,
      title: body.title,
      version,
      storageBucket: body.storageBucket,
      storagePath: body.storagePath,
      supersedePendingVersions,
      reason,
    });

    return jsonData(confirmation);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
