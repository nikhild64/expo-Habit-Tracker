/**
 * seed.ts — Developer dummy data for testing the Progress screen.
 *
 * The heatmap is built by stepping backwards from each habit's
 * `lastCompletedISO` for `streak` days, so setting large streak values fills
 * the calendar naturally without needing a per-day completion log.
 *
 * Designed to produce a realistic gradient across 5 months:
 *
 *   Days 1–23   : 5 habits active → darkest green (100%)
 *   Days 24–47  : 4 habits        → dark green    (~80%)
 *   Days 48–62  : 3 habits        → medium green  (~60%)
 *   Days 63–89  : 2 habits        → light green   (~40%)
 *   Days 90–148 : 1 habit         → faintest green (~20%)
 *   Days 149+   : 0               → empty
 */

import { saveHabits } from './storage';
import type { Habit } from './types';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export function buildDummyHabits(): Habit[] {
  const FIVE_MONTHS = daysAgo(153);
  const ONE_MONTH   = daysAgo(32);
  const TODAY       = new Date().toISOString();
  const YESTERDAY   = daysAgo(1);

  return [
    {
      id: 'seed-1',
      name: 'Read 20 Pages',
      icon: 'book-outline',
      color: '#8B5CF6',
      frequency: { kind: 'daily', hour: 21, minute: 0 },
      notificationIds: [],
      streak:     148,
      bestStreak: 150,
      lastCompletedISO: TODAY,
      createdAt: FIVE_MONTHS,
    },
    {
      id: 'seed-2',
      name: 'Meditate',
      icon: 'leaf-outline',
      color: '#16A34A',
      frequency: { kind: 'daily', hour: 6, minute: 30 },
      notificationIds: [],
      streak:     89,
      bestStreak: 92,
      lastCompletedISO: TODAY,
      createdAt: FIVE_MONTHS,
    },
    {
      id: 'seed-3',
      name: 'Morning Run',
      icon: 'walk-outline',
      color: '#3B82F6',
      frequency: { kind: 'daily', hour: 7, minute: 0 },
      notificationIds: [],
      streak:     47,
      bestStreak: 120,
      lastCompletedISO: TODAY,
      createdAt: FIVE_MONTHS,
    },
    {
      id: 'seed-4',
      name: 'Workout',
      icon: 'barbell-outline',
      color: '#EF4444',
      frequency: { kind: 'weekly', weekdays: [2, 4, 6], hour: 18, minute: 0 },
      notificationIds: [],
      streak:     62,
      bestStreak: 75,
      lastCompletedISO: YESTERDAY,   // not done today — shows realistic mix
      createdAt: FIVE_MONTHS,
    },
    {
      id: 'seed-5',
      name: 'Drink Water',
      icon: 'water-outline',
      color: '#0891B2',
      frequency: { kind: 'daily', hour: 9, minute: 0 },
      notificationIds: [],
      streak:     23,
      bestStreak: 23,
      lastCompletedISO: TODAY,
      createdAt: ONE_MONTH,          // newer habit — only 1 month of history
    },
  ];
}

/**
 * Replaces all habits in AsyncStorage with the 5 seed habits.
 * Call this from the dev tools panel in Settings and then reload the app.
 */
export async function loadDummyData(): Promise<void> {
  await saveHabits(buildDummyHabits());
}

/**
 * Clears all habits from storage.
 * Useful for resetting back to an empty state after testing.
 */
export async function clearDummyData(): Promise<void> {
  await saveHabits([]);
}
