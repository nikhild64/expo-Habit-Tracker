import { test, expect, type Page } from '@playwright/test';

/**
 * Habitly smoke e2e — boots a fresh PWA, walks through onboarding, adds
 * one quick-start habit, and asserts the Today screen renders it.
 *
 * We deliberately don't exercise the completion-toggle path here because
 * it runs through CDK drag-drop / pointer-events that need a more
 * involved setup; the smoke is only meant to guard against gross
 * regressions in the shell + onboarding + add-habit pipeline.
 *
 * The test wipes IndexedDB + localStorage before each run so a partially
 * onboarded developer machine doesn't poison results.
 */
async function resetAppState(page: Page): Promise<void> {
  // Visit root once so we have a same-origin context; ignore any guard
  // redirects (we'll wipe storage right after).
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    try {
      const fac = indexedDB as IDBFactory & {
        databases?: () => Promise<IDBDatabaseInfo[]>;
      };
      const dbs = (await fac.databases?.()) ?? [];
      for (const db of dbs) {
        if (db.name) indexedDB.deleteDatabase(db.name);
      }
      // Belt-and-braces: drop the named DB even if `databases()` is
      // unavailable (older browsers).
      indexedDB.deleteDatabase('habitly');
    } catch {
      // Best-effort — even if this throws the test still navigates fresh
      // below; the worst case is a partial re-onboarding.
    }
  });
}

test.describe('Habitly PWA smoke', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page);
  });

  test('onboarding → first habit → Today renders it', async ({ page }) => {
    // Jump directly to /onboarding so the test doesn't depend on the
    // onboarding-guard's IDB-readiness race (which is exercised in the
    // guard's own unit test, not here).
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });

    // Click "Next" 5 times to advance through the 6-slide pager
    // (intro → notify → accent → streaks → templates → first).
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: /^Next slide$/ }).click();
      // The pager uses scroll-snap + IntersectionObserver — give the
      // current-slide signal a beat to advance before clicking again.
      await page.waitForTimeout(350);
    }

    // The "Drink Water" quick-add chip lives on slide 6.
    await page.getByRole('button', { name: /^Add Drink Water$/ }).click();

    // Finish onboarding via the "Let's go!" CTA. The aria-label is
    // "Finish onboarding" regardless of label text.
    await page.getByRole('button', { name: /Finish onboarding/ }).click();

    // Should land on Today (root route).
    await expect(page).toHaveURL('http://localhost:4200/');

    // The habit should render in the Today list.
    await expect(page.getByText('Drink Water', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });
});
