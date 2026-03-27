import type { Page } from "@playwright/test";

export const ONBOARDING_COMPLETED_KEY = "quantis.onboarding.completedByAudience";
export const ONBOARDING_PROGRESS_KEY = "quantis.onboarding.progress";
export const ONBOARDING_LEGACY_COMPLETED_KEY = "quantis.onboarding.completed";

export async function resetOnboardingStorage(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(
    ([completedKey, progressKey, legacyCompletedKey]) => {
      window.localStorage.removeItem(completedKey);
      window.localStorage.removeItem(progressKey);
      window.localStorage.removeItem(legacyCompletedKey);
    },
    [ONBOARDING_COMPLETED_KEY, ONBOARDING_PROGRESS_KEY, ONBOARDING_LEGACY_COMPLETED_KEY]
  );
}

export async function mockAnalysesApi(page: Page): Promise<void> {
  await page.route("**/api/analyses", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        analysisDraft: {
          folderName: "Dossier principal",
          createdAt: new Date("2026-03-27T10:00:00.000Z").toISOString()
        }
      })
    });
  });
}

export async function addUploadFile(page: Page): Promise<void> {
  await page
    .locator('input[type="file"][accept=".xlsx,.xls,.csv"]')
    .setInputFiles({
    name: "sample.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("colA,colB\n1,2\n")
  });
  await page.getByText("sample.csv").first().waitFor({ state: "visible", timeout: 6_000 });
}

export async function disableAnonymousOnboarding(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate((completedKey) => {
    let parsed: { anonymous?: boolean; authenticated?: boolean } = {};
    try {
      const raw = window.localStorage.getItem(completedKey);
      parsed = raw ? (JSON.parse(raw) as { anonymous?: boolean; authenticated?: boolean }) : {};
    } catch {
      parsed = {};
    }

    parsed.anonymous = true;
    window.localStorage.setItem(completedKey, JSON.stringify(parsed));
    window.localStorage.removeItem("quantis.onboarding.progress");
  }, ONBOARDING_COMPLETED_KEY);
}
