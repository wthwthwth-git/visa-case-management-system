import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createApplicationConfirmationVersion: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    createApplicationConfirmationVersion: mocks.createApplicationConfirmationVersion,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/api/csrf", () => ({
  requireAdminCsrf: mocks.requireAdminCsrf,
}));

import { POST } from "./route";

function createRequest(body: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/admin/cases/route-case-id/application-confirmations",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/admin/cases/[caseId]/application-confirmations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.createApplicationConfirmationVersion.mockResolvedValue({
      id: "confirmation-id",
      caseId: "route-case-id",
      title: "Application form",
      version: 2,
      status: "pending",
      confirmedAt: null,
      supersededAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("requires admin auth and calls createApplicationConfirmationVersion with route caseId and whitelisted fields only", async () => {
    const request = createRequest({
      caseId: "body-case-id",
      title: "Application form",
      version: 2,
      storageBucket: "admin-confirmations",
      storagePath: "cases/route-case-id/application-confirmations/v2.pdf",
      supersedePendingVersions: true,
      reason: "updated form",
      status: "confirmed",
      confirmedAt: "2026-01-02T00:00:00.000Z",
      supersededAt: "2026-01-03T00:00:00.000Z",
      tokenHash: "do-not-pass",
      plaintextToken: "do-not-pass",
      signedUrl: "https://example.com/signed",
      metadata: { doNotPass: true },
      internalNote: "do not pass",
      actorId: "operator-id",
      actorType: "internal",
      portalVisible: true,
      portalDownloadable: true,
      file: "not-a-real-file",
      uploadedBy: "operator",
      eventType: "application_confirmation_created",
    });

    const response = await POST(request, {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });
    const payload = await response.json();
    const serviceArg = mocks.createApplicationConfirmationVersion.mock.calls[0][0];

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(serviceArg).toEqual({
      caseId: "route-case-id",
      title: "Application form",
      version: 2,
      storageBucket: "admin-confirmations",
      storagePath: "cases/route-case-id/application-confirmations/v2.pdf",
      supersedePendingVersions: true,
      reason: "updated form",
    });
    expect(JSON.stringify(serviceArg)).not.toContain("body-case-id");
    expect(JSON.stringify(serviceArg)).not.toContain("confirmedAt");
    expect(JSON.stringify(serviceArg)).not.toContain("tokenHash");
    expect(JSON.stringify(serviceArg)).not.toContain("signedUrl");
    expect(JSON.stringify(serviceArg)).not.toContain("metadata");
    expect(JSON.stringify(serviceArg)).not.toContain("internalNote");
    expect(JSON.stringify(serviceArg)).not.toContain("file");
    expect(payload.data).toEqual({
      id: "confirmation-id",
      caseId: "route-case-id",
      title: "Application form",
      version: 2,
      status: "pending",
      confirmedAt: null,
      supersededAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(JSON.stringify(payload)).not.toContain("storageBucket");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("signedUrl");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("passes an omitted optional version as undefined", async () => {
    await POST(
      createRequest({
        title: "Application form",
        storageBucket: "admin-confirmations",
        storagePath: "cases/route-case-id/application-confirmations/v1.pdf",
      }),
      {
        params: Promise.resolve({ caseId: "route-case-id" }),
      },
    );

    expect(mocks.createApplicationConfirmationVersion.mock.calls[0][0]).toEqual({
      caseId: "route-case-id",
      title: "Application form",
      version: undefined,
      storageBucket: "admin-confirmations",
      storagePath: "cases/route-case-id/application-confirmations/v1.pdf",
      supersedePendingVersions: undefined,
      reason: undefined,
    });
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["decimal", 1.5],
    ["string", "2"],
  ])("returns INVALID_REQUEST for invalid version: %s", async (_label, version) => {
    const response = await POST(
      createRequest({
        title: "Application form",
        version,
        storageBucket: "admin-confirmations",
        storagePath: "cases/route-case-id/application-confirmations/v1.pdf",
      }),
      {
        params: Promise.resolve({ caseId: "route-case-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.createApplicationConfirmationVersion).not.toHaveBeenCalled();
  });

  it.each([
    ["title", { storageBucket: "bucket", storagePath: "path" }],
    ["storageBucket", { title: "Application form", storagePath: "path" }],
    ["storagePath", { title: "Application form", storageBucket: "bucket" }],
  ])("returns INVALID_REQUEST for missing %s", async (_label, body) => {
    const response = await POST(createRequest(body), {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.createApplicationConfirmationVersion).not.toHaveBeenCalled();
  });

  it.each([
    ["supersedePendingVersions", "true"],
    ["reason", 123],
  ])("returns INVALID_REQUEST for invalid optional field %s", async (field, value) => {
    const response = await POST(
      createRequest({
        title: "Application form",
        storageBucket: "admin-confirmations",
        storagePath: "cases/route-case-id/application-confirmations/v1.pdf",
        [field]: value,
      }),
      {
        params: Promise.resolve({ caseId: "route-case-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.createApplicationConfirmationVersion).not.toHaveBeenCalled();
  });

  it("maps application confirmation admin errors to INVALID_REQUEST", async () => {
    const error = new Error("storagePath and tokenHash must not leak");
    error.name = "InvalidApplicationConfirmationInputError";
    mocks.createApplicationConfirmationVersion.mockRejectedValue(error);

    const response = await POST(
      createRequest({
        title: "Application form",
        storageBucket: "admin-confirmations",
        storagePath: "cases/route-case-id/application-confirmations/v1.pdf",
      }),
      {
        params: Promise.resolve({ caseId: "route-case-id" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("tokenHash");
  });

  it("maps auth failure to ADMIN_AUTH_REQUIRED and does not call service", async () => {
    const error = new Error("auth required");
    error.name = "AdminAuthNotImplementedError";
    mocks.requireAdminAuth.mockRejectedValue(error);

    const response = await POST(createRequest({}), {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("ADMIN_AUTH_REQUIRED");
    expect(mocks.createApplicationConfirmationVersion).not.toHaveBeenCalled();
  });

  it("does not import prisma, portal services, timeline writers, or upload helpers", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("createTimelineEvent");
    expect(source).not.toContain("upload");
    expect(source).not.toContain("createStorageSignedUrl");
  });
});
