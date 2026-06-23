import type { Habit } from '@/lib/habits/types';
import type { Achievement, AchievementId, Level, UserProfile } from './types';

// ── XP award amounts ─────────────────────────────────────────────────────────

export const XP_COMPLETE_HABIT = 10;
export const XP_ALL_DONE_BONUS = 50;
export const XP_STREAK_7       = 100;

// ── Level table ───────────────────────────────────────────────────────────────

export const LEVELS: Level[] = [
  { level: 1, title: 'Seedling',      minXP:    0, maxXP:   100, color: '#10B981' },
  { level: 2, title: 'Sprout',        minXP:  100, maxXP:   300, color: '#3B82F6' },
  { level: 3, title: 'Explorer',      minXP:  300, maxXP:   600, color: '#8B5CF6' },
  { level: 4, title: 'Builder',       minXP:  600, maxXP:  1000, color: '#F59E0B' },
  { level: 5, title: 'Streak Master', minXP: 1000, maxXP:  2000, color: '#EF4444' },
  { level: 6, title: 'Champion',      minXP: 2000, maxXP:  4000, color: '#EC4899' },
  { level: 7, title: 'Legend',        minXP: 4000, maxXP:    -1, color: '#6366F1' },
];

export function getLevel(xp: number): Level {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].minXP) return LEVELS[i];
  }
  return LEVELS[0];
}

/** Returns progress through the current level (0–1) and XP bookkeeping. */
export function getLevelProgress(xp: number): {
  current: Level;
  progress: number;
  xpInLevel: number;
  xpForLevel: number;
} {
  const current = getLevel(xp);
  if (current.maxXP === -1) {
    return { current, progress: 1, xpInLevel: xp - current.minXP, xpForLevel: 1 };
  }
  const xpForLevel = current.maxXP - current.minXP;
  const xpInLevel  = xp - current.minXP;
  return { current, progress: xpInLevel / xpForLevel, xpInLevel, xpForLevel };
}

// ── Achievement definitions ───────────────────────────────────────────────────

type AchievementDef = Omit<Achievement, 'unlockedAt'>;

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    id: 'first_step',
    name: 'First Step',
    description: 'Create your first habit',
    icon: 'footsteps-outline',
    color: '#10B981',
    xpReward: 25,
  },
  {
    id: 'perfect_day',
    name: 'Perfect Day',
    description: 'Complete all habits in a single day',
    icon: 'sunny-outline',
    color: '#F59E0B',
    xpReward: 50,
  },
  {
    id: 'week_warrior',
    name: 'Week Warrior',
    description: 'Reach a 7-day streak',
    icon: 'flame-outline',
    color: '#EF4444',
    xpReward: 100,
  },
  {
    id: 'consistent',
    name: 'Consistent',
    description: '30 total completions',
    icon: 'checkmark-circle-outline',
    color: '#3B82F6',
    xpReward: 75,
  },
  {
    id: 'collector',
    name: 'Collector',
    description: 'Have 5 active habits',
    icon: 'grid-outline',
    color: '#8B5CF6',
    xpReward: 50,
  },
  {
    id: 'centurion',
    name: 'Centurion',
    description: '100 total completions',
    icon: 'trophy-outline',
    color: '#EF4444',
    xpReward: 200,
  },
  {
    id: 'power_month',
    name: 'Power Month',
    description: 'Reach a 30-day streak',
    icon: 'star-outline',
    color: '#EC4899',
    xpReward: 300,
  },
];

export function buildDefaultAchievements(): Achievement[] {
  return ACHIEVEMENT_DEFS.map(def => ({ ...def, unlockedAt: null }));
}

// ── Achievement checker ────────────────────────────────────────────────────────

export type XpEvent = {
  allHabitsDone?: boolean;
};

/**
 * Checks all achievement conditions against the updated profile + current habits.
 * Returns the same array reference if nothing changed, or a new array with
 * newly-unlocked achievements patched in.
 */
export function checkAchievements(
  profile: UserProfile,
  habits: Habit[],
  event: XpEvent = {},
): Achievement[] {
  const activeHabits = habits.filter(h => (h.status ?? 'active') === 'active');
  const maxStreak    = activeHabits.reduce((m, h) => Math.max(m, h.streak ?? 0), 0);
  const unlockedIds  = new Set(
    profile.achievements
      .filter(a => a.unlockedAt !== null)
      .map(a => a.id as AchievementId),
  );

  const toUnlock: AchievementId[] = [];
  const check = (id: AchievementId, cond: boolean) => {
    if (!unlockedIds.has(id) && cond) toUnlock.push(id);
  };

  check('first_step',   habits.length >= 1);
  check('perfect_day',  !!event.allHabitsDone);
  check('week_warrior', maxStreak >= 7);
  check('power_month',  maxStreak >= 30);
  check('consistent',   profile.totalCompletions >= 30);
  check('centurion',    profile.totalCompletions >= 100);
  check('collector',    activeHabits.length >= 5);

  if (toUnlock.length === 0) return profile.achievements;

  const now = new Date().toISOString();
  return profile.achievements.map(a =>
    toUnlock.includes(a.id as AchievementId)
      ? { ...a, unlockedAt: now }
      : a,
  );
}
