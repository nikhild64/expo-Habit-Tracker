import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { Habit } from './types';
import { loadMoodEntries, saveMoodEntries } from '@/lib/mood/storage';
import { loadRoutines, saveRoutines } from '@/lib/routines/storage';
import { loadProfile, saveProfile } from '@/lib/gamification/storage';
import { loadQuietHours, saveQuietHours } from '@/lib/habits/quiet-hours';
import { loadHabits, saveHabits } from '@/lib/habits/storage';

// ── CSV helpers ───────────────────────────────────────────────────────────────

function escapeCsv(value: string): string {
  if (/[,"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Generates a CSV with one row per completion/note date per habit and shares
 * it via the system share sheet.
 *
 * Columns: name, category, date, completed, note, streak
 */
export async function exportToCSV(habits: Habit[]): Promise<void> {
  const rows: string[] = ['name,category,date,completed,note,streak'];

  for (const habit of habits) {
    const dates = new Set([
      ...(habit.completions ?? []),
      ...Object.keys(habit.notes ?? {}),
    ]);

    if (dates.size === 0) {
      // Include the habit with empty date columns so it appears in the export
      rows.push(
        [escapeCsv(habit.name), escapeCsv(habit.category), '', '', '', String(habit.streak)].join(','),
      );
    } else {
      for (const date of [...dates].sort()) {
        const completed = (habit.completions ?? []).includes(date);
        const note = habit.notes?.[date] ?? '';
        rows.push(
          [
            escapeCsv(habit.name),
            escapeCsv(habit.category),
            date,
            completed ? 'true' : 'false',
            escapeCsv(note),
            String(habit.streak),
          ].join(','),
        );
      }
    }
  }

  const csv = rows.join('\n');
  const timestamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `habitly-habits-${timestamp}.csv`);
  file.create({ overwrite: true });
  file.write(csv);

  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export Habits as CSV',
    UTI: 'public.comma-separated-values-text',
  });
}

/**
 * Exports the full habits array as a pretty-printed JSON file and shares it.
 */
export async function exportToJSON(habits: Habit[]): Promise<void> {
  const json = JSON.stringify(habits, null, 2);
  const timestamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `habitly-habits-${timestamp}.json`);
  file.create({ overwrite: true });
  file.write(json);

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export Habits as JSON',
    UTI: 'public.json',
  });
}

// ── Import ────────────────────────────────────────────────────────────────────

/**
 * Opens the system document picker, reads the chosen JSON file, validates its
 * structure, and returns an array of candidate Habit objects.
 *
 * Returns `null` if the user cancelled.
 * Throws an `Error` with a human-readable message if the file is invalid.
 */
export async function pickHabitsJSON(): Promise<Habit[] | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const file = new File(result.assets[0].uri);
  const content = file.textSync();

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Invalid format: expected a JSON array of habits.');
  }

  const valid = (parsed as unknown[]).filter(
    (h): h is Habit =>
      typeof h === 'object' &&
      h !== null &&
      typeof (h as Record<string, unknown>).id === 'string' &&
      typeof (h as Record<string, unknown>).name === 'string',
  );

  if (valid.length === 0) {
    throw new Error('No valid habits found in the file.');
  }

  return valid;
}

// ── Full backup (v2) ─────────────────────────────────────────────────────────

const BACKUP_SCHEMA_VERSION = 2;

type FullBackup = {
  schemaVersion: number;
  exportedAt: string;
  habits: Habit[];
  routines?: unknown;
  profile?: unknown;
  moodEntries?: unknown;
  quietHours?: unknown;
  theme?: { theme?: string; accent?: string; unlockedAccents?: string[] };
};

const THEME_KEY = '@theme_v1';
const ACCENT_KEY = '@accent_v1';
const UNLOCKED_KEY = '@accents_unlocked_v1';

/**
 * Exports a single bundled JSON containing habits + routines + profile + mood
 * + quiet-hours + theme prefs. Backwards-compatible: old single-array exports
 * are still accepted by `pickHabitsJSON`.
 */
export async function exportFullBackup(): Promise<void> {
  const [habits, routines, profile, moodEntries, quietHours, theme, accent, unlockedAccentsRaw] =
    await Promise.all([
      loadHabits(),
      loadRoutines(),
      loadProfile(),
      loadMoodEntries(),
      loadQuietHours(),
      AsyncStorage.getItem(THEME_KEY),
      AsyncStorage.getItem(ACCENT_KEY),
      AsyncStorage.getItem(UNLOCKED_KEY),
    ]);

  const unlockedAccents = (() => {
    if (!unlockedAccentsRaw) return undefined;
    try { return JSON.parse(unlockedAccentsRaw) as string[]; } catch { return undefined; }
  })();

  const backup: FullBackup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    habits,
    routines,
    profile,
    moodEntries,
    quietHours,
    theme: {
      theme: theme ?? undefined,
      accent: accent ?? undefined,
      unlockedAccents,
    },
  };

  const json = JSON.stringify(backup, null, 2);
  const timestamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `habitly-backup-${timestamp}.json`);
  file.create({ overwrite: true });
  file.write(json);

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Habitly Full Backup',
    UTI: 'public.json',
  });
}

/**
 * Imports a full backup file. Detects schema version and migrates accordingly.
 * Returns counts so the caller can confirm with the user.
 *
 * Returns `null` if the user cancelled.
 */
export async function pickFullBackup(): Promise<FullBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const file = new File(result.assets[0].uri);
  const content = file.textSync();
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  // Old-format files: bare habit array → wrap into a v1 backup shape
  if (Array.isArray(parsed)) {
    const habits = parsed as Habit[];
    return { schemaVersion: 1, exportedAt: new Date().toISOString(), habits };
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Unrecognised backup format.');
  }

  const backup = parsed as FullBackup;
  if (!Array.isArray(backup.habits)) {
    throw new Error('Backup is missing the required "habits" array.');
  }
  return backup;
}

/**
 * Applies a previously-picked backup to the device storage. This OVERWRITES
 * existing data for the included sections — callers should confirm with the user.
 */
export async function applyFullBackup(backup: FullBackup): Promise<{ restored: string[] }> {
  const restored: string[] = [];

  if (Array.isArray(backup.habits)) {
    await saveHabits(backup.habits);
    restored.push(`${backup.habits.length} habits`);
  }
  if (backup.routines) {
    // Best-effort — type compatibility is enforced on read
    await saveRoutines(backup.routines as never);
    restored.push('routines');
  }
  if (backup.profile) {
    await saveProfile(backup.profile as never);
    restored.push('profile (XP, coins, achievements)');
  }
  if (backup.moodEntries && typeof backup.moodEntries === 'object') {
    await saveMoodEntries(backup.moodEntries as never);
    restored.push('mood & journal');
  }
  if (backup.quietHours && typeof backup.quietHours === 'object') {
    await saveQuietHours(backup.quietHours as never);
    restored.push('quiet hours');
  }
  if (backup.theme) {
    const { theme, accent, unlockedAccents } = backup.theme;
    const items: Array<[string, string]> = [];
    if (theme === 'dark' || theme === 'light') items.push([THEME_KEY, theme]);
    if (typeof accent === 'string') items.push([ACCENT_KEY, accent]);
    if (Array.isArray(unlockedAccents)) items.push([UNLOCKED_KEY, JSON.stringify(unlockedAccents)]);
    if (items.length > 0) {
      await AsyncStorage.multiSet(items);
      restored.push('theme & accents');
    }
  }

  return { restored };
}

