import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adminMutationRoutes = [
  "app/api/admin/cases/route.ts",
  "app/api/admin/cases/[caseId]/route.ts",
  "app/api/admin/cases/[caseId]/application-confirmations/route.ts",
  "app/api/admin/cases/[caseId]/apply-template/route.ts",
  "app/api/admin/cases/[caseId]/immigration-requests/route.ts",
  "app/api/admin/cases/[caseId]/phase/route.ts",
  "app/api/admin/cases/[caseId]/token/create/route.ts",
  "app/api/admin/cases/[caseId]/token/regenerate/route.ts",
  "app/api/admin/cases/[caseId]/token/revoke/route.ts",
  "app/api/admin/requirements/[requirementId]/files/route.ts",
  "app/api/admin/requirements/[requirementId]/status/route.ts",
];

const portalRoutes = [
  "app/api/portal/[token]/application-confirmations/[confirmationId]/confirm/route.ts",
  "app/api/portal/[token]/application-confirmations/[confirmationId]/request-revision/route.ts",
  "app/api/portal/[token]/requirements/[requirementId]/files/route.ts",
  "app/api/portal/[token]/files/[fileId]/signed-url/route.ts",
  "app/api/portal/[token]/application-confirmations/[confirmationId]/signed-url/route.ts",
];

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin csrf route boundary", () => {
  it("requires CSRF in all admin mutation routes", () => {
    for (const route of adminMutationRoutes) {
      const source = readWorkspaceFile(route);

      expect(source, route).toContain("requireAdminCsrf");
      expect(source, route).toMatch(
        /const adminContext = await requireAdminAuth\(request\);\s+await requireAdminCsrf\(request\);/,
      );
    }
  });

  it("does not import CSRF guard from Portal routes", () => {
    const source = portalRoutes.map(readWorkspaceFile).join("\n");

    expect(source).not.toContain("requireAdminCsrf");
    expect(source).not.toContain("@/lib/api/csrf");
  });
});
