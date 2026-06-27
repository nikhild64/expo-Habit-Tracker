import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  input,
  output,
  signal,
} from '@angular/core';

import { IoniconComponent } from '../ionicon/ionicon.component';

const HOUR_LABELS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MIN_LABELS  = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const DEFAULT_SIZE = 252;

/**
 * ClockFaceComponent — port of src/components/ClockFace.tsx.
 *
 * Hand-rolled SVG analog clock-picker.
 *  - Tap the hour digit to enter hour-selection mode (default).
 *  - Tap the minute digit to enter minute-selection mode.
 *  - Tap or drag inside the clock face to pick a value.
 *  - After picking an hour, switches to minute mode after 120 ms
 *    (mirrors the mobile auto-advance).
 *  - 60 tick marks; 12 major labels; 36-px tint highlight on selected.
 *  - Hand length = `0.60 × radius`.
 *  - AM/PM segmented toggle below the face.
 *
 * Inputs:
 *   [hour24]  24-hour value 0..23
 *   [minute]  0..59
 *   [size]    overall pixel size (default 252)
 * Outputs:
 *   (hourChange) (minuteChange)
 */
@Component({
  selector: 'app-clock-face',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent],
  template: `
    <div class="root" [style.--clock-size.px]="size()">
      <!-- Time display + stepper arrows -->
      <div class="time-row">
        <div class="stepper">
          <button
            type="button"
            class="step-btn"
            (click)="stepHour(1)"
            [class.active]="mode() === 'hour'"
            aria-label="Increase hour"
          >
            <app-ionicon name="chevron-up" [size]="22" />
          </button>
          <button
            type="button"
            class="digit"
            [class.active]="mode() === 'hour'"
            (click)="setMode('hour')"
            aria-label="Edit hour"
          >
            {{ hour12() }}
          </button>
          <button
            type="button"
            class="step-btn"
            (click)="stepHour(-1)"
            [class.active]="mode() === 'hour'"
            aria-label="Decrease hour"
          >
            <app-ionicon name="chevron-down" [size]="22" />
          </button>
        </div>

        <div class="colon">:</div>

        <div class="stepper">
          <button
            type="button"
            class="step-btn"
            (click)="stepMinute(1)"
            [class.active]="mode() === 'minute'"
            aria-label="Increase minute"
          >
            <app-ionicon name="chevron-up" [size]="22" />
          </button>
          <button
            type="button"
            class="digit"
            [class.active]="mode() === 'minute'"
            (click)="setMode('minute')"
            aria-label="Edit minute"
          >
            {{ minutePadded() }}
          </button>
          <button
            type="button"
            class="step-btn"
            (click)="stepMinute(-1)"
            [class.active]="mode() === 'minute'"
            aria-label="Decrease minute"
          >
            <app-ionicon name="chevron-down" [size]="22" />
          </button>
        </div>

        <div class="period">{{ isPM() ? 'PM' : 'AM' }}</div>
      </div>

      <div class="mode-hint">
        {{ mode() === 'hour' ? 'SELECT HOUR' : 'SELECT MINUTE' }}
      </div>

      <!-- Clock face -->
      <div
        class="face"
        [style.width.px]="size()"
        [style.height.px]="size()"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointercancel)="onPointerUp($event)"
        role="slider"
        aria-label="Time picker"
      >
        <!-- 60 tick marks -->
        @for (i of ticks; track i) {
          <div
            class="tick"
            [class.major]="i % 5 === 0"
            [style.transform]="tickTransform(i)"
          ></div>
        }

        <!-- Labels -->
        @for (val of labels(); track val; let i = $index) {
          <div
            class="marker"
            [class.exact]="isExact(val)"
            [style.left.px]="labelPos(i).x"
            [style.top.px]="labelPos(i).y"
          >
            <span>{{ mode() === 'minute' ? padNum(val) : val }}</span>
          </div>
        }

        <!-- Hand -->
        <div
          class="hand"
          [style.left.px]="cx() - 1.5"
          [style.top.px]="handMid().y - HAND_LEN() / 2"
          [style.height.px]="HAND_LEN()"
          [style.transform]="'rotate(' + (handAngleDeg() + 90) + 'deg)'"
          [style.transform-origin]="'center ' + (HAND_LEN() / 2) + 'px'"
        ></div>
        <div
          class="end-dot"
          [style.left.px]="handEnd().x - 6"
          [style.top.px]="handEnd().y - 6"
        ></div>
        <div class="center-dot" [style.left.px]="cx() - 5" [style.top.px]="cx() - 5"></div>
      </div>

      <!-- AM / PM toggle -->
      <div class="period-toggle">
        <button
          type="button"
          [class.active]="!isPM()"
          (click)="setPeriod('AM')"
        >
          AM
        </button>
        <button
          type="button"
          [class.active]="isPM()"
          (click)="setPeriod('PM')"
        >
          PM
        </button>
      </div>
    </div>
  `,
  styleUrl: './clock-face.component.scss',
})
export class ClockFaceComponent {
  readonly hour24 = input.required<number>();
  readonly minute = input.required<number>();
  readonly size = input<number>(DEFAULT_SIZE);

