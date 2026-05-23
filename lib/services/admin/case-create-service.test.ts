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
    caseDocumentRequirement: {
      create: vi.fn(),
    },
    customerAccessToken: {
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
    transaction: vi.fn(),
    tx,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import { CaseCreateAccessError, InvalidCaseCreateInputError, createCase } from "./case-create-service";

const createdAt = new Date("2026-01-01T00:00:00.000Z");
const updatedAt = new Date("2026-01-01T00:00:00.000Z");

function createdCaseFromData(data: Record<string, unknown>) {
  return {
    id: "case-id",
    createdAt,
    updatedAt,
    ...data,
  };
}

describe("admin create case service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.customer.create.mockResolvedValue({ id: "customer-id" });
    mocks.tx.customer.findUnique.mockResolvedValue({ id: "existing-customer-id" });
    mocks.tx.case.create.mockImplementation(async ({ data }) => createdCaseFromData(data));
    mocks.tx.internalNote.create.mockResolvedValue({ id: "internal-note-id" });
    mocks.tx.timelineEvent.create.mockImplementation(async ({ data }) => data);
  });

  it("creates a Customer and then creates a draft Case", async () => {
    const result = await createCase({
      customer: {
        mode: "create",
        name: "Seed Customer",
        email: "seed.customer@example.com",
        phone: "000-0000",
        address: "Test address",
        nationality: "Test nationality",
        birthday: new Date("1990-01-01T00:00:00.000Z"),
        passportNumber: "TEST-PASSPORT",
        residenceCardNumber: "TEST-RESIDENCE",
      },
      existingVisaType: "Student",
      applyingVisaType: "Engineer",
      internalNote: "Internal onboarding note",
    });
    const customerCreateArg = mocks.tx.customer.create.mock.calls[0][0].data;
    const caseCreateArg = mocks.tx.case.create.mock.calls[0][0].data;

    expect(customerCreateArg).toEqual({
      name: "Seed Customer",
      email: "seed.customer@example.com",
      phone: "000-0000",
      address: "Test address",
      nationality: "Test nationality",
      birthday: new Date("1990-01-01T00:00:00.000Z"),
      passportNumber: "TEST-PASSPORT",
      residenceCardNumber: "TEST-RESIDENCE",
    });
    expect(caseCreateArg).toMatchObject({
      customerId: "customer-id",
      currentVisaType: "Student",
      targetVisaType: "Engineer",
      casePhase: "draft",
    });
    expect(caseCreateArg.caseNumber).toMatch(/^CASE-\d{8}-[A-F0-9]{8}$/);
    expect(caseCreateArg).not.toHaveProperty("customerName");
    expect(caseCreateArg).not.toHaveProperty("customerContact");
    expect(result).toMatchObject({
      id: "case-id",
      customerId: "customer-id",
      currentVisaType: "Student",
      targetVisaType: "Engineer",
      casePhase: "draft",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.caseNumber).toMatch(/^CASE-\d{8}-[A-F0-9]{8}$/);
  });

  it("reuses an existing Customer without updating it", async () => {
    await createCase({
      customer: {
        mode: "reuse",
        customerId: "existing-customer-id",
      },
      applyingVisaType: "Business Manager",
    });
    const caseCreateArg = mocks.tx.case.create.mock.calls[0][0].data;

    expect(mocks.tx.customer.findUnique).toHaveBeenCalledWith({
      where: { id: "existing-customer-id" },
      select: { id: true },
    });
    expect(mocks.tx.customer.create).not.toHaveBeenCalled();
    expect(mocks.tx.customer.update).not.toHaveBeenCalled();
    expect(caseCreateArg.customerId).toBe("existing-customer-id");
    expect(caseCreateArg.currentVisaType).toBe("unspecified");
  });

  it("does not create requirements or customer access tokens", async () => {
    await createCase({
      customer: {
        mode: "reuse",
        customerId: "existing-customer-id",
      },
      applyingVisaType: "Engineer",
    });

    expect(mocks.tx.caseDocumentRequirement.create).not.toHaveBeenCalled();
    expect(mocks.tx.customerAccessToken.create).not.toHaveBeenCalled();
  });

  it("writes case_created timeline without sensitive metadata", async () => {
    await createCase({
      customer: {
        mode: "create",
        name: "Seed Customer",
        email: "seed.customer@example.com",
        phone: "000-0000",
        address: "Test address",
        passportNumber: "TEST-PASSPORT",
        residenceCardNumber: "TEST-RESIDENCE",
      },
      existingVisaType: "Student",
      applyingVisaType: "Engineer",
      internalNote: "Internal onboarding note",
    });
    const caseCreatedEvent = mocks.tx.timelineEvent.create.mock.calls.find(
      ([arg]) => arg.data.eventType === "case_created",
    )?.[0].data;
    const metadataPayload = JSON.stringify(caseCreatedEvent.metadata);

    expect(caseCreatedEvent).toMatchObject({
      caseId: "case-id",
      eventType: "case_created",
      actorType: "internal",
      targetType: "case",
      targetId: "case-id",
      metadata: {
        caseId: "case-id",
        customerId: "customer-id",
        currentVisaType: "Student",
        targetVisaType: "Engineer",
      },
    });
    expect(metadataPayload).not.toContain("passportNumber");
    expect(metadataPayload).not.toContain("residenceCardNumber");
    expect(metadataPayload).not.toContain("seed.customer@example.com");
    expect(metadataPayload).not.toContain("000-0000");
    expect(metadataPayload).not.toContain("Test address");
    expect(metadataPayload).not.toContain("Internal onboarding note");
    expect(metadataPayload).not.toContain("token");
    expect(metadataPayload).not.toContain("tokenHash");
    expect(metadataPayload).not.toContain("signedUrl");
    expect(metadataPayload).not.toContain("storagePath");
    expect(metadataPayload).not.toContain("storageBucket");
  });

  it("stores an optional internal note outside case_created metadata", async () => {
    await createCase({
      customer: {
        mode: "reuse",
        customerId: "existing-customer-id",
      },
      applyingVisaType: "Engineer",
      internalNote: "Internal onboarding note",
    });

    expect(mocks.tx.internalNote.create).toHaveBeenCalledWith({
      data: {
        caseId: "case-id",
        targetType: "case",
        targetId: "case-id",
        body: "Internal onboarding note",
      },
      select: { id: true },
    });
    expect(JSON.stringify(mocks.tx.timelineEvent.create.mock.calls)).not.toContain(
      "Internal onboarding note",
    );
  });

  it("fails when the reused Customer does not exist", async () => {
    mocks.tx.customer.findUnique.mockResolvedValue(null);

    await expect(
      createCase({
        customer: {
          mode: "reuse",
          customerId: "missing-customer-id",
        },
        applyingVisaType: "Engineer",
      }),
    ).rejects.toBeInstanceOf(CaseCreateAccessError);
    expect(mocks.tx.case.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      "missing customer name",
      {
        customer: {
          mode: "create",
          name: "",
        },
        applyingVisaType: "Engineer",
      },
    ] as const,
    [
      "missing applyingVisaType",
      {
        customer: {
          mode: "create",
          name: "Seed Customer",
        },
        applyingVisaType: "",
      },
    ] as const,
    [
      "missing customerId",
      {
        customer: {
          mode: "reuse",
          customerId: "",
        },
        applyingVisaType: "Engineer",
      },
    ] as const,
  ])("fails for %s", async (_label, input) => {
    await expect(createCase(input)).rejects.toBeInstanceOf(InvalidCaseCreateInputError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns a DTO and not a Prisma object with relations or sensitive fields", async () => {
    const result = await createCase({
      customer: {
        mode: "create",
        name: "Seed Customer",
        passportNumber: "TEST-PASSPORT",
        residenceCardNumber: "TEST-RESIDENCE",
      },
      applyingVisaType: "Engineer",
    });
    const payload = JSON.stringify(result);

    expect(Object.keys(result).sort()).toEqual(
      [
        "caseNumber",
        "casePhase",
        "createdAt",
        "currentVisaType",
        "customerId",
        "id",
        "targetVisaType",
        "updatedAt",
      ].sort(),
    );
    expect(payload).not.toContain("customerName");
    expect(payload).not.toContain("customerContact");
    expect(payload).not.toContain("passportNumber");
    expect(payload).not.toContain("residenceCardNumber");
    expect(payload).not.toContain("documentRequirements");
    expect(payload).not.toContain("accessTokens");
  });

  it("retries when generated caseNumber conflicts with the unique constraint", async () => {
    const uniqueError = Object.assign(new Error("unique"), {
      code: "P2002",
      meta: { target: ["caseNumber"] },
    });
    mocks.tx.case.create.mockRejectedValueOnce(uniqueError);
    mocks.tx.case.create.mockImplementation(async ({ data }) => createdCaseFromData(data));

    const result = await createCase({
      customer: {
        mode: "reuse",
        customerId: "existing-customer-id",
      },
      applyingVisaType: "Engineer",
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(result.caseNumber).toMatch(/^CASE-\d{8}-[A-F0-9]{8}$/);
  });
});
