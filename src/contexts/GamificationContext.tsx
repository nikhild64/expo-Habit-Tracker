import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import {
  COINS_ALL_DONE_BONUS,
  COINS_COMPLETE_HABIT,
  COINS_QUEST,
  COINS_STREAK_7,
  checkAchievements,
  evaluateQuests,
  generateDailyQuests,
  getLevelProgress,
} from '@/lib/gamification/rules';
import type { XpEvent } from '@/lib/gamification/rules';
import { loadProfile, saveProfile } from '@/lib/gamification/storage';
import type { DailyQuest, Level, UserProfile } from '@/lib/gamification/types';
import type { Habit } from '@/lib/habits/types';
import { toDateKey } from '@/lib/habits/streak';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LevelInfo = {
  current: Level;
  progress: number;
  xpInLevel: number;
  xpForLevel: number;
};

type GamificationContextValue = {
  profile:   UserProfile | null;
  loading:   boolean;
  levelInfo: LevelInfo | null;
  /** Award XP for a completion event and run achievement checks. */
  awardXP:   (amount: number, event: XpEvent, habits: Habit[]) => Promise<void>;
  /** Spend coins (returns false if insufficient). */
  spendCoins: (amount: number) => Promise<boolean>;
  /** Recompute today's quests against current habit state. */
  refreshQuests: (habits: Habit[]) => Promise<void>;
  /** Non-null for exactly one render cycle after XP is awarded — consume to show a toast. */
  lastXpGain:     number | null;
  clearLastXpGain: () => void;
};

const GamificationContext = createContext<GamificationContextValue>({
  profile:         null,
  loading:         true,
  levelInfo:       null,
  awardXP:         async () => {},
  spendCoins:      async () => false,
  refreshQuests:   async () => {},
  lastXpGain:      null,
  clearLastXpGain: () => {},
});

// ── Provider ─────────────────────────────────────────────────────────────────

export function GamificationProvider({ children }: { children: ReactNode }) {
  const [profile,     setProfile]     = useState<UserProfile | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [lastXpGain,  setLastXpGain]  = useState<number | null>(null);
  const profileRef = useRef<UserProfile | null>(null);

  useEffect(() => {
    loadProfile().then(p => {
      // On load: ensure today's quests exist
      const today = toDateKey(new Date());
      let updated = p;
      if (!p.dailyQuests || p.questsRefreshedDate !== today) {
        updated = {
          ...p,
          dailyQuests: generateDailyQuests(today),
          questsRefreshedDate: today,
          coins: p.coins ?? 0,
        };
        saveProfile(updated).catch(console.error);
      }
      profileRef.current = updated;
      setProfile(updated);
      setLoading(false);
    });
  }, []);

  const refreshQuests = useCallback(async (habits: Habit[]) => {
    const current = profileRef.current;
    if (!current) return;
    const today = toDateKey(new Date());
    let quests = current.dailyQuests ?? [];
    if (!current.questsRefreshedDate || current.questsRefreshedDate !== today) {
      quests = generateDailyQuests(today);
    }
    const evaluated = evaluateQuests(quests, habits);

    // Award rewards for any quest newly-completed since last check
    let xpGain = 0;
    let coinGain = 0;
    for (let i = 0; i < evaluated.length; i++) {
      const wasDone = quests[i]?.completed ?? false;
      if (!wasDone && evaluated[i].completed) {
        xpGain += evaluated[i].xpReward;
        coinGain += evaluated[i].coinReward;
      }
    }

    const updated: UserProfile = {
      ...current,
      xp: current.xp + xpGain,
      coins: (current.coins ?? 0) + coinGain,
      dailyQuests: evaluated,
      questsRefreshedDate: today,
      lastUpdated: new Date().toISOString(),
    };
    profileRef.current = updated;
    setProfile(updated);
    saveProfile(updated).catch(console.error);
  }, []);

  const awardXP = useCallback(async (
    amount:  number,
    event:   XpEvent,
    habits:  Habit[],
  ): Promise<void> => {
    const current = profileRef.current;
    if (!current) return;

    // Compute coins earned for this completion
    let coinGain = COINS_COMPLETE_HABIT;
    if (event.allHabitsDone) coinGain += COINS_ALL_DONE_BONUS;
    const wasStreak7 = amount >= 100; // crude — XP_STREAK_7 = 100 indicates milestone
    if (wasStreak7) coinGain += COINS_STREAK_7;

    const withXP: UserProfile = {
      ...current,
      xp:               current.xp + amount,
      coins:            (current.coins ?? 0) + coinGain,
      totalCompletions: current.totalCompletions + 1,
      lastUpdated:      new Date().toISOString(),
    };

    const achievements = checkAchievements(withXP, habits, event);

    // Bonus XP + coins for achievements that just unlocked
    let bonusXP = 0;
    let bonusCoins = 0;
    for (const a of achievements) {
      const wasPreviouslyLocked = current.achievements.find(ca => ca.id === a.id)?.unlockedAt === null;
      if (a.unlockedAt !== null && wasPreviouslyLocked) {
        bonusXP += a.xpReward;
        bonusCoins += a.coinReward ?? 0;
      }
    }

    // Evaluate today's daily quests
    const today = toDateKey(new Date());
    let quests = current.dailyQuests ?? [];
    if (!current.questsRefreshedDate || current.questsRefreshedDate !== today) {
      quests = generateDailyQuests(today);
    }
    const evaluatedQuests = evaluateQuests(quests, habits);

    let questXP = 0;
    let questCoins = 0;
    for (let i = 0; i < evaluatedQuests.length; i++) {
      const wasDone = quests[i]?.completed ?? false;
      if (!wasDone && evaluatedQuests[i].completed) {
        questXP += evaluatedQuests[i].xpReward;
        questCoins += evaluatedQuests[i].coinReward + COINS_QUEST;
      }
    }

    const updated: UserProfile = {
      ...withXP,
      xp:          withXP.xp + bonusXP + questXP,
      coins:       (withXP.coins ?? 0) + bonusCoins + questCoins,
      achievements,
      dailyQuests: evaluatedQuests,
      questsRefreshedDate: today,
    };

    profileRef.current = updated;
    setProfile(updated);
    setLastXpGain(amount + bonusXP + questXP);
    saveProfile(updated).catch(console.error);
  }, []);

  const spendCoins = useCallback(async (amount: number): Promise<boolean> => {
    const current = profileRef.current;
    if (!current) return false;
    const have = current.coins ?? 0;
    if (have < amount) return false;
    const updated: UserProfile = {
      ...current,
      coins: have - amount,
      lastUpdated: new Date().toISOString(),
    };
    profileRef.current = updated;
    setProfile(updated);
    await saveProfile(updated);
    return true;
  }, []);

  const clearLastXpGain = useCallback(() => setLastXpGain(null), []);

  const levelInfo: LevelInfo | null = profile ? getLevelProgress(profile.xp) : null;

  return (
    <GamificationContext.Provider
      value={{ profile, loading, levelInfo, awardXP, spendCoins, refreshQuests, lastXpGain, clearLastXpGain }}
    >
      {children}
    </GamificationContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useGamification() {
  return useContext(GamificationContext);
}

export type { DailyQuest };
