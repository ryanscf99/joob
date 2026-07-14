import { expect, test } from "@playwright/test";

test("guest can discover youth filters and account fallback", async ({ page }) => {
  await page.goto("/jobs");
  await page.getByText("Youth-focused filters").click();
  await expect(page.getByText("Youth-friendly")).toBeVisible();
  await page.goto("/auth");
  await expect(page.getByRole("heading", { name: "Your jOOB account" })).toBeVisible();
});
