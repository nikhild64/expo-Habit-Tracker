/**
 * Reminder-slot derivation — converts a habit list into the per-sub
 * server-side reminder schedule POSTed to `/web/schedule`.
 *
 * Rules (per §10 + §B of the polish-pwa plan):
 *  - `daily`  / `xperweek`           → no `weekdays` (matches every day).
 *  - `weekly`                        → use `frequency.weekdays` directly
 *                                       (Expo convention 1=Sun..7=Sat).
 *  - `weekdays`                      → `[2,3,4,5,6]` (Mon..Fri).
 *  - `weekends`                      → `[1,7]`       (Sun + Sat).
 *  - `interval`                      → no `weekdays` (the server-side cron
 *                                       only matches time; "every N days"
 *                                       gating stays in the client UI).
 *
 * Per-habit reminders take precedence: if `habit.reminders[]` is set we emit
 * one slot per reminder. Otherwise we fall back to a single slot derived
 * from `frequency.hour` / `frequency.minute` (the legacy single-time path).
 *
 * Skips paused / archived habits and habits without a sensible reminder
 * time (hour < 0). Skips habits whose name is empty too — the backend
 * doesn't reject those but the user-facing notification would look broken.
 */
import type { Habit } from '../models/habit';
import type { ReminderSlot } from '../services/push-token.service';

const WEEKDAYS_MON_FRI = [2, 3, 4, 5, 6];
const WEEKDAYS_WEEKENDS = [1, 7];

function weekdaysFor(habit: Habit): number[] | undefined {
  const f = habit.frequency;
  switch (f.kind) {
    case 'weekly':   return f.weekdays?.length ? [...f.weekdays] : undefined;
    case 'weekdays': return WEEKDAYS_MON_FRI;
    case 'weekends': return WEEKDAYS_WEEKENDS;
    case 'daily':
    case 'xperweek':
    case 'interval':
    default:
      return undefined;
  }
}

export function reminderSlotsFromHabits(habits: Habit[]): ReminderSlot[] {
  const slots: ReminderSlot[] = [];

  for (const habit of habits) {
    if (!habit || !habit.id) continue;
    if ((habit.status ?? 'active') !== 'active') continue;
    if (!habit.name || !habit.name.trim()) continue;

    const weekdays = weekdaysFor(habit);
    const baseData = { screen: '/habit', habitId: habit.id };

    const list = (habit.reminders ?? []).filter(r =>
      typeof r.hour === 'number' && r.hour >= 0 && r.hour <= 23
      && typeof r.minute === 'number' && r.minute >= 0 && r.minute <= 59,
    );

    if (list.length > 0) {
      for (const r of list) {
        slots.push({
          id:      `${habit.id}:${r.id}`,
          hour:    r.hour,
          minute:  r.minute,
          weekdays: r.weekdays?.length ? [...r.weekdays] : weekdays,
          title:   habit.name,
          body:    r.label?.trim() || 'Time to build your streak. Tap to log it.',
          data:    baseData,
        });
      }
      continue;
    }

    // Fall back to the single-time path from frequency.hour/minute.
    const hour = habit.frequency.hour;
    const minute = habit.frequency.minute;
    if (typeof hour !== 'number' || typeof minute !== 'number') continue;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) continue;

    slots.push({
      id:      `${habit.id}:default`,
      hour,
      minute,
      weekdays,
      title:   habit.name,
      body:    'Time to build your streak. Tap to log it.',
      data:    baseData,
    });
  }

  return slots;
}
