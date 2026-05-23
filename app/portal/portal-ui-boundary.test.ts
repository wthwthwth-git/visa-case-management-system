import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const portalUiFiles = [
  "app/portal/[token]/page.tsx",
  "app/portal/_components/portal-page.tsx",
  "app/portal/_components/portal-ui.tsx",
  "app/portal/_lib/portal-api.ts",
];

const portalComponentFiles = [
  "app/portal/[token]/page.tsx",
  "app/portal/_components/portal-page.tsx",
  "app/portal/_components/portal-ui.tsx",
];

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("portal UI boundary", () => {
  it("does not import prisma, services, admin auth, or csrf helpers", () => {
    const source = portalUiFiles.map(readWorkspaceFile).join("\n");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@/lib/services");
    expect(source).not.toContain("@/lib/api/admin-auth");
    expect(source).not.toContain("@/lib/api/csrf");
    expect(source).not.toContain("adminServices");
    expect(source).not.toContain("portalServices");
    expect(source).not.toContain("requireAdminAuth");
    expect(source).not.toContain("requireAdminCsrf");
  });

  it("calls only portal API routes from portal UI helper", () => {
    const source = portalUiFiles.map(readWorkspaceFile).join("\n");

    expect(source).toContain("/api/portal/");
    expect(source).not.toContain("/api/admin");
  });

  it("does not persist tokens or access URLs in browser storage", () => {
    const source = portalUiFiles.map(readWorkspaceFile).join("\n");

    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("indexedDB");
  });

  it("does not render raw access URLs or internal fields from components", () => {
    const source = portalComponentFiles.map(readWorkspaceFile).join("\n");

    expect(source).not.toContain("signedUrl");
    expect(source).not.toContain("storagePath");
    expect(source).not.toContain("storageBucket");
    expect(source).not.toContain("tokenHash");
    expect(source).not.toContain("internalNote");
    expect(source).not.toContain("originalFileName");
    expect(source).not.toContain("metadata");
  });

  it("does not log portal token or access URL values", () => {
    const source = portalUiFiles.map(readWorkspaceFile).join("\n");

    expect(source).not.toContain("console.log");
  });
});
