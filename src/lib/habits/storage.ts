import AsyncStorage from '@react-native-async-storage/async-storage';

import { toDateKey } from './streak';
import type { Habit } from './types';

const STORAGE_KEY_V1 = '@habits_v1';
const STORAGE_KEY    = '@habits_v2';

/**
 * One-time v1 → v2 migration.
 *
 * Old habits lack a `completions` array. We derive one by stepping backwards
 * from `lastCompletedISO` for `streak` consecutive days — the same logic the
 * heatmap used to infer completions before v2.
 */
function migrateHabit(h: Habit): Habit {
  if (Array.isArray(h.completions)) return h; // already v2

  const completions: string[] = [];
  if (h.lastCompletedISO && h.streak > 0) {
    const end = new Date(h.lastCompletedISO);
    for (let i = 0; i < h.streak; i++) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      completions.push(toDateKey(d));
    }
  }
  return { ...h, completions };
}

export async function loadHabits(): Promise<Habit[]> {
  try {
    // Prefer v2 storage
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      // Still run migration guard per-entry: the background notification handler
      // can write habits that predate migration if the app was backgrounded
      // before the first v2 load completed.
      return (JSON.parse(raw) as Habit[]).map(migrateHabit);
    }

    // No v2 data yet — look for v1 and migrate up in one pass
    const rawV1 = await AsyncStorage.getItem(STORAGE_KEY_V1);
    if (!rawV1) return [];
    const migrated = (JSON.parse(rawV1) as Habit[]).map(migrateHabit);
    // Persist migrated data to v2 so subsequent loads are fast
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return [];
  }
}

export async function saveHabits(habits: Habit[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
  } catch (e) {
    console.error('[storage] saveHabits failed:', e);
  }
}
