import { requireAdminAuth } from "@/lib/api/admin-auth";
import { requireAdminCsrf } from "@/lib/api/csrf";
import { jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import { requireAdminRateLimit } from "@/lib/rate-limit";
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

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    const adminContext = await requireAdminAuth(request);
    await requireAdminCsrf(request);
    await requireAdminRateLimit(request, {
      adminId: adminContext.adminId,
      email: adminContext.email,
      routeGroup: "admin_destructive",
    });

    const { caseId } = await context.params;
    const result = await adminServices.removeAdminCase({ caseId });

    return jsonData(result);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
