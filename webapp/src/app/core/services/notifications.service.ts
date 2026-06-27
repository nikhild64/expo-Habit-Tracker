import { Injectable, effect, inject, signal } from '@angular/core';

import { reminderSlotsFromHabits } from '../utils/reminder-slots.util';
import { HabitsService } from './habits.service';
import { PushTokenService } from './push-token.service';
import { QuietHoursService } from './quiet-hours.service';

export type PermissionState = 'default' | 'granted' | 'denied';

/**
 * NotificationsService — port of src/lib/notifications/setup.ts for the web.
 *
 * Responsibilities:
 *  - Track + expose the browser's current `Notification.permission` value
 *    as a signal so the Today permission banner + Settings row stay
 *    reactive.
 *  - Provide `requestPermission()` — must be called from a click handler
 *    on iOS Safari 16.4+ (otherwise the prompt is silently suppressed) —
 *    AND, on success, auto-subscribe to Web Push + register with the
 *    backend.
 *  - Fire a foreground `new Notification(...)` while honouring quiet hours
 *    (for in-tab reminders while the PWA is open).
 *  - Wire a signal `effect()` that POSTs the per-sub reminder schedule to
 *    the backend whenever the habit list or quiet-hours window changes,
 *    so the server-side cron tick has a fresh view of the user's intent.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly quietHours = inject(QuietHoursService);
  private readonly pushToken  = inject(PushTokenService);
  private readonly habits     = inject(HabitsService);

  /** Current OS-level permission. 'default' = the user has not been asked. */
  readonly permission = signal<PermissionState>(this.readPermission());
  /** True when the runtime exposes the Notification API at all. */
  readonly supported = signal<boolean>(typeof Notification !== 'undefined');

  /** Debounce timer for the schedule-sync effect so a burst of habit edits collapses to one POST. */
  private syncDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Auto-sync the per-sub schedule whenever the user's habits or quiet
    // hours change. The actual POST is debounced 800 ms so a rapid sequence
    // of edits (drag-reorder, bulk import) coalesces into one network call.
    effect(() => {
      const habits = this.habits.habits();
      // Touch the QH + subscription signals so the effect re-runs whenever
      // DND changes or we acquire/lose the live subscription object.
      void this.quietHours.value();
      const sub = this.pushToken.subscription();

      if (!sub) return; // No sub → nothing to sync.

      if (this.syncDebounce) clearTimeout(this.syncDebounce);
      this.syncDebounce = setTimeout(() => {
        this.syncDebounce = null;
        const slots = reminderSlotsFromHabits(habits);
        void this.pushToken.syncSchedule(slots);
      }, 800);
    });
  }

  private readPermission(): PermissionState {
    if (typeof Notification === 'undefined') return 'denied';
    return Notification.permission as PermissionState;
  }

  /**
   * Triggers the OS permission prompt. MUST be called inside a click
   * handler — Safari/iOS silently swallows the request otherwise.
   *
   * On 'granted', kicks off `ensureSubscription()` and an initial schedule
   * sync so the user starts receiving server-scheduled reminders right away.
   */
  async requestPermission(): Promise<PermissionState> {
    if (typeof Notification === 'undefined') return 'denied';
    const existing = Notification.permission;

    let next: PermissionState;
    if (existing === 'granted' || existing === 'denied') {
      next = existing as PermissionState;
    } else {
      next = (await Notification.requestPermission()) as PermissionState;
    }
    this.permission.set(next);

    if (next === 'granted') {
      // Fire-and-forget — the UI doesn't need to await this. Errors are
      // logged inside PushTokenService.
      void (async () => {
        const sub = await this.pushToken.ensureSubscription();
        if (sub) {
          await this.pushToken.syncSchedule(reminderSlotsFromHabits(this.habits.habits()));
        }
      })();
    }

    return next;
  }

  /**
   * Fires a local in-tab notification using the W3C Notification API.
   * Honours quiet hours by silently dropping the call when DND is active.
   */
  notify(title: string, options?: NotificationOptions): Notification | null {
    if (this.permission() !== 'granted') return null;
    if (this.quietHours.isQuietNow()) return null;
    try {
      return new Notification(title, options);
    } catch (e) {
      console.warn('[notifications] notify failed', e);
      return null;
    }
  }
}
