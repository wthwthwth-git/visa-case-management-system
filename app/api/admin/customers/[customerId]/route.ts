import { requireAdminAuth } from "@/lib/api/admin-auth";
import { requireAdminCsrf } from "@/lib/api/csrf";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import { requireAdminRateLimit } from "@/lib/rate-limit";
import { adminServices } from "@/lib/services";

type RouteContext = {
  params: Promise<{
    customerId: string;
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

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function optionalString(value: unknown): string | null | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const adminContext = await requireAdminAuth(request);
    await requireAdminCsrf(request);
    await requireAdminRateLimit(request, {
      adminId: adminContext.adminId,
      email: adminContext.email,
      routeGroup: "admin_mutation",
    });

    const { customerId } = await context.params;
    const body = await readJsonBody(request);
    const name = requiredString(body.name);

    if (!name) {
      return jsonError("INVALID_REQUEST");
    }

    const updatedCustomer = await adminServices.updateAdminCustomer({
      customerId,
      name,
      email: optionalString(body.email),
      phone: optionalString(body.phone),
      nationality: optionalString(body.nationality),
    });

    return jsonData(updatedCustomer);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
