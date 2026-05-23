import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    customer: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    case: {
      create: vi.fn(),
    },
    documentTemplate: {
      findUnique: vi.fn(),
    },
    caseDocumentRequirement: {
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
    internalNote: {
      create: vi.fn(),
    },
    timelineEvent: {
      create: vi.fn(),
    },
  };

  return {
    documentTemplateFindUnique: vi.fn(),
    transaction: vi.fn(),
    tx,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    documentTemplate: {
      findUnique: mocks.documentTemplateFindUnique,
    },
    $transaction: mocks.transaction,
  },
}));

import {
  InvalidTemplateSelectionInputError,
  TemplateSelectionAccessError,
  createCaseFromTemplateSelection,
  previewCaseTemplateRequirements,
} from "./template-selection-service";

const createdAt = new Date("2026-01-01T00:00:00.000Z");
const updatedAt = new Date("2026-01-01T00:00:00.000Z");

const template = {
  id: "template-id",
  templateKey: "visa-path-001",
  version: 1,
  title: "No visa -> Engineer",
  currentVisaType: "无",
  targetVisaType: "技術・人文知識・国際業務",
  status: "active",
  items: [
    {
      id: "item-customer",
      itemKey: "item-001",
      title: "Passport",
      customerInstruction: "Upload passport.",
      internalNote: "Check expiry.",
      isRequired: true,
      responsibleParty: "customer",
      sortOrder: 20,
      acceptedFileTypesDescription: null,
    },
    {
      id: "item-office",
      itemKey: "item-002",
      title: "Application form",
      customerInstruction: null,
      internalNote: "Prepare internally.",
      isRequired: true,
      responsibleParty: "office",
      sortOrder: 10,
      acceptedFileTypesDescription: null,
    },
  ],
} as const;

function createdCaseFromData(data: Record<string, unknown>) {
  return {
    id: "case-id",
    createdAt,
    updatedAt,
    ...data,
  };
}

function baseInput(overrides = {}) {
  return {
    customer: {
      mode: "reuse" as const,
      customerId: "customer-id",
    },
    existingVisaType: "无",
    applyingVisaType: "技術・人文知識・国際業務",
    templateId: "template-id",
    selectedTemplateItemIds: ["item-customer"],
    customItems: [],
    ...overrides,
  };
}

