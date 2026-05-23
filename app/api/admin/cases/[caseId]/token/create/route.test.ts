import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MissingEnvironmentVariableError } from "@/lib/env";

const mocks = vi.hoisted(() => ({
  createPortalTokenForCase: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
  requireAdminRateLimit: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    createPortalTokenForCase: mocks.createPortalTokenForCase,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/api/csrf", () => ({
  requireAdminCsrf: mocks.requireAdminCsrf,
}));

vi.mock("@/lib/rate-limit", () => ({
  requireAdminRateLimit: mocks.requireAdminRateLimit,
}));

import { POST } from "./route";

function createRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/cases/case-id/token/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/cases/[caseId]/token/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({
      adminId: "development-admin",
      email: "admin@example.com",
    });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.requireAdminRateLimit.mockResolvedValue(undefined);
    mocks.createPortalTokenForCase.mockResolvedValue({
      tokenId: "token-id",
      plaintextToken: "service-plaintext-token",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  it("requires admin auth and calls createPortalTokenForCase with route caseId and whitelisted fields only", async () => {
    const request = createRequest({
      caseId: "attacker-case",
      reason: "initial portal link",
      expiresAt: "2026-01-01T00:00:00.000Z",
      plaintextToken: "request-plaintext-token",
      token: "request-token",
      tokenHash: "request-token-hash",
      status: "revoked",
      revokedAt: "2026-01-02T00:00:00.000Z",
      lastUsedAt: "2026-01-03T00:00:00.000Z",
      storagePath: "cases/case-id/file.pdf",
      storageBucket: "case-files",
      signedUrl: "https://example.com/signed",
      metadata: { doNotPass: true },
      timeline: "do-not-pass",
      eventType: "token_created",
      actorId: "operator-id",
      actorType: "internal",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const response = await POST(request, {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();
    const serviceArg = mocks.createPortalTokenForCase.mock.calls[0][0];

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(mocks.requireAdminRateLimit).toHaveBeenCalledWith(request, {
      adminId: "development-admin",
      email: "admin@example.com",
      routeGroup: "admin_token_mutation",
    });
    expect(serviceArg).toEqual({
      caseId: "case-id",
      reason: "initial portal link",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(JSON.stringify(serviceArg)).not.toContain("attacker-case");
    expect(JSON.stringify(serviceArg)).not.toContain("request-plaintext-token");
    expect(JSON.stringify(serviceArg)).not.toContain("request-token-hash");
    expect(JSON.stringify(serviceArg)).not.toContain("revoked");
    expect(JSON.stringify(serviceArg)).not.toContain("storagePath");
    expect(JSON.stringify(serviceArg)).not.toContain("signedUrl");
    expect(payload.data).toEqual({
      tokenId: "token-id",
      plaintextToken: "service-plaintext-token",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("passes omitted optional fields as undefined", async () => {
    await POST(createRequest({}), {
      params: Promise.resolve({ caseId: "case-id" }),
    });

    expect(mocks.createPortalTokenForCase).toHaveBeenCalledWith({
      caseId: "case-id",
      reason: undefined,
      expiresAt: undefined,
    });
  });

  it.each([
    ["invalid reason", { reason: 123 }],
    ["invalid expiresAt", { expiresAt: "not-a-date" }],
    ["non-string expiresAt", { expiresAt: 123 }],
  ])("returns INVALID_REQUEST for %s", async (_label, body) => {
    const response = await POST(createRequest(body), {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.createPortalTokenForCase).not.toHaveBeenCalled();
  });

  it("maps rate limit failures to RATE_LIMITED and does not call service", async () => {
    const error = new Error("limiter key must not leak");
    error.name = "RateLimitExceededError";
    Object.assign(error, { retryAfterSeconds: 30 });
    mocks.requireAdminRateLimit.mockRejectedValue(error);

    const response = await POST(createRequest({}), {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(payload.error.code).toBe("RATE_LIMITED");
    expect(mocks.createPortalTokenForCase).not.toHaveBeenCalled();
    expect(JSON.stringify(payload)).not.toContain("limiter key");
  });

  it("maps ActivePortalTokenExistsError to INVALID_REQUEST", async () => {
    const error = new Error("existing active token with tokenHash must not leak");
    error.name = "ActivePortalTokenExistsError";
    mocks.createPortalTokenForCase.mockRejectedValue(error);

    const response = await POST(createRequest({}), {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("maps InvalidTokenReasonError to INVALID_REQUEST", async () => {
    const error = new Error("tokenHash and signedUrl must not leak");
    error.name = "InvalidTokenReasonError";
    mocks.createPortalTokenForCase.mockRejectedValue(error);

    const response = await POST(createRequest({ reason: "contains token" }), {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(payload)).not.toContain("signedUrl");
  });

  it("maps auth failure to ADMIN_AUTH_REQUIRED and does not call service", async () => {
    const error = new Error("auth required");
    error.name = "AdminAuthNotImplementedError";
    mocks.requireAdminAuth.mockRejectedValue(error);

    const response = await POST(createRequest({}), {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("ADMIN_AUTH_REQUIRED");
    expect(mocks.createPortalTokenForCase).not.toHaveBeenCalled();
  });

  it("maps missing TOKEN_HASH_SECRET to SERVER_CONFIGURATION_ERROR without leaking secret details", async () => {
    mocks.createPortalTokenForCase.mockRejectedValue(
      new MissingEnvironmentVariableError("TOKEN_HASH_SECRET"),
    );

    const response = await POST(createRequest({}), {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe("SERVER_CONFIGURATION_ERROR");
    expect(serialized).not.toContain("TOKEN_HASH_SECRET");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("stack");
  });

  it("allows only the service-returned plaintextToken and hides forbidden response fields", async () => {
    const response = await POST(
      createRequest({
        plaintextToken: "request-plaintext-token",
        tokenHash: "request-token-hash",
        storagePath: "cases/case-id/file.pdf",
        storageBucket: "case-files",
        signedUrl: "https://example.com/signed",
      }),
      {
        params: Promise.resolve({ caseId: "case-id" }),
      },
    );
    const payload = JSON.stringify(await response.json());

    expect(payload).toContain("service-plaintext-token");
    expect(payload).not.toContain("request-plaintext-token");
    expect(payload).not.toContain("tokenHash");
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("signedUrl");
  });

  it("does not import prisma, portal services, token helpers, timeline writers, regenerate/revoke calls, or console logging", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("generatePortalToken");
    expect(source).not.toContain("hashPortalToken");
    expect(source).not.toContain("createTimelineEvent");
    expect(source).not.toContain("regeneratePortalTokenForCase");
    expect(source).not.toContain("revokeActivePortalTokenForCase");
    expect(source).not.toContain("console.");
  });
});
