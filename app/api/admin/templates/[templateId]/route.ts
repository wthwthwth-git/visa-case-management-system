import { requireAdminAuth } from "@/lib/api/admin-auth";
import { jsonErrorFromUnknown } from "@/lib/api/errors";
import { jsonData } from "@/lib/api/response";
import { adminServices } from "@/lib/services";

type RouteContext = {
  params: Promise<{
    templateId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireAdminAuth(request);

    const { templateId } = await context.params;
    const template = await adminServices.getAdminDocumentTemplateById(templateId);

    return jsonData(template);
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
