import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiPost,
  createCaseFromTemplateSelection,
  getAdminCsrfHeaders,
  toAdminErrorMessage,
} from "./admin-api";

function stubDocumentCookie(cookie: string) {
  vi.stubGlobal("document", {
    cookie,
  });
}

describe("admin API UI error formatting", () => {
  it("maps server configuration errors to safe Chinese copy", () => {
    expect(toAdminErrorMessage(new Error("Server configuration error."))).toBe(
      "服务配置缺失，请检查环境变量。",
    );
  });

  it("does not show stack traces or raw JSON-like details", () => {
    expect(toAdminErrorMessage(new Error("boom\n    at secret stack"), "安全错误")).toBe(
      "安全错误",
    );
    expect(toAdminErrorMessage(new Error('{"secret":"value"}'), "安全错误")).toBe("安全错误");
  });

  it("maps CSRF errors to safe Chinese copy", () => {
    expect(toAdminErrorMessage(new Error("Invalid admin request."))).toBe(
      "页面安全校验失败，请刷新页面后重试。",
    );
  });

  it("maps rate limit errors to safe Chinese copy", () => {
    expect(toAdminErrorMessage(new Error("Too many requests. Please try again later."))).toBe(
      "操作过于频繁，请稍后再试。",
    );
  });
});

describe("admin API CSRF headers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads CSRF token from cookie", async () => {
    stubDocumentCookie("admin_csrf_token=csrf-token");

    await expect(getAdminCsrfHeaders()).resolves.toEqual({
      "X-CSRF-Token": "csrf-token",
    });
  });

  it("fetches /api/admin/csrf when cookie is missing", async () => {
    stubDocumentCookie("");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ok: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getAdminCsrfHeaders();

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/csrf", {
      method: "GET",
      cache: "no-store",
    });
  });

  it("adds CSRF header to JSON mutations", async () => {
    stubDocumentCookie("admin_csrf_token=csrf-token");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ok: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiPost("/api/admin/cases", { hello: "world" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-CSRF-Token": "csrf-token",
    });
  });

  it("creates template-selection cases with a whitelisted JSON body", async () => {
    stubDocumentCookie("admin_csrf_token=csrf-token");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          caseId: "case-id",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createCaseFromTemplateSelection({
      customer: {
        mode: "create",
        name: "Customer",
        email: "customer@example.com",
        phone: "",
        address: "Should stay customer-only field",
        nationality: "",
        birthday: "",
      },
      existingVisaType: "无",
      applyingVisaType: "技術・人文知識・国際業務",
      title: " ",
      internalNote: "Internal note",
      templateId: "template-id",
      selectedTemplateItemIds: ["item-1"],
      customItems: [
        {
          title: "追加資料",
          responsibleParty: "customer",
          customerInstruction: "Instruction",
          internalNote: "Internal",
          dueDate: "2026-02-01",
          portalVisible: true,
          portalDownloadable: false,
        },
      ],
    });

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));

    expect(path).toBe("/api/admin/cases/from-template-selection");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-CSRF-Token": "csrf-token",
    });
    expect(body).toEqual({
      customer: {
        mode: "create",
        name: "Customer",
        email: "customer@example.com",
        phone: undefined,
        address: "Should stay customer-only field",
        nationality: undefined,
        birthday: undefined,
      },
      existingVisaType: "无",
      applyingVisaType: "技術・人文知識・国際業務",
      title: undefined,
      internalNote: "Internal note",
      templateId: "template-id",
      selectedTemplateItemIds: ["item-1"],
      customItems: [
        {
          title: "追加資料",
          responsibleParty: "customer",
          customerInstruction: "Instruction",
          internalNote: "Internal",
          dueDate: "2026-02-01",
          portalVisible: true,
          portalDownloadable: false,
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("tokenHash");
    expect(JSON.stringify(body)).not.toContain("storagePath");
    expect(JSON.stringify(body)).not.toContain("signedUrl");
    expect(JSON.stringify(body)).not.toContain("sourceTemplateId");
  });
});
