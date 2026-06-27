import {
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';

/**
 * Habitly app configuration.
 *
 * - Angular 21 ships zoneless change detection by default — no
 *   `provideZonelessChangeDetection()` call is needed (and we deliberately
 *   leave `provideZoneChangeDetection` out so we don't override that).
 * - `withComponentInputBinding()` lets route params flow into screens via
 *   `input()` signals (so `/habit/:id` → `id = input.required<string>()`).
 * - `withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })` keeps
 *   scroll position on back navigation (matches the mobile back-button feel).
 * - `withViewTransitions()` opts into the View Transitions API where
 *   supported — gives smooth page transitions on Chromium with zero JS.
 * - Service worker registered with the standard `registerWhenStable:30000`
 *   strategy. Phase-1's `ngsw-config.json` covers app-shell + asset caches;
 *   the custom Web Push handler is appended via `scripts/append-push-worker.mjs`
 *   in a later phase.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
      withViewTransitions(),
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
