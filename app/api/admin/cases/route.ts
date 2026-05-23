import { requireAdminAuth } from "@/lib/api/admin-auth";
import { requireAdminCsrf } from "@/lib/api/csrf";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import { requireAdminRateLimit } from "@/lib/rate-limit";
import { adminServices } from "@/lib/services";

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

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminAuth(request);

    const url = new URL(request.url);
    const cases = await adminServices.listAdminCases({
      phase: url.searchParams.get("phase") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    return jsonData(cases);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
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
    const customer = body.customer;

    if (!isRecord(customer) || typeof body.applyingVisaType !== "string") {
      return jsonError("INVALID_REQUEST");
    }

    if (customer.mode === "create") {
      const birthday = parseOptionalDate(customer.birthday);

      if (typeof customer.name !== "string" || birthday === "invalid") {
        return jsonError("INVALID_REQUEST");
      }

      const createdCase = await adminServices.createCase({
        customer: {
          mode: "create",
          name: customer.name,
          email: optionalString(customer.email),
          phone: optionalString(customer.phone),
          address: optionalString(customer.address),
          nationality: optionalString(customer.nationality),
          birthday,
          passportNumber: optionalString(customer.passportNumber),
          residenceCardNumber: optionalString(customer.residenceCardNumber),
        },
        existingVisaType: optionalString(body.existingVisaType),
        applyingVisaType: body.applyingVisaType,
        internalNote: optionalString(body.internalNote),
      });

      return jsonData(createdCase);
    }

    if (customer.mode === "reuse") {
      if (typeof customer.customerId !== "string") {
        return jsonError("INVALID_REQUEST");
      }

      const createdCase = await adminServices.createCase({
        customer: {
          mode: "reuse",
          customerId: customer.customerId,
        },
        existingVisaType: optionalString(body.existingVisaType),
        applyingVisaType: body.applyingVisaType,
        internalNote: optionalString(body.internalNote),
      });

      return jsonData(createdCase);
    }

    return jsonError("INVALID_REQUEST");
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
