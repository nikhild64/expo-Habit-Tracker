/**
 * Tests for freeze auto-consumption.
 * Mirrors the logic ported from src/contexts/HabitsContext.tsx::applyStreakCorrection.
 */
import { describe, expect, it } from 'vitest';

import { toDateKey } from './dates.util';
import { autoConsumeFreeze } from './freeze.util';
import { makeHabit } from './test-helpers';

const yesterday = toDateKey(new Date(Date.now() - 86_400_000));
const dayBefore = toDateKey(new Date(Date.now() - 172_800_000));

describe('autoConsumeFreeze', () => {
  it('consumes a freeze when yesterday was missed but day-before was hit', () => {
    const habit = makeHabit({
      completions: [dayBefore],
      freezesAvailable: 2,
    });
    const res = autoConsumeFreeze(habit);
    expect(res.consumed).toBe(true);
    expect(res.freezesAvailable).toBe(1);
    expect(res.freezeUsedDates).toContain(yesterday);
    expect(res.effective).toContain(yesterday);
  });

  it('does not consume when no freezes available', () => {
    const habit = makeHabit({
      completions: [dayBefore],
      freezesAvailable: 0,
    });
    const res = autoConsumeFreeze(habit);
    expect(res.consumed).toBe(false);
    expect(res.freezesAvailable).toBe(0);
    expect(res.freezeUsedDates).toEqual([]);
  });

  it('does not consume when there is no streak to protect', () => {
    const habit = makeHabit({
      completions: [], // day-before missing too
      freezesAvailable: 3,
    });
    const res = autoConsumeFreeze(habit);
    expect(res.consumed).toBe(false);
  });

  it('does not consume on xperweek (flex frequency)', () => {
    const habit = makeHabit({
      frequency: { kind: 'xperweek', count: 3, hour: 9, minute: 0 },
      completions: [dayBefore],
      freezesAvailable: 3,
    });
    const res = autoConsumeFreeze(habit);
    expect(res.consumed).toBe(false);
  });

  it('does not consume on interval (flex frequency)', () => {
    const habit = makeHabit({
      frequency: { kind: 'interval', days: 2, hour: 9, minute: 0 },
      completions: [dayBefore],
      freezesAvailable: 3,
    });
    const res = autoConsumeFreeze(habit);
    expect(res.consumed).toBe(false);
  });

  it('does not consume when yesterday is a planned skip-day', () => {
    const habit = makeHabit({
      completions: [dayBefore],
      freezesAvailable: 3,
      skipDays: [yesterday],
    });
    const res = autoConsumeFreeze(habit);
    expect(res.consumed).toBe(false);
  });

  it('does not consume when yesterday already has a freeze', () => {
    const habit = makeHabit({
      completions: [dayBefore],
      freezeUsedDates: [yesterday],
      freezesAvailable: 3,
    });
    const res = autoConsumeFreeze(habit);
    expect(res.consumed).toBe(false);
  });

  it('does not consume for non-active habits', () => {
    const habit = makeHabit({
      completions: [dayBefore],
      freezesAvailable: 3,
      status: 'archived',
    });
    const res = autoConsumeFreeze(habit);
    expect(res.consumed).toBe(false);
  });
});
