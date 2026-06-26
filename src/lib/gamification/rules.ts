import type { Habit, HabitCategory } from '@/lib/habits/types';
import { isDoneToday, toDateKey } from '@/lib/habits/streak';
import type { Achievement, AchievementId, DailyQuest, Level, UserProfile } from './types';

// ── XP & coin award amounts ───────────────────────────────────────────────────

export const XP_COMPLETE_HABIT = 10;
export const XP_ALL_DONE_BONUS = 50;
export const XP_STREAK_7       = 100;

/** Coins earned per habit completion. */
export const COINS_COMPLETE_HABIT = 2;
/** Coins for an all-done day. */
export const COINS_ALL_DONE_BONUS = 15;
/** Coins for a 7-day streak milestone. */
export const COINS_STREAK_7 = 25;
/** Coins for completing a daily quest. */
export const COINS_QUEST = 10;

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

// ── Achievement definitions (25 total) ────────────────────────────────────────

type AchievementDef = Omit<Achievement, 'unlockedAt'>;

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // Milestones
  { id: 'first_step',     name: 'First Step',       description: 'Create your first habit',           icon: 'footsteps-outline',     color: '#10B981', xpReward: 25,  coinReward: 5,   category: 'Milestones' },
  { id: 'collector',      name: 'Collector',         description: 'Have 5 active habits',              icon: 'grid-outline',          color: '#8B5CF6', xpReward: 50,  coinReward: 10,  category: 'Milestones' },
  { id: 'variety',        name: 'Curator',           description: 'Use 3+ categories',                 icon: 'apps-outline',          color: '#06B6D4', xpReward: 50,  coinReward: 10,  category: 'Variety' },
  { id: 'all_categories', name: 'Renaissance',       description: 'Have habits in all categories',     icon: 'sparkles-outline',      color: '#A855F7', xpReward: 200, coinReward: 50,  category: 'Variety' },

  // Streaks (Consistency)
  { id: 'week_warrior',   name: 'Week Warrior',      description: 'Reach a 7-day streak',              icon: 'flame-outline',         color: '#EF4444', xpReward: 100, coinReward: 20,  category: 'Consistency' },
  { id: 'fortnight',      name: 'Fortnight',         description: 'Reach a 14-day streak',             icon: 'flame',                 color: '#F97316', xpReward: 150, coinReward: 30,  category: 'Consistency' },
  { id: 'power_month',    name: 'Power Month',       description: 'Reach a 30-day streak',             icon: 'star-outline',          color: '#EC4899', xpReward: 300, coinReward: 60,  category: 'Consistency' },
  { id: 'quarter_year',   name: 'Quarter Year',      description: 'Reach a 90-day streak',             icon: 'star',                  color: '#8B5CF6', xpReward: 600, coinReward: 100, category: 'Consistency' },
  { id: 'half_year',      name: 'Half Year Hero',    description: 'Reach a 180-day streak',            icon: 'medal-outline',         color: '#F59E0B', xpReward: 1000,coinReward: 200, category: 'Consistency' },
  { id: 'century_streak', name: 'Century Streak',    description: 'Reach a 100-day streak',            icon: 'medal',                 color: '#FBBF24', xpReward: 750, coinReward: 150, category: 'Consistency' },

  // Completion counts
  { id: 'consistent',     name: 'Consistent',        description: '30 total completions',              icon: 'checkmark-circle-outline', color: '#3B82F6', xpReward: 75,  coinReward: 15,  category: 'Milestones' },
  { id: 'centurion',      name: 'Centurion',         description: '100 total completions',             icon: 'trophy-outline',        color: '#EF4444', xpReward: 200, coinReward: 40,  category: 'Milestones' },
  { id: 'thousand_done',  name: 'Marathoner',        description: '1,000 total completions',           icon: 'trophy',                color: '#FBBF24', xpReward: 1500,coinReward: 300, category: 'Milestones' },

  // Daily patterns
  { id: 'perfect_day',    name: 'Perfect Day',       description: 'Complete all habits in one day',    icon: 'sunny-outline',         color: '#F59E0B', xpReward: 50,  coinReward: 10,  category: 'Consistency' },
  { id: 'all_perfect_week', name: 'Perfect Week',    description: '7 days in a row with everything done', icon: 'ribbon-outline',    color: '#10B981', xpReward: 400, coinReward: 75,  category: 'Consistency' },

  // Time-of-day specific
  { id: 'early_bird',     name: 'Early Bird',        description: 'Complete a habit before 7 AM',      icon: 'partly-sunny-outline',  color: '#0EA5E9', xpReward: 30,  coinReward: 8,   category: 'Variety' },
  { id: 'night_owl',      name: 'Night Owl',         description: 'Complete a habit after 10 PM',      icon: 'moon-outline',          color: '#6366F1', xpReward: 30,  coinReward: 8,   category: 'Variety' },
  { id: 'morning_master', name: 'Morning Master',    description: 'Complete 30 morning habits',        icon: 'sunny',                 color: '#F59E0B', xpReward: 150, coinReward: 30,  category: 'Variety' },
  { id: 'evening_master', name: 'Evening Master',    description: 'Complete 30 evening habits',        icon: 'moon',                  color: '#6366F1', xpReward: 150, coinReward: 30,  category: 'Variety' },

  // Levels
  { id: 'level_3',        name: 'Explorer Unlocked', description: 'Reach Level 3',                     icon: 'arrow-up-circle',       color: '#8B5CF6', xpReward: 50,  coinReward: 20,  category: 'Milestones' },
  { id: 'level_5',        name: 'Streak Master',     description: 'Reach Level 5',                     icon: 'flash',                 color: '#EF4444', xpReward: 100, coinReward: 40,  category: 'Milestones' },
  { id: 'level_7',        name: 'Living Legend',     description: 'Reach Level 7',                     icon: 'star',                  color: '#6366F1', xpReward: 200, coinReward: 100, category: 'Milestones' },

  // Resilience
  { id: 'freezer',        name: 'Cool Customer',     description: 'Earn 3 streak freezes',             icon: 'snow-outline',          color: '#3B82F6', xpReward: 75,  coinReward: 15,  category: 'Resilience' },
  { id: 'comeback',       name: 'Comeback Kid',      description: 'Return after a 7+ day gap',         icon: 'refresh-outline',       color: '#14B8A6', xpReward: 100, coinReward: 20,  category: 'Resilience' },
];

