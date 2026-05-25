import { requireAdminAuth } from "@/lib/api/admin-auth";
import { requireAdminCsrf } from "@/lib/api/csrf";
import { jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import { requireAdminRateLimit } from "@/lib/rate-limit";
import { adminServices } from "@/lib/services";

export async function POST(request: Request): Promise<Response> {
  try {
    const adminContext = await requireAdminAuth(request);
    await requireAdminCsrf(request);
    await requireAdminRateLimit(request, {
      adminId: adminContext.adminId,
      email: adminContext.email,
      routeGroup: "admin_mutation",
    });

    const result = await adminServices.markAllAdminNotificationsRead();

    return jsonData(result);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
