import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { CATEGORY_META } from '../../core/models/category';
import type { Habit, HabitCategory } from '../../core/models/habit';
import { HabitsService } from '../../core/services/habits.service';
import { HapticsService } from '../../core/services/haptics.service';
import { toDateKey } from '../../core/utils/dates.util';
import { isDoneToday } from '../../core/utils/streak.util';
import { SheetComponent } from '../../shared/components/sheet/sheet.component';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';
import { HabitStreakRowComponent } from './components/habit-streak-row.component';
import { MonthHeatmapComponent } from './components/month-heatmap.component';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday',
];

type DayDetail = {
  dateKey: string;
  date: string;
  weekday: string;
  isFuture: boolean;
  done: Habit[];
  missed: Habit[];
  ratio: number;
  active: Habit[];
};

/**
 * Progress (Streaks) screen — port of src/app/(tabs)/streaks.tsx.
 *
 * Sections (top → bottom):
 *  1. Heading "Progress" 30/700.
 *  2. Summary 3-col card: `{habits} Habits` / `{best} Best Streak` /
 *     `{done}/{total} Done Today` separated by 1-px dividers.
 *  3. `MONTHLY OVERVIEW` — 34x34-cell heatmap with prev/next chevrons,
 *     6-step orange ramp, today gets a 2-px tint border. Tap a cell to
 *     open the day-detail BottomSheet.
 *  4. `BY CATEGORY` — per-category progress bars (only when > 1 category).
 *  5. `ALL HABITS` — list of `HabitStreakRow` cards.
 *  6. Footer note `Tracking N days · M total streak days`.
 *  7. Empty state when there are no visible habits.
 *
 * Archived habits are excluded from every metric (`visibleHabits` filter).
 */
@Component({
  selector: 'app-progress-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HabitStreakRowComponent,
    IoniconComponent,
    MonthHeatmapComponent,
    SheetComponent,
  ],
  templateUrl: './progress.page.html',
  styleUrl: './progress.page.scss',
})
export default class ProgressPage {
  private readonly router = inject(Router);
  private readonly habitsService = inject(HabitsService);
  private readonly haptics = inject(HapticsService);

  protected readonly loading = this.habitsService.loading;
  protected readonly selectedDay = signal<string | null>(null);

  protected readonly visibleHabits = computed<Habit[]>(() =>
    this.habitsService.habits().filter(h => (h.status ?? 'active') !== 'archived'),
  );

  protected readonly totalHabits = computed(() => this.visibleHabits().length);
  protected readonly overallBest = computed(() =>
    this.visibleHabits().reduce((m, h) => Math.max(m, h.bestStreak), 0),
  );
  protected readonly doneToday = computed(
    () => this.visibleHabits().filter(isDoneToday).length,
  );

  /** Days since the earliest habit was created (min 1, ceil days). */
  protected readonly daysSinceEarliest = computed(() => {
    const list = this.visibleHabits();
    if (list.length === 0) return 0;
    const earliest = list.reduce((min, h) =>
      new Date(h.createdAt) < new Date(min.createdAt) ? h : min,
    );
    const diff = Date.now() - new Date(earliest.createdAt).getTime();
    return Math.max(1, Math.ceil(diff / 86_400_000));
  });

  protected readonly totalStreakDays = computed(() =>
    this.visibleHabits().reduce((t, h) => t + h.streak, 0),
  );

  protected readonly todayKey = toDateKey(new Date());

  /** completionMap: YYYY-MM-DD → number of habits completed that day. */
  protected readonly completionMap = computed(() => {
    const map = new Map<string, number>();
    for (const habit of this.visibleHabits()) {
      for (const dateKey of habit.completions ?? []) {
        map.set(dateKey, (map.get(dateKey) ?? 0) + 1);
      }
    }
    return map;
  });

  /** habitMap: YYYY-MM-DD → Habit[] (for the day-detail sheet). */
  protected readonly habitMap = computed(() => {
    const map = new Map<string, Habit[]>();
    for (const habit of this.visibleHabits()) {
      for (const dateKey of habit.completions ?? []) {
        const bucket = map.get(dateKey);
        if (bucket) bucket.push(habit);
        else map.set(dateKey, [habit]);
      }
    }
    return map;
  });

  /** Per-category completion rates for the current month, sorted desc. */
  protected readonly categoryBreakdown = computed(() => {
    const now = new Date();
    const monthStart = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
    const today = toDateKey(now);
    const daysElapsed = now.getDate();

    const map = new Map<HabitCategory, { completed: number; total: number }>();
    for (const h of this.visibleHabits()) {
      const cat = h.category ?? 'Other';
      const entry = map.get(cat) ?? { completed: 0, total: 0 };
      entry.total += daysElapsed;
      entry.completed += (h.completions ?? []).filter(d => d >= monthStart && d <= today).length;
      map.set(cat, entry);
    }
    return Array.from(map.entries())
      .map(([category, { completed, total }]) => ({
        category,
        rate: total > 0 ? completed / total : 0,
      }))
      .sort((a, b) => b.rate - a.rate);
  });

  protected readonly selectedDayDetail = computed<DayDetail | null>(() => {
    const key = this.selectedDay();
    if (!key) return null;
    const todayKey = this.todayKey;
    const habits = this.visibleHabits();
    const map = this.habitMap();

    const isFuture = key > todayKey;
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(y, m - 1, d);

    // Active = habits that existed on or before the date
    const active = habits.filter(h => toDateKey(new Date(h.createdAt)) <= key);
    const doneSet = new Set((map.get(key) ?? []).map(h => h.id));
    const done = active.filter(h => doneSet.has(h.id));
    const missed = active.filter(h => !doneSet.has(h.id));
    const ratio = active.length > 0 ? done.length / active.length : 0;

    return {
      dateKey: key,
      date: `${MONTH_NAMES[m - 1]} ${d}, ${y}`,
      weekday: DAY_NAMES[dt.getDay()],
      isFuture,
      done,
      missed,
      ratio,
      active,
    };
  });

  // ── Navigation ───────────────────────────────────────────────────────
  protected onCellPress(dateKey: string): void {
    this.haptics.light();
    this.selectedDay.set(dateKey);
  }

  protected closeDayDetail(): void {
    this.selectedDay.set(null);
  }

  protected goToNew(): void {
    this.router.navigate(['/new']);
  }

  protected goToHabit(id: string): void {
    this.router.navigate(['/habit', id]);
  }

  protected getCategoryMeta(c: HabitCategory) {
    return CATEGORY_META[c];
  }

  protected pct(ratio: number): number {
    return Math.round(ratio * 100);
  }
}
