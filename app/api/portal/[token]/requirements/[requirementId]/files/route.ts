import { jsonError, jsonErrorFromUnknown } from "@/lib/api/errors";
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
  }>;
};

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { token, requirementId } = await context.params;

  try {
    await requirePortalPreValidationRateLimit(request, "portal_upload");
    const tokenContext = await portalServices.validatePortalToken(token);
    await requirePortalUploadRateLimit(request, {
      tokenId: tokenContext.tokenId,
      requirementId,
    });

    const formData = await request.formData();
    const formFile = formData.get("file");

    if (!isUploadFile(formFile)) {
      return jsonError("INVALID_UPLOAD");
    }

    const uploadedFile = await portalServices.uploadPortalDocumentFile({
      token,
      requirementId,
      file: {
        originalFileName: formFile.name,
        mimeType: formFile.type,
        fileSize: formFile.size,
        body: await formFile.arrayBuffer(),
      },
    });

    return jsonData(uploadedFile);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
