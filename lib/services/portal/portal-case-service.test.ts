import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  validatePortalToken: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    case: {
      findUniqueOrThrow: mocks.findUniqueOrThrow,
    },
  },
}));

vi.mock("./portal-token-service", () => ({
  validatePortalToken: mocks.validatePortalToken,
}));

import { getPortalCaseByToken } from "./portal-case-service";

describe("getPortalCaseByToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validatePortalToken.mockResolvedValue({
      tokenId: "token-id",
      caseId: "case-id",
    });
    mocks.findUniqueOrThrow.mockResolvedValue({
      id: "case-id",
      caseNumber: "CASE-001",
      targetVisaType: "经营管理",
      casePhase: "collecting_documents",
      customer: {
        name: "山田太郎",
      },
      documentRequirements: [],
      applicationConfirmations: [],
    });
  });

  it("queries client-visible requirements and completed or client-confirmed office requirements", async () => {
    await getPortalCaseByToken("portal-token");

    expect(mocks.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "case-id" },
        include: expect.objectContaining({
          documentRequirements: expect.objectContaining({
            where: {
              OR: [
                {
                  portalVisible: true,
                  responsibleParty: "customer",
                },
                {
                  responsibleParty: "office",
                  status: {
                    in: ["approved", "not_applicable"],
                  },
                },
              ],
            },
          }),
        }),
      }),
    );
  });
});
