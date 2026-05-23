import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPortalFileAccessUrl,
  fetchPortalCase,
  PortalApiError,
  toPortalErrorMessage,
  uploadPortalRequirementFile,
} from "./portal-api";

function mockJsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

describe("portal API helper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches portal case through the portal API only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        data: {
          caseId: "case-id",
          caseNumber: "CASE-1",
          customerName: "Customer",
          targetVisaType: "Visa",
          casePhase: "collecting_documents",
          requirements: [],
          applicationConfirmations: [],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPortalCase("plain-token");

    expect(result.caseNumber).toBe("CASE-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/portal/plain-token/case", {
      method: "GET",
      cache: "no-store",
    });
  });

  it("uploads a file with FormData containing only file", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        data: {
          id: "file-id",
          mimeType: "application/pdf",
          fileSize: "123",
          createdAt: "2026-01-01T00:00:00.000Z",
          portalDownloadable: true,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["hello"], "test.pdf", { type: "application/pdf" });
    await uploadPortalRequirementFile({
      token: "plain-token",
      requirementId: "requirement-id",
      file,
    });

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;

    expect(path).toBe("/api/portal/plain-token/requirements/requirement-id/files");
    expect(init.method).toBe("POST");
    expect(body).toBeInstanceOf(FormData);
    expect(Array.from(body.keys())).toEqual(["file"]);
    expect(body.get("file")).toBe(file);
  });

  it("returns an immediate-use access URL without exposing storage fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        data: {
          signedUrl: "https://storage.example.test/signed",
          expiresAt: "2026-01-01T00:05:00.000Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPortalFileAccessUrl({
      token: "plain-token",
      fileId: "file-id",
    });

    expect(result).toEqual({
      accessUrl: "https://storage.example.test/signed",
      expiresAt: "2026-01-01T00:05:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("storagePath");
    expect(JSON.stringify(result)).not.toContain("storageBucket");
  });

  it("throws PortalApiError for API errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse(
        {
          error: {
            code: "INVALID_PORTAL_TOKEN",
            message: "Invalid or expired link.",
          },
        },
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPortalCase("bad-token")).rejects.toMatchObject({
      name: "PortalApiError",
      code: "INVALID_PORTAL_TOKEN",
    });
  });

  it("maps portal errors to safe Chinese copy", () => {
    expect(toPortalErrorMessage(new PortalApiError("INVALID_PORTAL_TOKEN", "x"))).toBe(
      "链接无效或已过期，请联系事务所。",
    );
    expect(toPortalErrorMessage(new PortalApiError("RATE_LIMITED", "x"))).toBe(
      "操作过于频繁，请稍后再试。",
    );
    expect(toPortalErrorMessage(new PortalApiError("FILE_NOT_ACCESSIBLE", "x"))).toBe(
      "文件暂时无法访问，请联系事务所。",
    );
    expect(toPortalErrorMessage(new PortalApiError("CONFIRMATION_NOT_ACCESSIBLE", "x"))).toBe(
      "申请书暂时无法访问，请联系事务所。",
    );
    expect(toPortalErrorMessage(new PortalApiError("INVALID_UPLOAD", "x"))).toBe(
      "文件格式或大小不符合要求。",
    );
    expect(toPortalErrorMessage(new PortalApiError("INVALID_UPLOAD", "Invalid upload."))).toBe(
      "文件格式或大小不符合要求。",
    );
    expect(
      toPortalErrorMessage(
        new PortalApiError("INVALID_UPLOAD", "文件格式不符合要求。允许上传：PDF、Excel (.xlsx)。"),
      ),
    ).toBe("文件格式不符合要求。允许上传：PDF、Excel (.xlsx)。");
    expect(toPortalErrorMessage(new Error("boom"))).toBe(
      "发生错误，请稍后再试或联系事务所。",
    );
  });
});
