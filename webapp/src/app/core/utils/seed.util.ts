/**
 * Dummy/seed habits — port of src/lib/habits/seed.ts.
 *
 * Used by Settings → Developer Tools → "Load Dummy Data" so a downstream
 * agent can populate the IndexedDB store with realistic content while testing.
 */
import type { Habit } from '../models/habit';
import { toDateKey } from './dates.util';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

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
      completionTimestamps: {},
      notes: {},
      createdAt: FIVE_MONTHS,
      sortOrder: 0, pinned: true,
      category: 'Learning', status: 'active', pausedAt: null,
      freezesAvailable: 3, freezeUsedDates: [],
    },
    {
      id: 'seed-2',
      name: 'Meditate',
      icon: 'leaf-outline',
      color: '#16A34A',
      frequency: { kind: 'daily', hour: 6, minute: 30 },
      notificationIds: [],
      streak: 89, bestStreak: 89,
      lastCompletedISO: TODAY,
      completions: buildCompletions(89, 0),
      completionTimestamps: {},
      notes: {},
      createdAt: FIVE_MONTHS,
      sortOrder: 1, pinned: false,
      category: 'Mindfulness', status: 'active', pausedAt: null,
      freezesAvailable: 2, freezeUsedDates: [],
    },
    {
      id: 'seed-3',
      name: 'Morning Run',
      icon: 'walk-outline',
      color: '#3B82F6',
      frequency: { kind: 'daily', hour: 7, minute: 0 },
      notificationIds: [],
      streak: 47, bestStreak: 120,
      lastCompletedISO: TODAY,
      completions: [
        ...buildCompletions(47, 0),
        ...buildCompletions(120, 48),
      ],
      completionTimestamps: {},
      notes: {},
      createdAt: FIVE_MONTHS,
      sortOrder: 2, pinned: false,
      category: 'Health', status: 'active', pausedAt: null,
      freezesAvailable: 1, freezeUsedDates: [],
    },
    {
      id: 'seed-4',
      name: 'Workout',
      icon: 'barbell-outline',
      color: '#EF4444',
      frequency: { kind: 'weekly', weekdays: [2, 4, 6], hour: 18, minute: 0 },
      notificationIds: [],
      streak: 62, bestStreak: 62,
      lastCompletedISO: YESTERDAY,
      completions: buildCompletions(62, 1),
      completionTimestamps: {},
      notes: {},
      createdAt: FIVE_MONTHS,
      sortOrder: 3, pinned: false,
      category: 'Health', status: 'active', pausedAt: null,
      freezesAvailable: 1, freezeUsedDates: [],
    },
    {
      id: 'seed-5',
      name: 'Drink Water',
      icon: 'water-outline',
      color: '#0891B2',
      frequency: { kind: 'daily', hour: 9, minute: 0 },
      notificationIds: [],
      streak: 23, bestStreak: 23,
      lastCompletedISO: TODAY,
      completions: buildCompletions(23, 0),
      completionTimestamps: {},
      notes: {},
      createdAt: ONE_MONTH,
      sortOrder: 4, pinned: false,
      category: 'Health', status: 'active', pausedAt: null,
      freezesAvailable: 1, freezeUsedDates: [],
    },
  ];
}