  readonly hourChange = output<number>();
  readonly minuteChange = output<number>();

  readonly mode = signal<'hour' | 'minute'>('hour');
  readonly ticks = Array.from({ length: 60 }, (_, i) => i);

  readonly isPM = computed(() => this.hour24() >= 12);
  readonly hour12 = computed(() => this.hour24() % 12 || 12);
  readonly minutePadded = computed(() => this.minute().toString().padStart(2, '0'));
  readonly labels = computed(() => (this.mode() === 'hour' ? HOUR_LABELS : MIN_LABELS));

  readonly cx = computed(() => this.size() / 2);
  readonly MARKER_R = computed(() => this.cx() * 0.76);
  readonly HAND_LEN = computed(() => this.cx() * 0.60);

  readonly handAngleDeg = computed(() => {
    if (this.mode() === 'hour') {
      const h12 = this.hour12();
      return h12 === 12 ? -90 : h12 * 30 - 90;
    }
    return (this.minute() / 60) * 360 - 90;
  });

  readonly handMid = computed(() => {
    const rad = (this.handAngleDeg() * Math.PI) / 180;
    return {
      x: this.cx() + (this.HAND_LEN() / 2) * Math.cos(rad),
      y: this.cx() + (this.HAND_LEN() / 2) * Math.sin(rad),
    };
  });

  readonly handEnd = computed(() => {
    const rad = (this.handAngleDeg() * Math.PI) / 180;
    return {
      x: this.cx() + this.HAND_LEN() * Math.cos(rad),
      y: this.cx() + this.HAND_LEN() * Math.sin(rad),
    };
  });

  isExact(val: number): boolean {
    return this.mode() === 'hour' ? val === this.hour12() : val === this.minute();
  }

  padNum(v: number): string {
    return v.toString().padStart(2, '0');
  }

  tickTransform(i: number): string {
    const isMajor = i % 5 === 0;
    const a = ((i * 6 - 90) * Math.PI) / 180;
    const r1 = this.cx() * (isMajor ? 0.90 : 0.93);
    const x = this.cx() + r1 * Math.cos(a) - (isMajor ? 1.5 : 0.75);
    const y = this.cx() + r1 * Math.sin(a) - (isMajor ? 2.5 : 1.5);
    return `translate(${x}px, ${y}px) rotate(${i * 6}deg)`;
  }

  labelPos(idx: number): { x: number; y: number } {
    const a = ((idx * 30 - 90) * Math.PI) / 180;
    return {
      x: this.cx() + this.MARKER_R() * Math.cos(a) - 18,
      y: this.cx() + this.MARKER_R() * Math.sin(a) - 18,
    };
  }

  // ── Mode + stepper handlers ────────────────────────────────────────────

  setMode(m: 'hour' | 'minute'): void {
    this.mode.set(m);
  }

  stepHour(delta: 1 | -1): void {
    const h12 = this.hour12();
    const newH12 = ((h12 - 1 + delta + 12) % 12) + 1;
    const newH24 = this.isPM()
      ? (newH12 === 12 ? 12 : newH12 + 12)
      : (newH12 === 12 ? 0 : newH12);
    this.hourChange.emit(newH24);
    this.mode.set('hour');
  }

  stepMinute(delta: 1 | -1): void {
    this.minuteChange.emit((this.minute() + delta + 60) % 60);
    this.mode.set('minute');
  }

  setPeriod(period: 'AM' | 'PM'): void {
    if (period === 'AM' && this.isPM()) this.hourChange.emit(this.hour24() - 12);
    if (period === 'PM' && !this.isPM()) this.hourChange.emit(this.hour24() + 12);
  }

  // ── Touch / pointer interaction ────────────────────────────────────────

  private dragging = false;

  onPointerDown(e: PointerEvent): void {
    this.dragging = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    this.handleTouch(e);
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    this.handleTouch(e);
  }

  onPointerUp(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }

  @HostListener('window:blur')
  onBlur(): void {
    this.dragging = false;
  }

  private handleTouch(e: PointerEvent): void {
    const root = (e.currentTarget as HTMLElement);
    const rect = root.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - this.cx();
    const dy = y - this.cx();
    if (Math.sqrt(dx * dx + dy * dy) < this.cx() * 0.14) return;
    const angle = Math.atan2(dy, dx);
    const normalized = (angle + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);

    if (this.mode() === 'hour') {
      const rawHour = Math.round((normalized / (2 * Math.PI)) * 12) % 12;
      const newH12 = rawHour === 0 ? 12 : rawHour;
      const newH24 = this.isPM()
        ? (newH12 === 12 ? 12 : newH12 + 12)
        : (newH12 === 12 ? 0 : newH12);
      this.hourChange.emit(newH24);
      setTimeout(() => this.mode.set('minute'), 120);
    } else {
      const rawMin = Math.round((normalized / (2 * Math.PI)) * 60) % 60;
      this.minuteChange.emit(rawMin);
    }
  }
}
