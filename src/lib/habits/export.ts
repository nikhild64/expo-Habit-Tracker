import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { Habit } from './types';

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
