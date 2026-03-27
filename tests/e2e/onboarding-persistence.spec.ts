import { expect, test } from "@playwright/test";
import { resetOnboardingStorage } from "./helpers";

test.describe("Onboarding persistence", () => {
  test.beforeEach(async ({ page }) => {
    await resetOnboardingStorage(page);
  });

  test("conserve l'etape en cours apres reload", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Suivant" })).toBeVisible();
    await page.getByRole("button", { name: "Suivant" }).click();

    await expect(page).toHaveURL(/\/upload/);
    await expect(page.getByRole("heading", { name: /d[ée]poser un fichier/i })).toBeVisible();
    await expect.poll(async () => {
      return page.evaluate(() => window.localStorage.getItem("quantis.onboarding.progress"));
    }).toContain("tour-upload-dropzone");

    await page.reload();

    await expect(page.getByRole("heading", { name: /d[ée]poser un fichier/i })).toBeVisible();
  });

  test("minimise puis reouvre le widget", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: /reduire le guide/i }).click();
    await expect(page.getByRole("button", { name: /reouvrir le guide/i })).toBeVisible();

    await page.getByRole("button", { name: /reouvrir le guide/i }).click();
    await expect(page.getByRole("button", { name: "Suivant" })).toBeVisible();
  });

  test("Stop ferme le guide durablement jusqu'a relance manuelle", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByRole("button", { name: "Suivant" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("button", { name: "Suivant" })).toHaveCount(0);

    await page.goto("/settings");
    await page.getByRole("button", { name: /revoir le guide/i }).click();

    await expect(page.getByRole("button", { name: "Suivant" })).toBeVisible();
  });
});
