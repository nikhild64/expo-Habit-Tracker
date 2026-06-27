import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * SkeletonComponent — port of src/components/ui/Skeleton.tsx.
 *
 * Single pulsing rectangle. Use multiple in a group for list placeholders.
 * Animation collapses to a single frame under prefers-reduced-motion via
 * the global override in styles.scss.
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="skel"
      [style.width]="cssWidth()"
      [style.height.px]="height()"
      [style.border-radius.px]="radius()"
    ></div>
  `,
  styleUrl: './skeleton.component.scss',
})
export class SkeletonComponent {
  readonly height = input<number>(16);
  readonly width = input<number | string>('100%');
  readonly radius = input<number>(8);

  cssWidth(): string {
    const w = this.width();
    return typeof w === 'number' ? `${w}px` : w;
  }
}
