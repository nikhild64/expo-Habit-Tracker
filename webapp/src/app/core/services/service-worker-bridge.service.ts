import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

import { HabitsService } from './habits.service';
import { PushTokenService } from './push-token.service';
import { ToastService } from './toast.service';

/**
 * Messages the service worker can post back to a focused client. Mirrors
 * the `postMessage` calls in `src/service-worker/push-worker.ts`.
 *
 *  - `NAVIGATE`            → user tapped a regular notification while a
 *                             window was already open; we should focus +
 *                             route to the deep-link target.
 *  - `HABIT_DONE_FROM_PUSH`→ user tapped the "Done ✓" action button on a
 *                             habit-reminder notification. Mark it done +
 *                             show a small confirmation toast.
 *  - `SNOOZE_HABIT`        → user tapped the "Snooze 10 min" action. The
 *                             SW can't authenticate the backend call
 *                             itself, so we do it here from the page.
 */
type IncomingSwMessage =
  | { type: 'NAVIGATE'; url: string }
  | { type: 'HABIT_DONE_FROM_PUSH'; habitId: string }
  | { type: 'SNOOZE_HABIT'; habitId: string; minutes?: number };

/**
 * ServiceWorkerBridgeService — listens for postMessages from the custom
 * push handler appended to `ngsw-worker.js` (see push-worker.ts) and
 * routes them into the app's signal-based services.
 *
 * Started from the root component (`App`) so it's always running while the
 * PWA is open. Idempotent — `start()` may be called multiple times and
 * only attaches the listener once.
 */
@Injectable({ providedIn: 'root' })
export class ServiceWorkerBridgeService {
  private readonly router = inject(Router);
  private readonly habits = inject(HabitsService);
  private readonly pushToken = inject(PushTokenService);
  private readonly toast = inject(ToastService);

  private started = false;

  start(): void {
    if (this.started) return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    this.started = true;

    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data as IncomingSwMessage | null;
      if (!data || typeof data !== 'object' || !('type' in data)) return;
      void this.handle(data);
    });
  }

  private async handle(msg: IncomingSwMessage): Promise<void> {
    switch (msg.type) {
      case 'NAVIGATE':
        if (msg.url) void this.router.navigateByUrl(msg.url);
        return;

      case 'HABIT_DONE_FROM_PUSH': {
        const habit = this.habits.habits().find(h => h.id === msg.habitId);
        if (!habit) return;
        const res = await this.habits.markDone(msg.habitId);
        if (res.wasAdded) {
          this.toast.success(`${habit.name} marked done`);
        }
        return;
      }

      case 'SNOOZE_HABIT': {
        const habit = this.habits.habits().find(h => h.id === msg.habitId);
        const minutes = msg.minutes ?? 10;
        await this.pushToken.snooze(msg.habitId, minutes);
        this.toast.info(`Snoozed${habit ? ` "${habit.name}"` : ''} for ${minutes} min`);
        return;
      }
    }
  }
}
