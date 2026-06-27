import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import { IoniconComponent } from '../ionicon/ionicon.component';

/**
 * ChipComponent — port of src/components/ui/Chip.tsx.
 *
 * Tiny rounded-corner pill, used by the category rail on Today, the
 * frequency rail on the habit form, and a handful of other places. When
 * `active` is true the chip fills with the optional `activeColor` (defaults
 * to `--color-tint`).
 */
@Component({
  selector: 'app-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IoniconComponent],
  template: `
    <button
      type="button"
      class="chip press"
      [class.active]="active()"
      [style.background-color]="bg()"
      [style.border-color]="border()"
      [style.color]="fg()"
      [attr.aria-pressed]="active()"
      (click)="pressed.emit()"
    >
      @if (icon()) {
        <app-ionicon [name]="icon()!" [size]="13" [color]="fg()" />
      }
      <span class="label">{{ label() }}</span>
    </button>
  `,
  styleUrl: './chip.component.scss',
})
export class ChipComponent {
  readonly label = input.required<string>();
  readonly active = input<boolean>(false);
  readonly icon = input<string | undefined>(undefined);
  readonly activeColor = input<string | undefined>(undefined);

  readonly pressed = output<void>();

  /** Resolved tint colour for the active state. */
  readonly tint = computed(() => this.activeColor() ?? 'var(--color-tint)');

  bg(): string {
    return this.active() ? this.tint() : 'var(--color-surface-alt)';
  }
  border(): string {
    return this.active() ? this.tint() : 'var(--color-border)';
  }
  fg(): string {
    return this.active() ? '#fff' : 'var(--color-text-secondary)';
  }
}
