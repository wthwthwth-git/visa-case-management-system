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
    requirementId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { token, requirementId } = await context.params;

  try {
    await requirePortalPreValidationRateLimit(request, "portal_confirmation");
    const tokenContext = await portalServices.validatePortalToken(token);
    await requirePortalPostValidationRateLimit(request, {
      routeGroup: "portal_confirmation",
      tokenId: tokenContext.tokenId,
      caseId: tokenContext.caseId,
    });

    const result = await portalServices.confirmPortalOfficeRequirement({
      token,
      requirementId,
    });

    return jsonData(result);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
