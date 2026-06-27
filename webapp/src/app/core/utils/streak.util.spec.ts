/**
 * Tests for streak + frequency-aware logic.
 * Mirrors the same fixture shape used by the mobile app.
 */
import { describe, expect, it } from 'vitest';

import {
  computeFrequencyAwareStreak,
  computeStreak,
  isDoneToday,
} from './streak.util';
import { consecutiveCompletions, dateKey, makeHabit } from './test-helpers';

describe('computeStreak (daily)', () => {
  it('returns 0 for an empty history', () => {
    expect(computeStreak([])).toEqual({ streak: 0, bestStreak: 0 });
  });

  it('counts a fresh consecutive run ending today', () => {
    const c = consecutiveCompletions(5, 0);
    const { streak, bestStreak } = computeStreak(c);
    expect(streak).toBe(5);
    expect(bestStreak).toBe(5);
  });

  it('current streak survives missing today (last entry = yesterday)', () => {
    const c = consecutiveCompletions(3, 1);
    expect(computeStreak(c).streak).toBe(3);
  });

  it('current streak resets after a 2+ day gap', () => {
    // last completion = 3 days ago — yesterday is missing, so current = 0
    const c = consecutiveCompletions(3, 3);
    expect(computeStreak(c).streak).toBe(0);
  });

  it('bestStreak is the longest historical run, not just the current one', () => {
    const old = consecutiveCompletions(10, 30); // 10-day run ending 30 days ago
    const now = consecutiveCompletions(2, 0); //  2-day run ending today
    const { streak, bestStreak } = computeStreak([...old, ...now]);
    expect(streak).toBe(2);
    expect(bestStreak).toBe(10);
  });
});

describe('computeFrequencyAwareStreak — weekdays', () => {
  it('treats weekends as transparent for a Mon–Fri habit', () => {
    // Build a history of every weekday in the last two weeks.
    const completions: string[] = [];
    for (let d = 0; d < 14; d++) {
      const dt = new Date();
      dt.setDate(dt.getDate() - d);
      const dow = dt.getDay();
      if (dow >= 1 && dow <= 5) completions.push(dateKey(d));
    }
    const { streak, bestStreak } = computeFrequencyAwareStreak(completions, {
      kind: 'weekdays',
      hour: 9,
      minute: 0,
    });
    // Should be at least one full work week without breakage.
    expect(streak).toBeGreaterThanOrEqual(5);
    expect(bestStreak).toBeGreaterThanOrEqual(streak);
  });
});

describe('computeFrequencyAwareStreak — xperweek', () => {
  it('counts a week as qualifying when ≥ count completions are present', () => {
    // 3 completions in the current ISO week.
    const today = new Date();
    const dow = today.getDay();
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    const completions: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - mondayOffset + i);
      if (d <= today) completions.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }

    const res = computeFrequencyAwareStreak(completions, {
      kind: 'xperweek',
      count: 3,
      hour: 9,
      minute: 0,
    });
    expect(res.streak).toBeGreaterThanOrEqual(1);
  });
});

describe('isDoneToday', () => {
  it('binary daily habit is done when today is in completions', () => {
    const habit = makeHabit({ completions: [dateKey(0)] });
    expect(isDoneToday(habit)).toBe(true);
  });

  it('binary daily habit is not done without today in completions', () => {
    const habit = makeHabit({ completions: [dateKey(1)] });
    expect(isDoneToday(habit)).toBe(false);
  });

  it('quantitative habit requires progress >= target', () => {
    const habit = makeHabit({
      habitType: 'quantitative',
      target: { value: 8, unit: 'glasses' },
      progress: { [dateKey(0)]: 5 },
      completions: [dateKey(0)],
    });
    expect(isDoneToday(habit)).toBe(false);

    const habitDone = makeHabit({
      habitType: 'quantitative',
      target: { value: 8, unit: 'glasses' },
      progress: { [dateKey(0)]: 8 },
      completions: [dateKey(0)],
    });
    expect(isDoneToday(habitDone)).toBe(true);
  });

  it('negative habit is done when there is no slip today', () => {
    const habit = makeHabit({ habitType: 'negative', slipDates: [] });
    expect(isDoneToday(habit)).toBe(true);

    const slipped = makeHabit({
      habitType: 'negative',
      slipDates: [dateKey(0)],
    });
    expect(isDoneToday(slipped)).toBe(false);
  });

  it('timed habit requires accumulated seconds >= timerSeconds target', () => {
    const habit = makeHabit({
      habitType: 'timed',
      target: { value: 30, unit: 'min', timerSeconds: 1800 },
      sessionSeconds: { [dateKey(0)]: 600 },
      completions: [dateKey(0)],
    });
    expect(isDoneToday(habit)).toBe(false);

    const reachedTarget = makeHabit({
      habitType: 'timed',
      target: { value: 30, unit: 'min', timerSeconds: 1800 },
      sessionSeconds: { [dateKey(0)]: 1800 },
      completions: [dateKey(0)],
    });
    expect(isDoneToday(reachedTarget)).toBe(true);
  });
});
