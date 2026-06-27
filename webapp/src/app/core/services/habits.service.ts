import { Injectable, computed, inject, signal } from '@angular/core';

import type { Habit } from '../models/habit';
import { toDateKey } from '../utils/dates.util';
import { autoConsumeFreeze } from '../utils/freeze.util';
import { migrateHabit } from '../utils/migrate-habit.util';
import {
  computeFrequencyAwareStreak,
  computeStrengthScore,
  isDoneToday,
} from '../utils/streak.util';
import { randomUUID } from '../utils/uuid.util';
import { BadgingService } from './badging.service';
import { STORAGE_KEYS, StorageService } from './storage.service';

type AddHabitDraft = Omit<Habit,
  | 'id' | 'notificationIds' | 'streak' | 'bestStreak' | 'lastCompletedISO'
  | 'completions' | 'completionTimestamps' | 'createdAt' | 'sortOrder' | 'pinned'
  | 'status' | 'pausedAt' | 'freezesAvailable' | 'freezeUsedDates' | 'notes'
>;

export type MarkDoneResult = {
  /** True when the completion was added; false when it was removed (toggle-off). */
  wasAdded: boolean;
  /** The updated streak length after the toggle. */
  newStreak: number;
};

const noopResult: MarkDoneResult = { wasAdded: false, newStreak: 0 };

/**
 * HabitsService — port of src/contexts/HabitsContext.tsx.
 *
 * Owns the full habit lifecycle (CRUD + completion toggling + pinning + soft
 * delete + freeze auto-consumption + import) and persists every commit to
 * IndexedDB through StorageService.
 *
 * On construction it runs `loadFresh()` which:
 *   1. Reads the saved array from `habits_v2`.
 *   2. Runs the v1→v7 migrator on every entry (idempotent — see
 *      `migrate-habit.util.ts`).
 *   3. Runs the freeze auto-consumption pass (see `freeze.util.ts`).
 *   4. Recomputes streak / bestStreak / strengthScore from the merged
 *      effective-completion set.
 *
 * The Phase-1 notification scheduling work is delegated to a follow-up
 * agent — `notificationIds` is preserved on the type for cross-platform
 * import compatibility but no scheduling happens in this service.
 */
@Injectable({ providedIn: 'root' })
export class HabitsService {
  private readonly storage = inject(StorageService);
  private readonly badging = inject(BadgingService);

  readonly habits = signal<Habit[]>([]);
  readonly loading = signal(true);

  readonly activeHabits = computed(() =>
    this.habits().filter(h => (h.status ?? 'active') === 'active'),
  );
  readonly pinnedHabits = computed(() => this.activeHabits().filter(h => h.pinned));
  readonly archivedHabits = computed(() =>
    this.habits().filter(h => h.status === 'archived'),
  );

  /** Pending count — used for the home-screen app badge + permission banner. */
  readonly pendingCount = computed(() =>
    this.activeHabits().filter(h => !isDoneToday(h)).length,
  );

  constructor() {
    this.loadFresh();
    this.installAutoRefresh();
  }

