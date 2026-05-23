import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function createRequest(path: string, cookie?: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("admin auth middleware", () => {
  it("allows /admin/login without a session cookie", () => {
    const response = middleware(createRequest("/admin/login"));

    expect(response.status).toBe(200);
  });

  it("redirects admin pages without a session cookie", () => {
    const response = middleware(createRequest("/admin/cases"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/admin/login");
    expect(response.headers.get("location")).toContain("callbackUrl=%2Fadmin%2Fcases");
  });

  it("allows admin pages when a NextAuth session cookie is present", () => {
    const response = middleware(createRequest("/admin/cases", "next-auth.session-token=test-session"));

    expect(response.status).toBe(200);
  });
});
