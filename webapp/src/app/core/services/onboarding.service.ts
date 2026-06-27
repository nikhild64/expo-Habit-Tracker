import { Injectable, inject, signal } from '@angular/core';

import { STORAGE_KEYS, StorageService } from './storage.service';

/**
 * OnboardingService — port of src/lib/onboarding.ts.
 *
 * Single boolean: has the user seen the 6-slide onboarding pager.
 * Stored under `onboarding_v1` as the literal string `'done'` to stay
 * byte-identical with the mobile-app full-backup JSON.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly storage = inject(StorageService);

  readonly seen = signal(false);
  readonly ready = signal(false);

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    const raw = await this.storage.getItem<string>(STORAGE_KEYS.onboarding);
    this.seen.set(raw === 'done');
    this.ready.set(true);
  }

  async markDone(): Promise<void> {
    this.seen.set(true);
    await this.storage.setItem(STORAGE_KEYS.onboarding, 'done');
  }

  async reset(): Promise<void> {
    this.seen.set(false);
    await this.storage.removeItem(STORAGE_KEYS.onboarding);
  }
}
