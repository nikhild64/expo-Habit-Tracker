export type AchievementId =
  | 'first_step'
  | 'week_warrior'
  | 'centurion'
  | 'perfect_day'
  | 'power_month'
  | 'collector'
  | 'consistent';

export type Achievement = {
  id: AchievementId;
  name: string;
  description: string;
  icon: string;
  color: string;
  xpReward: number;
  /** ISO timestamp when unlocked, or null if still locked. */
  unlockedAt: string | null;
};

export type Level = {
  level: number;
  title: string;
  minXP: number;
  /** XP threshold at which the NEXT level begins; -1 means this is the max level. */
  maxXP: number;
  color: string;
};

export type UserProfile = {
  xp: number;
  totalCompletions: number;
  achievements: Achievement[];
  createdAt: string;
  lastUpdated: string;
};
