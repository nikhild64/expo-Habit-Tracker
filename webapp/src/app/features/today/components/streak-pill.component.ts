import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import type { Habit } from '../../../core/models/habit';
import { toDateKey } from '../../../core/utils/dates.util';
import { isDoneToday } from '../../../core/utils/streak.util';
import { IoniconComponent } from '../../../shared/components/ionicon/ionicon.component';

/**
 * StreakPillComponent — port of the StreakPill sub-component from
 * src/app/(tabs)/index.tsx.
 *
 * Four visual states (mirrors the mobile spec):
 *   - default        : surface bg + habit color icon tile
 *   - done-today     : green `--color-done` bg + white icon
 *   - freeze-protect : blue border + snow icon (yesterday's freeze was used
 *                      and today is not yet done — signals "your streak
 *                      survived")
 *   - milestone-glow : warm orange shadow when streak is a multiple of 7
 *                      AND today is already complete
 *
 * Tapping the pill navigates to `/habit/:id` (emitted via `(pressed)`).
 */
@Component({
  selector: 'app-streak-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent],
  template: `
    <button
      type="button"
      class="pill press"
      [class.done]="done()"
      [class.freeze]="freezeUsed() && !done()"
      [class.milestone]="isMilestone() && done()"
      [attr.aria-label]="ariaLabel()"
      [style.background-color]="done() ? 'var(--color-done)' : 'var(--color-surface)'"
      [style.border-color]="
        done()
          ? 'var(--color-done)'
          : freezeUsed() && !done()
            ? '#3B82F6'
            : 'var(--color-border)'
      "
      (click)="pressed.emit()"
    >
      <span
        class="icon"
        [style.background-color]="done() ? 'rgba(255,255,255,0.18)' : habit().color"
      >
        <app-ionicon [name]="habit().icon" [size]="14" color="#fff" />
      </span>
      <span class="body">
        <span class="name" [style.color]="done() ? '#fff' : 'var(--color-text)'">
          {{ habit().name }}
        </span>
        <span class="row">
          @if (freezeUsed() && !done()) {
            <app-ionicon name="snow-outline" [size]="11" color="#3B82F6" />
          } @else {
            <app-ionicon
              name="flame"
              [size]="11"
              [color]="done() ? 'rgba(255,255,255,0.7)' : 'var(--color-streak)'"
            />
          }
          <span
            class="streak-num"
            [style.color]="
              done()
                ? '#fff'
                : freezeUsed()
                  ? '#3B82F6'
                  : 'var(--color-streak)'
            "
          >
            {{ habit().streak }}d
          </span>
          @if (done()) {
            <app-ionicon name="checkmark-circle" [size]="12" color="#fff" />
          }
          @if (!done() && hasFreeze() && !freezeUsed()) {
            <span class="freeze-badge">
              <app-ionicon name="snow-outline" [size]="9" color="#3B82F6" />
              <span class="freeze-num">{{ habit().freezesAvailable }}</span>
            </span>
          }
        </span>
      </span>
    </button>
  `,
  styleUrl: './streak-pill.component.scss',
})
export class StreakPillComponent {
  readonly habit = input.required<Habit>();
  readonly pressed = output<void>();

  readonly done = computed(() => isDoneToday(this.habit()));
  readonly freezeUsed = computed(() => {
    const yesterday = toDateKey(new Date(Date.now() - 86_400_000));
    return (this.habit().freezeUsedDates ?? []).includes(yesterday);
  });
  readonly hasFreeze = computed(() => (this.habit().freezesAvailable ?? 0) > 0);
  readonly isMilestone = computed(() => {
    const s = this.habit().streak;
    return s > 0 && s % 7 === 0;
  });

  readonly ariaLabel = computed(() => {
    const h = this.habit();
    const parts = [`Open ${h.name}`, `${h.streak} day streak`];
    if (this.done()) parts.push('done today');
    if (this.freezeUsed() && !this.done()) parts.push('streak frozen');
    return parts.join(', ');
  });
}
