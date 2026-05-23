import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  assertSafeInternalNote,
  importVisaTemplates,
  loadVisaTemplateCatalog,
  validateVisaTemplateCatalog,
  VisaTemplateCatalogValidationError,
  type VisaTemplateCatalog,
} from "./import-visa-templates-lib";

let catalog: VisaTemplateCatalog;

beforeAll(async () => {
  catalog = await loadVisaTemplateCatalog();
});

function cloneCatalog(): VisaTemplateCatalog {
  return structuredClone(catalog);
}

function createMockPrisma(existingTemplateKeys = new Set<string>()) {
  const createMock = vi.fn(async ({ data }: { data: unknown }) => ({ id: "created", data }));
  const transactionMock = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      documentTemplate: {
        create: createMock,
      },
    }),
  );
  const findUniqueMock = vi.fn(
    async ({
      where,
    }: {
      where: { templateKey_version: { templateKey: string; version: number } };
    }) => {
      const key = `${where.templateKey_version.templateKey}:${where.templateKey_version.version}`;
      if (!existingTemplateKeys.has(key)) {
        return null;
      }

      return {
        id: "existing-template-id",
        _count: {
          items: 7,
        },
      };
    },
  );

  return {
    createMock,
    findUniqueMock,
    transactionMock,
    prisma: {
      documentTemplate: {
        findUnique: findUniqueMock,
      },
      $transaction: transactionMock,
    },
  };
}

describe("validateVisaTemplateCatalog", () => {
  it("accepts the frozen 210-template catalog", () => {
    expect(() => validateVisaTemplateCatalog(catalog)).not.toThrow();
  });

  it("rejects duplicate templateKey values", () => {
    const invalid = cloneCatalog();
    invalid.templates[1].templateKey = invalid.templates[0].templateKey;

    expect(() => validateVisaTemplateCatalog(invalid)).toThrow(
      VisaTemplateCatalogValidationError,
    );
  });

  it("rejects duplicate itemKey values inside a template", () => {
    const invalid = cloneCatalog();
    invalid.templates[0].items[1].itemKey = invalid.templates[0].items[0].itemKey;

    expect(() => validateVisaTemplateCatalog(invalid)).toThrow(
      VisaTemplateCatalogValidationError,
    );
  });

  it("rejects invalid responsibleParty values", () => {
    const invalid = cloneCatalog();
    invalid.templates[0].items[0].responsibleParty = "admin" as "customer";

    expect(() => validateVisaTemplateCatalog(invalid)).toThrow(
      VisaTemplateCatalogValidationError,
    );
  });
});

describe("importVisaTemplates", () => {
  it("dry-runs without writing templates", async () => {
    const mock = createMockPrisma();

    const summary = await importVisaTemplates({
      catalog,
      prisma: mock.prisma as never,
      dryRun: true,
    });

    expect(summary.createdTemplates).toBe(210);
    expect(summary.createdItems).toBe(3142);
    expect(summary.skippedTemplates).toBe(0);
    expect(summary.failedTemplates).toEqual([]);
    expect(mock.findUniqueMock).toHaveBeenCalledTimes(210);
    expect(mock.transactionMock).not.toHaveBeenCalled();
    expect(mock.createMock).not.toHaveBeenCalled();
  });

  it("skips existing templateKey/version pairs idempotently", async () => {
    const firstTemplate = catalog.templates[0];
    const mock = createMockPrisma(
      new Set([`${firstTemplate.templateKey}:${firstTemplate.version}`]),
    );

    const summary = await importVisaTemplates({
      catalog,
      prisma: mock.prisma as never,
      dryRun: true,
    });

    expect(summary.skippedTemplates).toBe(1);
    expect(summary.skippedItems).toBe(7);
    expect(summary.createdTemplates).toBe(209);
    expect(mock.transactionMock).not.toHaveBeenCalled();
  });

  it("maps catalog templates and items to DocumentTemplate create data", async () => {
    const mock = createMockPrisma();

    const summary = await importVisaTemplates({
      catalog,
      prisma: mock.prisma as never,
    });

    expect(summary.createdTemplates).toBe(210);
    expect(summary.createdItems).toBe(3142);
    expect(mock.transactionMock).toHaveBeenCalledTimes(210);

    const firstCreate = mock.createMock.mock.calls[0][0] as {
      data: {
        templateKey: string;
        version: number;
        title: string;
        status: string;
        currentVisaType: string;
        targetVisaType: string;
        items: {
          create: Array<{
            itemKey: string;
            title: string;
            isRequired: boolean;
            responsibleParty: string;
            acceptedFileTypesDescription: string | null;
            internalNote: string | null;
          }>;
        };
      };
    };

    expect(firstCreate.data.templateKey).toBe(catalog.templates[0].templateKey);
    expect(firstCreate.data.version).toBe(1);
    expect(firstCreate.data.status).toBe("active");
    expect(firstCreate.data.currentVisaType).toBe(catalog.templates[0].currentVisaType);
    expect(firstCreate.data.targetVisaType).toBe(catalog.templates[0].targetVisaType);
    expect(firstCreate.data.items.create).toHaveLength(catalog.templates[0].items.length);
    expect(firstCreate.data.items.create[0]).toMatchObject({
      itemKey: catalog.templates[0].items[0].itemKey,
      title: catalog.templates[0].items[0].title,
      isRequired: true,
      responsibleParty: catalog.templates[0].items[0].responsibleParty,
      acceptedFileTypesDescription: null,
    });

    const createJson = JSON.stringify(firstCreate.data).toLowerCase();
    expect(createJson).not.toContain("signedurl");
    expect(createJson).not.toContain("storagepath");
    expect(createJson).not.toContain("storagebucket");
    expect(createJson).not.toContain("tokenhash");
  });
});

describe("assertSafeInternalNote", () => {
  it("rejects unsafe storage, token, and signed URL text", () => {
    expect(() => assertSafeInternalNote("signedUrl=https://example.test")).toThrow(
      VisaTemplateCatalogValidationError,
    );
    expect(() => assertSafeInternalNote("storagePath=cases/1/file.pdf")).toThrow(
      VisaTemplateCatalogValidationError,
    );
    expect(() => assertSafeInternalNote("tokenHash=abc")).toThrow(
      VisaTemplateCatalogValidationError,
    );
  });
});
