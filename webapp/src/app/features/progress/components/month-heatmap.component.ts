import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

import type { Habit } from '../../../core/models/habit';
import { IoniconComponent } from '../../../shared/components/ionicon/ionicon.component';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type Cell = {
  /** Day-of-month number, or null for the leading blanks before day 1. */
  day: number | null;
  /** YYYY-MM-DD when day is non-null. */
  key: string | null;
  count: number;
  ratio: number;
  bgColor: string;
  textColor: string;
  isToday: boolean;
};

/**
 * Heat-color helper — same 6-step orange ramp as the mobile app.
 * `emptyColor` is the surface-alt background for zero-completion cells.
 */
function heatColor(completed: number, total: number, emptyColor: string): string {
  if (total === 0 || completed === 0) return emptyColor;
  const ratio = completed / total;
  if (ratio < 0.25) return '#FFE4BB';
  if (ratio < 0.50) return '#FFC87A';
  if (ratio < 0.75) return '#FFA030';
  if (ratio < 1.00) return '#FF8B1F';
  return '#C85000';
}

/**
 * MonthHeatmapComponent — port of the MonthHeatmap sub-component from
 * src/app/(tabs)/streaks.tsx.
 *
 * Owns:
 *  - Month nav (prev / next chevrons; disabled at boundary months).
 *  - 34x34 rounded-8 cells coloured by `heatColor(count, totalHabits)`.
 *  - Today gets a 2-px tint border.
 *  - Legend strip: `Less` + 5 swatches + `More`.
 *
 * Emits `(dayPressed)` when the user taps a non-empty cell so the parent
 * page can open the day-detail bottom sheet.
 */
@Component({
  selector: 'app-month-heatmap',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent],
  template: `
    <div class="card">
      <div class="header">
        <button
          type="button"
          class="nav"
          [disabled]="isEarliestMonth()"
          (click)="navPrev()"
          aria-label="Previous month"
        >
          <app-ionicon
            name="chevron-back"
            [size]="16"
            [color]="isEarliestMonth() ? 'var(--color-border)' : 'var(--color-text-secondary)'"
          />
        </button>
        <h3 class="title">{{ monthName() }} {{ viewYear() }}</h3>
        <button
          type="button"
          class="nav"
          [disabled]="isCurrentMonth()"
          (click)="navNext()"
          aria-label="Next month"
        >
          <app-ionicon
            name="chevron-forward"
            [size]="16"
            [color]="isCurrentMonth() ? 'var(--color-border)' : 'var(--color-text-secondary)'"
          />
        </button>
      </div>

      <div class="cal-row dow-row">
        @for (d of dow; track $index) {
          <span class="dow-label">{{ d }}</span>
        }
      </div>

      @for (week of weeks(); track $index) {
        <div class="cal-row">
          @for (cell of week; track $index) {
            <span class="cal-cell">
              @if (cell.day !== null) {
                <button
                  type="button"
                  class="heat-cell"
                  [class.today]="cell.isToday"
                  [style.background-color]="cell.bgColor"
                  (click)="dayPressed.emit(cell.key!)"
                  [attr.aria-label]="cell.key + ', ' + cell.count + ' completions'"
                >
                  <span
                    class="day-num"
                    [style.color]="cell.textColor"
                  >
                    {{ cell.day }}
                  </span>
                </button>
              }
            </span>
          }
        </div>
      }

      <div class="legend">
        <span class="legend-label">Less</span>
        @for (ratio of legendRatios; track $index) {
          <span
            class="legend-chip"
            [style.background-color]="heatRatio(ratio)"
          ></span>
        }
        <span class="legend-label">More</span>
      </div>
    </div>
  `,
  styleUrl: './month-heatmap.component.scss',
})
export class MonthHeatmapComponent {
  /** YYYY-MM-DD → number of habits completed that day. */
  readonly completionMap = input.required<Map<string, number>>();
  readonly totalHabits = input.required<number>();
  readonly habits = input.required<Habit[]>();
  readonly todayKey = input.required<string>();

  readonly dayPressed = output<string>();

  readonly dow = DOW;
  readonly legendRatios = [0, 0.2, 0.5, 0.75, 1];

  private readonly now = new Date();
  readonly viewYear = signal(this.now.getFullYear());
  readonly viewMonth = signal(this.now.getMonth());

  readonly monthName = computed(() => MONTH_NAMES[this.viewMonth()]);

  readonly isCurrentMonth = computed(
    () =>
      this.viewYear() === this.now.getFullYear() &&
      this.viewMonth() === this.now.getMonth(),
  );

  readonly earliestCreated = computed(() => {
    const list = this.habits();
    if (list.length === 0) return this.now;
    const earliest = list.reduce((min, h) =>
      new Date(h.createdAt) < new Date(min.createdAt) ? h : min,
    );
    return new Date(earliest.createdAt);
  });

  readonly isEarliestMonth = computed(() => {
    const c = this.earliestCreated();
    return this.viewYear() === c.getFullYear() && this.viewMonth() === c.getMonth();
  });

  readonly weeks = computed<Cell[][]>(() => {
    const year = this.viewYear();
    const month = this.viewMonth();
    const total = this.totalHabits();
    const todayKey = this.todayKey();
    const completionMap = this.completionMap();

    const firstDOW = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Cell[] = [];
    for (let i = 0; i < firstDOW; i++) {
      cells.push({
        day: null, key: null, count: 0, ratio: 0,
        bgColor: 'transparent', textColor: 'var(--color-text-muted)', isToday: false,
      });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const key = `${year}-${mm}-${dd}`;
      const count = completionMap.get(key) ?? 0;
      const ratio = total > 0 ? count / total : 0;
      const bgColor = heatColor(count, total, 'var(--color-surface-alt)');
      const isToday = key === todayKey;
      let textColor = 'var(--color-text-muted)';
      if (count > 0) {
        textColor = ratio >= 0.5 ? '#fff' : '#92400E';
      }
      if (isToday && count === 0) {
        textColor = 'var(--color-tint)';
      }
      cells.push({ day, key, count, ratio, bgColor, textColor, isToday });
    }
    while (cells.length % 7 !== 0) {
      cells.push({
        day: null, key: null, count: 0, ratio: 0,
        bgColor: 'transparent', textColor: 'var(--color-text-muted)', isToday: false,
      });
    }
    const weeks: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  });

  navPrev(): void {
    if (this.isEarliestMonth()) return;
    if (this.viewMonth() === 0) {
      this.viewMonth.set(11);
      this.viewYear.update(y => y - 1);
    } else {
      this.viewMonth.update(m => m - 1);
    }
  }

  navNext(): void {
    if (this.isCurrentMonth()) return;
    if (this.viewMonth() === 11) {
      this.viewMonth.set(0);
      this.viewYear.update(y => y + 1);
    } else {
      this.viewMonth.update(m => m + 1);
    }
  }

  /** Used by the legend strip. */
  heatRatio(ratio: number): string {
    const t = this.totalHabits();
    return heatColor(ratio * t, t, 'var(--color-surface-alt)');
  }
}
