import { requireAdminAuth } from "@/lib/api/admin-auth";
import { jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import { adminServices } from "@/lib/services";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireAdminAuth(request);
    const { caseId } = await context.params;
    const adminCase = await adminServices.getAdminCaseById(caseId);

    return jsonData(adminCase);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
