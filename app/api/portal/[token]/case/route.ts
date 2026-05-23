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
  }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { token } = await context.params;

  try {
    await requirePortalPreValidationRateLimit(request, "portal_case");
    const tokenContext = await portalServices.validatePortalToken(token);
    await requirePortalPostValidationRateLimit(request, {
      routeGroup: "portal_case",
      tokenId: tokenContext.tokenId,
      caseId: tokenContext.caseId,
    });

    const portalCase = await portalServices.getPortalCaseByToken(token);
    return jsonData(portalCase);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
