import { requireAdminAuth } from "@/lib/api/admin-auth";
import { createAdminCsrfCookie, generateAdminCsrfToken, getCookieValue, ADMIN_CSRF_COOKIE_NAME } from "@/lib/api/csrf";
import { jsonErrorFromUnknown } from "@/lib/api/errors";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminAuth(request);

    const existingToken = getCookieValue(request.headers.get("cookie"), ADMIN_CSRF_COOKIE_NAME);
    const response = Response.json({
      data: {
        ok: true,
      },
    });

    if (!existingToken) {
      response.headers.append("Set-Cookie", createAdminCsrfCookie(generateAdminCsrfToken()));
    }

    return response;
  } catch (error: unknown) {
    return jsonErrorFromUnknown(error);
  }
}