export function buildDefaultAchievements(): Achievement[] {
  return ACHIEVEMENT_DEFS.map(def => ({ ...def, unlockedAt: null }));
}

// ── Achievement checker ────────────────────────────────────────────────────────

export type XpEvent = {
  allHabitsDone?: boolean;
};

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

  // Tally time-of-day completions across all habits
  let morningCount = 0;
  let eveningCount = 0;
  let earlyEver = false;
  let lateEver = false;
  for (const h of habits) {
    const tod = h.timeOfDay ?? 'anytime';
    const count = (h.completions ?? []).length;
    if (tod === 'morning') morningCount += count;
    if (tod === 'evening') eveningCount += count;
    for (const iso of Object.values(h.completionTimestamps ?? {})) {
      const hr = new Date(iso).getHours();
      if (hr < 7) earlyEver = true;
      if (hr >= 22) lateEver = true;
    }
  }

  const categories = new Set<HabitCategory>(habits.map(h => h.category ?? 'Other'));
  const allCategoriesCount = 7; // total HabitCategory values in our enum
  const totalFreezes = habits.reduce((s, h) => s + (h.freezesAvailable ?? 0), 0);

  const level = getLevel(profile.xp);

  check('first_step',     habits.length >= 1);
  check('perfect_day',    !!event.allHabitsDone);
  check('week_warrior',   maxStreak >= 7);
  check('fortnight',      maxStreak >= 14);
  check('power_month',    maxStreak >= 30);
  check('quarter_year',   maxStreak >= 90);
  check('century_streak', maxStreak >= 100);
  check('half_year',      maxStreak >= 180);
  check('consistent',     profile.totalCompletions >= 30);
  check('centurion',      profile.totalCompletions >= 100);
  check('thousand_done',  profile.totalCompletions >= 1000);
  check('collector',      activeHabits.length >= 5);
  check('variety',        categories.size >= 3);
  check('all_categories', categories.size >= allCategoriesCount);
  check('early_bird',     earlyEver);
  check('night_owl',      lateEver);
  check('morning_master', morningCount >= 30);
  check('evening_master', eveningCount >= 30);
  check('level_3',        level.level >= 3);
  check('level_5',        level.level >= 5);
  check('level_7',        level.level >= 7);
  check('freezer',        totalFreezes >= 3);

  if (toUnlock.length === 0) return profile.achievements;

  const now = new Date().toISOString();
  return profile.achievements.map(a =>
    toUnlock.includes(a.id as AchievementId)
      ? { ...a, unlockedAt: now }
      : a,
  );
}

