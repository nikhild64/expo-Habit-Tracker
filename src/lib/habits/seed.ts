import { saveHabits } from './storage';
import { toDateKey } from './streak';
import type { Habit } from './types';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/**
 * Generates `count` consecutive YYYY-MM-DD completion keys ending `endDaysAgo`
 * days in the past (0 = today).
 */
function buildCompletions(count: number, endDaysAgo: number): string[] {
  const result: string[] = [];
  const end = new Date();
  end.setDate(end.getDate() - endDaysAgo);
  for (let i = 0; i < count; i++) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    result.push(toDateKey(d));
  }
  return result;
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
      bestStreak: 148,
      lastCompletedISO: TODAY,
      completions: buildCompletions(148, 0),
      createdAt: FIVE_MONTHS,
      sortOrder: 0,
      pinned: true,
    },
    {
      id: 'seed-2',
      name: 'Meditate',
      icon: 'leaf-outline',
      color: '#16A34A',
      frequency: { kind: 'daily', hour: 6, minute: 30 },
      notificationIds: [],
      streak:     89,
      bestStreak: 89,
      lastCompletedISO: TODAY,
      completions: buildCompletions(89, 0),
      createdAt: FIVE_MONTHS,
      sortOrder: 1,
      pinned: false,
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
      // Current streak of 47 days + an earlier run of 120 days (with a gap between them)
      completions: [
        ...buildCompletions(47, 0),    // current streak: today back 46 days
        ...buildCompletions(120, 48),  // past best: 120-day run ending 48 days ago
      ],
      createdAt: FIVE_MONTHS,
      sortOrder: 2,
      pinned: false,
    },
    {
      id: 'seed-4',
      name: 'Workout',
      icon: 'barbell-outline',
      color: '#EF4444',
      frequency: { kind: 'weekly', weekdays: [2, 4, 6], hour: 18, minute: 0 },
      notificationIds: [],
      streak:     62,
      bestStreak: 62,
      lastCompletedISO: YESTERDAY,
      completions: buildCompletions(62, 1),
      createdAt: FIVE_MONTHS,
      sortOrder: 3,
      pinned: false,
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
      completions: buildCompletions(23, 0),
      createdAt: ONE_MONTH,
      sortOrder: 4,
      pinned: false,
    },
  ];
}

/**
 * Replaces all habits in AsyncStorage with the 5 seed habits.
 * Call from dev tools in Settings and then reload the app.
 */
export async function loadDummyData(): Promise<void> {
  await saveHabits(buildDummyHabits());
}

/**
 * Clears all habits from storage.
 */
export async function clearDummyData(): Promise<void> {
  await saveHabits([]);
}
