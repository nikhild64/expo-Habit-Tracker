import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the Habitly smoke e2e.
 *
 * - Auto-starts `ng serve` on port 4200 before the suite, reuses an existing
 *   dev-server when one is already running (faster local iteration).
 * - Runs only Chromium for the smoke pass — adding Firefox + WebKit happens
 *   downstream if the smoke proves stable.
 * - HTML report is the only built-in reporter so CI logs stay readable;
 *   open with `npx playwright show-report`.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    timeout: 180_000,
    // Always start a fresh dev server so stale code from a previous
    // session doesn't poison results. If port 4200 is already in use,
    // Playwright will fail with a clear error instead of silently
    // reusing the wrong app.
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
