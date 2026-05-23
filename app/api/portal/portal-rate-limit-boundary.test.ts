import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const portalProtectedRoutes = [
  "app/api/portal/[token]/case/route.ts",
  "app/api/portal/[token]/files/[fileId]/signed-url/route.ts",
  "app/api/portal/[token]/application-confirmations/[confirmationId]/signed-url/route.ts",
  "app/api/portal/[token]/requirements/[requirementId]/files/route.ts",
  "app/api/portal/[token]/application-confirmations/[confirmationId]/confirm/route.ts",
  "app/api/portal/[token]/application-confirmations/[confirmationId]/request-revision/route.ts",
];

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("portal rate limit route boundary", () => {
  it("uses pre-validation limiter before explicit token validation", () => {
    for (const route of portalProtectedRoutes) {
      const source = readWorkspaceFile(route);
      const preIndex = source.indexOf("requirePortalPreValidationRateLimit");
      const validateIndex = source.indexOf("validatePortalToken");

      expect(preIndex, route).toBeGreaterThanOrEqual(0);
      expect(validateIndex, route).toBeGreaterThan(preIndex);
    }
  });

  it("uses post-validation limiter before calling protected portal services", () => {
    const caseRoute = readWorkspaceFile("app/api/portal/[token]/case/route.ts");
    const signedUrlRoute = readWorkspaceFile("app/api/portal/[token]/files/[fileId]/signed-url/route.ts");
    const confirmationSignedUrlRoute = readWorkspaceFile(
      "app/api/portal/[token]/application-confirmations/[confirmationId]/signed-url/route.ts",
    );
    const uploadRoute = readWorkspaceFile(
      "app/api/portal/[token]/requirements/[requirementId]/files/route.ts",
    );
    const confirmationConfirmRoute = readWorkspaceFile(
      "app/api/portal/[token]/application-confirmations/[confirmationId]/confirm/route.ts",
    );
    const confirmationRevisionRoute = readWorkspaceFile(
      "app/api/portal/[token]/application-confirmations/[confirmationId]/request-revision/route.ts",
    );

    expect(caseRoute.indexOf("requirePortalPostValidationRateLimit")).toBeLessThan(
      caseRoute.indexOf("getPortalCaseByToken"),
    );
    expect(signedUrlRoute.indexOf("requirePortalPostValidationRateLimit")).toBeLessThan(
      signedUrlRoute.indexOf("getPortalFileDownloadUrl"),
    );
    expect(confirmationSignedUrlRoute.indexOf("requirePortalPostValidationRateLimit")).toBeLessThan(
      confirmationSignedUrlRoute.indexOf("createPortalApplicationConfirmationSignedUrl"),
    );
    expect(uploadRoute.indexOf("requirePortalUploadRateLimit")).toBeLessThan(
      uploadRoute.indexOf("uploadPortalDocumentFile"),
    );
    expect(confirmationConfirmRoute.indexOf("requirePortalPostValidationRateLimit")).toBeLessThan(
      confirmationConfirmRoute.indexOf("confirmPortalApplicationConfirmation"),
    );
    expect(confirmationRevisionRoute.indexOf("requirePortalPostValidationRateLimit")).toBeLessThan(
      confirmationRevisionRoute.indexOf("requestPortalApplicationConfirmationRevision"),
    );
  });

  it("does not import admin services or admin csrf", () => {
    const source = portalProtectedRoutes.map(readWorkspaceFile).join("\n");

    expect(source).not.toContain("adminServices");
    expect(source).not.toContain("@/lib/api/csrf");
    expect(source).not.toContain("requireAdminCsrf");
  });
});
