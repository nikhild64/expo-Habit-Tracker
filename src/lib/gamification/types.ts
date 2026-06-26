export type AchievementId =
  | 'first_step'
  | 'week_warrior'
  | 'centurion'
  | 'perfect_day'
  | 'power_month'
  | 'collector'
  | 'consistent'
  // ── v2 additions ──
  | 'fortnight'
  | 'century_streak'
  | 'early_bird'
  | 'night_owl'
  | 'all_categories'
  | 'comeback'
  | 'variety'
  | 'half_year'
  | 'quarter_year'
  | 'morning_master'
  | 'evening_master'
  | 'thousand_done'
  | 'level_3'
  | 'level_5'
  | 'level_7'
  | 'freezer'
  | 'all_perfect_week';

export type Achievement = {
  id: AchievementId;
  name: string;
  description: string;
  icon: string;
  color: string;
  xpReward: number;
  coinReward?: number;
  category?: 'Consistency' | 'Variety' | 'Resilience' | 'Milestones' | 'Hidden';
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

export type DailyQuest = {
  id: string;
  /** YYYY-MM-DD date this quest is valid for. */
  date: string;
  title: string;
  description: string;
  /** Reward fields */
  xpReward: number;
  coinReward: number;
  /** True once the user satisfies the quest condition for this day. */
  completed: boolean;
  /** Icon used in the quest card. */
  icon: string;
};

export type UserProfile = {
  xp: number;
  /** Spendable coins (v2). Earned from completions + achievements + quests. */
  coins?: number;
  totalCompletions: number;
  achievements: Achievement[];
  /** Daily quests for today (v2). Refreshed on date change. */
  dailyQuests?: DailyQuest[];
  /** Last date we generated dailyQuests for. */
  questsRefreshedDate?: string;
  createdAt: string;
  lastUpdated: string;
};
