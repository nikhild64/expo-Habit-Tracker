import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { HabitsService } from '../../core/services/habits.service';
import type { Habit } from '../../core/models/habit';
import { completionRate } from '../../core/utils/stats.util';
import { computeStrengthScore } from '../../core/utils/streak.util';
import { CardComponent } from '../../shared/components/card/card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IoniconComponent } from '../../shared/components/ionicon/ionicon.component';
import { ProgressRingComponent } from '../../shared/components/progress-ring/progress-ring.component';
import { YearHeatmapComponent } from '../../shared/components/year-heatmap/year-heatmap.component';

type WindowDays = 7 | 30 | 90 | 365;

type Correlation = { aName: string; bName: string; lift: number };

function buildHourDistribution(habits: Habit[]): number[] {
  const buckets = new Array<number>(24).fill(0);
  for (const h of habits) {
    const stamps = h.completionTimestamps ?? {};
    for (const iso of Object.values(stamps)) {
      const hour = new Date(iso).getHours();
      buckets[hour] += 1;
    }
  }
  return buckets;
}

function buildHeatmapMap(habits: Habit[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of habits) {
    for (const d of h.completions ?? []) {
      m.set(d, (m.get(d) ?? 0) + 1);
    }
  }
  return m;
}

/**
 * findCorrelations — verbatim port of src/app/insights.tsx.
 *
 * Pairwise lift: how much more often is habit B completed on days A is
 * completed vs days A is not. Only pairs with both habits having ≥5
 * completions, ≥10 distinct dates overall, ≥5 in both A and ¬A groups,
 * and lift > 1.5 are kept. Returns the top 3 sorted descending by lift.
 */
function findCorrelations(habits: Habit[]): Correlation[] {
  const eligible = habits.filter(h => (h.completions ?? []).length >= 5);
  if (eligible.length < 2) return [];

  const allDates = new Set<string>();
  for (const h of eligible) for (const d of h.completions ?? []) allDates.add(d);
  if (allDates.size < 10) return [];

  const results: Correlation[] = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = 0; j < eligible.length; j++) {
      if (i === j) continue;
      const a = eligible[i];
      const b = eligible[j];
      const aSet = new Set(a.completions ?? []);
      const bSet = new Set(b.completions ?? []);
      const aDates = [...allDates].filter(d => aSet.has(d));
      const notADates = [...allDates].filter(d => !aSet.has(d));
      if (aDates.length < 5 || notADates.length < 5) continue;
      const pBgivenA = aDates.filter(d => bSet.has(d)).length / aDates.length;
      const pBgivenNotA = notADates.filter(d => bSet.has(d)).length / notADates.length;
      if (pBgivenNotA === 0) continue;
      const lift = pBgivenA / pBgivenNotA;
      if (lift > 1.5) results.push({ aName: a.name, bName: b.name, lift });
    }
  }
  results.sort((a, b) => b.lift - a.lift);
  return results.slice(0, 3);
}

/**
 * InsightsScreen — port of src/app/insights.tsx.
 *
 * Full-screen page (sibling of the tab shell). Six sections:
 *   1. Habit Strength gauge (avg of per-habit strength scores).
 *   2. Window selector + completion-rate card.
 *   3. Year activity heatmap (delegates to <app-year-heatmap>).
 *   4. Time-of-day bars (24 vertical bars, 84 px tall).
 *   5. Per-habit strength rows — tap to open /habit/:id.
 *   6. Patterns we noticed (findCorrelations).
 */
@Component({
  selector: 'app-insights-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    CardComponent,
    EmptyStateComponent,
    IoniconComponent,
    ProgressRingComponent,
    YearHeatmapComponent,
  ],
  templateUrl: './insights.page.html',
  styleUrl: './insights.page.scss',
})
export default class InsightsPage {
  private readonly habitsService = inject(HabitsService);
  private readonly router = inject(Router);

  readonly windowDays = signal<WindowDays>(30);
  readonly windowChoices: WindowDays[] = [7, 30, 90, 365];

