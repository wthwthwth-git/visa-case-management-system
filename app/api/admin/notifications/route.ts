import { requireAdminAuth } from "@/lib/api/admin-auth";
import { jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import { adminServices } from "@/lib/services";

function parseNotificationStatus(value: string | null) {
  if (value === "unread" || value === "read" || value === "archived" || value === "all") {
    return value;
  }

  return undefined;
}

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminAuth(request);

    const url = new URL(request.url);
    const notifications = await adminServices.listAdminNotifications({
      status: parseNotificationStatus(url.searchParams.get("status")),
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    return jsonData(notifications);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
