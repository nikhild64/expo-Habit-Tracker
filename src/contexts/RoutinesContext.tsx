import * as Notifications from 'expo-notifications';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { computeStreak, toDateKey } from '@/lib/habits/streak';
import { HABIT_CHANNEL_ID } from '@/lib/notifications/setup';
import { loadRoutines, saveRoutines } from '@/lib/routines/storage';
import type { Routine } from '@/lib/routines/types';

function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type AddRoutineDraft = Omit<Routine,
  'id' | 'notificationIds' | 'streak' | 'bestStreak' | 'completions' | 'createdAt'
>;

type RoutinesContextValue = {
  routines:                    Routine[];
  loading:                     boolean;
  addRoutine:                  (draft: AddRoutineDraft) => Promise<Routine>;
  updateRoutine:               (id: string, updates: Partial<Omit<Routine, 'id' | 'createdAt' | 'notificationIds'>>) => Promise<void>;
  deleteRoutine:               (id: string) => Promise<void>;
  markRoutineCompleteForToday: (id: string) => Promise<void>;
  loadFresh:                   () => Promise<void>;
};

const RoutinesContext = createContext<RoutinesContextValue>({
  routines:                    [],
  loading:                     true,
  addRoutine:                  async () => { throw new Error('RoutinesProvider not mounted'); },
  updateRoutine:               async () => {},
  deleteRoutine:               async () => {},
  markRoutineCompleteForToday: async () => {},
  loadFresh:                   async () => {},
});

// ── Notification helpers ──────────────────────────────────────────────────────

async function scheduleRoutineReminder(routine: Routine): Promise<string[]> {
  if (!routine.reminderTime) return [];
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return [];
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: routine.name,
        body: 'Time to start your routine!',
        data: { screen: '/routine', routineId: routine.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour:   routine.reminderTime.hour,
        minute: routine.reminderTime.minute,
        ...(Platform.OS === 'android' ? { channelId: HABIT_CHANNEL_ID } : {}),
      },
    });
    return [id];
  } catch {
    return [];
  }
}

async function cancelRoutineReminders(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => null)),
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function RoutinesProvider({ children }: { children: ReactNode }) {
  const [routines, setRoutinesState] = useState<Routine[]>([]);
  const [loading, setLoading]         = useState(true);
  const routinesRef                   = useRef<Routine[]>([]);

  function commit(next: Routine[]) {
    routinesRef.current = next;
    setRoutinesState(next);
    saveRoutines(next).catch(console.error);
  }

  async function loadFresh(): Promise<void> {
    const saved = await loadRoutines();
    commit(saved);
  }

  useEffect(() => {
    loadRoutines().then(saved => {
      commit(saved);
      setLoading(false);
    });
  }, []);

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function addRoutine(draft: AddRoutineDraft): Promise<Routine> {
    const routine: Routine = {
      ...draft,
      id:              randomUUID(),
      notificationIds: [],
      streak:          0,
      bestStreak:      0,
      completions:     [],
      createdAt:       new Date().toISOString(),
    };
    const ids = await scheduleRoutineReminder(routine);
    routine.notificationIds = ids;
    commit([...routinesRef.current, routine]);
    return routine;
  }

  async function updateRoutine(
    id: string,
    updates: Partial<Omit<Routine, 'id' | 'createdAt' | 'notificationIds'>>,
  ): Promise<void> {
    const existing = routinesRef.current.find(r => r.id === id);
    if (!existing) return;
    await cancelRoutineReminders(existing.notificationIds);
    const updated = { ...existing, ...updates };
    const ids = await scheduleRoutineReminder(updated);
    commit(routinesRef.current.map(r => (r.id === id ? { ...updated, notificationIds: ids } : r)));
  }

  async function deleteRoutine(id: string): Promise<void> {
    const routine = routinesRef.current.find(r => r.id === id);
    if (routine) await cancelRoutineReminders(routine.notificationIds);
    commit(routinesRef.current.filter(r => r.id !== id));
  }

  /**
   * Records today as a completed day for the routine and recomputes streak.
   * No-op if today is already in completions.
   */
  async function markRoutineCompleteForToday(id: string): Promise<void> {
    const routine = routinesRef.current.find(r => r.id === id);
    if (!routine) return;
    const key = toDateKey(new Date());
    if (routine.completions.includes(key)) return;
    const newCompletions         = [...routine.completions, key];
    const { streak, bestStreak } = computeStreak(newCompletions);
    commit(routinesRef.current.map(r =>
      r.id === id ? { ...r, completions: newCompletions, streak, bestStreak } : r,
    ));
  }

  return (
    <RoutinesContext.Provider value={{
      routines, loading, addRoutine, updateRoutine, deleteRoutine,
      markRoutineCompleteForToday, loadFresh,
    }}>
      {children}
    </RoutinesContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useRoutinesStore() {
  return useContext(RoutinesContext);
}
