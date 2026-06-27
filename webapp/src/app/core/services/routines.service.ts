import { Injectable, computed, inject, signal } from '@angular/core';

import type { Routine } from '../models/routine';
import { toDateKey } from '../utils/dates.util';
import { computeStreak } from '../utils/streak.util';
import { randomUUID } from '../utils/uuid.util';
import { STORAGE_KEYS, StorageService } from './storage.service';

type AddRoutineDraft = Omit<Routine,
  'id' | 'notificationIds' | 'streak' | 'bestStreak' | 'completions' | 'createdAt'
>;

function migrateRoutine(r: Routine): Routine {
  return {
    ...r,
    notificationIds: r.notificationIds ?? [],
    completions:     r.completions     ?? [],
  };
}

/**
 * RoutinesService — port of src/contexts/RoutinesContext.tsx.
 *
 * `markRoutineCompleteForToday` is no-op when today is already in completions
 * (mirrors the mobile semantics — completion is recorded once per day).
 *
 * Notification scheduling is intentionally OUT-OF-SCOPE in Phase 1 — the web
 * NotificationsService is owned by a follow-up agent. We keep the
 * `notificationIds` field on the type so JSON imports from the mobile app
 * still round-trip cleanly.
 */
@Injectable({ providedIn: 'root' })
export class RoutinesService {
  private readonly storage = inject(StorageService);

  readonly routines = signal<Routine[]>([]);
  readonly loading = signal(true);

  readonly activeRoutines = computed(() => this.routines());

  constructor() {
    this.loadFresh();
  }

  private async commit(next: Routine[]): Promise<void> {
    this.routines.set(next);
    await this.storage.setItem(STORAGE_KEYS.routines, next);
  }

  async loadFresh(): Promise<void> {
    const saved = await this.storage.getItem<Routine[]>(STORAGE_KEYS.routines);
    const migrated = (saved ?? []).map(migrateRoutine);
    this.routines.set(migrated);
    this.loading.set(false);
  }

  async addRoutine(draft: AddRoutineDraft): Promise<Routine> {
    const routine: Routine = {
      ...draft,
      id:              randomUUID(),
      notificationIds: [],
      streak:          0,
      bestStreak:      0,
      completions:     [],
      createdAt:       new Date().toISOString(),
    };
    await this.commit([...this.routines(), routine]);
    return routine;
  }

  async updateRoutine(
    id: string,
    updates: Partial<Omit<Routine, 'id' | 'createdAt' | 'notificationIds'>>,
  ): Promise<void> {
    const next = this.routines().map(r => (r.id === id ? { ...r, ...updates } : r));
    await this.commit(next);
  }

  async deleteRoutine(id: string): Promise<void> {
    await this.commit(this.routines().filter(r => r.id !== id));
  }

  async markRoutineCompleteForToday(id: string): Promise<void> {
    const routine = this.routines().find(r => r.id === id);
    if (!routine) return;
    const key = toDateKey(new Date());
    if (routine.completions.includes(key)) return;
    const newCompletions = [...routine.completions, key];
    const { streak, bestStreak } = computeStreak(newCompletions);
    await this.commit(this.routines().map(r =>
      r.id === id ? { ...r, completions: newCompletions, streak, bestStreak } : r,
    ));
  }
}
