import { expect, test } from "@playwright/test";

const adminStorageState = process.env.E2E_ADMIN_STORAGE_STATE;
const forbiddenAdminRuntimeFields = [
  "tokenHash",
  "storagePath",
  "storageBucket",
  "signedUrl",
];

test.describe("authenticated admin runtime smoke", () => {
  test.skip(
    !adminStorageState,
    "Set E2E_ADMIN_STORAGE_STATE to run authenticated Admin click flow.",
  );

  test.use({ storageState: adminStorageState ?? undefined });

  test("case list and new case navigation render without console errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/admin/cases");

    await expect(page.locator("body")).toContainText(/案件列表|新建案件/);
    const newCaseLink = page.getByRole("link", { name: /新建案件/ }).first();
    await expect(newCaseLink).toBeVisible();

    await newCaseLink.click();
    await expect(page).toHaveURL(/\/admin\/cases\/new/);
    await expect(page.locator("body")).toContainText(/新建案件|客户|申请签证/);

    const body = await page.locator("body").innerText();
    for (const field of forbiddenAdminRuntimeFields) {
      expect(body).not.toContain(field);
    }

    expect(errors).toEqual([]);
  });

  test("case detail renders without raw transport fields", async ({ page }) => {
    const caseId = process.env.E2E_CASE_ID;
    test.skip(!caseId, "Set E2E_CASE_ID to run case detail smoke.");

    await page.goto(`/admin/cases/${caseId}`);
    await expect(page.locator("body")).toContainText(/案件详情/);

    const body = await page.locator("body").innerText();
    for (const field of forbiddenAdminRuntimeFields) {
      expect(body).not.toContain(field);
    }
  });
});
