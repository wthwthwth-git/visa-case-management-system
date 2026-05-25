import { jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import {
  requirePortalPreValidationRateLimit,
  requirePortalUploadRateLimit,
} from "@/lib/rate-limit";
import { portalServices } from "@/lib/services";

type RouteContext = {
  params: Promise<{
    token: string;
    requirementId: string;
    fileId: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { token, requirementId, fileId } = await context.params;

  try {
    await requirePortalPreValidationRateLimit(request, "portal_upload");
    const tokenContext = await portalServices.validatePortalToken(token);
    await requirePortalUploadRateLimit(request, {
      tokenId: tokenContext.tokenId,
      requirementId,
    });

    const result = await portalServices.deletePortalUploadedFile({
      token,
      requirementId,
      fileId,
    });

    return jsonData(result);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
