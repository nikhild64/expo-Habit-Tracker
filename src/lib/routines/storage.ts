import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Routine } from './types';

const STORAGE_KEY = '@routines_v1';

function migrateRoutine(r: Routine): Routine {
  return {
    ...r,
    notificationIds: r.notificationIds ?? [],
    completions:     r.completions     ?? [],
  };
}

export async function loadRoutines(): Promise<Routine[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Routine[]).map(migrateRoutine);
  } catch {
    return [];
  }
}

export async function saveRoutines(routines: Routine[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(routines));
  } catch (e) {
    console.error('[storage] saveRoutines failed:', e);
  }
}
