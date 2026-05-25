import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adminUiFiles = [
  "app/admin/_components/admin-shell.tsx",
  "app/admin/_components/admin-session-controls.tsx",
  "app/admin/_lib/admin-api.ts",
  "app/admin/_components/ui.tsx",
  "app/admin/_components/admin-cases-page.tsx",
  "app/admin/_components/admin-new-case-page.tsx",
  "app/admin/_components/admin-case-detail-page.tsx",
  "app/admin/login/page.tsx",
  "app/admin/login/login-page.tsx",
  "app/admin/cases/page.tsx",
  "app/admin/cases/new/page.tsx",
  "app/admin/cases/[caseId]/page.tsx",
];

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin UI shell boundary", () => {
  it("does not import prisma or service namespaces from UI files", () => {
    const source = adminUiFiles.map(readWorkspaceFile).join("\n");

    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("@/lib/services");
    expect(source).not.toContain("@/auth");
    expect(source).not.toContain("adminServices");
    expect(source).not.toContain("portalServices");
  });

  it("does not persist plaintext tokens or signed URLs in browser storage", () => {
    const source = adminUiFiles.map(readWorkspaceFile).join("\n");

    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("indexedDB");
    expect(source).not.toContain(".setItem(");
  });

  it("does not directly access Supabase Storage or signed URL behavior from UI files", () => {
    const source = adminUiFiles.map(readWorkspaceFile).join("\n");

    expect(source).not.toContain("SUPABASE");
    expect(source).not.toContain("createSignedUrl");
    expect(source).not.toContain("downloadUrl");
  });

  it("does not log plaintext tokens from UI files", () => {
    const source = adminUiFiles.map(readWorkspaceFile).join("\n");

    expect(source).not.toContain("console.log");
  });

  it("uses whitelisted request bodies for token mutations", () => {
    const source = readWorkspaceFile("app/admin/_components/admin-case-detail-page.tsx");
    const regenerateBody = source.match(
      /postJson<RegeneratedPortalTokenResult>\([\s\S]*?\/token\/regenerate`,\s*\{([\s\S]*?)\},\s*\);/,
    )?.[1];
    const revokeBody = source.match(
      /postJson<RevokedPortalTokenResult>\([\s\S]*?\/token\/revoke`,\s*\{([\s\S]*?)\},\s*\);/,
    )?.[1];

    expect(regenerateBody).toBeDefined();
    expect(regenerateBody).toContain("reason:");
    expect(regenerateBody).toContain("expiresAt:");
    expect(regenerateBody).not.toContain("caseId");
    expect(regenerateBody).not.toContain("plaintextToken");
    expect(regenerateBody).not.toContain("tokenHash");
    expect(regenerateBody).not.toContain("storagePath");
    expect(regenerateBody).not.toContain("storageBucket");

    expect(revokeBody).toBeDefined();
    expect(revokeBody).toContain("reason:");
    expect(revokeBody).not.toContain("caseId");
    expect(revokeBody).not.toContain("plaintextToken");
    expect(revokeBody).not.toContain("tokenHash");
    expect(revokeBody).not.toContain("storagePath");
    expect(revokeBody).not.toContain("storageBucket");
  });

  it("keeps case detail mutation interactions guarded", () => {
    const source = readWorkspaceFile("app/admin/_components/admin-case-detail-page.tsx");

    expect(source).toContain("confirmImportantAction");
    expect(source).toContain("closeDisabled={isModalBusy}");
    expect(source).toContain("客户访问链接只显示一次。");
    expect(source).toContain("onBusyChange={setIsModalBusy}");
  });

  it("calls only API routes for admin data", () => {
    const source = adminUiFiles.map(readWorkspaceFile).join("\n");

    expect(source).toContain("/api/admin/cases");
    expect(source).toContain("/api/admin/files/");
    expect(source).toContain("/api/admin/customers");
    expect(source).toContain("/api/admin/templates");
  });

  it("uses the template-selection create flow on the new case page", () => {
    const source = readWorkspaceFile("app/admin/_components/admin-new-case-page.tsx");
    const apiSource = readWorkspaceFile("app/admin/_lib/admin-api.ts");

    expect(source).toContain("createCaseFromTemplateSelection");
    expect(apiSource).toContain("/api/admin/cases/from-template-selection");
    expect(source).toContain("/api/admin/customers?q=");
    expect(source).toContain("/api/admin/templates?");
    expect(source).toContain("/api/admin/templates/${template.id}");
    expect(source).toContain("/token/create");
    expect(source).not.toContain("/apply-template");
    expect(source).not.toContain('apiPost<CreatedCase>("/api/admin/cases"');
    expect(source).not.toContain("sourceTemplateId");
    expect(source).not.toContain("tokenHash");
    expect(source).not.toContain("storagePath");
    expect(source).not.toContain("storageBucket");
  });
});
