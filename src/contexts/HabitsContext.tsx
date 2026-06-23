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
  'id' | 'notificationIds' | 'streak' | 'bestStreak' | 'lastCompletedISO' | 'completions' | 'createdAt'
>;

type HabitsContextValue = {
  habits: Habit[];
  loading: boolean;
  addHabit:    (draft: AddHabitDraft) => Promise<Habit>;
  updateHabit: (id: string, updates: Partial<Omit<Habit, 'id' | 'notificationIds'>>) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  markDone:    (id: string) => Promise<void>;
  /** Re-reads habits from AsyncStorage and recomputes streaks. Used by the
   *  background notification handler after it writes directly to storage. */
  loadFresh:   () => Promise<void>;
};

const HabitsContext = createContext<HabitsContextValue>({
  habits:      [],
  loading:     true,
  addHabit:    async () => { throw new Error('HabitsProvider not mounted'); },
  updateHabit: async () => {},
  deleteHabit: async () => {},
  markDone:    async () => {},
  loadFresh:   async () => {},
});

// ── Provider ─────────────────────────────────────────────────────────────────

export function HabitsProvider({ children }: { children: ReactNode }) {
  const [habits, setHabitsState] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);

  // Keep a ref so async callbacks always see the latest array without needing
  // to be recreated on every render.
  const habitsRef = useRef<Habit[]>([]);

  /** Persist, update React state, and refresh the app badge in one call. */
  function commit(next: Habit[]) {
    habitsRef.current = next;
    setHabitsState(next);
    saveHabits(next).catch(console.error);
    const pending = next.filter(h => !isDoneToday(h)).length;
    Notifications.setBadgeCountAsync(pending).catch(() => null);
  }

  /** Recompute streaks from completions for every habit, then commit. */
  function applyStreakCorrection(raw: Habit[]): Habit[] {
    return raw.map(h => {
      const { streak, bestStreak } = computeStreak(h.completions ?? []);
      return { ...h, streak, bestStreak };
    });
  }

  async function loadFresh(): Promise<void> {
    const saved = await loadHabits();
    commit(applyStreakCorrection(saved));
  }

  useEffect(() => {
    // Initial load — hydrate state from AsyncStorage on mount.
    loadHabits().then(saved => {
      commit(applyStreakCorrection(saved));
      setLoading(false);
    });

    // Re-sync whenever the app returns to the foreground. This is necessary
    // because the notification "Done ✓" action handler writes directly to
    // AsyncStorage while the app is in the background, bypassing React state.
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
      id:              randomUUID(),
      notificationIds: [],
      streak:          0,
      bestStreak:      0,
      lastCompletedISO: null,
      completions:     [],
      createdAt:       new Date().toISOString(),
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

    const key         = toDateKey(new Date());
    const completions = habit.completions ?? [];

    // Toggle: remove if already done today, add otherwise
    const newCompletions = completions.includes(key)
      ? completions.filter(d => d !== key)
      : [...completions, key];

    const { streak, bestStreak } = computeStreak(newCompletions);

    // Keep lastCompletedISO in sync for the background notification handler
    // which still reads it directly from storage.
    const sorted             = [...newCompletions].sort().reverse();
    const lastCompletedISO   = sorted.length > 0
      ? new Date(sorted[0] + 'T00:00:00').toISOString()
      : null;

    commit(
      habitsRef.current.map(h =>
        h.id === id
          ? { ...h, completions: newCompletions, streak, bestStreak, lastCompletedISO }
          : h,
      ),
    );
  }

  return (
    <HabitsContext.Provider
      value={{ habits, loading, addHabit, updateHabit, deleteHabit, markDone, loadFresh }}
    >
      {children}
    </HabitsContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useHabitsStore() {
  return useContext(HabitsContext);
}

// Re-export isDoneToday so screens only need one import for both
export { isDoneToday } from '@/lib/habits/streak';
