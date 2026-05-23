import { randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_CSRF_COOKIE_NAME = "admin_csrf_token";
export const ADMIN_CSRF_HEADER_NAME = "x-csrf-token";

export class AdminCsrfError extends Error {
  readonly reason: "missing_cookie" | "missing_header" | "mismatch";

  constructor(reason: "missing_cookie" | "missing_header" | "mismatch") {
    super("Invalid admin request.");
    this.name = "AdminCsrfError";
    this.reason = reason;
  }
}

export function generateAdminCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createAdminCsrfCookie(token: string): string {
  const attributes = [
    `${ADMIN_CSRF_COOKIE_NAME}=${token}`,
    "Path=/",
    "SameSite=Lax",
    "Max-Age=43200",
  ];

  if (process.env.NODE_ENV === "production") {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function getCookieValue(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValueParts] = part.trim().split("=");

    if (rawKey === name) {
      return rawValueParts.join("=");
    }
  }

  return undefined;
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function getRequestPath(request: Request): string | null {
  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

async function auditCsrfFailure(request: Request, reason: AdminCsrfError["reason"]) {
  try {
    const { writeAdminAuthAudit } = await import("../auth/audit");

    await writeAdminAuthAudit({
      eventType: "csrf_failure",
      result: "blocked",
      requestPath: getRequestPath(request),
      method: request.method,
      reason,
      metadata: {
        reason,
        path: getRequestPath(request),
        method: request.method,
      },
    });
  } catch {
    // CSRF audit must not mask the security failure or leak internal details.
  }
}

export async function requireAdminCsrf(request: Request): Promise<void> {
  const cookieToken = getCookieValue(request.headers.get("cookie"), ADMIN_CSRF_COOKIE_NAME);
  const headerToken = request.headers.get(ADMIN_CSRF_HEADER_NAME);

  if (!cookieToken) {
    const error = new AdminCsrfError("missing_cookie");
    await auditCsrfFailure(request, error.reason);
    throw error;
  }

  if (!headerToken) {
    const error = new AdminCsrfError("missing_header");
    await auditCsrfFailure(request, error.reason);
    throw error;
  }

  if (!safeCompare(cookieToken, headerToken)) {
    const error = new AdminCsrfError("mismatch");
    await auditCsrfFailure(request, error.reason);
    throw error;
  }
}
