import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Cell = { key: string; count: number; dow: number; month: number };
type MonthLabel = { col: number; label: string };

/**
 * YearHeatmapComponent — port of src/components/YearHeatmap.tsx.
 *
 * GitHub-style 365-day heatmap rendered with inline SVG (no Skia on the web).
 * The grid is 7 rows tall (Sun..Sat) and ~53 columns wide; cells default to
 * 12 px with a 3 px gap. The colour scale is a 5-step alpha ramp on top of
 * the current `--color-tint`:
 *   0           → surface-alt
 *   <0.25       → tint + '40'
 *   <0.50       → tint + '80'
 *   <0.75       → tint + 'BB'
 *   >=0.75      → tint
 *
 * Month abbreviations float above the grid as absolutely-positioned `<span>`s
 * to match the GitHub feel. Designed to be wrapped in a horizontal scroller
 * by the parent — the inline SVG width is intrinsic so overflow-x works.
 *
 * Shared by /insights and /year-in-review.
 */
@Component({
  selector: 'app-year-heatmap',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" [style.width.px]="width()">
      <div class="months">
        @for (m of monthLabels(); track $index) {
          <span class="month" [style.left.px]="m.col * (cellSize() + cellGap())">{{ m.label }}</span>
        }
      </div>
      <svg
        [attr.width]="width()"
        [attr.height]="height()"
        [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
        aria-hidden="true"
      >
        <g [attr.transform]="'translate(0, ' + topPadding + ')'">
          @for (day of cells(); track day.key) {
            <rect
              [attr.x]="(day.col) * (cellSize() + cellGap())"
              [attr.y]="day.dow * (cellSize() + cellGap())"
              [attr.width]="cellSize()"
              [attr.height]="cellSize()"
              [attr.rx]="2.5"
              [attr.ry]="2.5"
              [attr.fill]="cellColor(day.count)"
            />
          }
        </g>
      </svg>
    </div>
  `,
  styles: [`
    :host { display: inline-block; }
    .wrap {
      position: relative;
      display: inline-block;
    }
    .months {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 14px;
      pointer-events: none;
    }
    .month {
      position: absolute;
      top: 0;
      font-size: 9px;
      font-weight: 600;
      color: var(--color-text-muted);
      line-height: 1;
    }
    svg { display: block; }
  `],
})
export class YearHeatmapComponent {
  /** Map of YYYY-MM-DD → completion count (0 = no completion). */
  readonly completionsByDate = input.required<Map<string, number>>();
  /** Max count used to scale intensity — typically active habit count. */
  readonly maxCount = input.required<number>();
  /** Override colour. Defaults to `--color-tint`. Must be hex (we append alpha). */
  readonly color = input<string | undefined>(undefined);
  readonly cellSize = input<number>(12);
  readonly cellGap = input<number>(3);

  /** Top padding above the grid reserved for month labels. */
  protected readonly topPadding = 14;

  private readonly resolved = computed(() => {
    const map = this.completionsByDate();
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 364);
    while (start.getDay() !== 0) start.setDate(start.getDate() - 1);

    const cells: (Cell & { col: number })[] = [];
    const cur = new Date(start);
    let i = 0;
    while (cur <= today) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${d}`;
      cells.push({
        key,
        count: map.get(key) ?? 0,
        dow: cur.getDay(),
        month: cur.getMonth(),
        col: Math.floor(i / 7),
      });
      cur.setDate(cur.getDate() + 1);
      i++;
    }

    const weeks = Math.ceil(cells.length / 7);
    const monthLabels: MonthLabel[] = [];
    let lastMonth = -1;
    for (const c of cells) {
      if (c.month !== lastMonth) {
        monthLabels.push({ col: c.col, label: MONTH_ABBR[c.month] });
        lastMonth = c.month;
      }
    }
    return { cells, weeks, monthLabels };
  });

  readonly cells = computed(() => this.resolved().cells);
  readonly monthLabels = computed(() => this.resolved().monthLabels);
  readonly width = computed(() =>
    this.resolved().weeks * (this.cellSize() + this.cellGap()),
  );
  readonly height = computed(() =>
    7 * (this.cellSize() + this.cellGap()) + this.topPadding,
  );

  /** Resolve current accent — read the running CSS variable each render. */
  private readAccent(): string {
    const override = this.color();
    if (override) return override;
    if (typeof getComputedStyle === 'undefined') return '#FF8B1F';
    const root = document.documentElement;
    const raw = getComputedStyle(root).getPropertyValue('--color-tint').trim();
    if (!raw) return '#FF8B1F';
    return raw;
  }

  cellColor(count: number): string {
    const max = this.maxCount();
    if (count === 0 || max === 0) return 'var(--color-surface-alt)';
    const ratio = Math.min(1, count / max);
    const accent = this.readAccent();
    if (ratio < 0.25) return this.withAlpha(accent, '40');
    if (ratio < 0.50) return this.withAlpha(accent, '80');
    if (ratio < 0.75) return this.withAlpha(accent, 'BB');
    return accent;
  }

  /**
   * Appends an 8-bit alpha suffix to a 6-digit hex.  Falls back to the raw
   * colour string if we got a non-hex (e.g. var(--…)) so it still paints.
   */
  private withAlpha(color: string, alphaHex: string): string {
    if (color.startsWith('#') && (color.length === 7)) {
      return color + alphaHex;
    }
    return color;
  }
}
