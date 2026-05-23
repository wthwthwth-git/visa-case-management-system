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

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { token, confirmationId } = await context.params;

  try {
    await requirePortalPreValidationRateLimit(request, "portal_signed_url");
    const tokenContext = await portalServices.validatePortalToken(token);
    await requirePortalPostValidationRateLimit(request, {
      routeGroup: "portal_signed_url",
      tokenId: tokenContext.tokenId,
      caseId: tokenContext.caseId,
    });

    const signedUrl = await portalServices.createPortalApplicationConfirmationSignedUrl({
      token,
      confirmationId,
    });

    return jsonData(signedUrl);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
