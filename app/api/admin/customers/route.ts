import { requireAdminAuth } from "@/lib/api/admin-auth";
import { jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import { adminServices } from "@/lib/services";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminAuth(request);

    const url = new URL(request.url);
    const customers = await adminServices.listAdminCustomers({
      q: url.searchParams.get("q") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    return jsonData(customers);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
