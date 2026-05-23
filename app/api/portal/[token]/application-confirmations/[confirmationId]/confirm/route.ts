import { jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import {
  requirePortalPostValidationRateLimit,
  requirePortalPreValidationRateLimit,
} from "@/lib/rate-limit";
import { portalServices } from "@/lib/services";

type RouteContext = {
  params: Promise<{
    token: string;
    confirmationId: string;
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

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { token, confirmationId } = await context.params;

  try {
    await requirePortalPreValidationRateLimit(request, "portal_confirmation");
    const tokenContext = await portalServices.validatePortalToken(token);
    await requirePortalPostValidationRateLimit(request, {
      routeGroup: "portal_confirmation",
      tokenId: tokenContext.tokenId,
      caseId: tokenContext.caseId,
    });

    const body = await readJsonBody(request);
    const confirmation = await portalServices.confirmPortalApplicationConfirmation({
      token,
      confirmationId,
      reason: optionalString(body.reason),
    });

    return jsonData(confirmation);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
