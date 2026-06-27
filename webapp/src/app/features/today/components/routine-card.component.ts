import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import type { Habit } from '../../../core/models/habit';
import type { Routine } from '../../../core/models/routine';
import { isDoneToday } from '../../../core/utils/streak.util';
import { IoniconComponent } from '../../../shared/components/ionicon/ionicon.component';

/**
 * RoutineCardComponent — port of the RoutineCard sub-component from
 * src/app/(tabs)/index.tsx.
 *
 * 44x44 colored icon tile + name + sub (`N/M done` | `All done!` |
 * `No active habits`) + static mini progress ring + chevron. The card's
 * border turns green when the routine is complete.
 *
 * Filters its `habits` input through `routine.habitIds`, keeping only
 * `active` ones (mirrors the mobile filter).
 */
@Component({
  selector: 'app-routine-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent],
  template: `
    <button
      type="button"
      class="card press"
      [class.complete]="allDone()"
      [attr.aria-label]="ariaLabel()"
      (click)="pressed.emit()"
    >
      <span class="accent" [style.background-color]="routine().color"></span>
      <span
        class="icon"
        [style.background-color]="allDone() ? 'var(--color-done-light)' : routine().color"
      >
        @if (allDone()) {
          <app-ionicon name="checkmark" [size]="20" color="var(--color-done)" />
        } @else {
          <app-ionicon [name]="routine().icon" [size]="20" color="#fff" />
        }
      </span>
      <span class="body">
        <span class="name">{{ routine().name }}</span>
        <span class="sub">
          @if (total() === 0) {
            No active habits
          } @else if (allDone()) {
            All done!
          } @else {
            {{ doneCount() }}/{{ total() }} done
          }
        </span>
      </span>
      <span
        class="ring"
        [style.border-color]="allDone() ? 'var(--color-done)' : routine().color"
        [style.color]="allDone() ? 'var(--color-done)' : routine().color"
      >
        {{ total() > 0 ? pct() + '%' : '—' }}
      </span>
      <app-ionicon name="chevron-forward" [size]="14" color="var(--color-text-muted)" />
    </button>
  `,
  styleUrl: './routine-card.component.scss',
})
export class RoutineCardComponent {
  readonly routine = input.required<Routine>();
  readonly habits = input.required<Habit[]>();
  readonly pressed = output<void>();

  readonly routineHabits = computed<Habit[]>(() => {
    const r = this.routine();
    return r.habitIds
      .map(id => this.habits().find(h => h.id === id))
      .filter((h): h is Habit => h != null && (h.status ?? 'active') === 'active');
  });

  readonly doneCount = computed(() => this.routineHabits().filter(isDoneToday).length);
  readonly total = computed(() => this.routineHabits().length);
  readonly allDone = computed(() => this.total() > 0 && this.doneCount() === this.total());
  readonly pct = computed(() =>
    this.total() > 0 ? Math.round((this.doneCount() / this.total()) * 100) : 0,
  );

  readonly ariaLabel = computed(() => {
    const r = this.routine();
    if (this.total() === 0) return `Open ${r.name} (no active habits)`;
    if (this.allDone()) return `Open ${r.name}, all done today`;
    return `Open ${r.name}, ${this.doneCount()} of ${this.total()} done today`;
  });
}
