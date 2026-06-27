import { Injectable, computed, inject, signal } from '@angular/core';

import { DEFAULT_QUIET_HOURS, type QuietHours } from '../models/quiet-hours';
import { isInQuietHours } from '../utils/quiet-hours.util';
import { STORAGE_KEYS, StorageService } from './storage.service';

/**
 * QuietHoursService — port of src/lib/habits/quiet-hours.ts wrapper +
 * the relevant portion of src/lib/notifications/setup.ts:
 *  - Stores the user's DND window in IndexedDB under `quiet_hours_v1`.
 *  - Computes whether "now" falls inside that window for the in-tab
 *    notification scheduler to consult (NotificationsService).
 *
 * `isQuietNow` is a signal that recomputes every minute so screens that
 * mention DND state (Settings page, Today permission banner) stay live.
 */
@Injectable({ providedIn: 'root' })
export class QuietHoursService {
  private readonly storage = inject(StorageService);

  readonly value = signal<QuietHours>(DEFAULT_QUIET_HOURS);
  readonly ready = signal(false);

  private readonly nowTick = signal(Date.now());

  readonly isQuietNow = computed(() => {
    void this.nowTick(); // re-evaluate whenever the tick advances
    const d = new Date();
    return isInQuietHours(d.getHours(), d.getMinutes(), this.value());
  });

  constructor() {
    this.load();
    if (typeof window !== 'undefined') {
      // Re-evaluate every minute so the Settings hint flips live without
      // forcing a reload (mirrors mobile's AppState foreground refresh).
      setInterval(() => this.nowTick.set(Date.now()), 60_000);
    }
  }

  private async load(): Promise<void> {
    const saved = await this.storage.getItem<Partial<QuietHours>>(STORAGE_KEYS.quietHours);
    if (saved) {
      this.value.set({
        ...DEFAULT_QUIET_HOURS,
        ...saved,
        startMinute: saved.startMinute ?? 0,
        endMinute: saved.endMinute ?? 0,
      });
    }
    this.ready.set(true);
  }

  async update(patch: Partial<QuietHours>): Promise<void> {
    const next: QuietHours = { ...this.value(), ...patch };
    this.value.set(next);
    await this.storage.setItem(STORAGE_KEYS.quietHours, next);
  }
}
