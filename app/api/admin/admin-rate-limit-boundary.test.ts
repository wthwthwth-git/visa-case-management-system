import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adminTokenMutationRoutes = [
  "app/api/admin/cases/[caseId]/token/create/route.ts",
  "app/api/admin/cases/[caseId]/token/regenerate/route.ts",
  "app/api/admin/cases/[caseId]/token/revoke/route.ts",
];

const adminUploadRoutes = ["app/api/admin/requirements/[requirementId]/files/route.ts"];

const adminDestructiveRoutes = [
  "app/api/admin/cases/route.ts",
  "app/api/admin/cases/[caseId]/application-confirmations/route.ts",
  "app/api/admin/cases/[caseId]/apply-template/route.ts",
  "app/api/admin/cases/[caseId]/immigration-requests/route.ts",
  "app/api/admin/cases/[caseId]/phase/route.ts",
  "app/api/admin/requirements/[requirementId]/status/route.ts",
];

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin rate limit route boundary", () => {
  it("protects token mutation routes with admin_token_mutation", () => {
    for (const route of adminTokenMutationRoutes) {
      const source = readWorkspaceFile(route);

      expect(source, route).toContain("requireAdminRateLimit");
      expect(source, route).toContain('routeGroup: "admin_token_mutation"');
      expect(source, route).toMatch(
        /const adminContext = await requireAdminAuth\(request\);\s+await requireAdminCsrf\(request\);\s+await requireAdminRateLimit/,
      );
    }
  });

  it("protects admin upload routes with admin_upload", () => {
    for (const route of adminUploadRoutes) {
      const source = readWorkspaceFile(route);

      expect(source, route).toContain("requireAdminUploadRateLimit");
      expect(source, route).toMatch(
        /const adminContext = await requireAdminAuth\(request\);\s+await requireAdminCsrf\(request\);/,
      );
    }
  });

  it("protects destructive admin mutation routes with admin_destructive", () => {
    for (const route of adminDestructiveRoutes) {
      const source = readWorkspaceFile(route);

      expect(source, route).toContain("requireAdminRateLimit");
      expect(source, route).toContain('routeGroup: "admin_destructive"');
    }
  });

  it("does not introduce Redis or KV dependencies", () => {
    const rateLimitSources = [
      "lib/rate-limit/types.ts",
      "lib/rate-limit/in-memory.ts",
      "lib/rate-limit/limiter.ts",
      "lib/rate-limit/keys.ts",
      "lib/rate-limit/policies.ts",
      "lib/rate-limit/audit.ts",
    ]
      .map(readWorkspaceFile)
      .join("\n");

    expect(rateLimitSources).not.toMatch(/redis|upstash|vercel\/kv|@vercel\/kv/i);
  });
});
