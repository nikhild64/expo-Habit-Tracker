import { Injectable, computed, inject, signal } from '@angular/core';

import type { Habit } from '../models/habit';
import type {
  Achievement,
  DailyQuest,
  Level,
  UserProfile,
} from '../models/gamification';
import { toDateKey } from '../utils/dates.util';
import {
  COINS_ALL_DONE_BONUS,
  COINS_COMPLETE_HABIT,
  COINS_QUEST,
  COINS_STREAK_7,
  XP_STREAK_7,
  buildDefaultAchievements,
  checkAchievements,
  evaluateQuests,
  generateDailyQuests,
  getLevelProgress,
  type XpEvent,
} from '../utils/gamification.util';
import { STORAGE_KEYS, StorageService } from './storage.service';

export type LevelInfo = {
  current: Level;
  progress: number;
  xpInLevel: number;
  xpForLevel: number;
};

function makeDefaultProfile(): UserProfile {
  const now = new Date().toISOString();
  return {
    xp:               0,
    coins:            0,
    totalCompletions: 0,
    achievements:     buildDefaultAchievements(),
    createdAt:        now,
    lastUpdated:      now,
  };
}

/**
 * GamificationService — port of src/contexts/GamificationContext.tsx.
 *
 * Owns the UserProfile (XP, coins, achievements, daily quests) and persists
 * every commit to IndexedDB under `profile_v1` (mirrors the mobile app, so
 * the full-backup JSON round-trips).
 *
 * `awardXP(amount, event, habits)` is the single entry point used by
 * HabitsService after a successful completion — it computes:
 *   1. The base XP / coin reward.
 *   2. Any all-done / 7-day-streak bonuses.
 *   3. New achievement unlocks (+ their bonus XP & coins).
 *   4. Any daily quests freshly completed by this event.
 *
 * After awarding, `lastXpGain()` exposes the total XP earned so the UI can
 * show a single "+N XP" toast and then clear it with `clearLastXpGain()`.
 */
@Injectable({ providedIn: 'root' })
export class GamificationService {
  private readonly storage = inject(StorageService);

  readonly profile = signal<UserProfile | null>(null);
  readonly loading = signal(true);
  readonly lastXpGain = signal<number | null>(null);

  readonly levelInfo = computed<LevelInfo | null>(() => {
    const p = this.profile();
    return p ? getLevelProgress(p.xp) : null;
  });

  readonly coins = computed(() => this.profile()?.coins ?? 0);
  readonly totalCompletions = computed(() => this.profile()?.totalCompletions ?? 0);
  readonly achievements = computed<Achievement[]>(
    () => this.profile()?.achievements ?? [],
  );
  readonly dailyQuests = computed<DailyQuest[]>(
    () => this.profile()?.dailyQuests ?? [],
  );

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    const saved = await this.storage.getItem<Partial<UserProfile>>(STORAGE_KEYS.profile);
    const def = makeDefaultProfile();

    let profile: UserProfile;
    if (saved) {
      // Merge so any newly-added achievement definitions are included.
      profile = {
        ...def,
        ...saved,
        achievements: def.achievements.map(defAch => {
          const existing = (saved.achievements ?? []).find(a => a.id === defAch.id);
          return existing ?? defAch;
        }),
      };
    } else {
      profile = def;
    }

    // Ensure today's quests exist.
    const today = toDateKey(new Date());
    if (!profile.dailyQuests || profile.questsRefreshedDate !== today) {
      profile = {
        ...profile,
        dailyQuests: generateDailyQuests(today),
        questsRefreshedDate: today,
        coins: profile.coins ?? 0,
      };
      await this.storage.setItem(STORAGE_KEYS.profile, profile);
    }

    this.profile.set(profile);
    this.loading.set(false);
  }

  private async commit(next: UserProfile): Promise<void> {
    this.profile.set(next);
    await this.storage.setItem(STORAGE_KEYS.profile, next);
  }

  /**
   * Re-evaluates today's quests against the current habits list and persists
   * any newly-completed quests (plus their XP/coin rewards). Safe to call
   * repeatedly: when no quest transitioned `false → true` and the stored
   * `questsRefreshedDate` already matches today, this is a no-op (no signal
   * write, no IndexedDB write). Idempotency is load-bearing — Profile fires
   * this on every habit change and we must not produce a new profile object
   * (with a fresh `lastUpdated`) when nothing actually changed.
   */
  async refreshQuests(habits: Habit[]): Promise<void> {
    const current = this.profile();
    if (!current) return;
    const today = toDateKey(new Date());
    const needsDateRefresh =
      !current.questsRefreshedDate || current.questsRefreshedDate !== today;
    let quests = current.dailyQuests ?? [];
    if (needsDateRefresh) {
      quests = generateDailyQuests(today);
    }
    const evaluated = evaluateQuests(quests, habits);

    let xpGain = 0;
    let coinGain = 0;
    for (let i = 0; i < evaluated.length; i++) {
      const wasDone = quests[i]?.completed ?? false;
      if (!wasDone && evaluated[i].completed) {
        xpGain += evaluated[i].xpReward;
        coinGain += evaluated[i].coinReward;
      }
    }

    // Idempotency guard: with `evaluateQuests` only ever flipping `completed`
    // from false→true, `xpGain === 0 && coinGain === 0` means no quest state
    // transitioned. If the stored date is also today, the persisted profile
    // already reflects reality — skip the write.
    if (!needsDateRefresh && xpGain === 0 && coinGain === 0) return;

    await this.commit({
      ...current,
      xp: current.xp + xpGain,
      coins: (current.coins ?? 0) + coinGain,
      dailyQuests: evaluated,
      questsRefreshedDate: today,
      lastUpdated: new Date().toISOString(),
    });
  }

  async awardXP(amount: number, event: XpEvent, habits: Habit[]): Promise<void> {
    const current = this.profile();
    if (!current) return;

    // Compute coins for this completion.
    let coinGain = COINS_COMPLETE_HABIT;
    if (event.allHabitsDone) coinGain += COINS_ALL_DONE_BONUS;
    const wasStreak7 = amount >= XP_STREAK_7;
    if (wasStreak7) coinGain += COINS_STREAK_7;

    const withXP: UserProfile = {
      ...current,
      xp:               current.xp + amount,
      coins:            (current.coins ?? 0) + coinGain,
      totalCompletions: current.totalCompletions + 1,
      lastUpdated:      new Date().toISOString(),
    };

    const achievements = checkAchievements(withXP, habits, event);

    let bonusXP = 0;
    let bonusCoins = 0;
    for (const a of achievements) {
      const wasPreviouslyLocked = current.achievements.find(ca => ca.id === a.id)?.unlockedAt === null;
      if (a.unlockedAt !== null && wasPreviouslyLocked) {
        bonusXP += a.xpReward;
        bonusCoins += a.coinReward ?? 0;
      }
    }

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
      xp:    withXP.xp + bonusXP + questXP,
      coins: (withXP.coins ?? 0) + bonusCoins + questCoins,
      achievements,
      dailyQuests: evaluatedQuests,
      questsRefreshedDate: today,
    };

    this.lastXpGain.set(amount + bonusXP + questXP);
    await this.commit(updated);
  }

  async spendCoins(amount: number): Promise<boolean> {
    const current = this.profile();
    if (!current) return false;
    const have = current.coins ?? 0;
    if (have < amount) return false;
    await this.commit({
      ...current,
      coins: have - amount,
      lastUpdated: new Date().toISOString(),
    });
    return true;
  }

  clearLastXpGain(): void {
    this.lastXpGain.set(null);
  }
}
