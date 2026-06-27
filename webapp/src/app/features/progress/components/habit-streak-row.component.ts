import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import type { Habit } from '../../../core/models/habit';
import { isDoneToday } from '../../../core/utils/streak.util';
import { IoniconComponent } from '../../../shared/components/ionicon/ionicon.component';

/**
 * HabitStreakRowComponent — port of the HabitStreakRow from
 * src/app/(tabs)/streaks.tsx.
 *
 * 40-px icon badge + name + flame streak badge (with done-today check) +
 * progress bar (`min(1, streak/bestStreak)` filled in habit.color) +
 * `Best: N day(s)` caption + chevron. Tap → `/habit/:id`.
 */
@Component({
  selector: 'app-habit-streak-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent],
  template: `
    <button type="button" class="row press" (click)="pressed.emit()">
      <span class="icon" [style.background-color]="habit().color">
        <app-ionicon [name]="habit().icon" [size]="18" color="#fff" />
      </span>
      <span class="info">
        <span class="top-row">
          <span class="name">{{ habit().name }}</span>
          <span class="streak-badge">
            <app-ionicon name="flame" [size]="13" color="var(--color-streak)" />
            <span class="streak-num">{{ habit().streak }}</span>
            @if (done()) {
              <app-ionicon name="checkmark-circle" [size]="13" color="var(--color-done)" />
            }
          </span>
        </span>
        <span class="track">
          <span
            class="fill"
            [style.width.%]="progressRatio() * 100"
            [style.background-color]="habit().color"
          ></span>
        </span>
        <span class="best-label">
          Best: {{ habit().bestStreak }} {{ habit().bestStreak === 1 ? 'day' : 'days' }}
        </span>
      </span>
      <app-ionicon name="chevron-forward" [size]="14" color="var(--color-border)" />
    </button>
  `,
  styleUrl: './habit-streak-row.component.scss',
})
export class HabitStreakRowComponent {
  readonly habit = input.required<Habit>();
  readonly pressed = output<void>();

  readonly done = computed(() => isDoneToday(this.habit()));
  readonly progressRatio = computed(() => {
    const h = this.habit();
    return h.bestStreak > 0 ? Math.min(1, h.streak / h.bestStreak) : 0;
  });
}
