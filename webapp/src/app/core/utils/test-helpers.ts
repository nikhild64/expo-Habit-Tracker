/**
 * Fixture helpers — used by every domain util spec.
 *
 * Builds a fully-populated `Habit` with sensible defaults so individual tests
 * can override just the fields they care about (mirrors the React Testing
 * Library "factories" pattern used in the mobile repo).
 */
import type { Frequency, Habit } from '../models/habit';
import { toDateKey } from './dates.util';

export function dateKey(daysAgo: number, base: Date = new Date()): string {
  const d = new Date(base);
  d.setDate(d.getDate() - daysAgo);
  return toDateKey(d);
}

/** Returns consecutive completion keys ending `endDaysAgo` days in the past. */
export function consecutiveCompletions(
  count: number,
  endDaysAgo: number = 0,
  base: Date = new Date(),
): string[] {
  const result: string[] = [];
  const end = new Date(base);
  end.setDate(end.getDate() - endDaysAgo);
  for (let i = 0; i < count; i++) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    result.push(toDateKey(d));
  }
  return result;
}

export function makeHabit(overrides: Partial<Habit> = {}): Habit {
  const defaultFreq: Frequency = { kind: 'daily', hour: 9, minute: 0 };
  return {
    id: 'h-fixture',
    name: 'Test Habit',
    icon: 'leaf-outline',
    color: '#16A34A',
    frequency: defaultFreq,
    notificationIds: [],
    streak: 0,
    bestStreak: 0,
    completions: [],
    lastCompletedISO: null,
    createdAt: new Date(Date.now() - 365 * 86_400_000).toISOString(),
    sortOrder: 0,
    pinned: false,
    category: 'Health',
    status: 'active',
    pausedAt: null,
    freezesAvailable: 1,
    freezeUsedDates: [],
    notes: {},
    completionTimestamps: {},
    habitType: 'binary',
    timeOfDay: 'anytime',
    skipDays: [],
    reminders: [{ id: 'r0', hour: 9, minute: 0 }],
    progress: {},
    sessionSeconds: {},
    subtaskCompletions: {},
    slipDates: [],
    ...overrides,
  };
}
