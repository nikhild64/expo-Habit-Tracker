import { describe, expect, it } from 'vitest';

import type { Habit, HabitCategory } from '../models/habit';
import { reminderSlotsFromHabits } from './reminder-slots.util';

function habit(overrides: Partial<Habit>): Habit {
  return {
    id: overrides.id ?? 'h1',
    name: overrides.name ?? 'Test Habit',
    icon: overrides.icon ?? 'water-outline',
    color: overrides.color ?? '#3B82F6',
    frequency: overrides.frequency ?? { kind: 'daily', hour: 7, minute: 30 },
    notificationIds: [],
    streak: 0,
    bestStreak: 0,
    completions: [],
    lastCompletedISO: null,
    createdAt: '2026-01-01T00:00:00Z',
    sortOrder: 0,
    pinned: false,
    category: (overrides.category ?? 'Other') as HabitCategory,
    status: overrides.status ?? 'active',
    pausedAt: null,
    freezesAvailable: 1,
    freezeUsedDates: [],
    notes: {},
    completionTimestamps: {},
    timeOfDay: 'morning',
    ...overrides,
  };
}

describe('reminderSlotsFromHabits', () => {
  it('emits a default slot for a daily habit with no per-habit reminders', () => {
    const slots = reminderSlotsFromHabits([
      habit({ id: 'a', name: 'Drink Water', frequency: { kind: 'daily', hour: 8, minute: 0 } }),
    ]);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      id: 'a:default',
      hour: 8,
      minute: 0,
      title: 'Drink Water',
      weekdays: undefined,
    });
  });

  it('maps "weekdays" frequency to Mon..Fri (Expo convention 1=Sun..7=Sat)', () => {
    const slots = reminderSlotsFromHabits([
      habit({ id: 'b', frequency: { kind: 'weekdays', hour: 7, minute: 0 } }),
    ]);
    expect(slots[0].weekdays).toEqual([2, 3, 4, 5, 6]);
  });

  it('maps "weekends" frequency to Sun + Sat', () => {
    const slots = reminderSlotsFromHabits([
      habit({ id: 'c', frequency: { kind: 'weekends', hour: 10, minute: 0 } }),
    ]);
    expect(slots[0].weekdays).toEqual([1, 7]);
  });

  it('passes through weekly weekdays directly', () => {
    const slots = reminderSlotsFromHabits([
      habit({ id: 'd', frequency: { kind: 'weekly', weekdays: [3, 5], hour: 9, minute: 15 } }),
    ]);
    expect(slots[0].weekdays).toEqual([3, 5]);
  });

  it('omits weekdays for xperweek + interval (server fires by time only)', () => {
    const slots = reminderSlotsFromHabits([
      habit({ id: 'x', frequency: { kind: 'xperweek', count: 3, hour: 12, minute: 0 } }),
      habit({ id: 'y', frequency: { kind: 'interval', days: 2, hour: 12, minute: 0 } }),
    ]);
    expect(slots[0].weekdays).toBeUndefined();
    expect(slots[1].weekdays).toBeUndefined();
  });

  it('emits one slot per habit.reminders entry, preferring those over default', () => {
    const slots = reminderSlotsFromHabits([
      habit({
        id: 'r',
        reminders: [
          { id: 'r1', hour: 7,  minute: 0,  label: 'Morning sip' },
          { id: 'r2', hour: 13, minute: 0 },
          { id: 'r3', hour: 19, minute: 30 },
        ],
      }),
    ]);
    expect(slots).toHaveLength(3);
    expect(slots[0]).toMatchObject({ id: 'r:r1', hour: 7,  minute: 0,  body: 'Morning sip' });
    expect(slots[2]).toMatchObject({ id: 'r:r3', hour: 19, minute: 30 });
  });

  it('skips paused/archived habits and unnamed habits', () => {
    const slots = reminderSlotsFromHabits([
      habit({ id: 'paused',   status: 'paused' }),
      habit({ id: 'archived', status: 'archived' }),
      habit({ id: 'noname',   name: '   ' }),
      habit({ id: 'ok',       name: 'OK' }),
    ]);
    expect(slots.map(s => s.id)).toEqual(['ok:default']);
  });

  it('attaches a deep-link data payload that the SW can route on tap', () => {
    const slots = reminderSlotsFromHabits([habit({ id: 'h42' })]);
    expect(slots[0].data).toEqual({ screen: '/habit', habitId: 'h42' });
  });
});