  readonly visibleHabits = computed(() =>
    this.habitsService.habits().filter(h => (h.status ?? 'active') !== 'archived'),
  );

  readonly heatmapMap = computed(() => buildHeatmapMap(this.visibleHabits()));
  readonly hourDistribution = computed(() => buildHourDistribution(this.visibleHabits()));
  readonly correlations = computed(() => findCorrelations(this.visibleHabits()));

  readonly overallStrength = computed(() => {
    const scored = this.visibleHabits()
      .filter(h => (h.completions ?? []).length > 0)
      .map(h => h.strengthScore ?? computeStrengthScore(h));
    if (scored.length === 0) return 0;
    return Math.round(scored.reduce((s, n) => s + n, 0) / scored.length);
  });

  readonly overallStrengthColor = computed(() => {
    const v = this.overallStrength();
    if (v >= 70) return 'var(--color-done)';
    if (v >= 40) return 'var(--color-streak)';
    return 'var(--color-danger)';
  });

  readonly overallStrengthLabel = computed(() => {
    const v = this.overallStrength();
    if (v >= 70) return 'Strong — keep going!';
    if (v >= 40) return 'Building momentum';
    return 'Time to rebuild';
  });

  readonly overallRate = computed(() => {
    const habits = this.visibleHabits();
    if (habits.length === 0) return 0;
    const w = this.windowDays();
    const rates = habits.map(h =>
      completionRate(h.completions ?? [], w, h.createdAt, h.frequency),
    );
    return rates.reduce((s, r) => s + r, 0) / rates.length;
  });

  readonly overallRatePct = computed(() => Math.round(this.overallRate() * 100));

  readonly hourMax = computed(() => Math.max(...this.hourDistribution(), 1));

  readonly maxHabitCount = computed(() => Math.max(1, this.visibleHabits().length));

  readonly strengthRows = computed(() =>
    this.visibleHabits().map(h => {
      const strength = h.strengthScore ?? computeStrengthScore(h);
      const color =
        strength >= 70 ? 'var(--color-done)'
        : strength >= 40 ? 'var(--color-streak)'
        : 'var(--color-danger)';
      return { habit: h, strength, color };
    }),
  );

  windowLabel(w: WindowDays): string {
    return w === 365 ? '1 yr' : `${w}d`;
  }

  windowHeading(): string {
    const w = this.windowDays();
    return w === 365 ? 'COMPLETION RATE — LAST YEAR' : `COMPLETION RATE — LAST ${w} DAYS`;
  }

  setWindow(w: WindowDays): void {
    this.windowDays.set(w);
  }

  hourBarHeight(v: number): number {
    return Math.max(2, (v / this.hourMax()) * 80);
  }

  hourBarColor(v: number): string {
    return v > 0 ? 'var(--color-tint)' : 'var(--color-surface-alt)';
  }

  hourAxisLabel(h: number): string {
    if (h === 0) return '12a';
    if (h === 12) return '12p';
    return h < 12 ? `${h}a` : `${h - 12}p`;
  }

  /** Round percentage of lift (e.g. lift=1.85 → "85"). */
  liftPct(lift: number): number {
    return Math.round((lift - 1) * 100);
  }

  back(): void {
    if (history.length > 1) {
      history.back();
    } else {
      void this.router.navigate(['/']);
    }
  }

  goYearReview(): void {
    void this.router.navigate(['/year-in-review']);
  }

  openHabit(id: string): void {
    void this.router.navigate(['/habit', id]);
  }

  newHabit(): void {
    void this.router.navigate(['/new']);
  }

  axisLabels = [0, 6, 12, 18, 23] as const;
  /** 0..23 — used as `@for` source so the template stays signal-free. */
  hourIndices = Array.from({ length: 24 }, (_, i) => i);
  /** Legend ratios (0/0.2/0.5/0.75/1) — used for the heatmap legend below. */
  legendRatios = [0, 0.2, 0.5, 0.75, 1] as const;
}
