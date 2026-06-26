import * as Notifications from 'expo-notifications';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { loadHabits, saveHabits } from '@/lib/habits/storage';
import {
  computeFrequencyAwareStreak,
  computeStreak,
  computeStrengthScore,
  isDoneToday,
  toDateKey,
} from '@/lib/habits/streak';
import type { Habit } from '@/lib/habits/types';
import { cancelHabitReminders, scheduleHabitReminders } from '@/lib/notifications/schedule';
import { refreshTodayWidget } from '@/lib/platform/widget';

function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

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

type HabitsContextValue = {
  habits:         Habit[];
  loading:        boolean;
  addHabit:       (draft: AddHabitDraft) => Promise<Habit>;
  updateHabit:    (id: string, updates: Partial<Omit<Habit, 'id' | 'notificationIds'>>) => Promise<void>;
  deleteHabit:    (id: string) => Promise<void>;
  markDone:       (id: string) => Promise<MarkDoneResult>;
  /** Quantitative habits: add `delta` to today's progress. Auto-completes when target hit. */
  incrementProgress: (id: string, delta: number) => Promise<MarkDoneResult>;
  /** Timed habits: add `seconds` to today's session total. */
  addTimerSeconds:   (id: string, seconds: number) => Promise<MarkDoneResult>;
  /** Negative habits: record a slip today (resets the days-clean counter). */
  markSlip:          (id: string) => Promise<void>;
  /** Sub-tasks: toggle one subtask done for a given habit + date. */
  toggleSubtask:     (id: string, subtaskId: string, dateKey?: string) => Promise<MarkDoneResult>;
  /** Skip days: mark/unmark a planned day off (neutral — doesn't break streak). */
  toggleSkipDay:     (id: string, dateKey: string) => Promise<void>;
  reorderHabits:  (orderedIds: string[]) => Promise<void>;
  togglePin:      (id: string) => Promise<void>;
  pauseHabit:     (id: string) => Promise<void>;
  archiveHabit:   (id: string) => Promise<void>;
  restoreHabit:   (id: string) => Promise<void>;
  addNote:        (habitId: string, date: string, note: string) => Promise<void>;
  loadFresh:      () => Promise<void>;
  /** Merges incoming habits into the store, skipping any whose ID already exists. */
  importHabits:   (incoming: Habit[]) => Promise<{ added: number; skipped: number }>;
};

const noopResult: MarkDoneResult = { wasAdded: false, newStreak: 0 };

const HabitsContext = createContext<HabitsContextValue>({
  habits:        [],
  loading:       true,
  addHabit:      async () => { throw new Error('HabitsProvider not mounted'); },
  updateHabit:   async () => {},
  deleteHabit:   async () => {},
  markDone:      async () => noopResult,
  incrementProgress: async () => noopResult,
  addTimerSeconds:   async () => noopResult,
  markSlip:          async () => {},
  toggleSubtask:     async () => noopResult,
  toggleSkipDay:     async () => {},
  reorderHabits: async () => {},
  togglePin:     async () => {},
  pauseHabit:    async () => {},
  archiveHabit:  async () => {},
  restoreHabit:  async () => {},
  addNote:       async () => {},
  loadFresh:     async () => {},
  importHabits:  async () => ({ added: 0, skipped: 0 }),
});

// ── Provider ─────────────────────────────────────────────────────────────────

