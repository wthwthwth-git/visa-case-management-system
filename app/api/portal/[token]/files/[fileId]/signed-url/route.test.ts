import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPortalFileDownloadUrl: vi.fn(),
  validatePortalToken: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  portalServices: {
    getPortalFileDownloadUrl: mocks.getPortalFileDownloadUrl,
    validatePortalToken: mocks.validatePortalToken,
  },
}));

import { POST } from "./route";

describe("POST /api/portal/[token]/files/[fileId]/signed-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validatePortalToken.mockResolvedValue({
      tokenId: "token-id",
      caseId: "case-id",
    });
    mocks.getPortalFileDownloadUrl.mockResolvedValue({
      signedUrl: "https://signed.example.test/file",
      expiresAt: new Date("2026-01-01T00:05:00.000Z"),
    });
  });

  it("ignores body.caseId and calls portalServices with token and fileId only", async () => {
    const response = await POST(
      new Request("http://localhost/api/portal/token/files/file-id/signed-url", {
        method: "POST",
        body: JSON.stringify({ caseId: "attacker-case" }),
      }),
      {
        params: Promise.resolve({
          token: "portal-token",
          fileId: "file-id",
        }),
      },
    );
    const payload = await response.json();

    expect(mocks.getPortalFileDownloadUrl).toHaveBeenCalledWith({
      token: "portal-token",
      fileId: "file-id",
    });
    expect(payload.data).toEqual({
      signedUrl: "https://signed.example.test/file",
      expiresAt: "2026-01-01T00:05:00.000Z",
    });
  });

  it("returns only signedUrl and expiresAt", async () => {
    const response = await POST(
      new Request("http://localhost/api/portal/token/files/file-id/signed-url", {
        method: "POST",
      }),
      {
        params: Promise.resolve({
          token: "portal-token",
          fileId: "file-id",
        }),
      },
    );
    const payload = await response.json();

    expect(Object.keys(payload.data)).toEqual(["signedUrl", "expiresAt"]);
    expect(JSON.stringify(payload)).not.toContain("storagePath");
    expect(JSON.stringify(payload)).not.toContain("storageBucket");
  });

  it("maps file access errors to safe error responses", async () => {
    const error = new Error("storagePath must not leak");
    error.name = "FileNotAccessibleError";
    mocks.getPortalFileDownloadUrl.mockRejectedValue(error);

    const response = await POST(
      new Request("http://localhost/api/portal/token/files/file-id/signed-url", {
        method: "POST",
      }),
      {
        params: Promise.resolve({
          token: "portal-token",
          fileId: "file-id",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({
      error: {
        code: "FILE_NOT_ACCESSIBLE",
        message: "File is not accessible.",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("storagePath");
  });

  it("does not import prisma or admin services", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("adminServices");
  });
});
