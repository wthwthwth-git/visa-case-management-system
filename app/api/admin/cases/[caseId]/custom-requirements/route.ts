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

type RouteResponsibleParty = "customer" | "office";

function parseResponsibleParty(value: unknown): RouteResponsibleParty | undefined {
  return value === "customer" || value === "office" ? value : undefined;
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

    if (typeof body.title !== "string" || !responsibleParty) {
      return jsonError("INVALID_REQUEST");
    }

    const requirement = await adminServices.addCustomRequirement({
      caseId,
      title: body.title,
      responsibleParty,
      customerInstruction: optionalString(body.customerInstruction),
    });

    return jsonData(requirement);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
