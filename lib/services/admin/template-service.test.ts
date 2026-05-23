import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    documentTemplate: {
      findMany: mocks.findMany,
      count: mocks.count,
      findUnique: mocks.findUnique,
    },
  },
}));

import { getAdminDocumentTemplateById, listAdminDocumentTemplates } from "./template-service";

const updatedAt = new Date("2026-01-01T00:00:00.000Z");
const createdAt = new Date("2025-12-01T00:00:00.000Z");

describe("admin template service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([
      {
        id: "template-id",
        templateKey: "engineer",
        version: 3,
        title: "Engineer template",
        status: "active",
        currentVisaType: "student",
        targetVisaType: "engineer",
        updatedAt,
        _count: {
          items: 12,
        },
      },
    ]);
    mocks.count.mockResolvedValue(1);
    mocks.findUnique.mockResolvedValue({
      id: "template-id",
      templateKey: "engineer",
      version: 3,
      title: "Engineer template",
      templateDescription: "Template description",
      status: "active",
      currentVisaType: "student",
      targetVisaType: "engineer",
      createdAt,
      updatedAt,
      items: [
        {
          id: "item-late",
          itemKey: "late",
          title: "Late item",
          customerInstruction: "Customer instruction",
          internalNote: "Internal note",
          isRequired: false,
          responsibleParty: "office",
          sortOrder: 20,
          acceptedFileTypesDescription: null,
        },
        {
          id: "item-early",
          itemKey: "early",
          title: "Early item",
          customerInstruction: null,
          internalNote: null,
          isRequired: true,
          responsibleParty: "customer",
          sortOrder: 10,
          acceptedFileTypesDescription: "PDF",
        },
      ],
    });
  });

  it("lists active templates by default with pagination and DTO mapping", async () => {
    const result = await listAdminDocumentTemplates();

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        status: "active",
      },
      select: expect.objectContaining({
        id: true,
        templateKey: true,
        version: true,
        title: true,
        status: true,
        _count: {
          select: {
            items: true,
          },
        },
      }),
      orderBy: [{ templateKey: "asc" }, { version: "desc" }],
      skip: 0,
      take: 20,
    });
    expect(mocks.count).toHaveBeenCalledWith({
      where: {
        status: "active",
      },
    });
    expect(result).toEqual({
      items: [
        {
          id: "template-id",
          templateKey: "engineer",
          version: 3,
          title: "Engineer template",
          status: "active",
          currentVisaType: "student",
          targetVisaType: "engineer",
          itemCount: 12,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });

  it("passes list filters and clamps pageSize", async () => {
    await listAdminDocumentTemplates({
      q: " engineer ",
      status: "archived",
      currentVisaType: "student",
      targetVisaType: "engineer",
      templateKey: "engineer",
      page: "2",
      pageSize: "500",
    });

    expect(mocks.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        status: "archived",
        templateKey: "engineer",
        currentVisaType: "student",
        targetVisaType: "engineer",
        OR: [
          { templateKey: { contains: "engineer", mode: "insensitive" } },
          { title: { contains: "engineer", mode: "insensitive" } },
          { templateDescription: { contains: "engineer", mode: "insensitive" } },
        ],
      },
      skip: 100,
      take: 100,
    });
  });

  it("defaults invalid status to active", async () => {
    await listAdminDocumentTemplates({ status: "not-a-status" });

    expect(mocks.findMany.mock.calls[0][0].where.status).toBe("active");
  });

  it("returns template detail with sorted items and internal fields for admin", async () => {
    const result = await getAdminDocumentTemplateById("template-id");

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "template-id" },
      select: expect.objectContaining({
        id: true,
        items: {
          select: expect.objectContaining({
            customerInstruction: true,
            internalNote: true,
          }),
          orderBy: { sortOrder: "asc" },
        },
      }),
    });
    expect(result?.items.map((item) => item.id)).toEqual(["item-early", "item-late"]);
    expect(result?.items[1]).toMatchObject({
      customerInstruction: "Customer instruction",
      internalNote: "Internal note",
    });
  });

  it("returns null when template detail is missing", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(getAdminDocumentTemplateById("missing-template")).resolves.toBeNull();
  });

  it("does not return storage, token, signed URL, or Prisma internals in DTOs", async () => {
    const listResult = await listAdminDocumentTemplates();
    const detailResult = await getAdminDocumentTemplateById("template-id");
    const payload = JSON.stringify({ listResult, detailResult });

    expect(payload).not.toContain("storagePath");
    expect(payload).not.toContain("storageBucket");
    expect(payload).not.toContain("tokenHash");
    expect(payload).not.toContain("plaintextToken");
    expect(payload).not.toContain("signedUrl");
    expect(payload).not.toContain("_count");
  });
});