// ── Daily Quests ────────────────────────────────────────────────────────────

const QUEST_POOL: Array<Omit<DailyQuest, 'date' | 'completed'>> = [
  { id: 'q_three',    title: 'Triple play',        description: 'Complete any 3 habits today',          xpReward: 25, coinReward: 10, icon: 'list-outline' },
  { id: 'q_morning',  title: 'Morning person',     description: 'Finish all morning habits',            xpReward: 30, coinReward: 12, icon: 'sunny-outline' },
  { id: 'q_evening',  title: 'Wind down',          description: 'Finish all evening habits',            xpReward: 30, coinReward: 12, icon: 'moon-outline' },
  { id: 'q_health',   title: 'Body & mind',        description: 'Complete a Health habit',              xpReward: 20, coinReward: 8,  icon: 'heart-outline' },
  { id: 'q_learn',    title: 'Always learning',    description: 'Complete a Learning habit',            xpReward: 20, coinReward: 8,  icon: 'book-outline' },
  { id: 'q_first',    title: 'Early start',        description: 'Complete a habit before 9 AM',         xpReward: 25, coinReward: 10, icon: 'time-outline' },
  { id: 'q_streak',   title: 'Streak guardian',    description: 'Keep every active streak going today', xpReward: 35, coinReward: 15, icon: 'flame-outline' },
  { id: 'q_perfect',  title: 'Perfect day',        description: 'Complete all habits today',            xpReward: 50, coinReward: 20, icon: 'star-outline' },
];

/** Picks 3 distinct quests for the given date using a deterministic seed. */
export function generateDailyQuests(dateKey: string): DailyQuest[] {
  // Deterministic shuffle based on date hash
  let seed = 0;
  for (let i = 0; i < dateKey.length; i++) seed = (seed * 31 + dateKey.charCodeAt(i)) & 0xffffffff;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const shuffled = [...QUEST_POOL].sort(() => rng() - 0.5);
  return shuffled.slice(0, 3).map(q => ({ ...q, date: dateKey, completed: false }));
}

/** Evaluates which of today's quests are satisfied given current state. */
export function evaluateQuests(
  quests: DailyQuest[],
  habits: Habit[],
): DailyQuest[] {
  const today = toDateKey(new Date());
  if (quests.length === 0 || quests[0].date !== today) return quests;

  const activeHabits = habits.filter(h => (h.status ?? 'active') === 'active');
  const doneToday = activeHabits.filter(h => isDoneToday(h));
  const completedCount = doneToday.length;

  // Active streaks: every habit with streak > 0 must still be done today
  const allStreaksKept = activeHabits
    .filter(h => h.streak > 0)
    .every(h => isDoneToday(h));

  return quests.map(q => {
    let completed = q.completed;
    if (!completed) {
      switch (q.id) {
        case 'q_three':
          completed = completedCount >= 3;
          break;
        case 'q_morning':
          {
            const morningHabits = activeHabits.filter(h => h.timeOfDay === 'morning');
            completed = morningHabits.length > 0 && morningHabits.every(h => isDoneToday(h));
          }
          break;
        case 'q_evening':
          {
            const eveHabits = activeHabits.filter(h => h.timeOfDay === 'evening');
            completed = eveHabits.length > 0 && eveHabits.every(h => isDoneToday(h));
          }
          break;
        case 'q_health':
          completed = doneToday.some(h => h.category === 'Health');
          break;
        case 'q_learn':
          completed = doneToday.some(h => h.category === 'Learning');
          break;
        case 'q_first':
          completed = doneToday.some(h => {
            const iso = (h.completionTimestamps ?? {})[today];
            return iso ? new Date(iso).getHours() < 9 : false;
          });
          break;
        case 'q_streak':
          completed = allStreaksKept && doneToday.length > 0;
          break;
        case 'q_perfect':
          completed = activeHabits.length > 0 && doneToday.length === activeHabits.length;
          break;
      }
    }
    return { ...q, completed };
  });
}