export function HabitsProvider({ children }: { children: ReactNode }) {
  const [habits, setHabitsState] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const habitsRef = useRef<Habit[]>([]);

  function commit(next: Habit[]) {
    habitsRef.current = next;
    setHabitsState(next);
    saveHabits(next).catch(console.error);
    // Badge counts only undone *active* habits
    const pending = next.filter(h => (h.status ?? 'active') === 'active' && !isDoneToday(h)).length;
    Notifications.setBadgeCountAsync(pending).catch(() => null);
    // Refresh Android home-screen widget (no-op on iOS / web)
    refreshTodayWidget().catch(() => null);
  }

  function applyStreakCorrection(raw: Habit[]): Habit[] {
    const yesterday  = toDateKey(new Date(Date.now() - 86_400_000));
    const dayBefore  = toDateKey(new Date(Date.now() - 172_800_000));

    return raw.map(h => {
      if ((h.status ?? 'active') !== 'active') return h;

      const completions      = h.completions    ?? [];
      let freezeUsedDates    = h.freezeUsedDates ?? [];
      let freezesAvailable   = h.freezesAvailable ?? 1;
      let effective = [...new Set([...completions, ...freezeUsedDates])];

      const isFlexFreq =
        h.frequency.kind === 'xperweek' || h.frequency.kind === 'interval';

      const yesterdayDOW = new Date(yesterday + 'T00:00:00').getDay();
      const yesterdayWasScheduled = (() => {
        switch (h.frequency.kind) {
          case 'daily':    return true;
          case 'weekly':   return h.frequency.weekdays.includes(yesterdayDOW + 1);
          case 'weekdays': return yesterdayDOW >= 1 && yesterdayDOW <= 5;
          case 'weekends': return yesterdayDOW === 0 || yesterdayDOW === 6;
          default:         return false;
        }
      })();

      // Skip days are neutral — never trigger a freeze.
      const wasSkipped = (h.skipDays ?? []).includes(yesterday);

      if (
        !isFlexFreq                            &&
        yesterdayWasScheduled                  &&
        !wasSkipped                            &&
        !effective.includes(yesterday)         &&
        effective.includes(dayBefore)          &&
        freezesAvailable > 0                   &&
        !freezeUsedDates.includes(yesterday)
      ) {
        freezeUsedDates  = [...freezeUsedDates, yesterday];
        freezesAvailable = freezesAvailable - 1;
        effective        = [...new Set([...completions, ...freezeUsedDates])];
      }

      const { streak, bestStreak } = computeFrequencyAwareStreak(effective, h.frequency);
      const strengthScore = computeStrengthScore(h);

      return {
        ...h,
        streak,
        bestStreak,
        strengthScore,
        freezesAvailable,
        freezeUsedDates,
      };
    });
  }

  async function loadFresh(): Promise<void> {
    const saved = await loadHabits();
    commit(applyStreakCorrection(saved));
  }

  useEffect(() => {
    loadHabits().then(saved => {
      commit(applyStreakCorrection(saved));
      setLoading(false);
    });

    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') loadFresh();
    });
    return () => appStateSub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function addHabit(draft: AddHabitDraft): Promise<Habit> {
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
      sortOrder:            habitsRef.current.length,
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
    const ids = await scheduleHabitReminders(newHabit);
    newHabit.notificationIds = ids;
    commit([...habitsRef.current, newHabit]);
    return newHabit;
  }

  async function updateHabit(
    id: string,
    updates: Partial<Omit<Habit, 'id' | 'notificationIds'>>,
  ): Promise<void> {
    const existing = habitsRef.current.find(h => h.id === id);
    if (!existing) return;
    await cancelHabitReminders(existing.notificationIds);
    const updated: Habit = { ...existing, ...updates };
    const ids = await scheduleHabitReminders(updated);
    updated.notificationIds = ids;
    commit(habitsRef.current.map(h => (h.id === id ? updated : h)));
  }

  async function deleteHabit(id: string): Promise<void> {
    const habit = habitsRef.current.find(h => h.id === id);
    if (habit) await cancelHabitReminders(habit.notificationIds);
    commit(habitsRef.current.filter(h => h.id !== id));
  }

  // ── Shared completion mutator ─────────────────────────────────────────────

  function toggleCompletionEntry(
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

    const sorted           = [...newCompletions].sort().reverse();
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

  // ── Completion methods (per habit type) ───────────────────────────────────

  async function markDone(id: string): Promise<MarkDoneResult> {
    const habit = habitsRef.current.find(h => h.id === id);
    if (!habit) return noopResult;

    const key = toDateKey(new Date());

    // Negative habit "mark done" doesn't change completions — see markSlip for inverse
    if (habit.habitType === 'negative') {
      // Tapping "I stayed clean today" — record a completion entry to track the streak
      const { habit: updated, result } = toggleCompletionEntry(habit, key, true);
      commit(habitsRef.current.map(h => h.id === id ? updated : h));
      return result;
    }

    const completions = habit.completions ?? [];
    const wasAddingNow = !completions.includes(key);
    const { habit: nextHabit, result } = toggleCompletionEntry(habit, key, wasAddingNow);

    // For quantitative habits, also satisfy the numeric target so day stays "done"
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
    // When unticking quantitative/timed, also clear today's accumulator
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

    // For interval habits: reschedule the one-shot notification
    let notificationIds = habit.notificationIds;
    if (wasAddingNow && habit.frequency.kind === 'interval') {
      await cancelHabitReminders(habit.notificationIds);
      notificationIds = await scheduleHabitReminders({
        ...finalHabit,
      });
      finalHabit = { ...finalHabit, notificationIds };
    }

    commit(habitsRef.current.map(h => h.id === id ? finalHabit : h));
    return result;
  }

  async function incrementProgress(id: string, delta: number): Promise<MarkDoneResult> {
    const habit = habitsRef.current.find(h => h.id === id);
    if (!habit || habit.habitType !== 'quantitative') return noopResult;

    const key = toDateKey(new Date());
    const prev = (habit.progress ?? {})[key] ?? 0;
    const next = Math.max(0, prev + delta);
    const target = habit.target?.value ?? 1;

    const newProgress = { ...(habit.progress ?? {}), [key]: next };
    if (next === 0) delete newProgress[key];

    const wasDoneBefore  = prev >= target;
    const isDoneNow      = next >= target;

    let updated: Habit = { ...habit, progress: newProgress };
    let result: MarkDoneResult = { wasAdded: false, newStreak: habit.streak };

    if (isDoneNow && !wasDoneBefore) {
      const { habit: withCompletion, result: r } = toggleCompletionEntry(updated, key, true);
      updated = withCompletion;
      result  = r;
    } else if (!isDoneNow && wasDoneBefore) {
      const { habit: withoutCompletion, result: r } = toggleCompletionEntry(updated, key, false);
      updated = withoutCompletion;
      result  = r;
    }

    commit(habitsRef.current.map(h => h.id === id ? updated : h));
    return result;
  }

  async function addTimerSeconds(id: string, seconds: number): Promise<MarkDoneResult> {
    const habit = habitsRef.current.find(h => h.id === id);
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
      const { habit: withCompletion, result: r } = toggleCompletionEntry(updated, key, true);
      updated = withCompletion;
      result  = r;
    }

    commit(habitsRef.current.map(h => h.id === id ? updated : h));
    return result;
  }

  async function markSlip(id: string): Promise<void> {
    const habit = habitsRef.current.find(h => h.id === id);
    if (!habit || habit.habitType !== 'negative') return;

    const key = toDateKey(new Date());
    const slipDates = habit.slipDates ?? [];
    const newSlips = slipDates.includes(key) ? slipDates.filter(d => d !== key) : [...slipDates, key];

    // Slipping today removes today from completions and resets streak
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
    commit(habitsRef.current.map(h => h.id === id ? updated : h));
  }

  async function toggleSubtask(id: string, subtaskId: string, dateKey?: string): Promise<MarkDoneResult> {
    const habit = habitsRef.current.find(h => h.id === id);
    if (!habit) return noopResult;

    const key = dateKey ?? toDateKey(new Date());
    const todayDone = (habit.subtaskCompletions ?? {})[key] ?? [];
    const isDone = todayDone.includes(subtaskId);
    const newTodayDone = isDone ? todayDone.filter(s => s !== subtaskId) : [...todayDone, subtaskId];

    const subtaskCompletions = { ...(habit.subtaskCompletions ?? {}) };
    if (newTodayDone.length === 0) delete subtaskCompletions[key];
    else subtaskCompletions[key] = newTodayDone;

    let updated: Habit = { ...habit, subtaskCompletions };

    // If all subtasks done today → mark habit done; if not → remove completion
    const allSubtasks = habit.subtasks ?? [];
    const allDone     = allSubtasks.length > 0 && allSubtasks.every(s => newTodayDone.includes(s.id));
    const wasMarkedDone = (habit.completions ?? []).includes(key);

    let result: MarkDoneResult = { wasAdded: false, newStreak: habit.streak };
    if (allDone && !wasMarkedDone) {
      const { habit: withCompletion, result: r } = toggleCompletionEntry(updated, key, true);
      updated = withCompletion;
      result  = r;
    } else if (!allDone && wasMarkedDone) {
      const { habit: withoutCompletion, result: r } = toggleCompletionEntry(updated, key, false);
      updated = withoutCompletion;
      result  = r;
    }

    commit(habitsRef.current.map(h => h.id === id ? updated : h));
    return result;
  }

  async function toggleSkipDay(id: string, dateKey: string): Promise<void> {
    const habit = habitsRef.current.find(h => h.id === id);
    if (!habit) return;
    const skipDays = habit.skipDays ?? [];
    const newSkips = skipDays.includes(dateKey)
      ? skipDays.filter(d => d !== dateKey)
      : [...skipDays, dateKey];
    commit(habitsRef.current.map(h => h.id === id ? { ...h, skipDays: newSkips } : h));
  }

  async function reorderHabits(orderedIds: string[]): Promise<void> {
    const updated = habitsRef.current.map(h => {
      const idx = orderedIds.indexOf(h.id);
      return idx >= 0 ? { ...h, sortOrder: idx } : h;
    });
    commit(updated);
  }

  async function togglePin(id: string): Promise<void> {
    commit(habitsRef.current.map(h => (h.id === id ? { ...h, pinned: !h.pinned } : h)));
  }

  async function pauseHabit(id: string): Promise<void> {
    const habit = habitsRef.current.find(h => h.id === id);
    if (!habit) return;
    await cancelHabitReminders(habit.notificationIds);
    commit(habitsRef.current.map(h =>
      h.id === id
        ? { ...h, status: 'paused', pausedAt: new Date().toISOString(), notificationIds: [] }
        : h,
    ));
  }

  async function archiveHabit(id: string): Promise<void> {
    const habit = habitsRef.current.find(h => h.id === id);
    if (!habit) return;
    await cancelHabitReminders(habit.notificationIds);
    commit(habitsRef.current.map(h =>
      h.id === id
        ? { ...h, status: 'archived', notificationIds: [] }
        : h,
    ));
  }

  async function restoreHabit(id: string): Promise<void> {
    const habit = habitsRef.current.find(h => h.id === id);
    if (!habit) return;
    const restored: Habit = { ...habit, status: 'active', pausedAt: null };
    const ids = await scheduleHabitReminders(restored);
    restored.notificationIds = ids;
    commit(habitsRef.current.map(h => (h.id === id ? restored : h)));
  }

  async function addNote(habitId: string, date: string, note: string): Promise<void> {
    commit(habitsRef.current.map(h => {
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

  async function importHabits(incoming: Habit[]): Promise<{ added: number; skipped: number }> {
    const existing    = habitsRef.current;
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

    const withNotifications = await Promise.all(
      toAdd.map(async h => {
        const ids = await scheduleHabitReminders(h);
        return { ...h, notificationIds: ids };
      }),
    );

    commit([...existing, ...withNotifications]);
    return { added: withNotifications.length, skipped: incoming.length - withNotifications.length };
  }

  return (
    <HabitsContext.Provider
      value={{
        habits, loading,
        addHabit, updateHabit, deleteHabit,
        markDone, incrementProgress, addTimerSeconds, markSlip,
        toggleSubtask, toggleSkipDay,
        reorderHabits, togglePin, pauseHabit, archiveHabit, restoreHabit,
        addNote, importHabits, loadFresh,
      }}
    >
      {children}
    </HabitsContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useHabitsStore() {
  return useContext(HabitsContext);
}

// Re-export the unchanged helper so existing imports keep working.
// We don't re-export computeStreak (it's now an internal helper used by toggleCompletionEntry).
export { isDoneToday } from '@/lib/habits/streak';

// Suppress unused-import warning — computeStreak retained for potential future use
void computeStreak;
