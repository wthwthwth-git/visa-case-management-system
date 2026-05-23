import { requireAdminAuth } from "@/lib/api/admin-auth";
import { requireAdminCsrf } from "@/lib/api/csrf";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import { requireAdminUploadRateLimit } from "@/lib/rate-limit";
import { adminServices } from "@/lib/services";

type RouteContext = {
  params: Promise<{
    requirementId: string;
  }>;
};

function isUploadFile(value: FormDataEntryValue): value is File {
  return value instanceof File;
}

async function readOptionalJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const adminContext = await requireAdminAuth(request);
    await requireAdminCsrf(request);

    const { requirementId } = await context.params;
    await requireAdminUploadRateLimit(request, {
      adminId: adminContext.adminId,
      email: adminContext.email,
      requirementId,
    });

    const formData = await request.formData();
    const caseId = formData.get("caseId");
    const formFiles = formData.getAll("file").filter(isUploadFile);

    if (typeof caseId !== "string") {
      return jsonError("INVALID_REQUEST");
    }

    if (formFiles.length === 0) {
      return jsonError("INVALID_UPLOAD");
    }

    const uploadedFiles = [];

    for (const formFile of formFiles) {
      const uploadedFile = await adminServices.uploadAdminDocumentFile({
        caseId,
        requirementId,
        file: {
          originalFileName: formFile.name,
          mimeType: formFile.type,
          fileSize: formFile.size,
          body: await formFile.arrayBuffer(),
        },
      });
      uploadedFiles.push(uploadedFile);
    }

    return jsonData(uploadedFiles);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    const adminContext = await requireAdminAuth(request);
    await requireAdminCsrf(request);

    const { requirementId } = await context.params;
    await requireAdminUploadRateLimit(request, {
      adminId: adminContext.adminId,
      email: adminContext.email,
      requirementId,
    });

    const body = await readOptionalJsonBody(request);
    const result = await adminServices.removeAdminRequirementUploadedFiles({
      requirementId,
      reason: readOptionalString(body.reason),
    });

    return jsonData(result);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
