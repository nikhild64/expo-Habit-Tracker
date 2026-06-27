/**
 * Tests for GamificationService.refreshQuests focused on its idempotency
 * contract.
 *
 * Why this matters: Profile fires `refreshQuests(habits)` from a signal
 * `effect()` every time the habits array changes. If the call wrote to the
 * `profile` signal unconditionally (each commit produces a fresh
 * `lastUpdated` ISO string, so referential equality always fails), and the
 * effect happened to track `profile` via the synchronous prefix of the
 * async function, we get a tight read→write cycle that freezes the tab.
 * The Profile component now wraps the call in `untracked()`, but we also
 * want this service to be a no-op when nothing changed, both as defense in
 * depth and so we don't churn IndexedDB / OnPush re-renders on every visit.
 */
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { UserProfile } from '../models/gamification';
import { toDateKey } from '../utils/dates.util';
import {
  buildDefaultAchievements,
  generateDailyQuests,
} from '../utils/gamification.util';
import { makeHabit } from '../utils/test-helpers';
import { GamificationService } from './gamification.service';
import { STORAGE_KEYS, StorageService } from './storage.service';

class FakeStorageService {
  readonly store = new Map<string, unknown>();
  setCalls = 0;

  async getItem<T>(key: string): Promise<T | null> {
    return (this.store.get(key) ?? null) as T | null;
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    this.setCalls++;
    // Deep-clone via JSON to mirror the real IndexedDB round-trip and
    // avoid the service mutating our fixture by reference.
    this.store.set(key, JSON.parse(JSON.stringify(value)));
  }
}

async function waitForLoad(svc: GamificationService): Promise<void> {
  // load() awaits storage.getItem() then potentially storage.setItem();
  // a few microtask flushes are enough to drain both.
  for (let i = 0; i < 10 && svc.loading(); i++) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}

describe('GamificationService.refreshQuests', () => {
  let storage: FakeStorageService;
  let svc: GamificationService;

  beforeEach(async () => {
    storage = new FakeStorageService();

    // Pre-seed a profile whose dailyQuests are already aligned to today so
    // load() does NOT call setItem on its own (which would muddy the
    // setCalls assertions below).
    const today = toDateKey(new Date());
    const seeded: UserProfile = {
      xp: 0,
      coins: 0,
      totalCompletions: 0,
      achievements: buildDefaultAchievements(),
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      dailyQuests: generateDailyQuests(today),
      questsRefreshedDate: today,
    };
    storage.store.set(STORAGE_KEYS.profile, seeded);

    TestBed.configureTestingModule({
      providers: [
        GamificationService,
        { provide: StorageService, useValue: storage },
      ],
    });

    svc = TestBed.inject(GamificationService);
    await waitForLoad(svc);
    expect(svc.loading()).toBe(false);
    // Sanity: load() with an up-to-date seed must not have written.
    expect(storage.setCalls).toBe(0);
  });

  it('is a no-op when nothing changed (same profile reference, no setItem)', async () => {
    const profileBefore = svc.profile();
    const habits = [makeHabit({ completions: [] })];

    await svc.refreshQuests(habits);
    expect(svc.profile()).toBe(profileBefore);
    expect(storage.setCalls).toBe(0);

    // Repeated calls — the classic Profile-effect-fires-on-every-habit-tick
    // case — stay no-ops.
    await svc.refreshQuests(habits);
    await svc.refreshQuests(habits);
    expect(svc.profile()).toBe(profileBefore);
    expect(storage.setCalls).toBe(0);
  });

  it('commits exactly once when a quest transitions, then short-circuits', async () => {
    // Five habits completed today guarantees the "triple play" quest flips
    // if it was drawn today; if not, no quest transition is possible and we
    // skip the test rather than assert false positives.
    const today = toDateKey(new Date());
    const habits = Array.from({ length: 5 }, (_, i) =>
      makeHabit({ id: `h-${i}`, completions: [today] }),
    );

    const profileBeforeFirst = svc.profile();
    await svc.refreshQuests(habits);
    const profileAfterFirst = svc.profile();

    const flipped = profileAfterFirst!.dailyQuests!.some(q => q.completed);
    if (!flipped) {
      // For today's deterministic quest draw, none of the picks fire on
      // "3+ habits done today" alone. Idempotency still holds — assert it.
      expect(profileAfterFirst).toBe(profileBeforeFirst);
      expect(storage.setCalls).toBe(0);
      return;
    }

    expect(profileAfterFirst).not.toBe(profileBeforeFirst);
    expect(storage.setCalls).toBe(1);
    expect(profileAfterFirst!.xp).toBeGreaterThan(0);

    // Re-running with the same habits must not commit again — this is the
    // assertion that, before the fix, would have failed because every call
    // produced a fresh `lastUpdated` ISO string.
    await svc.refreshQuests(habits);
    await svc.refreshQuests(habits);
    expect(svc.profile()).toBe(profileAfterFirst);
    expect(storage.setCalls).toBe(1);
  });
});
