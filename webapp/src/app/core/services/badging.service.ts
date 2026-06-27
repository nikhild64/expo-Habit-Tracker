import { Injectable } from '@angular/core';

interface AppBadgeNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

/**
 * BadgingService — thin wrapper around the App Badging API.
 *
 * Supported on:
 *  - Chrome / Edge on desktop + Android (when PWA is installed)
 *  - Safari 17.5+ on iOS once added to Home Screen
 *  - Silent no-op everywhere else (notably Firefox).
 *
 * Called by HabitsService.commit() on every state change so the installed
 * PWA's home-screen icon shows the count of habits still pending today.
 */
@Injectable({ providedIn: 'root' })
export class BadgingService {
  private get nav(): AppBadgeNavigator | null {
    return typeof navigator !== 'undefined' ? (navigator as unknown as AppBadgeNavigator) : null;
  }

  set(count: number): void {
    const n = this.nav;
    if (!n?.setAppBadge) return;
    void n.setAppBadge(count).catch(() => null);
  }

  clear(): void {
    const n = this.nav;
    if (!n?.clearAppBadge) return;
    void n.clearAppBadge().catch(() => null);
  }
}
