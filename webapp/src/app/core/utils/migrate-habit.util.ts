/**
 * Habit migration helper — port of `migrateHabit()` from
 * src/lib/habits/storage.ts. Idempotent so it's safe to call on every load.
 *
 * Versions covered:
 *   v1 → v2: derives completions[] from lastCompletedISO + streak.
 *   v2 → v3: adds sortOrder + pinned defaults.
 *   v3 → v4: adds category + status + pausedAt + freeze fields.
 *   v4 → v5: adds completionTimestamps.
 *   v5 → v6: adds notes.
 *   v6 → v7: adds habitType, timeOfDay, multi-reminders, skipDays, and the
 *            quantitative / timed / subtask / negative scaffolding.
 *
 * The `index` parameter is used to assign a stable default sortOrder when
 * none is stored, preserving the existing list order from before sorting
 * existed.
 */
import type { Habit } from '../models/habit';
import { toDateKey } from './dates.util';

export function migrateHabit(h: Habit, index: number): Habit {
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

  // v5 → v6: notes
  if (!out.notes || typeof out.notes !== 'object' || Array.isArray(out.notes)) {
    out = { ...out, notes: {} };
  }

  // v6 → v7: habit type, time-of-day, multi-reminders, skip days, quantitative/timed/subtask/negative fields
  if (!out.habitType) {
    out = { ...out, habitType: 'binary' };
  }
  if (!out.timeOfDay) {
    out = { ...out, timeOfDay: 'anytime' };
  }
  if (!Array.isArray(out.skipDays)) {
    out = { ...out, skipDays: [] };
  }
  if (!Array.isArray(out.reminders)) {
    out = {
      ...out,
      reminders: [
        {
          id: 'r0',
          hour: out.frequency?.hour ?? 9,
          minute: out.frequency?.minute ?? 0,
        },
      ],
    };
  }

  return out;
}
