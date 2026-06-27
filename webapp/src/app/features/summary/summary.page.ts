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
import { toDateKey } from '../../core/utils/dates.util';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';

function completedYesterday(habit: Habit): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (habit.completions ?? []).includes(toDateKey(yesterday));
}

function yesterdayLabel(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * SummaryScreen — port of src/app/summary.tsx.
 *
 * Yesterday's recap: which habits were completed, which were missed, and
 * which streaks are at risk. Mostly meant to be deep-linked from a server
 * push, but also accessible from Settings → Insights & Reviews.
 */
@Component({
  selector: 'app-summary-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IoniconComponent],
  templateUrl: './summary.page.html',
  styleUrl: './summary.page.scss',
})
export default class SummaryPage {
  private readonly habitsService = inject(HabitsService);
  private readonly router = inject(Router);

  readonly yesterdayLabel = yesterdayLabel();

  readonly habits = computed(() => this.habitsService.habits());

  readonly done = computed(() => this.habits().filter(completedYesterday));
  readonly missed = computed(() => this.habits().filter(h => !completedYesterday(h)));
  readonly total = computed(() => this.habits().length);
  readonly doneCount = computed(() => this.done().length);
  readonly progressPct = computed(() => {
    const t = this.total();
    return t > 0 ? Math.round((this.doneCount() / t) * 100) : 0;
  });
  readonly streaksAtRisk = computed(() => this.missed().filter(h => h.streak > 0));

  readonly overviewTitle = computed(() => {
    const t = this.total();
    const d = this.doneCount();
    if (d === t) return 'Perfect day! All habits completed.';
    if (d === 0) return 'No habits completed yesterday.';
    return `${d} of ${t} habits completed`;
  });

  readonly progressBarColor = computed(() =>
    this.doneCount() === this.total() ? 'var(--color-done)' : 'var(--color-tint)',
  );

  readonly riskText = computed(() => {
    const risk = this.streaksAtRisk();
    if (risk.length === 0) return '';
    if (risk.length === 1) return `"${risk[0].name}" streak will reset if not done today.`;
    return `${risk.length} streaks will reset if not done today.`;
  });

  back(): void {
    if (history.length > 1) history.back();
    else void this.router.navigate(['/']);
  }

  goHome(): void {
    void this.router.navigate(['/']);
  }

  newHabit(): void {
    void this.router.navigate(['/new']);
  }

  openHabit(id: string): void {
    void this.router.navigate(['/habit', id]);
  }
}
