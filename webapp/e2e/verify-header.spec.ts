/**
 * Manual-verification screenshots for the global `<app-app-header>` and the
 * brand favicon. Not part of the regular smoke pass — run on demand via
 * `npx playwright test e2e/verify-header.spec.ts`.
 *
 * Covers:
 *  - Tab routes (`/`, `/settings`) — header visible.
 *  - Stack route (`/insights`) — header visible.
 *  - Full-bleed `/onboarding` — header hidden.
 *  - Full-bleed `/lock` — header hidden.
 *  - `/favicon.ico` returns 200 with the brand bytes.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/.shots';
mkdirSync(SHOTS, { recursive: true });

async function reset(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    try {
      const fac = indexedDB as IDBFactory & {
        databases?: () => Promise<IDBDatabaseInfo[]>;
      };
      const dbs = (await fac.databases?.()) ?? [];
      for (const db of dbs) if (db.name) indexedDB.deleteDatabase(db.name);
      indexedDB.deleteDatabase('habitly');
    } catch {
      /* ignored */
    }
  });
}

/** Walk the 6-slide onboarding pager and finish via the "Let's go!" CTA.
 *  Identical to the smoke-test helper so we know the OnboardingService
 *  signals end up populated through the same path the user takes. */
async function completeOnboarding(page: Page): Promise<void> {
  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: /^Next slide$/ }).click();
    await page.waitForTimeout(350);
  }
  await page.getByRole('button', { name: /^Add Drink Water$/ }).click();
  await page.getByRole('button', { name: /Finish onboarding/ }).click();
  await page.waitForURL('http://localhost:4200/', { timeout: 10_000 });
}

test.describe('App header + favicon visual checks', () => {
  test.beforeEach(async ({ page }) => {
    await reset(page);
  });

  test('header hidden on /onboarding (full-bleed)', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('app-app-header header.app-header')).toHaveCount(0);
    await expect(page.locator('body')).toHaveClass(/no-app-header/);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/onboarding.png`, fullPage: false });
  });

  test('header hidden on /lock (full-bleed)', async ({ page }) => {
    await page.goto('/lock', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('app-app-header header.app-header')).toHaveCount(0);
    await expect(page.locator('body')).toHaveClass(/no-app-header/);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/lock.png`, fullPage: false });
  });

  test('favicon returns 200 with PNG/ICO bytes', async ({ request }) => {
    const res = await request.get('/favicon.ico');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/x-icon');
    const body = await res.body();
    // ICO file starts with 0x00 0x00 0x01 0x00.
    expect(body[0]).toBe(0);
    expect(body[1]).toBe(0);
    expect(body[2]).toBe(1);
    expect(body[3]).toBe(0);
    // Three images stored: 16, 32, 48.
    expect(body[4]).toBe(3);
  });

  test.describe('after onboarding', () => {
    test.beforeEach(async ({ page }) => {
      await completeOnboarding(page);
    });

    test('header visible on Today (tab route)', async ({ page }) => {
      const header = page.locator('app-app-header header.app-header');
      await expect(header).toBeVisible();
      await expect(header.locator('.brand-name')).toHaveText('Habitly');
      await expect(page.locator('body')).not.toHaveClass(/no-app-header/);
      // Wait for the Today page hydration to settle so screenshots aren't
      // captured mid-route-transition. The habit row + tab bar are the
      // last things to paint after the onboarding redirect resolves.
      await expect(page.locator('app-tab-bar .tab').first()).toBeVisible();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SHOTS}/today.png`, fullPage: false });
    });

    test('header visible on /insights (stack route)', async ({ page }) => {
      await page.goto('/insights', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('app-app-header header.app-header')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${SHOTS}/insights.png`, fullPage: false });
    });

    test('header visible on /settings (tab)', async ({ page }) => {
      await page.goto('/settings', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('app-app-header header.app-header')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${SHOTS}/settings.png`, fullPage: false });
    });

    test('theme toggle flips between sunny + moon', async ({ page }) => {
      const toggle = page.locator('app-app-header .theme-toggle');
      await expect(toggle).toBeVisible();
      const firstLabel = await toggle.getAttribute('aria-label');
      await toggle.click();
      await expect
        .poll(async () => toggle.getAttribute('aria-label'))
        .not.toEqual(firstLabel);
    });
  });
});
