import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    case: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    documentTemplate: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    caseDocumentRequirement: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    documentFile: {
      create: vi.fn(),
    },
    customerAccessToken: {
      create: vi.fn(),
    },
    applicationConfirmation: {
      create: vi.fn(),
    },
    customer: {
      update: vi.fn(),
    },
    timelineEvent: {
      create: vi.fn(),
    },
  };

  return {
    transaction: vi.fn(),
    tx,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import {
  InvalidTemplateApplyInputError,
  TemplateAlreadyAppliedError,
  TemplateApplyAccessError,
  applyDocumentTemplateToCase,
} from "./template-apply-service";

const template = {
  id: "template-id",
  templateKey: "engineer",
  version: 3,
  status: "active",
  items: [
    {
      id: "item-customer",
      title: "Passport",
      customerInstruction: "Upload passport.",
      internalNote: "Check expiry.",
      isRequired: true,
      responsibleParty: "customer",
      sortOrder: 10,
      acceptedFileTypesDescription: "PDF or image",
    },
    {
      id: "item-office",
      title: "Office form",
      customerInstruction: null,
      internalNote: "Prepare internally.",
      isRequired: false,
      responsibleParty: "office",
      sortOrder: 20,
      acceptedFileTypesDescription: null,
    },
  ],
} as const;

describe("admin apply document template service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.case.findUnique.mockResolvedValue({ id: "case-id" });
    mocks.tx.documentTemplate.findUnique.mockResolvedValue(template);
    mocks.tx.documentTemplate.findFirst.mockResolvedValue(template);
    mocks.tx.caseDocumentRequirement.findFirst.mockResolvedValue(null);
    mocks.tx.caseDocumentRequirement.create.mockImplementation(async () => ({
      id: `requirement-${mocks.tx.caseDocumentRequirement.create.mock.calls.length}`,
    }));
    mocks.tx.timelineEvent.create.mockImplementation(async ({ data }) => data);
  });

  it("applies a template by templateId inside a transaction", async () => {
    const result = await applyDocumentTemplateToCase({
      caseId: "case-id",
      templateId: "template-id",
      reason: "initial setup",
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.documentTemplate.findUnique).toHaveBeenCalledWith({
      where: { id: "template-id" },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    expect(result).toEqual({
      caseId: "case-id",
      templateId: "template-id",
      templateKey: "engineer",
      templateVersion: 3,
      copiedRequirementCount: 2,
      requirementIds: ["requirement-1", "requirement-2"],
    });
  });

  it("applies a template by templateKey and version", async () => {
    await applyDocumentTemplateToCase({
      caseId: "case-id",
      templateKey: "engineer",
      version: 3,
    });

    expect(mocks.tx.documentTemplate.findFirst).toHaveBeenCalledWith({
      where: {
        templateKey: "engineer",
        version: 3,
        status: "active",
      },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  });

  it("selects the latest active template when only templateKey is provided", async () => {
    await applyDocumentTemplateToCase({
      caseId: "case-id",
      templateKey: "engineer",
    });

    expect(mocks.tx.documentTemplate.findFirst).toHaveBeenCalledWith({
      where: {
        templateKey: "engineer",
        status: "active",
      },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { version: "desc" },
    });
  });

  it("copies template items into case requirements with snapshot fields", async () => {
    await applyDocumentTemplateToCase({
      caseId: "case-id",
      templateId: "template-id",
    });
    const customerRequirementData = mocks.tx.caseDocumentRequirement.create.mock.calls[0][0].data;
    const officeRequirementData = mocks.tx.caseDocumentRequirement.create.mock.calls[1][0].data;

    expect(customerRequirementData).toEqual({
      caseId: "case-id",
      title: "Passport",
      customerInstruction: "Upload passport.",
      internalNote: "Check expiry.",
      isRequired: true,
      responsibleParty: "customer",
      sourceType: "template",
      status: "not_submitted",
      sortOrder: 10,
      acceptedFileTypesDescription: "PDF or image",
      portalVisible: true,
      portalDownloadable: false,
      sourceTemplateId: "template-id",
      sourceTemplateVersion: 3,
      sourceTemplateItemId: "item-customer",
    });
    expect(officeRequirementData).toMatchObject({
      responsibleParty: "office",
      portalVisible: false,
      portalDownloadable: false,
      sourceType: "template",
      status: "not_submitted",
      sourceTemplateId: "template-id",
      sourceTemplateVersion: 3,
      sourceTemplateItemId: "item-office",
    });
  });

  it("does not create files, tokens, application confirmations, update customer, or modify case phase", async () => {
    await applyDocumentTemplateToCase({
      caseId: "case-id",
      templateId: "template-id",
    });

    expect(mocks.tx.documentFile.create).not.toHaveBeenCalled();
    expect(mocks.tx.customerAccessToken.create).not.toHaveBeenCalled();
    expect(mocks.tx.applicationConfirmation.create).not.toHaveBeenCalled();
    expect(mocks.tx.customer.update).not.toHaveBeenCalled();
    expect(mocks.tx.case.update).not.toHaveBeenCalled();
  });

  it("rejects duplicate application of the same template version", async () => {
    mocks.tx.caseDocumentRequirement.findFirst.mockResolvedValueOnce({
      id: "existing-requirement",
    });

    await expect(
      applyDocumentTemplateToCase({
        caseId: "case-id",
        templateId: "template-id",
        allowMultipleTemplates: true,
      }),
    ).rejects.toBeInstanceOf(TemplateAlreadyAppliedError);
    expect(mocks.tx.caseDocumentRequirement.create).not.toHaveBeenCalled();
  });

  it("rejects another template by default when the case already has template requirements", async () => {
    mocks.tx.caseDocumentRequirement.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "existing-template-requirement" });

    await expect(
      applyDocumentTemplateToCase({
        caseId: "case-id",
        templateId: "template-id",
      }),
    ).rejects.toBeInstanceOf(TemplateAlreadyAppliedError);
    expect(mocks.tx.caseDocumentRequirement.create).not.toHaveBeenCalled();
  });

  it("allows a different template when allowMultipleTemplates is true", async () => {
    await applyDocumentTemplateToCase({
      caseId: "case-id",
      templateId: "template-id",
      allowMultipleTemplates: true,
    });

    expect(mocks.tx.caseDocumentRequirement.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.tx.caseDocumentRequirement.create).toHaveBeenCalledTimes(2);
  });

  it("writes one template_items_copied timeline event with safe metadata", async () => {
    await applyDocumentTemplateToCase({
      caseId: "case-id",
      templateId: "template-id",
      reason: "initial setup",
    });
    const timelineEvent = mocks.tx.timelineEvent.create.mock.calls[0][0].data;
    const metadataPayload = JSON.stringify(timelineEvent.metadata);

    expect(mocks.tx.timelineEvent.create).toHaveBeenCalledTimes(1);
    expect(timelineEvent).toMatchObject({
      caseId: "case-id",
      eventType: "template_items_copied",
      actorType: "internal",
      summary: "Template items copied.",
      targetType: "document_template",
      targetId: "template-id",
      metadata: {
        templateId: "template-id",
        templateKey: "engineer",
        templateVersion: 3,
        copiedRequirementCount: 2,
        reason: "initial setup",
      },
    });
    expect(metadataPayload).not.toContain("requirementIds");
    expect(metadataPayload).not.toContain("requirement-");
    expect(metadataPayload).not.toContain("internalNote");
    expect(metadataPayload).not.toContain("Check expiry");
    expect(metadataPayload).not.toContain("customerInstruction");
    expect(metadataPayload).not.toContain("Upload passport");
    expect(metadataPayload).not.toContain("storagePath");
    expect(metadataPayload).not.toContain("storageBucket");
    expect(metadataPayload).not.toContain("signedUrl");
    expect(metadataPayload).not.toContain("token");
    expect(metadataPayload).not.toContain("tokenHash");
    expect(metadataPayload).not.toContain("passportNumber");
    expect(metadataPayload).not.toContain("residenceCardNumber");
  });

  it("returns a DTO without template item content or internal fields", async () => {
    const result = await applyDocumentTemplateToCase({
      caseId: "case-id",
      templateId: "template-id",
    });
    const payload = JSON.stringify(result);

    expect(Object.keys(result).sort()).toEqual(
      [
        "caseId",
        "copiedRequirementCount",
        "requirementIds",
        "templateId",
        "templateKey",
        "templateVersion",
      ].sort(),
    );
    expect(payload).toContain("requirement-1");
    expect(payload).not.toContain("internalNote");
    expect(payload).not.toContain("customerInstruction");
    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("tokenHash");
  });

  it("fails when case does not exist", async () => {
    mocks.tx.case.findUnique.mockResolvedValue(null);

    await expect(
      applyDocumentTemplateToCase({
        caseId: "case-id",
        templateId: "template-id",
      }),
    ).rejects.toBeInstanceOf(TemplateApplyAccessError);
    expect(mocks.tx.caseDocumentRequirement.create).not.toHaveBeenCalled();
  });

  it("fails when template does not exist or is not active", async () => {
    mocks.tx.documentTemplate.findUnique.mockResolvedValue({
      ...template,
      status: "archived",
    });

    await expect(
      applyDocumentTemplateToCase({
        caseId: "case-id",
        templateId: "template-id",
      }),
    ).rejects.toBeInstanceOf(TemplateApplyAccessError);
    expect(mocks.tx.caseDocumentRequirement.create).not.toHaveBeenCalled();
  });

  it.each([
    ["missing caseId", { caseId: "", templateId: "template-id" }],
    ["missing template selector", { caseId: "case-id" }],
    ["invalid version", { caseId: "case-id", templateKey: "engineer", version: 0 }],
    [
      "unsafe reason",
      {
        caseId: "case-id",
        templateId: "template-id",
        reason: "contains tokenHash",
      },
    ],
  ] as const)("fails for %s", async (_label, input) => {
    await expect(applyDocumentTemplateToCase(input)).rejects.toBeInstanceOf(
      InvalidTemplateApplyInputError,
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
