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

/** Pre-populate the `habitly` IDB with `onboarding_v1=done` so the
 *  onboarding-guard lets routes through without manually walking the
 *  6-slide pager. The OnboardingService caches the value on boot, so
 *  the page must be reloaded after this returns. */
async function markOnboarded(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('habitly', 1);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains('kv')) {
          open.result.createObjectStore('kv');
        }
      };
      open.onsuccess = () => {
        const tx = open.result.transaction('kv', 'readwrite');
        tx.objectStore('kv').put('done', 'onboarding_v1');
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

test.describe('App header + favicon visual checks', () => {
  test.beforeEach(async ({ page }) => {
    await reset(page);
    await markOnboarded(page);
    // After `markOnboarded` reload the app sits on /onboarding (the guard
    // had redirected there during the reset), but the IDB now says we're
    // onboarded — `await page.goto('/')` in each test re-runs the guards
    // against the cached signal and lets us through to the tab routes.
  });

  test('header visible on Today (tab route)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL('http://localhost:4200/');
    const header = page.locator('app-app-header header.app-header');
    await expect(header).toBeVisible();
    await expect(header.locator('.brand-name')).toHaveText('Habitly');
    await expect(page.locator('body')).not.toHaveClass(/no-app-header/);
    await page.screenshot({ path: `${SHOTS}/today.png`, fullPage: false });
  });

  test('header visible on /insights (stack route)', async ({ page }) => {
    await page.goto('/insights', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('app-app-header header.app-header')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/insights.png`, fullPage: false });
  });

  test('header visible on /settings (tab)', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('app-app-header header.app-header')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/settings.png`, fullPage: false });
  });

  test('header hidden on /onboarding (full-bleed)', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('app-app-header header.app-header')).toHaveCount(0);
    await expect(page.locator('body')).toHaveClass(/no-app-header/);
    await page.screenshot({ path: `${SHOTS}/onboarding.png`, fullPage: false });
  });

  test('header hidden on /lock (full-bleed)', async ({ page }) => {
    await page.goto('/lock', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('app-app-header header.app-header')).toHaveCount(0);
    await expect(page.locator('body')).toHaveClass(/no-app-header/);
    await page.screenshot({ path: `${SHOTS}/lock.png`, fullPage: false });
  });

  test('theme toggle flips between sunny + moon', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const toggle = page.locator('app-app-header .theme-toggle');
    await expect(toggle).toBeVisible();
    const firstLabel = await toggle.getAttribute('aria-label');
    await toggle.click();
    await expect
      .poll(async () => toggle.getAttribute('aria-label'))
      .not.toEqual(firstLabel);
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
});
