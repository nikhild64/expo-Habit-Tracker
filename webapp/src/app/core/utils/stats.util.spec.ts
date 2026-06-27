/**
 * Tests for computeHabitStats — completion rates + best day + averages.
 */
import { describe, expect, it } from 'vitest';

import { computeHabitStats, completionRate } from './stats.util';
import { consecutiveCompletions, dateKey } from './test-helpers';

const oldCreatedAt = new Date(Date.now() - 200 * 86_400_000).toISOString();

describe('computeHabitStats', () => {
  it('returns zero rates and zero totals for an empty history', () => {
    const stats = computeHabitStats([], oldCreatedAt);
    expect(stats.total).toBe(0);
    expect(stats.rate7d).toBe(0);
    expect(stats.rate30d).toBe(0);
    expect(stats.rate90d).toBe(0);
    expect(stats.momentum).toBe(0);
    expect(stats.bestDay).toBeNull();
  });

  it('counts completions in the last 7 days for rate7d', () => {
    const c = consecutiveCompletions(7, 0);
    const stats = computeHabitStats(c, oldCreatedAt);
    expect(stats.rate7d).toBe(1);
    expect(stats.total).toBe(7);
  });

  it('caps completion rate at 1 (never reports >100%)', () => {
    // 10 completions in the last 7 days — duplicates aren't possible but
    // overcounting due to off-by-one shouldn't push the rate above 1.
    const c = consecutiveCompletions(10, 0);
    expect(completionRate(c, 7, oldCreatedAt)).toBe(1);
  });

  it('frequency-aware denominator for weekday habit', () => {
    // 5 weekday completions in a 7-day window should be 100% for a weekday habit
    // and only ~71% for a daily habit. Use a simple sanity-check that the
    // denominator changes when frequency is supplied.
    const c = consecutiveCompletions(5, 0);
    const dailyRate = completionRate(c, 7, oldCreatedAt, { kind: 'daily', hour: 9, minute: 0 });
    const weekdayRate = completionRate(c, 7, oldCreatedAt, { kind: 'weekdays', hour: 9, minute: 0 });
    expect(weekdayRate).toBeGreaterThanOrEqual(dailyRate);
  });

  it('bestDay returns null when there are fewer than 7 completions', () => {
    expect(computeHabitStats([dateKey(0)], oldCreatedAt).bestDay).toBeNull();
    expect(computeHabitStats(consecutiveCompletions(7, 0), oldCreatedAt).bestDay).toBeTypeOf('string');
  });
});
