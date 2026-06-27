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
import { completionRate } from '../../core/utils/stats.util';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';

function weekLabel(): string {
  const today = new Date();
  // ISO week: Monday is day 1 — `(getDay()+6)%7` returns 0..6 with Mon=0.
  const dayOfWeek = today.getDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;

  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString('en-US', opts);
  const start = fmt(monday, { month: 'short', day: 'numeric' });
  const end = fmt(sunday, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${start} – ${end}`;
}

function weekRate(habit: Habit): number {
  return completionRate(habit.completions ?? [], 7, habit.createdAt);
}

function motivationalMessage(score: number): string {
  if (score >= 0.9)
    return "Excellent week! You're absolutely crushing it — keep up the momentum!";
  if (score >= 0.7)
    return "Good week! You're building real consistency. Stay the course this week!";
  return "Every streak starts with a single day. Keep going — this week is a fresh chance!";
}

/**
 * WeeklyReviewScreen — port of src/app/weekly-review.tsx.
 *
 * Score card (huge percentage in tier colour) + top habit / needs attention
 * row + per-habit list + motivational message + CTA.
 *
 * Tier colours:
 *   ≥0.9 → done (green)
 *   ≥0.7 → streak (orange)
 *   else → tint
 */
@Component({
  selector: 'app-weekly-review-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IoniconComponent],
  templateUrl: './weekly-review.page.html',
  styleUrl: './weekly-review.page.scss',
})
export default class WeeklyReviewPage {
  private readonly habitsService = inject(HabitsService);
  private readonly router = inject(Router);

  readonly weekLabel = weekLabel();

  readonly activeHabits = computed(() =>
    this.habitsService.habits().filter(h => (h.status ?? 'active') === 'active'),
  );

  readonly habitRates = computed(() =>
    this.activeHabits().map(h => ({ habit: h, rate: weekRate(h) })),
  );

  readonly overallScore = computed(() => {
    const rates = this.habitRates();
    if (rates.length === 0) return 0;
    return rates.reduce((sum, r) => sum + r.rate, 0) / rates.length;
  });

  readonly overallScorePct = computed(() => Math.round(this.overallScore() * 100));

  readonly scoreColor = computed(() => {
    const s = this.overallScore();
    if (s >= 0.9) return 'var(--color-done)';
    if (s >= 0.7) return 'var(--color-streak)';
    return 'var(--color-tint)';
  });

  readonly starEntry = computed(() => {
    const rates = this.habitRates();
    if (rates.length === 0) return null;
    return rates.reduce((best, cur) => (cur.rate > best.rate ? cur : best));
  });

  readonly attentionEntry = computed(() => {
    const rates = this.habitRates();
    if (rates.length <= 1) return null;
    return rates.reduce((worst, cur) => (cur.rate < worst.rate ? cur : worst));
  });

  readonly motivationalMessage = computed(() => motivationalMessage(this.overallScore()));

  pct(v: number): number {
    return Math.round(v * 100);
  }

  rowColor(rate: number): string {
    if (rate >= 0.9) return 'var(--color-done)';
    if (rate >= 0.5) return 'var(--color-tint)';
    return 'var(--color-danger)';
  }

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
}
