import * as Notifications from 'expo-notifications';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { loadHabits, saveHabits } from '@/lib/habits/storage';
import { computeFrequencyAwareStreak, computeStreak, isDoneToday, toDateKey } from '@/lib/habits/streak';
import type { Habit } from '@/lib/habits/types';
import { cancelHabitReminders, scheduleHabitReminders } from '@/lib/notifications/schedule';

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
  | 'status' | 'pausedAt' | 'freezesAvailable' | 'freezeUsedDates'
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
  reorderHabits:  (orderedIds: string[]) => Promise<void>;
  togglePin:      (id: string) => Promise<void>;
  pauseHabit:     (id: string) => Promise<void>;
  archiveHabit:   (id: string) => Promise<void>;
  restoreHabit:   (id: string) => Promise<void>;
  loadFresh:      () => Promise<void>;
};

const HabitsContext = createContext<HabitsContextValue>({
  habits:        [],
  loading:       true,
  addHabit:      async () => { throw new Error('HabitsProvider not mounted'); },
  updateHabit:   async () => {},
  deleteHabit:   async () => {},
  markDone:      async () => ({ wasAdded: false, newStreak: 0 }),
  reorderHabits: async () => {},
  togglePin:     async () => {},
  pauseHabit:    async () => {},
  archiveHabit:  async () => {},
  restoreHabit:  async () => {},
  loadFresh:     async () => {},
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
  }

  /**
   * Recomputes streak for every habit and auto-applies streak freezes.
   *
   * Freeze rules:
   * - Only active habits are eligible (paused/archived are never decayed)
   * - For daily/weekly/weekdays/weekends: a freeze fires when yesterday was a
   *   scheduled day that the user missed, the day before IS in effective
   *   completions, and a freeze token is available
   * - xperweek/interval habits use flexible streaks and are NOT subject to
   *   per-day freeze logic
   */
  function applyStreakCorrection(raw: Habit[]): Habit[] {
    const yesterday  = toDateKey(new Date(Date.now() - 86_400_000));
    const dayBefore  = toDateKey(new Date(Date.now() - 172_800_000));

    return raw.map(h => {
      // Paused/archived habits: no decay, no freeze, no streak change
      if ((h.status ?? 'active') !== 'active') return h;

      const completions      = h.completions    ?? [];
      let freezeUsedDates    = h.freezeUsedDates ?? [];
      let freezesAvailable   = h.freezesAvailable ?? 1;

      // Merge completions + existing freeze dates for streak computation
      let effective = [...new Set([...completions, ...freezeUsedDates])];

      // Per-day freeze only makes sense for fixed-schedule frequency kinds
      const isFlexFreq =
        h.frequency.kind === 'xperweek' || h.frequency.kind === 'interval';

      // Check whether yesterday was a scheduled day for this habit
      const yesterdayDOW = new Date(yesterday + 'T00:00:00').getDay();
      const yesterdayWasScheduled = (() => {
        switch (h.frequency.kind) {
          case 'daily':    return true;
          case 'weekly':   return h.frequency.weekdays.includes(yesterdayDOW + 1);
          case 'weekdays': return yesterdayDOW >= 1 && yesterdayDOW <= 5;
          case 'weekends': return yesterdayDOW === 0 || yesterdayDOW === 6;
          default:         return false; // flex types handled above
        }
      })();

      // Auto-apply a freeze if the user missed exactly a scheduled yesterday
      if (
        !isFlexFreq                            &&
        yesterdayWasScheduled                  &&
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

      return {
        ...h,
        streak,
        bestStreak,
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
      createdAt:            new Date().toISOString(),
      sortOrder:            habitsRef.current.length,
      pinned:               false,
      status:               'active',
      pausedAt:             null,
      freezesAvailable:     1,
      freezeUsedDates:      [],
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

  async function markDone(id: string): Promise<MarkDoneResult> {
    const habit = habitsRef.current.find(h => h.id === id);
    if (!habit) return { wasAdded: false, newStreak: 0 };

    const key                   = toDateKey(new Date());
    const completions           = habit.completions           ?? [];
    const freezeUsedDates       = habit.freezeUsedDates       ?? [];
    const completionTimestamps  = { ...(habit.completionTimestamps ?? {}) };

    const wasAdded       = !completions.includes(key);
    const newCompletions = wasAdded
      ? [...completions, key]
      : completions.filter(d => d !== key);

    // Record or remove the precise completion timestamp for smart-reminders
    if (wasAdded) {
      completionTimestamps[key] = new Date().toISOString();
    } else {
      delete completionTimestamps[key];
    }

    // Include freeze dates when computing streak so freeze-protected days count
    const effective          = [...new Set([...newCompletions, ...freezeUsedDates])];
    const { streak, bestStreak } = computeFrequencyAwareStreak(effective, habit.frequency);

    // Award one freeze token every 7-day milestone (max 3) — only for fixed-schedule habits
    const currentFreezes      = habit.freezesAvailable ?? 1;
    const isFlexFreq          = habit.frequency.kind === 'xperweek' || habit.frequency.kind === 'interval';
    const newFreezesAvailable = (!isFlexFreq && wasAdded && streak > 0 && streak % 7 === 0)
      ? Math.min(3, currentFreezes + 1)
      : currentFreezes;

    const sorted           = [...newCompletions].sort().reverse();
    const lastCompletedISO = sorted.length > 0
      ? new Date(sorted[0] + 'T00:00:00').toISOString()
      : null;

    // For interval habits: reschedule the one-shot notification so the next
    // reminder fires `days` days from today's completion, not from creation time.
    let notificationIds = habit.notificationIds;
    if (wasAdded && habit.frequency.kind === 'interval') {
      await cancelHabitReminders(habit.notificationIds);
      notificationIds = await scheduleHabitReminders(
        { ...habit, completions: newCompletions },
      );
    }

    commit(
      habitsRef.current.map(h =>
        h.id === id
          ? {
              ...h,
              completions: newCompletions,
              completionTimestamps,
              streak,
              bestStreak,
              lastCompletedISO,
              freezesAvailable: newFreezesAvailable,
              notificationIds,
            }
          : h,
      ),
    );

    return { wasAdded, newStreak: streak };
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

  return (
    <HabitsContext.Provider
      value={{
        habits, loading, addHabit, updateHabit, deleteHabit, markDone,
        reorderHabits, togglePin, pauseHabit, archiveHabit, restoreHabit, loadFresh,
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

export { isDoneToday } from '@/lib/habits/streak';
