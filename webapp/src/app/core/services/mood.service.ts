import { Injectable, computed, inject, signal } from '@angular/core';

import { toDateKey } from '../utils/dates.util';
import type { MoodEntry } from '../models/mood';
import { STORAGE_KEYS, StorageService } from './storage.service';

/**
 * MoodService — port of src/contexts/MoodContext.tsx.
 *
 * Stores entries as a Record keyed by YYYY-MM-DD under `mood_v1` so the
 * full-backup JSON round-trips with the mobile app.
 *
 * `setReflection('', date)` removes the reflection field (and the whole
 * entry when no other fields remain) — same semantics as the mobile.
 */
@Injectable({ providedIn: 'root' })
export class MoodService {
  private readonly storage = inject(StorageService);

  readonly entries = signal<Record<string, MoodEntry>>({});
  readonly ready = signal(false);

  readonly today = computed(() => this.entries()[toDateKey(new Date())]);

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    const saved = await this.storage.getItem<Record<string, MoodEntry>>(STORAGE_KEYS.moodEntries);
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      this.entries.set(saved);
    }
    this.ready.set(true);
  }

  private async commit(next: Record<string, MoodEntry>): Promise<void> {
    this.entries.set(next);
    await this.storage.setItem(STORAGE_KEYS.moodEntries, next);
  }

  async upsertEntry(date: string, patch: Partial<MoodEntry>): Promise<void> {
    const prev = this.entries();
    const existing = prev[date] ?? { date };
    const merged: MoodEntry = { ...existing, ...patch, date };
    await this.commit({ ...prev, [date]: merged });
  }

  async setReflection(date: string, text: string): Promise<void> {
    const trimmed = text.trim();
    const prev = this.entries();
    const existing = prev[date];

    if (!trimmed) {
      if (!existing) return;
      const { reflection: _ignored, ...rest } = existing;
      void _ignored;
      if (Object.keys(rest).length === 1) {
        // only `date` is left — drop the whole entry
        const next = { ...prev };
        delete next[date];
        await this.commit(next);
        return;
      }
      await this.commit({ ...prev, [date]: rest as MoodEntry });
      return;
    }

    const base = existing ?? { date };
    await this.commit({ ...prev, [date]: { ...base, reflection: trimmed, date } });
  }
}
