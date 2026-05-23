import { describe, expect, it } from "vitest";
import {
  buildAdminRateLimitKey,
  buildAdminUploadRateLimitKey,
  buildIpRateLimitKey,
  buildPortalRateLimitKey,
  buildPortalUploadRateLimitKey,
  getClientIp,
} from "./keys";

describe("rate limit key generation", () => {
  it("extracts the first forwarded IP", () => {
    const request = new Request("http://localhost/api", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 198.51.100.2",
      },
    });

    expect(getClientIp(request)).toBe("203.0.113.10");
  });

  it("hashes IP keys and does not expose the raw IP", () => {
    const request = new Request("http://localhost/api", {
      headers: {
        "x-real-ip": "203.0.113.10",
      },
    });

    const key = buildIpRateLimitKey(request, "portal_case");

    expect(key.keyType).toBe("ip");
    expect(key.key).toContain("portal_case");
    expect(key.key).not.toContain("203.0.113.10");
  });

  it("builds admin keys from adminId and route group", () => {
    const key = buildAdminRateLimitKey({
      adminId: "Admin ID",
      routeGroup: "admin_token_mutation",
    });

    expect(key).toEqual({
      key: "admin:admin_id:admin_token_mutation",
      keyType: "admin",
    });
  });

  it("builds upload keys without storage or token material", () => {
    const adminKey = buildAdminUploadRateLimitKey({
      adminId: "admin-id",
      requirementId: "requirement-id",
    });
    const portalKey = buildPortalUploadRateLimitKey({
      tokenId: "token-id",
      requirementId: "requirement-id",
    });

    expect(adminKey.key).toBe("admin-upload:admin-id:requirement-id");
    expect(portalKey.key).toBe("portal-upload:token-id:requirement-id");
    expect(adminKey.key).not.toContain("tokenHash");
    expect(portalKey.key).not.toContain("plaintext");
  });

  it("builds portal post-validation keys from tokenId and caseId only", () => {
    const key = buildPortalRateLimitKey({
      tokenId: "token-id",
      caseId: "case-id",
      routeGroup: "portal_signed_url",
    });

    expect(key).toEqual({
      key: "portal:token-id:case-id:portal_signed_url",
      keyType: "portal",
    });
    expect(key.key).not.toContain("tokenHash");
  });
});
