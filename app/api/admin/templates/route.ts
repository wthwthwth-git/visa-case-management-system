import { requireAdminAuth } from "@/lib/api/admin-auth";
import { jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import { adminServices } from "@/lib/services";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminAuth(request);

    const url = new URL(request.url);
    const templates = await adminServices.listAdminDocumentTemplates({
      q: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      currentVisaType: url.searchParams.get("currentVisaType") ?? undefined,
      targetVisaType: url.searchParams.get("targetVisaType") ?? undefined,
      templateKey: url.searchParams.get("templateKey") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    return jsonData(templates);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