  /**
   * Auto-refresh on tab focus.
   *
   * Web has no pull-to-refresh primitive, so we rely on the browser's
   * `visibilitychange` event to silently re-run `loadFresh()` whenever the
   * tab becomes visible again. This covers the three edge cases the
   * (now-removed) manual Refresh button addressed:
   *
   *   1. Midnight rollover — date changed while the tab was hidden, so the
   *      freeze auto-consumption needs to re-run to apply yesterday's freeze.
   *   2. Multi-tab sync — another tab of this PWA wrote new state to IDB.
   *   3. Service-worker push DONE action that mutated state while we were
   *      backgrounded.
   *
   * Throttled to once every 60 s so rapid tab switching doesn't thrash IDB.
   */
  private installAutoRefresh(): void {
    if (typeof document === 'undefined') return;
    let lastRefresh = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefresh < 60_000) return;
      lastRefresh = Date.now();
      void this.loadFresh();
    });
  }

  // ── Persistence ────────────────────────────────────────────────────────

  private async commit(next: Habit[]): Promise<void> {
    this.habits.set(next);
    await this.storage.setItem(STORAGE_KEYS.habits, next);
    // Web App Badging API — no-op on browsers that don't implement it.
    this.badging.set(next.filter(h => (h.status ?? 'active') === 'active' && !isDoneToday(h)).length);
  }

  private applyStreakCorrection(raw: Habit[]): Habit[] {
    const now = new Date();
    return raw.map(h => {
      if ((h.status ?? 'active') !== 'active') return h;

      // 1. Run freeze auto-consumption (pure helper — fully testable).
      const freeze = autoConsumeFreeze(h, now);

      // 2. Recompute streak / bestStreak from the effective set.
      const { streak, bestStreak } = computeFrequencyAwareStreak(freeze.effective, h.frequency);

      return {
        ...h,
        streak,
        bestStreak,
        strengthScore: computeStrengthScore(h),
        freezesAvailable: freeze.freezesAvailable,
        freezeUsedDates: freeze.freezeUsedDates,
      };
    });
  }

  /**
   * Loads the saved habits, migrates them in-place (v1→v7), runs the freeze
   * auto-consumption pass, and pushes the result into the signal.
   *
   * Safe to call multiple times — re-running it is a no-op once habits are
   * migrated to v7 because every step in `migrateHabit` is idempotent.
   */
  async loadFresh(): Promise<void> {
    const saved = await this.storage.getItem<Habit[]>(STORAGE_KEYS.habits);
    const migrated = (saved ?? []).map((h, i) => migrateHabit(h, i));
    await this.commit(this.applyStreakCorrection(migrated));
    this.loading.set(false);
  }

  // ── CRUD ───────────────────────────────────────────────────────────────

  async addHabit(draft: AddHabitDraft): Promise<Habit> {
    const newHabit: Habit = {
      ...draft,
      id:                   randomUUID(),
      notificationIds:      [],
      streak:               0,
      bestStreak:           0,
      lastCompletedISO:     null,
      completions:          [],
      completionTimestamps: {},
      notes:                {},
      createdAt:            new Date().toISOString(),
      sortOrder:            this.habits().length,
      pinned:               false,
      status:               'active',
      pausedAt:             null,
      freezesAvailable:     1,
      freezeUsedDates:      [],
      habitType:            draft.habitType ?? 'binary',
      timeOfDay:            draft.timeOfDay ?? 'anytime',
      skipDays:             draft.skipDays ?? [],
      reminders:            draft.reminders,
      progress:             {},
      sessionSeconds:       {},
      subtaskCompletions:   {},
      slipDates:            [],
    };
    await this.commit([...this.habits(), newHabit]);
    return newHabit;
  }

  async updateHabit(
    id: string,
    updates: Partial<Omit<Habit, 'id' | 'notificationIds'>>,
  ): Promise<void> {
    const next = this.habits().map(h => (h.id === id ? { ...h, ...updates } : h));
    await this.commit(next);
  }

  async deleteHabit(id: string): Promise<void> {
    await this.commit(this.habits().filter(h => h.id !== id));
  }

  // ── Shared completion mutator ──────────────────────────────────────────

  private toggleCompletionEntry(
    habit: Habit,
    key: string,
    add: boolean,
  ): { habit: Habit; result: MarkDoneResult } {
    const completions          = habit.completions           ?? [];
    const freezeUsedDates      = habit.freezeUsedDates       ?? [];
    const completionTimestamps = { ...(habit.completionTimestamps ?? {}) };

    const wasAdded = add && !completions.includes(key);
    const wasRemoved = !add && completions.includes(key);
    if (!wasAdded && !wasRemoved) {
      return { habit, result: { wasAdded: false, newStreak: habit.streak } };
    }

    const newCompletions = wasAdded
      ? [...completions, key]
      : completions.filter(d => d !== key);

    if (wasAdded) {
      completionTimestamps[key] = new Date().toISOString();
    } else {
      delete completionTimestamps[key];
    }

    const effective = [...new Set([...newCompletions, ...freezeUsedDates])];
    const { streak, bestStreak } = computeFrequencyAwareStreak(effective, habit.frequency);

    const currentFreezes = habit.freezesAvailable ?? 1;
    const isFlexFreq     = habit.frequency.kind === 'xperweek' || habit.frequency.kind === 'interval';
    const newFreezesAvailable = (!isFlexFreq && wasAdded && streak > 0 && streak % 7 === 0)
      ? Math.min(3, currentFreezes + 1)
      : currentFreezes;

    const sorted = [...newCompletions].sort().reverse();
    const lastCompletedISO = sorted.length > 0
      ? new Date(sorted[0] + 'T00:00:00').toISOString()
      : null;

    const updated: Habit = {
      ...habit,
      completions: newCompletions,
      completionTimestamps,
      streak,
      bestStreak,
      strengthScore: computeStrengthScore({ ...habit, completions: newCompletions }),
      lastCompletedISO,
      freezesAvailable: newFreezesAvailable,
    };

    return { habit: updated, result: { wasAdded, newStreak: streak } };
  }

  // ── Completion methods (per habit type) ────────────────────────────────

  async markDone(id: string): Promise<MarkDoneResult> {
    const habit = this.habits().find(h => h.id === id);
    if (!habit) return noopResult;

    const key = toDateKey(new Date());

    if (habit.habitType === 'negative') {
      const { habit: updated, result } = this.toggleCompletionEntry(habit, key, true);
      await this.commit(this.habits().map(h => h.id === id ? updated : h));
      return result;
    }

    const completions = habit.completions ?? [];
    const wasAddingNow = !completions.includes(key);
    const { habit: nextHabit, result } = this.toggleCompletionEntry(habit, key, wasAddingNow);

    let finalHabit = nextHabit;
    if (wasAddingNow && habit.habitType === 'quantitative') {
      const progress = { ...(habit.progress ?? {}) };
      progress[key] = habit.target?.value ?? 1;
      finalHabit = { ...nextHabit, progress };
    }
    if (wasAddingNow && habit.habitType === 'timed') {
      const sessionSeconds = { ...(habit.sessionSeconds ?? {}) };
      sessionSeconds[key] = habit.target?.timerSeconds ?? 60;
      finalHabit = { ...nextHabit, sessionSeconds };
    }
    if (!wasAddingNow && habit.habitType === 'quantitative') {
      const progress = { ...(habit.progress ?? {}) };
      delete progress[key];
      finalHabit = { ...nextHabit, progress };
    }
    if (!wasAddingNow && habit.habitType === 'timed') {
      const sessionSeconds = { ...(habit.sessionSeconds ?? {}) };
      delete sessionSeconds[key];
      finalHabit = { ...nextHabit, sessionSeconds };
    }

    await this.commit(this.habits().map(h => h.id === id ? finalHabit : h));
    return result;
  }

  async incrementProgress(id: string, delta: number): Promise<MarkDoneResult> {
    const habit = this.habits().find(h => h.id === id);
    if (!habit || habit.habitType !== 'quantitative') return noopResult;

    const key = toDateKey(new Date());
    const prev = (habit.progress ?? {})[key] ?? 0;
    const next = Math.max(0, prev + delta);
    const target = habit.target?.value ?? 1;

    const newProgress = { ...(habit.progress ?? {}), [key]: next };
    if (next === 0) delete newProgress[key];

    const wasDoneBefore = prev >= target;
    const isDoneNow     = next >= target;

    let updated: Habit = { ...habit, progress: newProgress };
    let result: MarkDoneResult = { wasAdded: false, newStreak: habit.streak };

    if (isDoneNow && !wasDoneBefore) {
      const r = this.toggleCompletionEntry(updated, key, true);
      updated = r.habit;
      result = r.result;
    } else if (!isDoneNow && wasDoneBefore) {
      const r = this.toggleCompletionEntry(updated, key, false);
      updated = r.habit;
      result = r.result;
    }

    await this.commit(this.habits().map(h => h.id === id ? updated : h));
    return result;
  }

  async addTimerSeconds(id: string, seconds: number): Promise<MarkDoneResult> {
    const habit = this.habits().find(h => h.id === id);
    if (!habit || habit.habitType !== 'timed') return noopResult;

    const key = toDateKey(new Date());
    const prev = (habit.sessionSeconds ?? {})[key] ?? 0;
    const next = Math.max(0, prev + seconds);
    const target = habit.target?.timerSeconds ?? 60;

    const newSeconds = { ...(habit.sessionSeconds ?? {}), [key]: next };
    if (next === 0) delete newSeconds[key];

    const wasDoneBefore = prev >= target;
    const isDoneNow     = next >= target;

    let updated: Habit = { ...habit, sessionSeconds: newSeconds };
    let result: MarkDoneResult = { wasAdded: false, newStreak: habit.streak };

    if (isDoneNow && !wasDoneBefore) {
      const r = this.toggleCompletionEntry(updated, key, true);
      updated = r.habit;
      result = r.result;
    }

    await this.commit(this.habits().map(h => h.id === id ? updated : h));
    return result;
  }

  async markSlip(id: string): Promise<void> {
    const habit = this.habits().find(h => h.id === id);
    if (!habit || habit.habitType !== 'negative') return;

    const key = toDateKey(new Date());
    const slipDates = habit.slipDates ?? [];
    const newSlips = slipDates.includes(key) ? slipDates.filter(d => d !== key) : [...slipDates, key];

    const completions = (habit.completions ?? []).filter(d => d !== key);
    const { streak, bestStreak } = computeFrequencyAwareStreak(completions, habit.frequency);
    const updated: Habit = {
      ...habit,
      slipDates: newSlips,
      completions,
      streak,
      bestStreak,
      strengthScore: computeStrengthScore({ ...habit, slipDates: newSlips }),
    };
    await this.commit(this.habits().map(h => h.id === id ? updated : h));
  }

  async toggleSubtask(id: string, subtaskId: string, dateKey?: string): Promise<MarkDoneResult> {
    const habit = this.habits().find(h => h.id === id);
    if (!habit) return noopResult;

    const key = dateKey ?? toDateKey(new Date());
    const todayDone = (habit.subtaskCompletions ?? {})[key] ?? [];
    const isDone = todayDone.includes(subtaskId);
    const newTodayDone = isDone ? todayDone.filter(s => s !== subtaskId) : [...todayDone, subtaskId];

    const subtaskCompletions = { ...(habit.subtaskCompletions ?? {}) };
    if (newTodayDone.length === 0) delete subtaskCompletions[key];
    else subtaskCompletions[key] = newTodayDone;

    let updated: Habit = { ...habit, subtaskCompletions };

    const allSubtasks = habit.subtasks ?? [];
    const allDone     = allSubtasks.length > 0 && allSubtasks.every(s => newTodayDone.includes(s.id));
    const wasMarkedDone = (habit.completions ?? []).includes(key);

    let result: MarkDoneResult = { wasAdded: false, newStreak: habit.streak };
    if (allDone && !wasMarkedDone) {
      const r = this.toggleCompletionEntry(updated, key, true);
      updated = r.habit;
      result = r.result;
    } else if (!allDone && wasMarkedDone) {
      const r = this.toggleCompletionEntry(updated, key, false);
      updated = r.habit;
      result = r.result;
    }

    await this.commit(this.habits().map(h => h.id === id ? updated : h));
    return result;
  }

  async toggleSkipDay(id: string, dateKey: string): Promise<void> {
    const habit = this.habits().find(h => h.id === id);
    if (!habit) return;
    const skipDays = habit.skipDays ?? [];
    const newSkips = skipDays.includes(dateKey)
      ? skipDays.filter(d => d !== dateKey)
      : [...skipDays, dateKey];
    await this.commit(this.habits().map(h => h.id === id ? { ...h, skipDays: newSkips } : h));
  }

  async reorderHabits(orderedIds: string[]): Promise<void> {
    const updated = this.habits().map(h => {
      const idx = orderedIds.indexOf(h.id);
      return idx >= 0 ? { ...h, sortOrder: idx } : h;
    });
    await this.commit(updated);
  }

  async togglePin(id: string): Promise<void> {
    await this.commit(this.habits().map(h => (h.id === id ? { ...h, pinned: !h.pinned } : h)));
  }

  async pauseHabit(id: string): Promise<void> {
    await this.commit(this.habits().map(h =>
      h.id === id
        ? { ...h, status: 'paused', pausedAt: new Date().toISOString(), notificationIds: [] }
        : h,
    ));
  }

  async archiveHabit(id: string): Promise<void> {
    await this.commit(this.habits().map(h =>
      h.id === id
        ? { ...h, status: 'archived', notificationIds: [] }
        : h,
    ));
  }

  async restoreHabit(id: string): Promise<void> {
    await this.commit(this.habits().map(h =>
      h.id === id ? { ...h, status: 'active', pausedAt: null } : h,
    ));
  }

  async addNote(habitId: string, date: string, note: string): Promise<void> {
    await this.commit(this.habits().map(h => {
      if (h.id !== habitId) return h;
      const notes = { ...(h.notes ?? {}) };
      if (note.trim()) {
        notes[date] = note.trim();
      } else {
        delete notes[date];
      }
      return { ...h, notes };
    }));
  }

  async importHabits(incoming: Habit[]): Promise<{ added: number; skipped: number }> {
    const existing    = this.habits();
    const existingIds = new Set(existing.map(h => h.id));
    const maxOrder    = existing.reduce((m, h) => Math.max(m, h.sortOrder ?? 0), existing.length - 1);

    const toAdd: Habit[] = incoming
      .filter(h => !existingIds.has(h.id))
      .map((h, i) => ({
        ...h,
        completions:          Array.isArray(h.completions)     ? h.completions     : [],
        completionTimestamps: h.completionTimestamps           ?? {},
        notes:                h.notes                         ?? {},
        freezesAvailable:     h.freezesAvailable               ?? 1,
        freezeUsedDates:      Array.isArray(h.freezeUsedDates) ? h.freezeUsedDates : [],
        pinned:               h.pinned                        ?? false,
        category:             h.category                      ?? 'Other',
        habitType:            h.habitType                     ?? 'binary',
        timeOfDay:            h.timeOfDay                     ?? 'anytime',
        skipDays:             Array.isArray(h.skipDays)        ? h.skipDays         : [],
        progress:             h.progress                      ?? {},
        sessionSeconds:       h.sessionSeconds                ?? {},
        subtaskCompletions:   h.subtaskCompletions            ?? {},
        slipDates:            Array.isArray(h.slipDates)       ? h.slipDates        : [],
        notificationIds:      [],
        status:               'active' as const,
        pausedAt:             null,
        sortOrder:            maxOrder + i + 1,
      }));

    await this.commit([...existing, ...toAdd]);
    return { added: toAdd.length, skipped: incoming.length - toAdd.length };
  }
}
