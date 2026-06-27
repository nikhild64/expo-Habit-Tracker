import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import type { Habit } from '../../../core/models/habit';
import { toDateKey } from '../../../core/utils/dates.util';
import { formatFreq } from '../../../core/utils/format.util';
import {
  isDoneToday,
  quantProgressToday,
  timedProgressToday,
} from '../../../core/utils/streak.util';
import { IoniconComponent } from '../../../shared/components/ionicon/ionicon.component';

/**
 * HabitRowComponent — port of the HabitRow + CompletionControl from
 * src/app/(tabs)/index.tsx.
 *
 * Layout (1:1 with the mobile spec):
 *   ┌──┐ ┌─────┐ name 15/600                 [streak] [pin] [✓] [drag]
 *   │  │ │icon │ meta 12/muted
 *   └──┘ └─────┘
 *
 * The colored 4-px accent strip sits absolutely on the left edge; the
 * 44x44 icon tile shows habit.icon in white over habit.color; the body
 * stacks name + `formatFreq(habit)`  (+ ` · N/M` when subtasks exist).
 * Optional flame-streak badge appears between body and the pin toggle
 * when streak > 0.
 *
 * Completion control varies by habitType (4 variants):
 *   - binary       : 32-px outline circle → green + ✓ when done
 *   - quantitative : 36-px tile with vertical fill (`32 * cur/target`) +
 *                    cur/target text; turns green + ✓ when target met
 *   - timed        : same 36-px tile, idle shows play icon (tap routes to
 *                    `/timer/:id` via `(timedPressed)`)
 *   - negative     : 32-px outline circle → green + shield-checkmark when
 *                    "stayed clean"
 *
 * The directives (swipe + long-press for context menu, drag handle for
 * cdk drag-and-drop) are wired by the parent Today page on the row's
 * wrapper element. This component only owns the visual + the four
 * type-specific completion controls.
 */
