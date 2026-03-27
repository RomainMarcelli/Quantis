import { expect, test } from "@playwright/test";
import {
  addUploadFile,
  disableAnonymousOnboarding,
  mockAnalysesApi,
  resetOnboardingStorage
} from "./helpers";

test.describe("Upload robustness", () => {
  test.beforeEach(async ({ page }) => {
    await mockAnalysesApi(page);
  });

  test("lance l'analyse juste apres drop sans perdre le fichier", async ({ page }) => {
    await disableAnonymousOnboarding(page);
    await page.goto("/upload");

    await addUploadFile(page);
    await page.getByRole("button", { name: /lancer l'analyse/i }).click();

    await expect(page).toHaveURL(/\/register\?/);
  });

  test("champs optionnels vides: l'analyse passe quand meme", async ({ page }) => {
    await disableAnonymousOnboarding(page);
    await page.goto("/upload");

    await addUploadFile(page);
    await page.getByRole("button", { name: /lancer l'analyse/i }).click();

    await expect(page).toHaveURL(/\/register\?/);
  });

  test("champs optionnels remplis: auto-passage a l'etape suivante", async ({ page }) => {
    await resetOnboardingStorage(page);
    await page.goto("/");

    await page.getByRole("button", { name: "Suivant" }).click();
    await expect(page).toHaveURL(/\/upload/);

    await addUploadFile(page);
    await expect(page.getByRole("heading", { name: /contexte entreprise/i })).toBeVisible();

    await page.getByRole("button", { name: /nombre d'employ[ée]s \(optionnel\)/i }).click();
    await page.getByRole("option", { name: /independant - 1/i }).click();

    await page.getByRole("button", { name: /secteur d'activit[ée] \(optionnel\)/i }).click();
    await page.getByRole("option", { name: /saas & edition de logiciels/i }).click();

    await expect(page.getByRole("heading", { name: /lancer l'analyse/i })).toBeVisible();
  });
});
