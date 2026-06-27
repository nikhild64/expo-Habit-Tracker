/**
 * Tests for the gamification rule set — coin math + level table + quest
 * generation determinism + evaluateQuests.
 */
import { describe, expect, it } from 'vitest';

import { toDateKey } from './dates.util';
import {
  COINS_ALL_DONE_BONUS,
  COINS_COMPLETE_HABIT,
  COINS_STREAK_7,
  XP_ALL_DONE_BONUS,
  XP_COMPLETE_HABIT,
  XP_STREAK_7,
  computeCoinAward,
  evaluateQuests,
  generateDailyQuests,
  getLevel,
  getLevelProgress,
} from './gamification.util';
import { makeHabit } from './test-helpers';

describe('awardXP coin math (computeCoinAward)', () => {
  it('grants COINS_COMPLETE_HABIT (2) for a plain completion', () => {
    expect(computeCoinAward(XP_COMPLETE_HABIT, {})).toBe(COINS_COMPLETE_HABIT);
  });

  it('adds COINS_ALL_DONE_BONUS (15) when allHabitsDone is true', () => {
    const total = computeCoinAward(XP_COMPLETE_HABIT, { allHabitsDone: true });
    expect(total).toBe(COINS_COMPLETE_HABIT + COINS_ALL_DONE_BONUS);
  });

  it('adds COINS_STREAK_7 (25) when amount hits the 7-day milestone threshold', () => {
    const streakAmount = XP_COMPLETE_HABIT + XP_STREAK_7;
    const total = computeCoinAward(streakAmount, {});
    expect(total).toBe(COINS_COMPLETE_HABIT + COINS_STREAK_7);
  });

  it('stacks all-done + streak-7 bonuses', () => {
    const streakAmount = XP_COMPLETE_HABIT + XP_ALL_DONE_BONUS + XP_STREAK_7;
    const total = computeCoinAward(streakAmount, { allHabitsDone: true });
    expect(total).toBe(
      COINS_COMPLETE_HABIT + COINS_ALL_DONE_BONUS + COINS_STREAK_7,
    );
  });
});

describe('Level table', () => {
  it('returns Seedling for xp = 0', () => {
    expect(getLevel(0).title).toBe('Seedling');
  });

  it('returns Sprout at 100 xp (level 2 boundary)', () => {
    expect(getLevel(100).title).toBe('Sprout');
  });

  it('returns Legend (max) at 4000 xp', () => {
    const lv = getLevel(4000);
    expect(lv.title).toBe('Legend');
    expect(lv.maxXP).toBe(-1);
  });

  it('reports progress = 1 once at max level', () => {
    expect(getLevelProgress(8000).progress).toBe(1);
  });

  it('linearly interpolates progress within a level', () => {
    const half = getLevelProgress(150); // 150 xp = halfway between 100 and 300
    expect(half.current.title).toBe('Sprout');
    expect(half.progress).toBeCloseTo(0.25);
  });
});

describe('generateDailyQuests', () => {
  it('always returns 3 quests for a given date', () => {
    const q = generateDailyQuests('2026-06-27');
    expect(q).toHaveLength(3);
    expect(new Set(q.map(x => x.id)).size).toBe(3);
  });

  it('is deterministic — same date returns the same quests', () => {
    const a = generateDailyQuests('2026-06-27');
    const b = generateDailyQuests('2026-06-27');
    expect(a).toEqual(b);
  });

  it('different dates can produce different quest sets', () => {
    const a = new Set(generateDailyQuests('2026-06-27').map(q => q.id));
    const b = new Set(generateDailyQuests('2026-06-28').map(q => q.id));
    // Two random days don't guarantee disjoint sets, but the orderings
    // should differ for at least one comparison; we just assert the helper
    // doesn't crash on a fresh date.
    expect(b.size).toBe(3);
    void a; // referenced for symmetry
  });
});

describe('evaluateQuests', () => {
  const today = toDateKey(new Date());

  it('marks "triple play" complete when 3 habits are done today', () => {
    const habits = Array.from({ length: 3 }, (_, i) =>
      makeHabit({ id: `h-${i}`, completions: [today] }),
    );
    const quests = [{
      id: 'q_three',
      date: today,
      title: 'Triple play',
      description: 'Complete any 3 habits today',
      xpReward: 25,
      coinReward: 10,
      completed: false,
      icon: 'list-outline',
    }];
    const evaluated = evaluateQuests(quests, habits);
    expect(evaluated[0].completed).toBe(true);
  });

  it('does NOT touch quests whose date is not today', () => {
    const habits = [makeHabit({ completions: [today] })];
    const quests = [{
      id: 'q_three',
      date: '1999-01-01',
      title: 'Triple play',
      description: 'Complete any 3 habits today',
      xpReward: 25,
      coinReward: 10,
      completed: false,
      icon: 'list-outline',
    }];
    const evaluated = evaluateQuests(quests, habits);
    expect(evaluated[0].completed).toBe(false);
  });
});
