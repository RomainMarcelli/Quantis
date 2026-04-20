import { expect, test } from "@playwright/test";
import {
  addUploadFile,
  disableAnonymousOnboarding,
  mockAnalysesApi,
  resetOnboardingStorage
} from "./helpers";

const loginEmail = process.env.E2E_LOGIN_EMAIL ?? "e2e.user@quantis.test";
const loginPassword = process.env.E2E_LOGIN_PASSWORD ?? "E2E-password-123!";

test.describe("Critical flow", () => {
  test.beforeEach(async ({ page }) => {
    await resetOnboardingStorage(page);
    await mockAnalysesApi(page);
  });

  test("arrivee -> onboarding -> upload -> inscription", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Suivant" })).toBeVisible();

    await page.getByRole("button", { name: "Suivant" }).click();
    await expect(page).toHaveURL(/\/upload/);

    await addUploadFile(page);
    await expect(page.getByRole("heading", { name: /contexte entreprise/i })).toBeVisible();

    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /cr.+ation de compte/i })).toBeVisible();
  });

  test("connexion -> redirection /synthese + guide 1ere connexion", async ({ page }) => {
    await disableAnonymousOnboarding(page);
    await page.goto("/login?next=/synthese");
    await expect(page).toHaveURL(/\/login/);

    await page.locator('input[type="email"]').first().fill(loginEmail);
    await page.locator('input[type="password"]').first().fill(loginPassword);
    await page.getByRole("button", { name: /se connecter/i }).click();

    await expect(page).toHaveURL(/\/synthese/);
    const startGuideButton = page.getByRole("button", { name: /c'est parti|suivant/i }).first();
    await expect(startGuideButton).toBeVisible();

    const noNeedButton = page.getByRole("button", { name: /pas besoin/i });
    if ((await noNeedButton.count()) > 0) {
      await noNeedButton.click();
    } else {
      await page.getByRole("button", { name: "Stop" }).click();
    }
    await page.reload();

    await expect(page.getByRole("button", { name: /c'est parti|suivant/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /pas besoin|stop/i })).toHaveCount(0);
  });

  test("precedent revient correctement de register vers upload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Suivant" }).click();
    await expect(page).toHaveURL(/\/upload/);

    await addUploadFile(page);
    await expect(page.getByRole("heading", { name: /contexte entreprise/i })).toBeVisible();

    await page.getByRole("button", { name: "Suivant" }).click();
    await expect(page.getByRole("heading", { name: /lancer l'analyse/i })).toBeVisible();

    await page.getByRole("button", { name: "Suivant" }).click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByRole("heading", { name: /connexion ou inscription/i })).toBeVisible();

    await page.getByRole("button", { name: /pr.+c.+d.+nt/i }).click();
    await expect(page).toHaveURL(/\/upload/);
    await expect(page.getByRole("heading", { name: /lancer l'analyse/i })).toBeVisible();
  });
});
