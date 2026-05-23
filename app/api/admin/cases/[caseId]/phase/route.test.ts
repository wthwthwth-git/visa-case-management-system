import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changeCasePhase: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireAdminCsrf: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    changeCasePhase: mocks.changeCasePhase,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/api/csrf", () => ({
  requireAdminCsrf: mocks.requireAdminCsrf,
}));

import { PATCH } from "./route";

function createRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/cases/route-case-id/phase", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/cases/[caseId]/phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.requireAdminCsrf.mockResolvedValue(undefined);
    mocks.changeCasePhase.mockResolvedValue({
      caseId: "route-case-id",
      oldPhase: "preparing_application",
      newPhase: "submitted",
      warnings: [
        {
          type: "required_requirements_incomplete",
          count: 2,
        },
      ],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("requires admin auth and calls changeCasePhase with route caseId and whitelisted fields only", async () => {
    const request = createRequest({
      caseId: "body-case-id",
      newPhase: "submitted",
      reason: "manual submit",
      submittedAt: "2026-01-01T00:00:00.000Z",
      submissionNumber: "SUB-001",
      resultAt: "2026-02-01T00:00:00.000Z",
      allowWithWarnings: true,
      casePhase: "approved",
      oldPhase: "draft",
      warnings: [{ type: "do-not-pass", count: 999 }],
      metadata: { doNotPass: true },
      internalNote: "do not pass",
      storagePath: "cases/route-case-id/file.pdf",
      storageBucket: "case-files",
      tokenHash: "do-not-pass",
      sourceType: "immigration_request",
      requirementId: "requirement-id",
      requirementStatus: "approved",
      immigrationRequest: true,
      dueDate: "2026-03-01T00:00:00.000Z",
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });
    const payload = await response.json();
    const serviceArg = mocks.changeCasePhase.mock.calls[0][0];

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(serviceArg).toEqual({
      caseId: "route-case-id",
      newPhase: "submitted",
      reason: "manual submit",
      submittedAt: new Date("2026-01-01T00:00:00.000Z"),
      submissionNumber: "SUB-001",
      resultAt: new Date("2026-02-01T00:00:00.000Z"),
      allowWithWarnings: true,
    });
    expect(JSON.stringify(serviceArg)).not.toContain("body-case-id");
    expect(JSON.stringify(serviceArg)).not.toContain("dueDate");
    expect(JSON.stringify(serviceArg)).not.toContain("sourceType");
    expect(JSON.stringify(serviceArg)).not.toContain("requirementStatus");
    expect(JSON.stringify(serviceArg)).not.toContain("storagePath");
    expect(JSON.stringify(serviceArg)).not.toContain("tokenHash");
    expect(JSON.stringify(serviceArg)).not.toContain("internalNote");
    expect(payload.data.warnings).toEqual([
      {
        type: "required_requirements_incomplete",
        count: 2,
      },
    ]);
  });

  it.each([
    ["submittedAt", { newPhase: "submitted", submittedAt: "not-a-date" }],
    ["resultAt", { newPhase: "approved", resultAt: "not-a-date" }],
  ])("returns INVALID_REQUEST for invalid %s", async (_label, body) => {
    const response = await PATCH(createRequest(body), {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid request.",
      },
    });
    expect(mocks.changeCasePhase).not.toHaveBeenCalled();
  });

  it("returns INVALID_REQUEST for invalid newPhase", async () => {
    const response = await PATCH(createRequest({ newPhase: "not-a-phase" }), {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(mocks.changeCasePhase).not.toHaveBeenCalled();
  });

  it("maps phase service errors to INVALID_REQUEST", async () => {
    const error = new Error("storagePath and internal details must not leak");
    error.name = "InvalidCasePhaseTransitionError";
    mocks.changeCasePhase.mockRejectedValue(error);

    const response = await PATCH(createRequest({ newPhase: "submitted" }), {
      params: Promise.resolve({ caseId: "route-case-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(payload)).not.toContain("storagePath");
  });

  it("does not import prisma, portal services, timeline writers, or requirement creators", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@prisma/client");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("createTimelineEvent");
    expect(source).not.toContain("addImmigrationAdditionalRequirement");
    expect(source).not.toContain("caseDocumentRequirement");
  });
});