@Component({
  selector: 'app-habit-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent],
  template: `
    <div
      class="card"
      role="button"
      tabindex="0"
      [attr.aria-pressed]="done()"
      [attr.aria-label]="ariaLabel()"
      (click)="rowPressed.emit()"
      (keydown.enter)="rowPressed.emit()"
      (keydown.space)="$event.preventDefault(); onPrimary($event)"
    >
      <span class="accent" [style.background-color]="habit().color"></span>
      <span class="icon" [style.background-color]="habit().color">
        <app-ionicon [name]="habit().icon" [size]="20" color="#fff" />
      </span>

      <span class="body">
        <span
          class="name"
          [style.color]="done() ? 'var(--color-text-muted)' : 'var(--color-text)'"
        >
          {{ habit().name }}
        </span>
        <span class="meta">{{ metaText() }}</span>
      </span>

      @if (habit().streak > 0) {
        <span class="streak-badge">
          <app-ionicon name="flame" [size]="12" color="var(--color-streak)" />
          <span class="streak-num">{{ habit().streak }}</span>
        </span>
      }

      <button
        type="button"
        class="icon-btn"
        [attr.aria-label]="habit().pinned ? 'Unpin habit' : 'Pin habit'"
        (click)="$event.stopPropagation(); pinPressed.emit()"
      >
        <app-ionicon
          [name]="habit().pinned ? 'bookmark' : 'bookmark-outline'"
          [size]="15"
          [color]="habit().pinned ? 'var(--color-tint)' : 'var(--color-border)'"
        />
      </button>

      <!-- Type-specific completion control -->
      @switch (habit().habitType ?? 'binary') {
        @case ('quantitative') {
          <button
            type="button"
            class="q-btn"
            [class.done]="done()"
            [style.border-color]="done() ? 'var(--color-done)' : 'transparent'"
            [style.background-color]="done() ? 'var(--color-done)' : 'transparent'"
            (click)="$event.stopPropagation(); onPrimary($event)"
          >
            @if (done()) {
              <app-ionicon name="checkmark" [size]="16" color="#fff" />
            } @else {
              <span class="q-stack">
                <span class="q-num" [style.color]="habit().color">{{ quantCurrent() }}</span>
                <span class="q-den">/{{ quantTarget() }}</span>
              </span>
              @if (quantRatio() > 0) {
                <span
                  class="q-fill"
                  [style.background-color]="habit().color"
                  [style.height.px]="32 * quantRatio()"
                ></span>
              }
            }
          </button>
        }
        @case ('timed') {
          <button
            type="button"
            class="q-btn"
            [class.done]="done()"
            [style.border-color]="done() ? 'var(--color-done)' : 'transparent'"
            [style.background-color]="done() ? 'var(--color-done)' : 'transparent'"
            (click)="$event.stopPropagation(); onPrimary($event)"
            aria-label="Open timer"
          >
            @if (done()) {
              <app-ionicon name="checkmark" [size]="16" color="#fff" />
            } @else {
              <app-ionicon name="play" [size]="16" [color]="habit().color" />
              @if (timedRatio() > 0) {
                <span
                  class="q-fill"
                  [style.background-color]="habit().color"
                  [style.height.px]="32 * timedRatio()"
                ></span>
              }
              @if (timedMinutes() > 0) {
                <span class="q-mins" [style.color]="habit().color">
                  {{ timedMinutes() }}m
                </span>
              }
            }
          </button>
        }
        @case ('negative') {
          <button
            type="button"
            class="done-btn"
            [class.done]="done()"
            [style.border-color]="done() ? 'var(--color-done)' : 'var(--color-border)'"
            [style.background-color]="done() ? 'var(--color-done)' : 'transparent'"
            (click)="$event.stopPropagation(); onPrimary($event)"
            [attr.aria-label]="done() ? 'Stayed clean' : 'Mark stayed clean'"
          >
            @if (done()) {
              <app-ionicon name="shield-checkmark" [size]="16" color="#fff" />
            } @else {
              <app-ionicon name="remove-circle-outline" [size]="16" color="var(--color-text-muted)" />
            }
          </button>
        }
        @default {
          <button
            type="button"
            class="done-btn"
            [class.done]="done()"
            [style.border-color]="done() ? 'var(--color-done)' : 'var(--color-border)'"
            [style.background-color]="done() ? 'var(--color-done)' : 'transparent'"
            (click)="$event.stopPropagation(); onPrimary($event)"
            [attr.aria-label]="done() ? 'Mark not done' : 'Mark done'"
          >
            @if (done()) {
              <app-ionicon name="checkmark" [size]="16" color="#fff" />
            }
          </button>
        }
      }

      <button
        type="button"
        class="icon-btn drag-handle"
        aria-label="Drag to reorder"
        (click)="$event.stopPropagation()"
      >
        <app-ionicon name="reorder-three-outline" [size]="20" color="var(--color-text-muted)" />
      </button>
    </div>
  `,
  styleUrl: './habit-row.component.scss',
})
export class HabitRowComponent {
  readonly habit = input.required<Habit>();

  readonly rowPressed = output<void>();
  readonly primaryPressed = output<void>();
  readonly pinPressed = output<void>();

  readonly done = computed(() => isDoneToday(this.habit()));

  readonly metaText = computed(() => {
    const h = this.habit();
    const base = formatFreq(h);
    const subtasks = h.subtasks ?? [];
    if (subtasks.length === 0) return base;
    const todayKey = toDateKey(new Date());
    const subDone = (h.subtaskCompletions ?? {})[todayKey] ?? [];
    return `${base} · ${subDone.length}/${subtasks.length}`;
  });

  readonly quantRatio = computed(() => quantProgressToday(this.habit()));
  readonly quantCurrent = computed(
    () => (this.habit().progress ?? {})[toDateKey(new Date())] ?? 0,
  );
  readonly quantTarget = computed(() => this.habit().target?.value ?? 1);

  readonly timedRatio = computed(() => timedProgressToday(this.habit()));
  readonly timedSeconds = computed(
    () => (this.habit().sessionSeconds ?? {})[toDateKey(new Date())] ?? 0,
  );
  readonly timedMinutes = computed(() => Math.round(this.timedSeconds() / 60));

  readonly ariaLabel = computed(() => {
    const h = this.habit();
    const parts: string[] = [h.name];
    if (this.done()) parts.push('completed');
    if (h.streak > 0) parts.push(`${h.streak}-day streak`);
    if (h.pinned) parts.push('pinned');
    return parts.join(', ');
  });

  onPrimary(e: Event): void {
    e.stopPropagation();
    this.primaryPressed.emit();
  }
}
