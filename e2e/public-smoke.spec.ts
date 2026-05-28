import { expect, test } from "@playwright/test";

const forbiddenPortalFields = [
  "internalNote",
  "storagePath",
  "storageBucket",
  "tokenHash",
  "signedUrl",
  "originalFileName",
];

function isExpectedBrowserNoise(message: string) {
  return (
    message.includes("Failed to load resource") &&
    (message.includes("401") ||
      message.includes("403") ||
      message.includes("Unauthorized"))
  );
}

test.describe("public runtime smoke", () => {
  test("invalid portal token shows a safe error state", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`/portal/invalid-e2e-${Date.now()}`);

    await expect(page.locator("body")).toContainText(
      /链接|无效|过期|联系|事务所|Invalid/i,
    );

    const body = await page.locator("body").innerText();
    for (const field of forbiddenPortalFields) {
      expect(body).not.toContain(field);
    }

    expect(errors.filter((message) => !isExpectedBrowserNoise(message))).toEqual([]);
  });

  test("admin pages require login before showing case data", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/admin/cases");

    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.locator("body")).toContainText(/登录后台管理|后台登录|Google/);

    const body = await page.locator("body").innerText();
    expect(body).not.toContain("tokenHash");
    expect(body).not.toContain("storagePath");
    expect(body).not.toContain("storageBucket");

    expect(errors).toEqual([]);
  });
});
