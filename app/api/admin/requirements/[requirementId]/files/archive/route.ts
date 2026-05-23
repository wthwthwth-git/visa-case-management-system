import { requireAdminAuth } from "@/lib/api/admin-auth";
import { requireAdminCsrf } from "@/lib/api/csrf";
import { jsonErrorFromUnknown } from "@/lib/api/errors";
import { requireAdminUploadRateLimit } from "@/lib/rate-limit";
import { adminServices } from "@/lib/services";

type RouteContext = {
  params: Promise<{
    requirementId: string;
  }>;
};

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

    const archive = await adminServices.createAdminRequirementFilesArchive({
      requirementId,
    });

    const body = archive.body.buffer.slice(
      archive.body.byteOffset,
      archive.body.byteOffset + archive.body.byteLength,
    ) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": archive.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(archive.fileName)}`,
      },
    });
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