describe("previewCaseTemplateRequirements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.documentTemplateFindUnique.mockResolvedValue(template);
  });

  it("returns an admin-only preview DTO without writing to the database", async () => {
    const result = await previewCaseTemplateRequirements({ templateId: "template-id" });

    expect(mocks.documentTemplateFindUnique).toHaveBeenCalledWith({
      where: { id: "template-id" },
      select: {
        id: true,
        templateKey: true,
        version: true,
        title: true,
        currentVisaType: true,
        targetVisaType: true,
        status: true,
        items: {
          select: {
            id: true,
            itemKey: true,
            title: true,
            customerInstruction: true,
            internalNote: true,
            isRequired: true,
            responsibleParty: true,
            sortOrder: true,
            acceptedFileTypesDescription: true,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(result.template).toEqual({
      id: "template-id",
      templateKey: "visa-path-001",
      version: 1,
      title: "No visa -> Engineer",
      currentVisaType: "无",
      targetVisaType: "技術・人文知識・国際業務",
    });
    expect(result.items.map((item) => item.sourceTemplateItemId)).toEqual([
      "item-office",
      "item-customer",
    ]);
    expect(result.items[0]).toMatchObject({
      itemKey: "item-002",
      responsibleParty: "office",
      internalNote: "Prepare internally.",
      defaultSelected: true,
    });
    expect(JSON.stringify(result)).not.toContain("storagePath");
    expect(JSON.stringify(result)).not.toContain("storageBucket");
    expect(JSON.stringify(result)).not.toContain("signedUrl");
    expect(JSON.stringify(result)).not.toContain("tokenHash");
  });

  it("fails when the template is not active", async () => {
    mocks.documentTemplateFindUnique.mockResolvedValue({ ...template, status: "archived" });

    await expect(previewCaseTemplateRequirements({ templateId: "template-id" })).rejects.toBeInstanceOf(
      TemplateSelectionAccessError,
    );
  });
});

describe("createCaseFromTemplateSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.customer.create.mockResolvedValue({ id: "new-customer-id" });
    mocks.tx.customer.findUnique.mockResolvedValue({ id: "customer-id" });
    mocks.tx.documentTemplate.findUnique.mockResolvedValue(template);
    mocks.tx.case.create.mockImplementation(async ({ data }) => createdCaseFromData(data));
    mocks.tx.caseDocumentRequirement.create.mockImplementation(async () => ({
      id: `requirement-${mocks.tx.caseDocumentRequirement.create.mock.calls.length}`,
    }));
    mocks.tx.internalNote.create.mockResolvedValue({ id: "internal-note-id" });
    mocks.tx.timelineEvent.create.mockImplementation(async ({ data }) => data);
  });

  it("creates a case and copies only selected template items", async () => {
    const result = await createCaseFromTemplateSelection(baseInput());
    const requirementCreates = mocks.tx.caseDocumentRequirement.create.mock.calls;
    const copiedRequirement = requirementCreates[0][0].data;

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.case.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: "customer-id",
        currentVisaType: "无",
        targetVisaType: "技術・人文知識・国際業務",
        casePhase: "draft",
      }),
    });
    expect(copiedRequirement).toMatchObject({
      caseId: "case-id",
      title: "Passport",
      sourceType: "template",
      status: "not_submitted",
      sourceTemplateId: "template-id",
      sourceTemplateVersion: 1,
      sourceTemplateItemId: "item-customer",
      portalVisible: true,
      portalDownloadable: false,
    });
    expect(JSON.stringify(requirementCreates)).not.toContain("Application form");
    expect(result).toMatchObject({
      caseId: "case-id",
      customerId: "customer-id",
      currentVisaType: "无",
      targetVisaType: "技術・人文知識・国際業務",
      casePhase: "draft",
      templateId: "template-id",
      templateKey: "visa-path-001",
      templateVersion: 1,
      selectedItemCount: 1,
      excludedItemCount: 1,
      customItemCount: 0,
      requirementIds: ["requirement-1"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.caseNumber).toMatch(/^CASE-\d{8}-[A-F0-9]{8}$/);
  });

  it("creates custom requirements with portal visibility defaults and forced downloadable visibility", async () => {
    await createCaseFromTemplateSelection(
      baseInput({
        selectedTemplateItemIds: ["item-office"],
        customItems: [
          {
            title: "Customer extra",
            responsibleParty: "customer",
            customerInstruction: "Please upload this.",
            internalNote: "Admin-only note.",
          },
          {
            title: "Office downloadable",
            responsibleParty: "office",
            portalVisible: false,
            portalDownloadable: true,
          },
        ],
      }),
    );
    const customCustomer = mocks.tx.caseDocumentRequirement.create.mock.calls[1][0].data;
    const customOfficeDownloadable = mocks.tx.caseDocumentRequirement.create.mock.calls[2][0].data;

    expect(customCustomer).toMatchObject({
      title: "Customer extra",
      sourceType: "custom",
      sourceTemplateId: null,
      sourceTemplateVersion: null,
      sourceTemplateItemId: null,
      status: "not_submitted",
      responsibleParty: "customer",
      portalVisible: true,
      portalDownloadable: false,
      customerInstruction: "Please upload this.",
      internalNote: "Admin-only note.",
    });
    expect(customOfficeDownloadable).toMatchObject({
      title: "Office downloadable",
      sourceType: "custom",
      responsibleParty: "office",
      portalVisible: true,
      portalDownloadable: true,
    });
  });

  it("creates a new Customer when requested and does not update reused Customers", async () => {
    await createCaseFromTemplateSelection(
      baseInput({
        customer: {
          mode: "create",
          name: "New Customer",
          email: "new@example.com",
          passportNumber: "TEST-PASSPORT",
          residenceCardNumber: "TEST-RESIDENCE",
        },
      }),
    );

    expect(mocks.tx.customer.create).toHaveBeenCalledWith({
      data: {
        name: "New Customer",
        email: "new@example.com",
        phone: undefined,
        address: undefined,
        nationality: undefined,
        birthday: undefined,
        passportNumber: "TEST-PASSPORT",
        residenceCardNumber: "TEST-RESIDENCE",
      },
      select: { id: true },
    });
    expect(mocks.tx.customer.update).not.toHaveBeenCalled();
  });

  it("rejects selected items that do not belong to the template before creating the case", async () => {
    await expect(
      createCaseFromTemplateSelection(
        baseInput({
          selectedTemplateItemIds: ["item-customer", "missing-item"],
        }),
      ),
    ).rejects.toBeInstanceOf(TemplateSelectionAccessError);
    expect(mocks.tx.case.create).not.toHaveBeenCalled();
    expect(mocks.tx.caseDocumentRequirement.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate selected template item ids before opening a transaction", async () => {
    await expect(
      createCaseFromTemplateSelection(
        baseInput({
          selectedTemplateItemIds: ["item-customer", "item-customer"],
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidTemplateSelectionInputError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("writes safe timeline events for case, selected template items, and custom requirements", async () => {
    await createCaseFromTemplateSelection(
      baseInput({
        customItems: [
          {
            title: "Customer extra",
            responsibleParty: "customer",
            customerInstruction: "Sensitive-ish customer-facing text.",
            internalNote: "Internal-only custom note.",
          },
        ],
      }),
    );
    const events = mocks.tx.timelineEvent.create.mock.calls.map(([arg]) => arg.data);
    const templateEvent = events.find((event) => event.eventType === "template_items_copied");
    const customEvent = events.find(
      (event) =>
        event.eventType === "requirement_created" &&
        event.summary === "Custom requirements created.",
    );
    const metadataPayload = JSON.stringify(events);

    expect(events.map((event) => event.eventType)).toEqual([
      "case_created",
      "template_items_copied",
      "requirement_created",
    ]);
    expect(templateEvent).toMatchObject({
      summary: "Selected template items copied.",
      metadata: {
        caseId: "case-id",
        templateId: "template-id",
        templateKey: "visa-path-001",
        templateVersion: 1,
        selectedItemCount: 1,
        excludedItemCount: 1,
        customItemCount: 1,
      },
    });
    expect(customEvent).toMatchObject({
      metadata: {
        caseId: "case-id",
        templateId: "template-id",
        templateKey: "visa-path-001",
        templateVersion: 1,
        selectedItemCount: 1,
        excludedItemCount: 1,
        customItemCount: 1,
      },
    });
    expect(metadataPayload).not.toContain("internalNote");
    expect(metadataPayload).not.toContain("Internal-only custom note");
    expect(metadataPayload).not.toContain("customerInstruction");
    expect(metadataPayload).not.toContain("Sensitive-ish customer-facing text");
    expect(metadataPayload).not.toContain("token");
    expect(metadataPayload).not.toContain("tokenHash");
    expect(metadataPayload).not.toContain("signedUrl");
    expect(metadataPayload).not.toContain("storagePath");
    expect(metadataPayload).not.toContain("storageBucket");
    expect(metadataPayload).not.toContain("passportNumber");
    expect(metadataPayload).not.toContain("residenceCardNumber");
  });

  it("does not create tokens, files, application confirmations, or storage side effects", async () => {
    await createCaseFromTemplateSelection(baseInput());

    expect(mocks.tx.customerAccessToken.create).not.toHaveBeenCalled();
    expect(mocks.tx.documentFile.create).not.toHaveBeenCalled();
    expect(mocks.tx.applicationConfirmation.create).not.toHaveBeenCalled();
  });

  it("relies on the transaction for rollback if requirement creation fails", async () => {
    mocks.tx.caseDocumentRequirement.create.mockRejectedValueOnce(new Error("create failed"));

    await expect(createCaseFromTemplateSelection(baseInput())).rejects.toThrow("create failed");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.timelineEvent.create).toHaveBeenCalledTimes(1);
  });

  it("fails when the reused Customer does not exist", async () => {
    mocks.tx.customer.findUnique.mockResolvedValue(null);

    await expect(createCaseFromTemplateSelection(baseInput())).rejects.toBeInstanceOf(
      TemplateSelectionAccessError,
    );
    expect(mocks.tx.case.create).not.toHaveBeenCalled();
  });

  it("fails when the template does not exist or is not active", async () => {
    mocks.tx.documentTemplate.findUnique.mockResolvedValue({ ...template, status: "archived" });

    await expect(createCaseFromTemplateSelection(baseInput())).rejects.toBeInstanceOf(
      TemplateSelectionAccessError,
    );
    expect(mocks.tx.case.create).not.toHaveBeenCalled();
  });

  it.each([
    ["missing applyingVisaType", baseInput({ applyingVisaType: "" })],
    ["missing templateId", baseInput({ templateId: "" })],
    ["missing customerId", baseInput({ customer: { mode: "reuse", customerId: "" } })],
    [
      "invalid custom responsibleParty",
      baseInput({
        customItems: [{ title: "Bad item", responsibleParty: "admin" }],
      }),
    ],
    [
      "no requirements",
      baseInput({
        selectedTemplateItemIds: [],
        customItems: [],
      }),
    ],
  ] as const)("fails for %s", async (_label, input) => {
    await expect(createCaseFromTemplateSelection(input)).rejects.toBeInstanceOf(
      InvalidTemplateSelectionInputError,
    );
  });
});
