import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_CSRF_COOKIE_NAME,
  ADMIN_CSRF_HEADER_NAME,
  AdminCsrfError,
  createAdminCsrfCookie,
  generateAdminCsrfToken,
  getCookieValue,
  requireAdminCsrf,
} from "./csrf";

const mocks = vi.hoisted(() => ({
  writeAdminAuthAudit: vi.fn(),
}));

vi.mock("@/lib/auth/audit", () => ({
  writeAdminAuthAudit: mocks.writeAdminAuthAudit,
}));

function requestWithCsrf(input: { cookie?: string; header?: string }) {
  const headers = new Headers();

  if (input.cookie) {
    headers.set("cookie", `${ADMIN_CSRF_COOKIE_NAME}=${input.cookie}`);
  }

  if (input.header) {
    headers.set(ADMIN_CSRF_HEADER_NAME, input.header);
  }

  return new Request("http://localhost/api/admin/cases", {
    method: "POST",
    headers,
  });
}

describe("admin csrf guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a base64url token", () => {
    const token = generateAdminCsrfToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(30);
  });

  it("creates a readable same-site cookie", () => {
    const cookie = createAdminCsrfCookie("csrf-token");

    expect(cookie).toContain(`${ADMIN_CSRF_COOKIE_NAME}=csrf-token`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("HttpOnly");
  });

  it("reads a cookie value", () => {
    expect(getCookieValue("a=1; admin_csrf_token=abc; b=2", ADMIN_CSRF_COOKIE_NAME)).toBe("abc");
  });

  it("passes when cookie and header match", async () => {
    await expect(requireAdminCsrf(requestWithCsrf({ cookie: "safe-token", header: "safe-token" }))).resolves.toBeUndefined();
    expect(mocks.writeAdminAuthAudit).not.toHaveBeenCalled();
  });

  it.each([
    ["missing cookie", { header: "safe-token" }, "missing_cookie"],
    ["missing header", { cookie: "safe-token" }, "missing_header"],
    ["mismatch", { cookie: "safe-token", header: "other-token" }, "mismatch"],
  ] as const)("fails for %s without leaking token values", async (_label, input, reason) => {
    await expect(requireAdminCsrf(requestWithCsrf(input))).rejects.toBeInstanceOf(AdminCsrfError);
    await expect(requireAdminCsrf(requestWithCsrf(input))).rejects.toMatchObject({ reason });

    const auditPayload = mocks.writeAdminAuthAudit.mock.calls.at(-1)?.[0];
    expect(auditPayload).toMatchObject({
      eventType: "csrf_failure",
      result: "blocked",
      requestPath: "/api/admin/cases",
      method: "POST",
      reason,
    });
    expect(JSON.stringify(auditPayload)).not.toContain("safe-token");
    expect(JSON.stringify(auditPayload)).not.toContain("other-token");
  });
});
