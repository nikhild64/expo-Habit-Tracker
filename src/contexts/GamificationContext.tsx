import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { checkAchievements, getLevelProgress } from '@/lib/gamification/rules';
import type { XpEvent } from '@/lib/gamification/rules';
import { loadProfile, saveProfile } from '@/lib/gamification/storage';
import type { Level, UserProfile } from '@/lib/gamification/types';
import type { Habit } from '@/lib/habits/types';

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
  /** Non-null for exactly one render cycle after XP is awarded — consume to show a toast. */
  lastXpGain:     number | null;
  clearLastXpGain: () => void;
};

const GamificationContext = createContext<GamificationContextValue>({
  profile:         null,
  loading:         true,
  levelInfo:       null,
  awardXP:         async () => {},
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
      profileRef.current = p;
      setProfile(p);
      setLoading(false);
    });
  }, []);

  const awardXP = useCallback(async (
    amount:  number,
    event:   XpEvent,
    habits:  Habit[],
  ): Promise<void> => {
    const current = profileRef.current;
    if (!current) return;

    // Increment total completions and XP
    const withXP: UserProfile = {
      ...current,
      xp:               current.xp + amount,
      totalCompletions: current.totalCompletions + 1,
      lastUpdated:      new Date().toISOString(),
    };

    // Check & unlock newly-earned achievements (with updated totalCompletions)
    const achievements = checkAchievements(withXP, habits, event);

    // Bonus XP for achievements that just unlocked
    const bonusXP = achievements.reduce<number>((sum, a) => {
      const wasPreviouslyLocked = current.achievements.find(ca => ca.id === a.id)?.unlockedAt === null;
      return a.unlockedAt !== null && wasPreviouslyLocked ? sum + a.xpReward : sum;
    }, 0);

    const updated: UserProfile = {
      ...withXP,
      xp:          withXP.xp + bonusXP,
      achievements,
    };

    profileRef.current = updated;
    setProfile(updated);
    setLastXpGain(amount + bonusXP);
    saveProfile(updated).catch(console.error);
  }, []);

  const clearLastXpGain = useCallback(() => setLastXpGain(null), []);

  const levelInfo: LevelInfo | null = profile ? getLevelProgress(profile.xp) : null;

  return (
    <GamificationContext.Provider
      value={{ profile, loading, levelInfo, awardXP, lastXpGain, clearLastXpGain }}
    >
      {children}
    </GamificationContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useGamification() {
  return useContext(GamificationContext);
}
