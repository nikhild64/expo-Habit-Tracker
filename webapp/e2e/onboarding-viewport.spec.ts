import { test, expect, type Page } from '@playwright/test';

/**
 * Per-viewport verification for the onboarding-screen scroll fix.
 *
 * For each of the four viewport sizes called out in the bug report we:
 *   1. Wipe IndexedDB/localStorage so the onboarding-guard doesn't redirect.
 *   2. Navigate to /onboarding.
 *   3. Click "Next" through all 6 slides, screenshotting each one.
 *   4. Assert documentElement + body cannot scroll vertically AND the
 *      onboarding `.page` itself reports zero overflow on every slide.
 *
 * The test is intentionally separate from `smoke.spec.ts` so future
 * regressions in viewport layout fail with a focused stack trace.
 */
const VIEWPORTS = [
  { name: 'iphone-se-375x667',  width: 375,  height: 667  },
  { name: 'iphone-11-414x896',  width: 414,  height: 896  },
  { name: 'pixel-5-360x800',    width: 360,  height: 800  },
  { name: 'desktop-1440x900',   width: 1440, height: 900  },
];

async function resetAppState(page: Page): Promise<void> {
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
      indexedDB.deleteDatabase('habitly');
    } catch {
      // Best-effort.
    }
  });
}

async function assertNoVerticalScroll(page: Page, label: string): Promise<void> {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const pageEl = document.querySelector<HTMLElement>('app-onboarding-page .page');
    return {
      rootScroll:  root.scrollHeight,
      rootClient:  root.clientHeight,
      bodyScroll:  body.scrollHeight,
      bodyClient:  body.clientHeight,
      pageScroll:  pageEl?.scrollHeight ?? 0,
      pageClient:  pageEl?.clientHeight ?? 0,
      pageOffsetH: pageEl?.offsetHeight ?? 0,
    };
  });

  // `scrollHeight` may exceed `clientHeight` by 1px due to sub-pixel
  // rendering. We tolerate that single pixel everywhere.
  expect(
    metrics.rootScroll - metrics.rootClient,
    `[${label}] <html> overflows by ${metrics.rootScroll - metrics.rootClient}px`,
  ).toBeLessThanOrEqual(1);
  expect(
    metrics.bodyScroll - metrics.bodyClient,
    `[${label}] <body> overflows by ${metrics.bodyScroll - metrics.bodyClient}px`,
  ).toBeLessThanOrEqual(1);
  expect(
    metrics.pageScroll - metrics.pageClient,
    `[${label}] .page overflows by ${metrics.pageScroll - metrics.pageClient}px`,
  ).toBeLessThanOrEqual(1);
}

test.describe('Onboarding viewport fit', () => {
  for (const vp of VIEWPORTS) {
    test(`fits within ${vp.width}x${vp.height} (${vp.name})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await resetAppState(page);
      await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
      // Give the bottom-sheet + scroller a frame to settle.
      await page.waitForTimeout(150);

      const SLIDE_LABELS = ['intro', 'notify', 'accent', 'streaks', 'templates', 'first'];

      for (let i = 0; i < SLIDE_LABELS.length; i++) {
        const slideLabel = `${vp.name} / slide ${i + 1} (${SLIDE_LABELS[i]})`;

        await assertNoVerticalScroll(page, slideLabel);
        await page.screenshot({
          path: `playwright-report/onboarding-${vp.name}-slide-${i + 1}-${SLIDE_LABELS[i]}.png`,
          fullPage: false,
        });

        if (i < SLIDE_LABELS.length - 1) {
          await page.getByRole('button', { name: /^Next slide$/ }).click();
          await page.waitForTimeout(350);
        }
      }
    });
  }
});
