import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * ProgressRingComponent — port of src/components/ui/ProgressRing.tsx.
 *
 * Inline `<svg>` with two `<circle>`s. The progress circle uses
 * `stroke-dasharray` + `stroke-dashoffset`; the offset transitions over
 * 400 ms with `cubic-bezier(.65,0,.35,1)` so the ring fills smoothly.
 *
 *  - 12 o'clock start: `transform: rotate(-90deg)` on the SVG itself.
 *  - Round line cap for nicer endpoints (matches the mobile look).
 *  - Reduce-motion override flattens the transition globally (see styles.scss).
 */
@Component({
  selector: 'app-progress-ring',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" [style.width.px]="size()" [style.height.px]="size()">
      <svg
        [attr.width]="size()"
        [attr.height]="size()"
        [attr.viewBox]="'0 0 ' + size() + ' ' + size()"
        style="transform: rotate(-90deg)"
        aria-hidden="true"
      >
        <circle
          [attr.cx]="size() / 2"
          [attr.cy]="size() / 2"
          [attr.r]="r()"
          [attr.stroke]="trackColor() ?? 'var(--color-border)'"
          [attr.stroke-width]="stroke()"
          fill="none"
        />
        <circle
          class="progress"
          [attr.cx]="size() / 2"
          [attr.cy]="size() / 2"
          [attr.r]="r()"
          [attr.stroke]="color() ?? 'var(--color-tint)'"
          [attr.stroke-width]="stroke()"
          fill="none"
          stroke-linecap="round"
          [attr.stroke-dasharray]="circumference() + ' ' + circumference()"
          [style.stroke-dashoffset]="offset()"
        />
      </svg>
      @if (label() !== undefined) {
        <span class="label" [style.color]="color() ?? 'var(--color-tint)'">
          {{ label() }}
        </span>
      }
    </div>
  `,
  styleUrl: './progress-ring.component.scss',
})
export class ProgressRingComponent {
  /** 0–1 fraction. Clamped to [0, 1] internally. */
  readonly progress = input.required<number>();
  readonly size = input<number>(64);
  readonly stroke = input<number>(6);
  readonly color = input<string | undefined>(undefined);
  readonly trackColor = input<string | undefined>(undefined);
  readonly label = input<string | undefined>(undefined);

  /** Radius accounting for stroke width — keeps the circle inside the SVG box. */
  readonly r = computed(() => (this.size() - this.stroke()) / 2);
  readonly circumference = computed(() => 2 * Math.PI * this.r());

  readonly clampedProgress = computed(() => Math.max(0, Math.min(1, this.progress())));
  readonly offset = computed(() => this.circumference() * (1 - this.clampedProgress()));
}
