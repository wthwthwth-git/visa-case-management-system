import { requireAdminAuth } from "@/lib/api/admin-auth";
import { requireAdminCsrf } from "@/lib/api/csrf";
import { jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import { requireAdminRateLimit } from "@/lib/rate-limit";
import { adminServices } from "@/lib/services";

type RouteContext = {
  params: Promise<{
    fileId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const adminContext = await requireAdminAuth(request);
    await requireAdminCsrf(request);
    await requireAdminRateLimit(request, {
      adminId: adminContext.adminId,
      email: adminContext.email,
      routeGroup: "admin_mutation",
    });

    const { fileId } = await context.params;
    const result = await adminServices.getAdminFileDownloadUrl({ fileId });

    return jsonData({
      signedUrl: result.signedUrl,
      expiresAt: result.expiresAt,
    });
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
