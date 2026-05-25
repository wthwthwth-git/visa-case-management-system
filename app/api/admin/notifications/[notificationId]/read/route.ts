import { requireAdminAuth } from "@/lib/api/admin-auth";
import { requireAdminCsrf } from "@/lib/api/csrf";
import { jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import { requireAdminRateLimit } from "@/lib/rate-limit";
import { adminServices } from "@/lib/services";

export async function POST(
  request: Request,
  context: { params: Promise<{ notificationId: string }> },
): Promise<Response> {
  try {
    const adminContext = await requireAdminAuth(request);
    await requireAdminCsrf(request);
    await requireAdminRateLimit(request, {
      adminId: adminContext.adminId,
      email: adminContext.email,
      routeGroup: "admin_mutation",
    });

    const { notificationId } = await context.params;
    const notification = await adminServices.markAdminNotificationRead(notificationId);

    return jsonData(notification);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
