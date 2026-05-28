import { expect, type Page, test } from "@playwright/test";

const forbiddenPortalFields = [
  "internalNote",
  "storagePath",
  "storageBucket",
  "tokenHash",
  "signedUrl",
  "originalFileName",
];

async function expectNoForbiddenPortalFields(page: Page) {
  const body = await page.locator("body").innerText();
  for (const field of forbiddenPortalFields) {
    expect(body).not.toContain(field);
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
}

test.describe("mobile portal smoke", () => {
  test("invalid token state is readable on small screens", async ({ page }) => {
    await page.goto(`/portal/mobile-invalid-${Date.now()}`);
    await expect(page.locator("body")).toContainText(
      /链接|无效|过期|联系|事务所|Invalid/i,
    );
    await expectNoForbiddenPortalFields(page);
    await expectNoHorizontalOverflow(page);
  });

  test("valid token portal page keeps mobile-safe boundaries", async ({ page }) => {
    const token = process.env.E2E_PORTAL_TOKEN ?? "";
    test.skip(!token, "Set E2E_PORTAL_TOKEN to run valid Portal mobile smoke.");

    await page.goto(`/portal/${encodeURIComponent(token)}`);
    await expect(page.locator("body")).toContainText(
      /案件进度|提交资料|完成资料确认|客户/i,
    );
    await expectNoForbiddenPortalFields(page);
    await expectNoHorizontalOverflow(page);
  });
});
