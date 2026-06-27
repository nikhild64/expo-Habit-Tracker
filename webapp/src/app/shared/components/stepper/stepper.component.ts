import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';

import { HapticsService } from '../../../core/services/haptics.service';
import { IoniconComponent } from '../ionicon/ionicon.component';

/**
 * StepperComponent — port of src/components/ui/Stepper.tsx.
 *
 * Big-touch numeric stepper used on the habit form (target value, timer
 * duration, X-per-week count). Default value 32 / 700 / -1.
 *
 * Clamp logic mirrors the mobile: the button is disabled when the next
 * value would fall outside [min, max] (greys the icon out, no haptic).
 */
@Component({
  selector: 'app-stepper',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent],
  template: `
    <div class="wrap">
      <button
        type="button"
        class="btn press"
        [disabled]="!canDec()"
        (click)="dec()"
        [attr.aria-label]="'Decrease ' + (unit() ?? 'value')"
      >
        <app-ionicon
          name="remove-circle"
          [size]="32"
          [color]="canDec() ? 'var(--color-tint)' : 'var(--color-border)'"
        />
      </button>

      <div class="value-block">
        <span class="value">{{ value() }}</span>
        @if (unit()) {
          <span class="unit">{{ unit() }}</span>
        }
      </div>

      <button
        type="button"
        class="btn press"
        [disabled]="!canInc()"
        (click)="inc()"
        [attr.aria-label]="'Increase ' + (unit() ?? 'value')"
      >
        <app-ionicon
          name="add-circle"
          [size]="32"
          [color]="canInc() ? 'var(--color-tint)' : 'var(--color-border)'"
        />
      </button>
    </div>
  `,
  styleUrl: './stepper.component.scss',
})
export class StepperComponent {
  private readonly haptics = inject(HapticsService);

  readonly value = input.required<number>();
  readonly min = input<number>(0);
  readonly max = input<number>(999);
  readonly step = input<number>(1);
  readonly unit = input<string | undefined>(undefined);

  readonly changed = output<number>();

  readonly canDec = computed(() => this.value() - this.step() >= this.min());
  readonly canInc = computed(() => this.value() + this.step() <= this.max());

  dec(): void {
    if (!this.canDec()) return;
    this.haptics.selection();
    this.changed.emit(this.value() - this.step());
  }
  inc(): void {
    if (!this.canInc()) return;
    this.haptics.selection();
    this.changed.emit(this.value() + this.step());
  }
}
