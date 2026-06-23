import * as Notifications from 'expo-notifications';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { loadHabits, saveHabits } from '@/lib/habits/storage';
import { computeStreak, isDoneToday, toDateKey } from '@/lib/habits/streak';
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
  | 'completions' | 'createdAt' | 'sortOrder' | 'pinned'
  | 'status' | 'pausedAt' | 'freezesAvailable' | 'freezeUsedDates'
>;

type HabitsContextValue = {
  habits:         Habit[];
  loading:        boolean;
  addHabit:       (draft: AddHabitDraft) => Promise<Habit>;
  updateHabit:    (id: string, updates: Partial<Omit<Habit, 'id' | 'notificationIds'>>) => Promise<void>;
  deleteHabit:    (id: string) => Promise<void>;
  markDone:       (id: string) => Promise<void>;
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
  markDone:      async () => {},
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
   * - A freeze fires when yesterday is NOT in effective completions, the day
   *   before yesterday IS (meaning a 1-day gap exists), and at least one freeze
   *   token remains
   * - Each freeze token can cover exactly one missed day
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

      // Auto-apply a freeze if the user missed exactly yesterday
      if (
        !effective.includes(yesterday) &&      // yesterday unfinished
        effective.includes(dayBefore)  &&      // day-before was done (streak was alive)
        freezesAvailable > 0           &&      // has a token
        !freezeUsedDates.includes(yesterday)   // haven't already frozen yesterday
      ) {
        freezeUsedDates  = [...freezeUsedDates, yesterday];
        freezesAvailable = freezesAvailable - 1;
        effective        = [...new Set([...completions, ...freezeUsedDates])];
      }

      const { streak, bestStreak } = computeStreak(effective);

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
      id:               randomUUID(),
      notificationIds:  [],
      streak:           0,
      bestStreak:       0,
      lastCompletedISO: null,
      completions:      [],
      createdAt:        new Date().toISOString(),
      sortOrder:        habitsRef.current.length,
      pinned:           false,
      status:           'active',
      pausedAt:         null,
      freezesAvailable: 1,
      freezeUsedDates:  [],
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

  async function markDone(id: string): Promise<void> {
    const habit = habitsRef.current.find(h => h.id === id);
    if (!habit) return;

    const key            = toDateKey(new Date());
    const completions    = habit.completions    ?? [];
    const freezeUsedDates = habit.freezeUsedDates ?? [];

    const wasAdded       = !completions.includes(key);
    const newCompletions = wasAdded
      ? [...completions, key]
      : completions.filter(d => d !== key);

    // Include freeze dates when computing streak so freeze-protected days count
    const effective          = [...new Set([...newCompletions, ...freezeUsedDates])];
    const { streak, bestStreak } = computeStreak(effective);

    // Award one freeze token every 7-day milestone (max 3)
    const currentFreezes   = habit.freezesAvailable ?? 1;
    const newFreezesAvailable = wasAdded && streak > 0 && streak % 7 === 0
      ? Math.min(3, currentFreezes + 1)
      : currentFreezes;

    const sorted           = [...newCompletions].sort().reverse();
    const lastCompletedISO = sorted.length > 0
      ? new Date(sorted[0] + 'T00:00:00').toISOString()
      : null;

    commit(
      habitsRef.current.map(h =>
        h.id === id
          ? { ...h, completions: newCompletions, streak, bestStreak, lastCompletedISO, freezesAvailable: newFreezesAvailable }
          : h,
      ),
    );
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
