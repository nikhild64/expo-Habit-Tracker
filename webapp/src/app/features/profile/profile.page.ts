import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';

import type { Achievement } from '../../core/models/gamification';
import { MOOD_EMOJI } from '../../core/models/mood';
import { GamificationService } from '../../core/services/gamification.service';
import { HabitsService } from '../../core/services/habits.service';
import { HapticsService } from '../../core/services/haptics.service';
import { MoodService } from '../../core/services/mood.service';
import { toDateKey } from '../../core/utils/dates.util';
import { LEVELS } from '../../core/utils/gamification.util';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';

/**
 * Profile (Gamification) screen — port of src/app/(tabs)/profile.tsx.
 *
 * Layout:
 *  1. Header: "Profile" 30/700 + amber coin pill → `/shop`.
 *  2. Quick-action row (3 buttons flex 1): Insights → /insights,
 *     Journal → /journal/today (shows today's mood emoji if logged),
 *     Year → /year-in-review.
 *  3. DAILY QUESTS card (when present) — per-quest row with 38-px icon
 *     disc, title (strikethrough when done), description, stacked reward
 *     pills (+coins + xp).
 *  4. Hero Level card with 4-px left accent strip in level color, 56x56
 *     rounded-16 badge + level # 26/900, level title 20/800, XP, 8-px
 *     progress bar, hint, mini 7-dot level ladder.
 *  5. Stats row: Completions / Active habits / Badges.
 *  6. ACHIEVEMENTS grid — 2 col flex wrap, gap 10, `48%` width each;
 *     unlocked-only by default; "N locked · tap to view" expand toggle;
 *     locked at opacity 0.5; 44x44 disc with `ach.color+'22'` bg; bottom-
 *     right 16x16 check badge on unlocked items.
 *
 * Loading state when `profile` or `levelInfo` is null.
 */
@Component({
  selector: 'app-profile-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
})
export default class ProfilePage {
  private readonly router = inject(Router);
  private readonly gamification = inject(GamificationService);
  private readonly habitsService = inject(HabitsService);
  private readonly mood = inject(MoodService);
  private readonly haptics = inject(HapticsService);

  protected readonly profile = this.gamification.profile;
  protected readonly levelInfo = this.gamification.levelInfo;
  protected readonly loading = this.gamification.loading;
  protected readonly moodToday = this.mood.today;
  protected readonly habits = this.habitsService.habits;

  protected readonly achievementsExpanded = signal(false);

  protected readonly activeHabits = computed(() =>
    this.habits().filter(h => (h.status ?? 'active') === 'active'),
  );

  protected readonly unlockedCount = computed(
    () =>
      (this.profile()?.achievements ?? []).filter(a => a.unlockedAt !== null).length,
  );

  protected readonly lockedCount = computed(() => {
    const p = this.profile();
    if (!p) return 0;
    return p.achievements.length - this.unlockedCount();
  });

  protected readonly visibleAchievements = computed<Achievement[]>(() => {
    const p = this.profile();
    if (!p) return [];
    return this.achievementsExpanded()
      ? p.achievements
      : p.achievements.filter(a => a.unlockedAt !== null);
  });

  protected readonly nextLevelName = computed(() => {
    const li = this.levelInfo();
    if (!li) return null;
    const next = LEVELS.find(l => l.level === li.current.level + 1);
    return next?.title ?? null;
  });

  protected readonly xpToNext = computed(() => {
    const li = this.levelInfo();
    if (!li || li.current.maxXP === -1) return null;
    return li.xpForLevel - li.xpInLevel;
  });

  protected readonly progressPct = computed(() => {
    const li = this.levelInfo();
    if (!li) return 0;
    return Math.min(li.progress, 1) * 100;
  });

  protected readonly xpDisplay = computed(() =>
    (this.profile()?.xp ?? 0).toLocaleString(),
  );

  protected readonly levels = LEVELS;

  /** Mood emoji to show on the Journal quick-action button. */
  protected readonly journalIcon = computed(() => {
    const m = this.moodToday();
    const score = m?.eveningMood ?? m?.morningMood;
    return score ? MOOD_EMOJI[score] : null;
  });

  constructor() {
    // Re-evaluate today's quests when habits change so the card stays fresh
    // (mirrors the mobile's useEffect → refreshQuests(habits) call).
    //
    // The call to `refreshQuests` must be wrapped in `untracked()`: its
    // synchronous body reads `this.profile()` and writes `profile` back via
    // `commit()` (the synchronous prefix runs before the first `await`). If
    // tracked, the write would re-trigger this effect — a classic read→write
    // cycle that freezes the tab and OOMs the renderer.
    effect(() => {
      if (this.loading()) return;
      const habits = this.habits();
      untracked(() => {
        void this.gamification.refreshQuests(habits);
      });
    });
  }

  // ── Navigation ───────────────────────────────────────────────────────
  protected goToShop(): void {
    this.haptics.light();
    this.router.navigate(['/shop']);
  }
  protected goToInsights(): void {
    this.router.navigate(['/insights']);
  }
  protected goToJournal(): void {
    this.router.navigate(['/journal', toDateKey(new Date())]);
  }
  protected goToYearInReview(): void {
    this.router.navigate(['/year-in-review']);
  }

  protected toggleAchievements(): void {
    this.achievementsExpanded.update(v => !v);
  }

  protected firstWord(title: string): string {
    return title.split(' ')[0];
  }
}
