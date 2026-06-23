import AsyncStorage from '@react-native-async-storage/async-storage';

import { toDateKey } from './streak';
import type { Habit } from './types';

const STORAGE_KEY_V1 = '@habits_v1';
const STORAGE_KEY    = '@habits_v2';

/**
 * Forward-compatible migration applied to every habit on load.
 *
 * v1 → v2: derives completions[] from lastCompletedISO + streak.
 * v2 → v3: adds sortOrder and pinned defaults for habits that predate those fields.
 *
 * The `index` parameter is used to assign a stable default sortOrder when none
 * is stored, preserving the existing list order from before sorting existed.
 */
function migrateHabit(h: Habit, index: number): Habit {
  let out = h;

  // v1 → v2: completions
  if (!Array.isArray(out.completions)) {
    const completions: string[] = [];
    if (out.lastCompletedISO && out.streak > 0) {
      const end = new Date(out.lastCompletedISO);
      for (let i = 0; i < out.streak; i++) {
        const d = new Date(end);
        d.setDate(d.getDate() - i);
        completions.push(toDateKey(d));
      }
    }
    out = { ...out, completions };
  }

  // v2 → v3: sortOrder + pinned
  if (out.sortOrder === undefined || out.sortOrder === null) {
    out = { ...out, sortOrder: index };
  }
  if (out.pinned === undefined || out.pinned === null) {
    out = { ...out, pinned: false };
  }

  // v3 → v4: category + status + pausedAt + freeze fields
  if (out.category === undefined || out.category === null) {
    out = { ...out, category: 'Other' };
  }
  if (out.status === undefined || out.status === null) {
    out = { ...out, status: 'active' };
  }
  if (!Object.prototype.hasOwnProperty.call(out, 'pausedAt')) {
    out = { ...out, pausedAt: null };
  }
  if (out.freezesAvailable === undefined || out.freezesAvailable === null) {
    out = { ...out, freezesAvailable: 1 };
  }
  if (!Array.isArray(out.freezeUsedDates)) {
    out = { ...out, freezeUsedDates: [] };
  }

  // v4 → v5: completionTimestamps
  if (!out.completionTimestamps || typeof out.completionTimestamps !== 'object') {
    out = { ...out, completionTimestamps: {} };
  }

  return out;
}

export async function loadHabits(): Promise<Habit[]> {
  try {
    // Prefer v2 storage
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      // Still run migration guard per-entry: the background notification handler
      // can write habits that predate migration if the app was backgrounded
      // before the first v2 load completed.
      return (JSON.parse(raw) as Habit[]).map((h, i) => migrateHabit(h, i));
    }

    // No v2 data yet — look for v1 and migrate up in one pass
    const rawV1 = await AsyncStorage.getItem(STORAGE_KEY_V1);
    if (!rawV1) return [];
    const migrated = (JSON.parse(rawV1) as Habit[]).map((h, i) => migrateHabit(h, i));
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
