import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAdminTimelineEvents: vi.fn(),
  requireAdminAuth: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  adminServices: {
    listAdminTimelineEvents: mocks.listAdminTimelineEvents,
  },
}));

vi.mock("@/lib/api/admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

import { GET } from "./route";

describe("GET /api/admin/cases/[caseId]/timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue({ adminId: "development-admin" });
    mocks.listAdminTimelineEvents.mockResolvedValue([
      {
        id: "event-id",
        eventType: "case_created",
        actorType: "internal",
        metadata: {
          note: "admin timeline metadata",
        },
      },
    ]);
  });

  it("requires admin auth and returns admin timeline DTOs from service", async () => {
    const request = new Request("http://localhost/api/admin/cases/case-id/timeline");
    const response = await GET(request, {
      params: Promise.resolve({ caseId: "case-id" }),
    });
    const payload = await response.json();

    expect(mocks.requireAdminAuth).toHaveBeenCalledWith(request);
    expect(mocks.listAdminTimelineEvents).toHaveBeenCalledWith("case-id");
    expect(payload.data[0].metadata.note).toBe("admin timeline metadata");
  });

  it("does not import prisma or portal services", () => {
    const source = readFileSync(resolve(__dirname, "route.ts"), "utf8");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("portalServices");
  });
});
