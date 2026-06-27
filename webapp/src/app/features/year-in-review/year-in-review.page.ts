import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';

import { HabitsService } from '../../core/services/habits.service';
import type { Habit } from '../../core/models/habit';
import { CardComponent } from '../../shared/components/card/card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';
import { YearHeatmapComponent } from '../../shared/components/year-heatmap/year-heatmap.component';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function computeBestMonth(habits: Habit[]): { month: string; count: number } {
  const counts = new Map<string, number>();
  const year = new Date().getFullYear();
  for (const h of habits) {
    for (const d of h.completions ?? []) {
      if (!d.startsWith(`${year}-`)) continue;
      const month = d.slice(0, 7);
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return { month: '—', count: 0 };
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [monthKey, count] = sorted[0];
  const m = parseInt(monthKey.slice(5), 10) - 1;
  return { month: MONTH_NAMES[m], count };
}

/**
 * YearInReviewScreen — port of src/app/year-in-review.tsx.
 *
 * Yearly highlight reel rendered as a stack of cards:
 *   - Hero: huge total completion count + trophy.
 *   - LONGEST STREAK + BEST MONTH side-by-side.
 *   - TOP HABIT (biggest contributor) with its colour + icon + sub stats.
 *   - YEAR HEATMAP (horizontal scroll, reuse <app-year-heatmap>).
 *   - Thanks card tinted with the current accent.
 */
@Component({
  selector: 'app-year-in-review-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    CardComponent,
    EmptyStateComponent,
    IoniconComponent,
    YearHeatmapComponent,
  ],
  templateUrl: './year-in-review.page.html',
  styleUrl: './year-in-review.page.scss',
})
export default class YearInReviewPage {
  private readonly habitsService = inject(HabitsService);
  private readonly router = inject(Router);

  readonly year = new Date().getFullYear();

  readonly visibleHabits = computed(() =>
    this.habitsService.habits().filter(h => (h.status ?? 'active') !== 'archived'),
  );

  readonly totalCompletions = computed(() =>
    this.visibleHabits().reduce(
      (s, h) => s + (h.completions ?? []).filter(d => d.startsWith(`${this.year}-`)).length,
      0,
    ),
  );

  readonly bestStreak = computed(() =>
    this.visibleHabits().reduce((m, h) => Math.max(m, h.bestStreak), 0),
  );

  readonly topHabit = computed<Habit | null>(() => {
    const habits = this.visibleHabits();
    if (habits.length === 0) return null;
    return habits.reduce((top, h) => {
      const hc = (h.completions ?? []).filter(d => d.startsWith(`${this.year}-`)).length;
      const tc = (top.completions ?? []).filter(d => d.startsWith(`${this.year}-`)).length;
      return hc > tc ? h : top;
    });
  });

  readonly topHabitCompletions = computed(() => {
    const h = this.topHabit();
    if (!h) return 0;
    return (h.completions ?? []).filter(d => d.startsWith(`${this.year}-`)).length;
  });

  readonly bestMonth = computed(() => computeBestMonth(this.visibleHabits()));

  readonly heatmapMap = computed(() => {
    const m = new Map<string, number>();
    for (const h of this.visibleHabits()) {
      for (const d of h.completions ?? []) {
        m.set(d, (m.get(d) ?? 0) + 1);
      }
    }
    return m;
  });

  readonly maxHabitCount = computed(() => Math.max(1, this.visibleHabits().length));

  back(): void {
    if (history.length > 1) history.back();
    else void this.router.navigate(['/']);
  }

  newHabit(): void {
    void this.router.navigate(['/new']);
  }
}
