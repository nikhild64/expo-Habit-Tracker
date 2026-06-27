import { Injectable, OnDestroy, inject } from '@angular/core';
import { SwUpdate, VersionEvent } from '@angular/service-worker';

import { ToastService } from './toast.service';

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min

/**
 * AppUpdatesService — surfaces ngsw version updates as a one-tap toast.
 *
 * Subscribes to `SwUpdate.versionUpdates` and shows a non-destructive
 * "A new version is ready" toast with an inline `Reload` action whenever
 * the installed service worker has activated a fresh app version.
 *
 * Also runs `swUpdate.checkForUpdate()` every 30 min so long-lived PWA
 * sessions (e.g. desktop installed) pick up backend deploys without
 * waiting for the next hard reload.
 *
 * Started from the root `App` component via `start()` (idempotent) so the
 * subscription's lifetime is tied to the app shell, not any single page.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdatesService implements OnDestroy {
  private readonly swUpdate = inject(SwUpdate);
  private readonly toast = inject(ToastService);

  private started = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private subscription: { unsubscribe: () => void } | null = null;

  start(): void {
    if (this.started) return;
    if (!this.swUpdate.isEnabled) return;
    this.started = true;

    this.subscription = this.swUpdate.versionUpdates.subscribe((evt: VersionEvent) => {
      if (evt.type === 'VERSION_READY') {
        this.toast.info('A new version is ready', {
          actionLabel: 'Reload',
          duration: 15_000,
          onAction: () => {
            if (typeof document !== 'undefined') document.location.reload();
          },
        });
      }
    });

    this.pollTimer = setInterval(() => {
      void this.swUpdate.checkForUpdate().catch(() => false);
    }, CHECK_INTERVAL_MS);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.subscription?.unsubscribe();
  }
}
