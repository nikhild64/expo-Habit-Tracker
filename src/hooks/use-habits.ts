import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';

import { loadHabits, saveHabits } from '@/lib/habits/storage';
import type { Habit } from '@/lib/habits/types';
import { cancelHabitReminders, scheduleHabitReminders } from '@/lib/notifications/schedule';

function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Date helpers ────────────────────────────────────────────────────────────

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isYesterday(d: Date): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return sameDay(d, yesterday);
}

export function isDoneToday(habit: Habit): boolean {
  if (!habit.lastCompletedISO) return false;
  return sameDay(new Date(habit.lastCompletedISO), new Date());
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useHabits() {
  const [habits, setHabitsState] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);

  // Ref keeps the latest habits array available inside async callbacks
  // without needing to re-create those callbacks on every render.
  const habitsRef = useRef<Habit[]>([]);

  function commit(next: Habit[]) {
    habitsRef.current = next;
    setHabitsState(next);
    saveHabits(next).catch(console.error);
    // Stretch goal: update app icon badge with count of habits not yet done today
    const pending = next.filter(h => !isDoneToday(h)).length;
    Notifications.setBadgeCountAsync(pending).catch(() => null);
  }

  useEffect(() => {
    loadHabits().then(saved => {
      // One-pass streak correction: if lastCompletedISO is 2+ days old, the
      // user missed a day — reset streak to 0 so stale badges aren't shown.
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      const corrected = saved.map(h => {
        if (!h.streak || !h.lastCompletedISO) return h;
        const last = new Date(h.lastCompletedISO);
        last.setHours(0, 0, 0, 0);
        const diffDays = Math.round((todayMidnight.getTime() - last.getTime()) / 86_400_000);
        return diffDays >= 2 ? { ...h, streak: 0 } : h;
      });
      commit(corrected);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Re-loads habits from storage — call via useFocusEffect when returning to a screen. */
  async function loadFresh() {
    const saved = await loadHabits();
    commit(saved);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function addHabit(
    draft: Omit<Habit, 'id' | 'notificationIds' | 'streak' | 'bestStreak' | 'lastCompletedISO' | 'createdAt'>,
  ): Promise<Habit> {
    const newHabit: Habit = {
      ...draft,
      id: randomUUID(),
      notificationIds: [],
      streak: 0,
      bestStreak: 0,
      lastCompletedISO: null,
      createdAt: new Date().toISOString(),
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

    // Cancel the old set of scheduled notifications for this habit only.
    await cancelHabitReminders(existing.notificationIds);

    const updated: Habit = { ...existing, ...updates };

    // Reschedule with the new frequency/name.
    const ids = await scheduleHabitReminders(updated);
    updated.notificationIds = ids;

    commit(habitsRef.current.map(h => (h.id === id ? updated : h)));
  }

  async function deleteHabit(id: string): Promise<void> {
    const habit = habitsRef.current.find(h => h.id === id);
    if (habit) {
      await cancelHabitReminders(habit.notificationIds);
    }
    commit(habitsRef.current.filter(h => h.id !== id));
  }

  async function markDone(id: string): Promise<void> {
    const habit = habitsRef.current.find(h => h.id === id);
    if (!habit) return;

    if (isDoneToday(habit)) {
      // Toggle off — revert today's completion.
      // Restore lastCompletedISO to yesterday (midnight) when the streak was > 1,
      // meaning the previous completion really was yesterday.  Without this the
      // startup streak-correction loop skips the entry because lastCompletedISO
      // is null, and an outdated streak value can persist across calendar days.
      const prevStreak = Math.max(0, habit.streak - 1);
      let prevLastCompleted: string | null = null;
      if (prevStreak > 0) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        prevLastCompleted = yesterday.toISOString();
      }
      commit(
        habitsRef.current.map(h =>
          h.id === id
            ? { ...h, streak: prevStreak, lastCompletedISO: prevLastCompleted }
            : h,
        ),
      );
    } else {
      // Toggle on — mark done and update streak.
      const today = new Date();
      const last = habit.lastCompletedISO ? new Date(habit.lastCompletedISO) : null;
      const newStreak = last && isYesterday(last) ? habit.streak + 1 : 1;
      const newBest = Math.max(newStreak, habit.bestStreak);
      commit(
        habitsRef.current.map(h =>
          h.id === id
            ? { ...h, streak: newStreak, bestStreak: newBest, lastCompletedISO: today.toISOString() }
            : h,
        ),
      );
    }
  }

  return { habits, loading, addHabit, updateHabit, deleteHabit, markDone, loadFresh };
}
